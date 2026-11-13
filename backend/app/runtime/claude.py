import asyncio
import importlib.util
from dataclasses import asdict
from pathlib import Path
import os
from uuid import uuid4
import httpx

from app.runtime.adapters import Adapter
from app.runtime.state import now, redact
from app.runtime.transport import RuntimeErrorSafe


class ClaudeAdapter(Adapter):
    provider, name = "claude", "Claude Agent"

    def __init__(self, owner, state):
        super().__init__(owner, state)
        self.key = ""
        self.clients = {}
        self.pending = {}
        self.capabilities.update(history_import=True, models=True, archive=False, login=False)

    def installed(self):
        return importlib.util.find_spec("claude_agent_sdk") is not None

    def child_env(self):
        hidden = ("SECRET", "TOKEN", "API_KEY", "ENCRYPTION_KEY", "NONCE", "DATABASE_URL")
        values = {k: "" for k in os.environ if any(part in k.upper() for part in hidden)}
        values.update(ANTHROPIC_API_KEY=self.key, ANTHROPIC_BASE_URL="https://api.anthropic.com")
        return values

    async def connect(self):
        if not self.installed():
            raise RuntimeErrorSafe("Install claude-agent-sdk in the DevPulse backend.")
        if not self.key:
            raise RuntimeErrorSafe("Save an Anthropic API key in Integrations and verify again.")
        from importlib.metadata import version
        from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions
        async with httpx.AsyncClient(timeout=20) as api:
            reply = await api.get("https://api.anthropic.com/v1/models", headers={"x-api-key": self.key, "anthropic-version": "2023-06-01"})
        if reply.status_code != 200:
            raise RuntimeErrorSafe("Anthropic could not verify this API key. Check its access and retry.")
        self.models = [{"id": m["id"], "name": m["display_name"]} for m in reply.json().get("data", [])]
        async with ClaudeSDKClient(options=ClaudeAgentOptions(tools=[], setting_sources=[], strict_mcp_config=True, env=self.child_env())) as client:
            await client.get_server_info()
        self.version, self.status, self.error = version("claude-agent-sdk"), "connected", None
        return self.info()

    async def list_sessions(self, cwd):
        from claude_agent_sdk import list_sessions
        rows = await asyncio.to_thread(list_sessions, directory=cwd, limit=100, include_worktrees=False)
        return [{"id": row.session_id, "title": row.custom_title or row.summary, "cwd": row.cwd or cwd} for row in rows]

    async def read(self, sid):
        from claude_agent_sdk import get_session_messages
        items = await asyncio.to_thread(get_session_messages, sid, directory=self.state.sessions[sid]["cwd"], limit=200)
        return {"messages": [asdict(item) for item in items]}

    async def create(self, cwd, model, mode):
        return str(uuid4())

    async def resume(self, sid, cwd, mode="ask", model=None):
        return await self.read(sid)

    async def send_message(self, session, text, model=None, mode="ask"):
        from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient, HookMatcher
        from claude_agent_sdk import AssistantMessage, ResultMessage, TextBlock, ToolUseBlock
        from claude_agent_sdk.types import StreamEvent
        sid, cwd = session["id"], Path(session["cwd"]).resolve()
        async def guard(data, tool_use_id, _context):
            tool, args = data.get("tool_name"), data.get("tool_input", {})
            permitted = False
            if tool in {"Read", "Write", "Edit"}:
                target = (cwd / args.get("file_path", "")).resolve()
                from app.api.projects import excluded
                permitted = target.is_relative_to(cwd) and not any(excluded(p) for p in target.relative_to(cwd).parts)
                if permitted and tool in {"Edit", "Write"}:
                    permitted = False
                    if mode == "agent":
                        future = asyncio.get_running_loop().create_future()
                        rid = str(uuid4())
                        self.pending[rid] = future
                        await self.approval(tool, rid, {"file": str(target), "change": args}, sid)
                        try:
                            permitted = await asyncio.wait_for(future, 300)
                        finally:
                            self.pending.pop(rid, None)
            return {"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "allow" if permitted else "deny"}}
        existing = await self.read(sid)
        options = ClaudeAgentOptions(cwd=str(cwd), model=model, resume=sid if existing["messages"] else None,
            session_id=None if existing["messages"] else sid, env=self.child_env(),
            tools=["Read", "Write", "Edit"] if mode == "agent" else ["Read"],
            hooks={"PreToolUse": [HookMatcher(hooks=[guard])]}, permission_mode="default", strict_mcp_config=True,
            setting_sources=[], include_partial_messages=True, max_turns=32)
        async with ClaudeSDKClient(options=options) as client:
            self.clients[sid] = client
            try:
                await client.query(text if mode != "plan" else "Plan this task without editing files:\n" + text)
                async for event in client.receive_response():
                    if isinstance(event, StreamEvent):
                        delta = event.event.get("delta", {})
                        if delta.get("type") == "text_delta":
                            self.emit(sid, "message_delta", {"text": delta["text"]})
                    elif isinstance(event, AssistantMessage):
                        for block in event.content:
                            if isinstance(block, TextBlock):
                                session["messages"].append({"role": "assistant", "text": redact(block.text), "timestamp": now()})
                                self.emit(sid, "message", {"text": block.text})
                            elif isinstance(block, ToolUseBlock):
                                self.emit(sid, "tool", {"name": block.name, "input": block.input})
                    elif isinstance(event, ResultMessage):
                        if event.is_error:
                            raise RuntimeErrorSafe("Claude reported a failed turn. Check account access and the session activity.")
                        self.emit(sid, "turn_completed", {"duration_ms": event.duration_ms})
            finally:
                self.clients.pop(sid, None)
        self.state.release(sid)

    async def interrupt(self, sid):
        if sid in self.clients:
            await self.clients[sid].interrupt()

    async def decide(self, approval, decision, option_id=None):
        future = self.pending.get(approval["request_id"])
        if future and not future.done():
            future.set_result(decision == "approve")

    async def dispose(self):
        self.key = ""
        for sid in list(self.clients):
            await self.interrupt(sid)
        await super().dispose()
