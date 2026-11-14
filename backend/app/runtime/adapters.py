import asyncio
from dataclasses import asdict, is_dataclass
import importlib.util
import json
import os
from pathlib import Path
import shutil
from uuid import uuid4

from app.runtime.state import now, redact
from app.runtime.transport import JsonRpcProcess, RuntimeErrorSafe


class Adapter:
    def __init__(self, owner, state):
        self.owner, self.state = owner, state
        self.rpc = None
        self.status = "not_connected"
        self.account = None
        self.models = []
        self.usage = None
        self.version = None
        self.error = None
        self.capabilities = {"sessions": True, "streaming": True, "approvals": True, "interrupt": True, "modes": ["ask", "plan", "agent"]}

    def info(self):
        return {"id": self.provider, "name": self.name, "installed": self.installed(), "status": self.status if self.installed() else "not_installed", "account": self.account, "models": self.models, "usage": self.usage, "version": self.version, "error": self.error, "capabilities": self.capabilities, "updated_at": now()}

    def emit(self, sid, kind, data):
        return self.state.emit(self.owner, self.provider, sid, kind, data)

    async def approval(self, method, request_id, params, sid):
        approval_id = str(uuid4())
        self.state.approvals[approval_id] = {"id": approval_id, "owner": self.owner, "provider": self.provider, "session_id": sid, "method": method, "request_id": request_id, "request": redact(params), "options": params.get("options", [])}
        if sid in self.state.sessions:
            self.state.sessions[sid]["status"] = "awaiting_approval"
        self.emit(sid, "approval", {k: v for k, v in self.state.approvals[approval_id].items() if k not in {"owner", "request_id"}})

    async def dispose(self):
        if self.rpc:
            await self.rpc.close()
            self.rpc = None
        for sid, session in self.state.sessions.items():
            if session["provider"] == self.provider and session["owner"] == self.owner and session["status"] in {"running", "awaiting_approval"}:
                self.state.release(sid, "interrupted")
        self.status = "not_connected"

    def assert_connected(self):
        if self.status != "connected":
            raise RuntimeErrorSafe("Connect and verify this provider first.")


