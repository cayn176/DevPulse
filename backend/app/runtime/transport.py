import asyncio
import json
import os
from collections.abc import Awaitable, Callable


class RuntimeErrorSafe(Exception):
    """Public diagnostic deliberately omits subprocess stderr and secrets."""


def child_environment(extra=None):
    env = {k: v for k, v in os.environ.items() if not any(x in k.upper() for x in ("SECRET", "TOKEN", "API_KEY", "ENCRYPTION_KEY", "NONCE", "DATABASE_URL"))}
    env.update(extra or {})
    return env


class JsonRpcProcess:
    def __init__(self, command: list[str], on_message: Callable[[dict], Awaitable[None]], cwd=None, env=None):
        self.command, self.on_message, self.cwd, self.env = command, on_message, cwd, env
        self.process = None
        self.pending = {}
        self.serial = 0
        self.reader = None
        self.stderr = None
        self.write_lock = asyncio.Lock()
        self.closed = False

    async def start(self):
        try:
            self.process = await asyncio.create_subprocess_exec(*self.command, cwd=self.cwd, env=child_environment(self.env), stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, limit=4 * 1024 * 1024, creationflags=0x08000000 if os.name == "nt" else 0)
        except (OSError, NotImplementedError) as exc:
            raise RuntimeErrorSafe("The agent process could not start. Check the installed runtime and operating-system permissions.") from exc
        self.reader = asyncio.create_task(self._read())
        self.stderr = asyncio.create_task(self._drain_stderr())

    async def send(self, message):
        if not self.process or self.process.returncode is not None or self.closed:
            raise RuntimeErrorSafe("The runtime is disconnected. Connect it again.")
        encoded = (json.dumps(message, ensure_ascii=False) + "\n").encode()
        if len(encoded) > 2 * 1024 * 1024:
            raise RuntimeErrorSafe("Runtime message exceeds the 2 MB limit.")
        async with self.write_lock:
            self.process.stdin.write(encoded)
            await self.process.stdin.drain()

    async def request(self, method, params=None, timeout=45):
        self.serial += 1
        request_id = self.serial
        future = asyncio.get_running_loop().create_future()
        self.pending[request_id] = future
        try:
            await self.send({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params or {}})
            return await asyncio.wait_for(future, timeout)
        except asyncio.TimeoutError as exc:
            raise RuntimeErrorSafe("The runtime did not respond in time. Check its login or interrupt the operation.") from exc
        finally:
            self.pending.pop(request_id, None)

    async def notify(self, method, params=None):
        await self.send({"jsonrpc": "2.0", "method": method, "params": params or {}})

    async def reply(self, request_id, result):
        await self.send({"jsonrpc": "2.0", "id": request_id, "result": result})

    async def _read(self):
        try:
            while line := await self.process.stdout.readline():
                try:
                    message = json.loads(line)
                except (ValueError, UnicodeDecodeError):
                    continue
                if not isinstance(message, dict):
                    continue
                request_id = message.get("id")
                if "method" not in message and request_id in self.pending:
                    future = self.pending[request_id]
                    if not future.done():
                        if "error" in message:
                            future.set_exception(RuntimeErrorSafe("Runtime rejected the request (code " + str(message["error"].get("code", "unknown")) + "). Check supported capabilities and authentication."))
                        else:
                            future.set_result(message.get("result", {}))
                elif "method" in message:
                    # Never await a user approval on the reader: it must keep draining RPC replies.
                    await self.on_message(message)
        except (OSError, ValueError, asyncio.CancelledError):
            pass
        finally:
            for future in self.pending.values():
                if not future.done():
                    future.set_exception(RuntimeErrorSafe("The runtime process disconnected."))
            if not self.closed:
                await self.on_message({"method": "runtime/disconnected", "params": {}})

    async def _drain_stderr(self):
        try:
            while await self.process.stderr.read(16384):
                pass  # Never log raw stderr, which may include auth details or source secrets.
        except asyncio.CancelledError:
            pass

    async def close(self):
        self.closed = True
        if self.process and self.process.returncode is None:
            self.process.terminate()
            try:
                await asyncio.wait_for(self.process.wait(), 5)
            except asyncio.TimeoutError:
                self.process.kill()
                await self.process.wait()
        for task in (self.reader, self.stderr):
            if task:
                task.cancel()
        await asyncio.gather(*(t for t in (self.reader, self.stderr) if t), return_exceptions=True)
