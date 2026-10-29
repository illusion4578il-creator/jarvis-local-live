#!/usr/bin/env python3
"""One-click Jarvis launcher: creates ./venv, installs requirements.txt when it changes, starts jarvis.py."""

import hashlib
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VENV = ROOT / "venv"
REQUIREMENTS = ROOT / "requirements.txt"
STAMP = VENV / ".requirements.sha256"
OLLAMA_URL = "http://localhost:11434"


def venv_python():
    return VENV / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")


def ensure_venv():
    python = venv_python()
    if not python.exists():
        print("Virtual environment ban raha hai...")
        subprocess.check_call([sys.executable, "-m", "venv", str(VENV)], cwd=ROOT)
    digest = hashlib.sha256(REQUIREMENTS.read_bytes()).hexdigest()
    if not STAMP.is_file() or STAMP.read_text(encoding="utf-8").strip() != digest:
        print("Packages install ho rahe hain (pehli baar kuch minute lag sakte hain)...")
        subprocess.check_call([str(python), "-m", "pip", "install", "-r", str(REQUIREMENTS)], cwd=ROOT)
        STAMP.write_text(digest, encoding="utf-8")
    return python


def ollama_running():
    try:
        urllib.request.urlopen(OLLAMA_URL + "/api/version", timeout=3)
        return True
    except (urllib.error.URLError, OSError):
        return False


def main():
    if not REQUIREMENTS.is_file():
        print("requirements.txt nahi mili. Poori Jarvis folder download karein.")
        return 1
    python = ensure_venv()
    if not ollama_running():
        print("Ollama chal nahi raha. Ollama app kholiye ya 'ollama serve' chalaiye. Jarvis phir bhi khul raha hai.")
    return subprocess.call([str(python), str(ROOT / "jarvis.py")], cwd=ROOT)


if __name__ == "__main__":
    sys.exit(main())