class CodexAdapter(Adapter):
    provider, name = "codex", "OpenAI Codex"

    def __init__(self, owner, state):
        super().__init__(owner, state)
        self.capabilities.update({"history_import": True, "models": True, "account": True, "usage": True, "archive": True, "login": True})
        self.turns = {}

    def installed(self):
        return bool(shutil.which("codex"))

    async def connect(self):
        if not self.installed():
            raise RuntimeErrorSafe("Install the official Codex CLI first.")
        if not self.rpc or self.rpc.closed or self.rpc.process.returncode is not None:
            self.rpc = JsonRpcProcess([shutil.which("codex"), "app-server", "--listen", "stdio://"], self.on_event)
            await self.rpc.start()
            result = await self.rpc.request("initialize", {"clientInfo": {"name": "devpulse", "title": "DevPulse", "version": "0.3.1"}, "capabilities": {"experimentalApi": False}})
            self.version = result.get("userAgent")
            await self.rpc.notify("initialized")
        data = await self.rpc.request("account/read", {"refreshToken": False})
        self.account = redact(data.get("account"))
        self.status = "connected" if self.account else "setup_required"
        if self.account:
            models = await self.rpc.request("model/list", {"limit": 100, "includeHidden": False})
            self.models = [{"id": m.get("id", m.get("model")), "name": m.get("displayName", m.get("model")), "default": m.get("isDefault", False)} for m in models.get("data", [])]
            try:
                self.usage = redact(await self.rpc.request("account/rateLimits/read"))
            except RuntimeErrorSafe:
                self.usage = None
        self.error = None
        return self.info()

    async def login(self):
        if not self.rpc:
            await self.connect()
        result = await self.rpc.request("account/login/start", {"type": "chatgpt"})
        return {"url": result.get("authUrl"), "login_id": result.get("loginId"), "message": "Complete the official Codex browser login, then Verify connection."}

    async def list_sessions(self, cwd=None):
        self.assert_connected()
        result = await self.rpc.request("thread/list", {"limit": 100, **({"cwd": cwd} if cwd else {})})
        return [{"id": r["id"], "title": r.get("name") or r.get("preview") or "Codex thread", "cwd": r.get("cwd"), "provider": self.provider, "updated_at": r.get("updatedAt"), "imported": True} for r in result.get("data", [])]

    async def create(self, cwd, model, mode):
        self.assert_connected()
        result = await self.rpc.request("thread/start", {"cwd": cwd, "model": model, "approvalPolicy": "untrusted", "sandbox": "workspace-write" if mode == "agent" else "read-only", "serviceName": "devpulse"})
        return result["thread"]["id"]

    async def read(self, sid):
        self.assert_connected()
        result = await self.rpc.request("thread/read", {"threadId": sid, "includeTurns": False})
        # Current protocol uses paginated history; retain the server's item types verbatim.
        try:
            items = await self.rpc.request("thread/items/list", {"threadId": sid, "limit": 100, "sortDirection": "asc"})
            result["items"] = items.get("data", [])
        except RuntimeErrorSafe:
            legacy = await self.rpc.request("thread/read", {"threadId": sid, "includeTurns": True})
            result["thread"] = legacy["thread"]
        return result

    async def resume(self, sid, cwd, mode="ask", model=None):
        existing = await self.read(sid)
        if os.path.normcase(str(Path(existing["thread"]["cwd"]).resolve())) != os.path.normcase(str(Path(cwd).resolve())):
            raise RuntimeErrorSafe("The selected project does not match this provider session's directory.")
        return await self.rpc.request("thread/resume", {"threadId": sid, "cwd": cwd, "approvalPolicy": "untrusted", "sandbox": "workspace-write" if mode == "agent" else "read-only", "model": model})

    async def send_message(self, session, text, model=None, mode="ask"):
        policy = {"type": "workspaceWrite", "writableRoots": [session["cwd"]], "networkAccess": False, "excludeTmpdirEnvVar": True, "excludeSlashTmp": True} if mode == "agent" else {"type": "readOnly", "networkAccess": False}
        result = await self.rpc.request("turn/start", {"threadId": session["id"], "input": [{"type": "text", "text": text}], "model": model, "cwd": session["cwd"], "approvalPolicy": "untrusted", "sandboxPolicy": policy})
        self.turns[session["id"]] = result["turn"]["id"]
        self.emit(session["id"], "turn_started", {"turn_id": result["turn"]["id"]})

    async def interrupt(self, sid):
        turn_id = self.turns.get(sid)
        if turn_id:
            await self.rpc.request("turn/interrupt", {"threadId": sid, "turnId": turn_id})
        self.state.release(sid, "interrupted")

    async def archive(self, sid):
        await self.rpc.request("thread/archive", {"threadId": sid})

    async def decide(self, approval, decision, option_id=None):
        method = approval["method"]
        if method == "item/permissions/requestApproval":
            # Scope expansions are intentionally unsupported: never widen beyond the project.
            result = {"permissions": {}, "scope": "turn"}
        elif method in {"item/commandExecution/requestApproval", "item/fileChange/requestApproval"}:
            session = self.state.sessions.get(approval["session_id"], {})
            allowed = decision == "approve" and session.get("mode") == "agent"
            result = {"decision": "accept" if allowed else "decline"}
        else:
            result = {"decision": "decline"}
        await self.rpc.reply(approval["request_id"], result)

    async def on_event(self, message):
        method, params = message.get("method", ""), message.get("params", {})
        sid = params.get("threadId") or params.get("thread", {}).get("id")
        if "id" in message:
            if method in {"item/commandExecution/requestApproval", "item/fileChange/requestApproval", "item/permissions/requestApproval"}:
                await self.approval(method, message["id"], params, sid)
            else:
                await self.rpc.send({"jsonrpc": "2.0", "id": message["id"], "error": {"code": -32601, "message": "Client capability is not supported"}})
            return
        if method == "runtime/disconnected":
            self.status, self.error = "connection_error", "Codex process disconnected. Reconnect to resume saved threads."
            for session in list(self.state.sessions.values()):
                if session["owner"] == self.owner and session["provider"] == self.provider:
                    self.state.release(session["id"], "interrupted")
        elif method == "item/agentMessage/delta":
            self.emit(sid, "message_delta", {"text": params.get("delta", ""), "item_id": params.get("itemId")})
        elif method in {"item/started", "item/completed"}:
            item = params.get("item", {})
            if item.get("type") == "agentMessage" and method == "item/completed":
                self._message(sid, item.get("text", ""))
            elif item.get("type") == "fileChange":
                self.emit(sid, "file_change", item)
            else:
                self.emit(sid, "tool", {"name": item.get("type"), "status": method.split("/")[-1], **item})
        elif method == "turn/completed":
            self.turns.pop(sid, None)
            self.state.release(sid, "idle" if params.get("turn", {}).get("status") == "completed" else "interrupted")
            self.emit(sid, "turn_completed", params.get("turn", {}))
            self.state.save()
        else:
            self.emit(sid, "runtime", {"method": method, "params": params})

    def _message(self, sid, text):
        session = self.state.sessions.get(sid)
        if session:
            session["messages"].append({"role": "assistant", "text": redact(text), "timestamp": now()})
            self.state.save()
        self.emit(sid, "message", {"role": "assistant", "text": text})


