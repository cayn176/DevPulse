"""Create local settings once without printing secret material."""
from pathlib import Path
from cryptography.fernet import Fernet

target = Path(__file__).parent / ".env"
if not target.exists():
    with target.open("x", encoding="utf-8") as file:
        file.write("TOKEN_ENCRYPTION_KEY=" + Fernet.generate_key().decode() + "\n")
        file.write("FRONTEND_ORIGIN=http://127.0.0.1:5173\nGITHUB_REDIRECT_URI=http://127.0.0.1:5173/auth/github/callback\n")
        file.write("APP_ENV=development\nLOCAL_AGENT_GITHUB_LOGIN=\n")
    print("Local configuration created. Add OAuth credentials or connect with a token in the browser.")
else:
    print("Existing local configuration preserved.")

existing = target.read_text(encoding="utf-8")
names = {line.split("=", 1)[0].strip() for line in existing.splitlines() if "=" in line and not line.lstrip().startswith("#")}
with target.open("a", encoding="utf-8") as file:
    for name in ("SERVER_AI_GITHUB_LOGIN", "OPENAI_API_KEY", "OPENAI_MODEL", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "CURSOR_API_KEY", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"):
        if name not in names:
            file.write("\n" + name + "=\n")
