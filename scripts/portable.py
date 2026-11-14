"""Create the portable Windows download from the same payload used by NSIS."""
import hashlib
import json
from pathlib import Path
from tempfile import NamedTemporaryFile
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
release = root / "release"
payload = release / "win-unpacked"
version = json.loads((root / "package.json").read_text(encoding="utf-8"))["version"]
portable = release / f"DevPulse-Portable-{version}-x64.zip"
setup = release / f"DevPulse-Setup-{version}-x64.exe"
offline = release / f"DevPulse-Offline-{version}-x64.exe"
if not all(path.is_file() for path in (payload / "DevPulse.exe", setup, offline)):
    raise SystemExit("Build the Windows app and installers first.")
with NamedTemporaryFile(dir=release, suffix=".zip.tmp", delete=False) as temp:
    temporary = Path(temp.name)
try:
    with ZipFile(temporary, "w", compression=ZIP_DEFLATED, compresslevel=5) as archive:
        for file in sorted(payload.rglob("*")):
            if file.is_file():
                archive.write(file, Path("DevPulse") / file.relative_to(payload))
    temporary.replace(portable)
finally:
    temporary.unlink(missing_ok=True)
lines = []
for file in (setup, offline, portable):
    with file.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    lines.append(f"{digest}  {file.name}\n")
with NamedTemporaryFile(dir=release, suffix=".sum.tmp", mode="w", encoding="ascii", newline="\n", delete=False) as temp:
    temp.writelines(lines)
Path(temp.name).replace(release / "SHA256SUMS.txt")
print(portable.name, portable.stat().st_size)
