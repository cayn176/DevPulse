"""Build a private Windows Python runtime from the official installed interpreter."""
import shutil
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
backend = root / "backend"
stage = backend / "dist" / "windows-runtime"
stage.mkdir(parents=True, exist_ok=True)
base = Path(sys.base_prefix)
runtime = stage / "python"
runtime.mkdir(exist_ok=True)

def ignore(_dir, names):
    return {name for name in names if name in {"__pycache__", ".git", ".pytest_cache"} or name.endswith(".pyc")}

for name in ("python.exe","python3.dll",f"python{sys.version_info.major}{sys.version_info.minor}.dll","vcruntime140.dll","vcruntime140_1.dll","LICENSE.txt"):
    shutil.copy2(base / name,runtime / name)
shutil.copytree(base/"DLLs",runtime/"DLLs",dirs_exist_ok=True,ignore=ignore)
def standard_files(folder, names):
    skip=ignore(folder,names)
    if Path(folder)==(base/"Lib"):
        skip.update({"site-packages","idlelib","tkinter","turtledemo","test","ensurepip","venv"})
    return skip
shutil.copytree(base/"Lib",runtime/"Lib",dirs_exist_ok=True,ignore=standard_files)
site = Path(sys.prefix)/"Lib"/"site-packages"
target=runtime/"Lib"/"site-packages"
target.mkdir(exist_ok=True)
for entry in site.iterdir():
    if entry.name.startswith(("pip-","setuptools-","pyinstaller","PyInstaller","pytest","_pytest","pip","altgraph","pillow","PIL","pefile","peutils","win32ctypes","_pyinstaller","__pycache__")):
        continue
    if entry.is_dir():
        shutil.copytree(entry,target/entry.name,dirs_exist_ok=True,ignore=ignore)
    elif entry.suffix in {".py",".pyd",".dll",".pth"}:
        shutil.copy2(entry,target/entry.name)
# SQLAlchemy ships equivalent Python implementations for optional Cython accelerators.
# Distribute the portable implementation instead of optional native extensions.
for extension in (target/"sqlalchemy").rglob("*.pyd"):
    equivalent = extension.with_name(extension.name.split(".")[0]+".py")
    if equivalent.is_file():
        extension.unlink()
for name in ("app","alembic"):
    shutil.copytree(backend/name,stage/"backend"/name,dirs_exist_ok=True,ignore=ignore)
shutil.copy2(backend/"alembic.ini",stage/"backend"/"alembic.ini")
(stage/"desktop").mkdir(exist_ok=True)
shutil.copy2(root/"desktop"/"api_entry.py",stage/"desktop"/"api_entry.py")
print("Packaged the official Python executable, standard library and backend dependencies.")