class CursorAdapter(Adapter):
    provider, name = "cursor", "Cursor Agent"

    def installed(self):
        return bool(shutil.which("agent") or shutil.which("cursor-agent"))

    async def connect(self):
        if not self.installed():
            raise RuntimeErrorSafe("Cursor CLI is not installed. Install it from cursor.com/cli; the editor alone is not the CLI.")
        if not self.rpc:
            self.rpc = JsonRpcProcess([shutil.which("agent") or shutil.which("cursor-agent"), "acp"], self.on_event)
            await self.rpc.start()
            result = await self.rpc.request("initialize", {"protocolVersion": 1, "clientInfo": {"name": "devpulse", "version": "0.3.1"}, "clientCapabilities": {"fs": {"readTextFile": False, "writeTextFile": False}, "terminal": False}})
            self.version = result.get("agentInfo", {}).get("version")
            self.agent_capabilities = result.get("agentCapabilities", {})
            self.capabilities.update({"history_import": bool(self.agent_capabilities.get("loadSession")), "models": False, "account": False, "usage": False, "archive": False, "login": True})
        await self.rpc.request("authenticate", {"methodId": "cursor_login"})
        self.status = "connected"
        return self.info()

    async def login(self):
        await self.connect()
        return {"message": "Official Cursor ACP authentication completed. If authentication failed, run agent login in your terminal and Verify again."}

    async def list_sessions(self, cwd=None):
        self.assert_connected()
        if not self.agent_capabilities.get("sessionCapabilities", {}).get("list"):
            return []
        result = await self.rpc.request("session/list", {**({"cwd": cwd} if cwd else {})})
        return [{"id": r["sessionId"], "title": r.get("title", "Cursor session"), "cwd": r.get("cwd"), "provider": self.provider, "updated_at": r.get("updatedAt"), "imported": True} for r in result.get("sessions", [])]

    async def create(self, cwd, model, mode):
        self.assert_connected()
        result = await self.rpc.request("session/new", {"cwd": cwd, "mcpServers": []})
        self._models(result)
        if mode:
            await self.rpc.request("session/set_mode", {"sessionId": result["sessionId"], "modeId": mode})
        return result["sessionId"]

    def _models(self, result):
        self.models = [{"id": m["modelId"], "name": m.get("name", m["modelId"])} for m in result.get("models", {}).get("availableModels", [])]
        self.capabilities["models"] = bool(self.models)
        modes = result.get("modes", {}).get("availableModes", [])
        if modes:
            self.capabilities["modes"] = [m["id"] for m in modes]

    async def resume(self, sid, cwd, mode="ask", model=None):
        self.assert_connected()
        if not self.agent_capabilities.get("loadSession"):
            raise RuntimeErrorSafe("This Cursor runtime does not expose session loading.")
        result = await self.rpc.request("session/load", {"sessionId": sid, "cwd": cwd, "mcpServers": []})
        self._models(result)
        return result

    async def read(self, sid):
        return {}  # ACP replays supported history through session/update on load.

    async def send_message(self, session, text, model=None, mode="ask"):
        sid = session["id"]
        await self.rpc.request("session/set_mode", {"sessionId": sid, "modeId": mode})
        if model and self.capabilities.get("models"):
            await self.rpc.request("session/set_model", {"sessionId": sid, "modelId": model})
        self.emit(sid, "turn_started", {})
        result = await self.rpc.request("session/prompt", {"sessionId": sid, "prompt": [{"type": "text", "text": text}]}, timeout=1800)
        self.state.release(sid)
        self.emit(sid, "turn_completed", result)
        self.state.save()

    async def interrupt(self, sid):
        await self.rpc.notify("session/cancel", {"sessionId": sid})
        self.state.release(sid, "interrupted")

    async def archive(self, sid):
        raise RuntimeErrorSafe("Cursor does not advertise session archival in this adapter.")

    async def decide(self, approval, decision, option_id=None):
        options = approval.get("options", [])
        allowed = decision == "approve" and self.state.sessions.get(approval["session_id"], {}).get("mode") == "agent"
        selected = next((o for o in options if o.get("optionId") == option_id), None) if option_id else next((o for o in options if o.get("kind") == ("allow_once" if allowed else "reject_once")), None)
        if selected and (allowed or selected.get("kind", "").startswith("reject")):
            result = {"outcome": {"outcome": "selected", "optionId": selected["optionId"]}}
        else:
            result = {"outcome": {"outcome": "cancelled"}}
        await self.rpc.reply(approval["request_id"], result)

    async def on_event(self, message):
        method, params = message.get("method", ""), message.get("params", {})
        sid = params.get("sessionId")
        if "id" in message:
            if method == "session/request_permission":
                await self.approval(method, message["id"], params, sid)
            else:
                await self.rpc.send({"jsonrpc": "2.0", "id": message["id"], "error": {"code": -32601, "message": "Client capability not supported"}})
        elif method == "session/update":
            update = params.get("update", {})
            kind = update.get("sessionUpdate")
            if kind == "agent_message_chunk":
                text = update.get("content", {}).get("text", "")
                session = self.state.sessions.get(sid)
                if session:
                    messages = session["messages"]
                    if not messages or messages[-1]["role"] != "assistant":
                        messages.append({"role": "assistant", "text": "", "timestamp": now()})
                    messages[-1]["text"] += redact(text)
                self.emit(sid, "message_delta", {"text": text})
            else:
                self.emit(sid, "tool" if kind in {"tool_call", "tool_call_update"} else "runtime", update)
        elif method == "runtime/disconnected":
            self.status, self.error = "connection_error", "Cursor runtime disconnected."
            for session in list(self.state.sessions.values()):
                if session["owner"] == self.owner and session["provider"] == self.provider:
                    self.state.release(session["id"], "interrupted")
