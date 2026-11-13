"""Frozen local API entry point. This module never includes development secrets."""
import os
from pathlib import Path
import sys
import threading


def main():
    bundle = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))
    backend = bundle / "backend"
    if not getattr(sys, "frozen", False):
        sys.path.insert(0, str(backend))
    from alembic.config import Config
    from alembic import command
    import uvicorn
    from app.main import app as application
    config = Config(str(backend / "alembic.ini"))
    config.set_main_option("script_location", str(backend / "alembic"))
    command.upgrade(config, "head")
    server = uvicorn.Server(uvicorn.Config(application, host="127.0.0.1", port=int(os.environ["PORT"]), access_log=False, log_level="warning"))
    # Electron owns the pipe. Parent exit closes it and shuts down Uvicorn cleanly.
    def watch_parent():
        try:
            sys.stdin.buffer.read()
        finally:
            server.should_exit = True
    threading.Thread(target=watch_parent, daemon=True).start()
    server.run()


if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()
    main()
