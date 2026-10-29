#!/usr/bin/env python3
"""Jarvis: voice-first desktop assistant. Ollama is the brain; tools give it control of this Windows PC."""

import datetime
import json
import base64
import io
import math
import os
import queue
import random
import re
import shutil
import subprocess
import threading
import sys
import time
import tkinter as tk
import webbrowser
import zipfile
from pathlib import Path
from tkinter import filedialog, messagebox

import numpy as np
import psutil
import pyttsx3
import requests
import sounddevice as sd
import speech_recognition as sr
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

KNOWLEDGE = ROOT / "knowledge"
ACTION_LOG = ROOT / "jarvis-actions.log"
SETTINGS_FILE = ROOT / "jarvis-settings.json"
SAMPLE_RATE = 16000
OUTPUT_LIMIT = 8000
SOURCE_LIMIT = 200000
MAX_HISTORY = 40
SPEECH_LIMIT = 600
SYSTEM_PROMPT = (
    "You are Jarvis, a personal voice assistant running on the user's Windows PC with full access to it: "
    "PowerShell and cmd, programs, files and folders, running processes, system information, Windows settings, "
    "power actions, the web, and your own saved memory. Use tools to act; never say you cannot access the PC "
    "when a tool can do it. For multi-step tasks, first say a one-line plan, then use one tool at a time and check "
    "each result before the next. File tools work on the REAL files and folders of the PC: read, write, create, "
    "edit and delete them directly at their actual paths (absolute paths like C:\\Users\\name\\file.txt, or paths "
    "relative to the user's home folder). Never create a dummy, simulated, sandbox or virtual environment, and never "
    "pretend to act; to run a program or script, use run_command or open_app on the real file. "
    "Always confirm with list_dir or read_file that a file change really happened. "
    "For a GitHub repo the user names, use setup_repo with its URL: it clones or downloads the repo, reads its README "
    "and installs its dependencies (npm install, or a .venv with pip install -r requirements.txt). Then explain in one or "
    "two lines what the project does and how to run it. Run its code only after the user agrees. "
    "To write or change code, use search_code to find the right file, read_file to read it, then edit_file to change only "
    "the lines that need it (write_file only for a brand-new file), and open_vscode to show the folder in VS Code. "
    "If a run fails with an error, read the error text, find the cause, fix the file with edit_file and run it again; "
    "repeat at most three times, then say what still fails. "
    "To look at the screen (an error on screen, a window the user points at), use take_screenshot. "
    "To read a web page the way a browser shows it, use browse_web. "
    "Only delete, kill, shut down or restart when the user clearly asked for it. "
    "When the user reports a PC problem (wifi, internet, sound, a device, an app or a slow PC), troubleshoot it yourself: "
    "first gather facts with run_command (for example Get-NetAdapter, Get-NetIPConfiguration, ipconfig /all, "
    "netsh wlan show interfaces, Test-Connection 8.8.8.8, Get-Service for the related service, Get-WinEvent for recent "
    "errors). Read the actual error text, find the most likely cause and explain it in one or two lines. Then apply "
    "reversible fixes yourself (restart a stopped service, ipconfig /release then /renew, ipconfig /flushdns, enable a "
    "disabled adapter) and check again that the problem is really gone before you say it is fixed. "
    "Before risky changes (netsh winsock or ip reset, driver or registry edits, disabling the adapter the PC is "
    "currently using), say what you will do and wait for the user's agreement. If a fix needs admin rights you do not "
    "have, or needs the user's hands, say exactly what to click or run, and use open_settings for the right page. "
    "Never claim a fix worked without checking it. "
    "Your replies are spoken aloud: keep them short, natural and conversational, with no markdown, code blocks "
    "or lists. Reply in the same language the user speaks (Hindi, Hinglish or English)."
)

DEFAULT_SETTINGS = {
    "model": os.getenv("OLLAMA_MODEL", "llama3.1"),
    "ollama_url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/"),
    "language": os.getenv("JARVIS_LANGUAGE", "hi-IN"),
    "voice_enabled": True,
    "speech_rate": 180,
    "mic_threshold": 400,
    "allowed_folders": [str(Path.home())],
    "max_agent_steps": 12,
    "vision_model": os.getenv("OLLAMA_VISION_MODEL", "llava"),
    "confirm_destructive": True,
}

MODEL_CHOICES = [
    "llama3.1",
    "huihui_ai/gemma-4-abliterated",
]


def load_settings():
    settings = dict(DEFAULT_SETTINGS)
    if SETTINGS_FILE.exists():
        try:
            settings.update(json.loads(SETTINGS_FILE.read_text(encoding="utf-8")))
        except (ValueError, OSError):
            pass
    return settings


def save_settings(settings):
    SETTINGS_FILE.write_text(json.dumps(settings, ensure_ascii=False, indent=2), encoding="utf-8")


SETTINGS = load_settings()

BG = "#05080F"
PANEL = "#0B1422"
PANEL_EDGE = "#14324A"
GRID = "#0D1E30"
TEXT = "#D6F4FF"
MUTED = "#5B7A90"
CYAN = "#22D3EE"
GREEN = "#22C55E"
AMBER = "#F59E0B"
MAGENTA = "#E879F9"
RED = "#F87171"
FONT = "Consolas"


def check_path(path):
    target = Path(os.path.expandvars(str(path))).expanduser()
    if not target.is_absolute():
        target = Path.home() / target
    target = target.resolve()
    return target


def trim(text, limit=OUTPUT_LIMIT):
    return text if len(text) <= limit else text[:limit] + "\n...[truncated]"


def run_command(command, shell="powershell"):
    if os.name == "nt":
        argv = ["cmd", "/c", command] if shell == "cmd" else ["powershell", "-NoProfile", "-Command", command]
    else:
        argv = ["bash", "-lc", command]
    result = subprocess.run(argv, capture_output=True, text=True, errors="replace",
                            timeout=300, cwd=Path.home())
    return trim(f"exit code {result.returncode}\n{result.stdout}{result.stderr}")


def open_app(path, args=None):
    if isinstance(args, str):
        args = [args]
    args = [str(item) for item in (args or [])]
    if os.name == "nt" and not args:
        os.startfile(path)
        return f"Opened {path}."
    process = subprocess.Popen([path, *args], cwd=Path.home())
    return f"Started {path} (pid {process.pid})."


def open_url(url):
    webbrowser.open(url)
    return f"Opened {url} in the browser."


def open_settings(page=""):
    if os.name != "nt":
        return "Windows settings sirf Windows par khul sakti hain."
    os.startfile(f"ms-settings:{page}")
    return f"Settings opened: {page or 'home'}."


def system_info():
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage(Path.home().anchor or "/")
    uptime_hours = (time.time() - psutil.boot_time()) / 3600
    lines = [
        f"CPU: {psutil.cpu_percent(interval=1):.0f}% ({psutil.cpu_count()} cores)",
        f"RAM: {memory.percent:.0f}% used of {memory.total / 1073741824:.1f} GB",
        f"Disk: {disk.percent:.0f}% used of {disk.total / 1073741824:.0f} GB",
        f"Uptime: {uptime_hours:.1f} hours",
    ]
    battery = psutil.sensors_battery()
    if battery:
        state = "charging" if battery.power_plugged else "on battery"
        lines.append(f"Battery: {battery.percent:.0f}% ({state})")
    return "\n".join(lines)


def list_processes(name_filter=""):
    rows = []
    for proc in psutil.process_iter(["pid", "name", "memory_info"]):
        info = proc.info
        name = info.get("name") or ""
        if name_filter.lower() in name.lower():
            memory = info.get("memory_info")
            mb = (memory.rss if memory else 0) / 1048576
            rows.append(f"{name} (pid {info['pid']}, {mb:.0f} MB)")
    return trim("\n".join(sorted(rows)) or "Koi process nahi mila.")


def kill_process(name):
    wanted = {name.lower(), f"{name.lower()}.exe"}
    killed = 0
    for proc in psutil.process_iter(["name"]):
        if (proc.info.get("name") or "").lower() in wanted:
            try:
                proc.kill()
                killed += 1
            except psutil.Error:
                pass
    return f"{killed} process(es) band ki gayi: {name}." if killed else f"{name} naam ka process nahi mila."


POWER_COMMANDS = {
    "lock": "rundll32.exe user32.dll,LockWorkStation",
    "sleep": "rundll32.exe powrprof.dll,SetSuspendState 0,1,0",
    "shutdown": "shutdown /s /t 30",
    "restart": "shutdown /r /t 30",
    "cancel": "shutdown /a",
}


def power_action(action):
    command = POWER_COMMANDS.get(action)
    if command is None:
        return f"Unknown power action: {action}"
    return run_command(command, "cmd")


def read_file(path):
    return trim(check_path(path).read_text(encoding="utf-8", errors="replace"))


def write_file(path, content):
    target = check_path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return f"Wrote {len(content)} characters to {target}"


def edit_file(path, old_text="", new_text="", start_line=0, end_line=0):
    target = check_path(path)
    if not target.is_file():
        return f"File nahi mili: {target}"
    text = target.read_text(encoding="utf-8", errors="replace")
    if old_text:
        count = text.count(old_text)
        if count == 0:
            return f"old_text {target} mein nahi mila. read_file se exact text lekar dobara try karein."
        if count > 1:
            return f"old_text {count} jagah mila. Aage-peeche ki kuch lines jod kar unique block dein."
        updated = text.replace(old_text, new_text, 1)
        summary = f"Replaced 1 block in {target}"
    else:
        start, end = int(start_line or 0), int(end_line or 0)
        lines = text.splitlines(keepends=True)
        if not 1 <= start <= end <= len(lines):
            return f"Line range {start}-{end} file ki length ({len(lines)} lines) se bahar hai."
        replacement = new_text if (not new_text or new_text.endswith("\n")) else new_text + "\n"
        updated = "".join(lines[:start - 1]) + replacement + "".join(lines[end:])
        summary = f"Replaced lines {start}-{end} in {target}"
    if updated == text:
        return "Koi change nahi hua."
    target.write_text(updated, encoding="utf-8")
    return f"{summary}."


def list_dir(path="."):
    entries = sorted(check_path(path).iterdir(), key=lambda item: item.name.lower())
    return trim("\n".join(f"{'[DIR] ' if item.is_dir() else ''}{item.name}" for item in entries))


def delete_path(path):
    target = check_path(path)
    if target.is_dir():
        shutil.rmtree(target)
    elif target.exists():
        target.unlink()
    else:
        return f"Nahi mila: {target}"
    return f"Deleted {target}"


def search_files(query, root=""):
    base = str(check_path(root or Path.home()))
    needle = query.lower()
    matches = []
    for dirpath, dirnames, filenames in os.walk(base):
        for name in dirnames + filenames:
            if needle in name.lower():
                matches.append(os.path.join(dirpath, name))
                if len(matches) >= 100:
                    return trim("\n".join(matches))
    return trim("\n".join(matches) or "Kuch nahi mila.")


def save_knowledge(title, text):
    KNOWLEDGE.mkdir(exist_ok=True)
    name = re.sub(r"[^\w-]+", "_", title).strip("_")[:60] or "note"
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    target = KNOWLEDGE / f"{stamp}_{name}.md"
    target.write_text(f"# {title}\n\n{text[:SOURCE_LIMIT]}\n", encoding="utf-8")
    return f"Saved to memory as {target.name}"


def read_upload(path):
    source = Path(path).expanduser()
    return save_knowledge(source.stem, source.read_text(encoding="utf-8", errors="replace"))


def learn_from_file(path):
    return read_upload(check_path(path))


def learn_from_url(url):
    response = requests.get(url, timeout=20, headers={"User-Agent": "Jarvis/1.0"})
    response.raise_for_status()
    text = re.sub(r"<script.*?</script>|<style.*?</style>", " ", response.text, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return save_knowledge(url, re.sub(r"\s+", " ", text).strip())


def recall(query):
    if not KNOWLEDGE.exists():
        return "Memory is empty."
    words = [word.lower() for word in re.findall(r"\w+", query) if len(word) > 2]
    hits = []
    for file in KNOWLEDGE.glob("*.md"):
        text = file.read_text(encoding="utf-8", errors="replace")
        score = sum(text.lower().count(word) for word in words)
        if score:
            hits.append((score, file.name, text))
    if not hits:
        return "Nothing in memory matches that."
    hits.sort(key=lambda hit: hit[0], reverse=True)
    return trim("\n\n".join(f"[{name}]\n{text[:2000]}" for _, name, text in hits[:3]))


def web_search(query, limit=5):
    response = requests.get("https://html.duckduckgo.com/html/", params={"q": query}, timeout=20,
                            headers={"User-Agent": "Mozilla/5.0 Jarvis/1.0"})
    response.raise_for_status()
    links = re.findall(r'<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', response.text, flags=re.S)
    snippets = re.findall(r'class="result__snippet"[^>]*>(.*?)</a>', response.text, flags=re.S)
    results = []
    for index, (href, title) in enumerate(links[:limit]):
        clean_title = re.sub(r"<[^>]+>", "", title).strip()
        snippet = re.sub(r"<[^>]+>", "", snippets[index]).strip() if index < len(snippets) else ""
        results.append(f"{index + 1}. {clean_title}\n   {href}\n   {snippet}")
    if not results:
        return "No search results found."
    return trim("\n\n".join(results))


CODE_EXTENSIONS = {".py", ".js", ".jsx", ".ts", ".tsx", ".json", ".css", ".html", ".md", ".txt", ".yml",
                   ".yaml", ".toml", ".sql", ".java", ".cs", ".go", ".rs", ".c", ".cpp", ".h"}
SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build"}


def search_code(query, root=""):
    base = check_path(root) if root else Path.home()
    needle = query.lower()
    hits = []
    files_seen = 0
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = [name for name in dirnames if name not in SKIP_DIRS]
        for filename in filenames:
            path = Path(dirpath) / filename
            if path.suffix.lower() not in CODE_EXTENSIONS:
                continue
            files_seen += 1
            if files_seen > 5000:
                return trim("\n".join(hits) or "Bahut zyada files hain. Root folder chhota karke dobara try karein.")
            try:
                if path.stat().st_size > 1000000:
                    continue
                lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError:
                continue
            for number, line in enumerate(lines, 1):
                if needle in line.lower():
                    hits.append(f"{path}:{number}: {line.strip()[:160]}")
                    if len(hits) >= 60:
                        return trim("\n".join(hits))
    return trim("\n".join(hits) or "Code mein kuch nahi mila.")


def open_vscode(folder_path):
    target = check_path(folder_path)
    if not target.is_dir():
        return f"Folder nahi mila: {target}"
    code = shutil.which("code")
    if code is None:
        return ("VS Code ka 'code' command PATH mein nahi hai. VS Code mein Ctrl+Shift+P dabakar "
                "'Shell Command: Install code command in PATH' chalayein.")
    subprocess.Popen([code, str(target)], cwd=Path.home())
    return f"VS Code mein khol diya: {target}"


def _run_step(argv, cwd):
    result = subprocess.run(argv, cwd=cwd, capture_output=True, text=True, errors="replace", timeout=900)
    output = f"{result.stdout}{result.stderr}".strip()
    return f"$ {' '.join(argv)}\nexit code {result.returncode}\n{trim(output, 2000)}"


def _download_github_zip(url, target):
    base = url.rstrip("/").removesuffix(".git")
    for branch in ("main", "master"):
        response = requests.get(f"{base}/archive/refs/heads/{branch}.zip", timeout=120)
        if response.status_code == 200:
            break
    else:
        raise RuntimeError("GitHub se zip download nahi hua (main ya master branch nahi mili).")
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        top = archive.namelist()[0].split("/")[0]
        archive.extractall(target.parent)
    (target.parent / top).rename(target)


def setup_repo(url, folder=""):
    if "github.com" not in url:
        return "Abhi sirf GitHub repo links support hain (https://github.com/owner/repo)."
    name = url.rstrip("/").removesuffix(".git").split("/")[-1] or "repo"
    target = check_path(folder) if folder else Path.home() / name
    git = shutil.which("git")
    steps = []
    if (target / ".git").is_dir():
        steps.append(_run_step([git, "pull", "--ff-only"], target) if git
                     else "Repo pehle se hai, git nahi mila isliye update nahi kiya.")
    elif target.exists() and any(target.iterdir()):
        return f"Folder pehle se khali nahi hai: {target}. Dusra folder dein."
    elif git:
        steps.append(_run_step([git, "clone", url, str(target)], Path.home()))
    else:
        _download_github_zip(url, target)
        steps.append(f"Zip download aur extract ho gaya: {target}")
    readme = next((path for path in (target / "README.md", target / "readme.md", target / "README.txt",
                                     target / "README") if path.is_file()), None)
    steps.append("README:\n" + (trim(readme.read_text(encoding="utf-8", errors="replace"), 4000)
                               if readme else "README nahi mili."))
    if (target / "package.json").is_file():
        npm = shutil.which("npm")
        steps.append(_run_step([npm, "install"], target) if npm
                     else "npm nahi mila, dependencies install nahi hui.")
    if (target / "requirements.txt").is_file():
        venv = target / ".venv"
        if not venv.exists():
            steps.append(_run_step([sys.executable, "-m", "venv", str(venv)], target))
        pip = venv / "Scripts" / "pip.exe" if os.name == "nt" else venv / "bin" / "pip"
        steps.append(_run_step([str(pip), "install", "-r", "requirements.txt"], target))
    return trim(f"Folder: {target}\n\n" + "\n\n".join(steps), 8000)


def take_screenshot(question="Screen par kya dikh raha hai? Koi error ho to uska fix batao.", window_title=""):
    try:
        from PIL import ImageGrab
    except ImportError:
        return "Screenshot ke liye Pillow chahiye. Terminal mein 'pip install pillow' chalayein."
    if window_title:
        try:
            import pygetwindow as gw
        except ImportError:
            return "Window screenshot ke liye pygetwindow chahiye. Terminal mein 'pip install pygetwindow' chalayein."
        matches = [w for w in gw.getAllWindows() if window_title.lower() in w.title.lower()
                   and w.width > 0 and w.height > 0]
        if not matches:
            return f"'{window_title}' naam ki window nahi mili."
        window = matches[0]
        image = ImageGrab.grab(bbox=(window.left, window.top, window.right, window.bottom))
    else:
        image = ImageGrab.grab()
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    model = SETTINGS.get("vision_model") or "llava"
    response = requests.post(f"{SETTINGS['ollama_url']}/api/chat", json={
        "model": model, "stream": False,
        "messages": [{"role": "user", "content": question, "images": [encoded]}],
    }, timeout=600)
    if response.status_code == 404:
        return f"Vision model '{model}' Ollama mein nahi hai. Terminal mein 'ollama pull {model}' chalayein."
    response.raise_for_status()
    return trim(response.json()["message"]["content"].strip())


def browse_web(url):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        response = requests.get(url, timeout=30, headers={"User-Agent": "Mozilla/5.0 Jarvis/1.0"})
        response.raise_for_status()
        text = re.sub(r"<script.*?</script>|<style.*?</style>", " ", response.text, flags=re.S | re.I)
        text = re.sub(r"<[^>]+>", " ", text)
        return trim("(Playwright nahi hai, simple page fetch): " + re.sub(r"\s+", " ", text).strip())
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                page = browser.new_page()
                page.goto(url, timeout=30000, wait_until="domcontentloaded")
                page.wait_for_timeout(1500)
                title = page.title()
                text = page.inner_text("body")
            finally:
                browser.close()
    except Exception as error:
        return (f"Browser chal nahi paya ({type(error).__name__}: {error}). Terminal mein "
                "'python -m playwright install chromium' chalayein.")
    return trim(f"{title}\n{url}\n\n{text}")


CODEBASE_INDEX = ROOT / "codebase_index"
CODEBASE_CHUNK_LINES = 40


def index_codebase(folder_path):
    try:
        import chromadb
    except ImportError:
        return "Codebase index ke liye chromadb chahiye. Terminal mein 'pip install chromadb' chalayein."
    target = check_path(folder_path)
    if not target.is_dir():
        return f"Folder nahi mila: {target}"
    ids, documents, metadatas = [], [], []
    for dirpath, dirnames, filenames in os.walk(target):
        dirnames[:] = [name for name in dirnames if name not in SKIP_DIRS]
        for filename in filenames:
            path = Path(dirpath) / filename
            if path.suffix.lower() not in CODE_EXTENSIONS:
                continue
            try:
                if path.stat().st_size > 300000:
                    continue
                lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError:
                continue
            for start in range(0, len(lines), CODEBASE_CHUNK_LINES):
                chunk = "\n".join(lines[start:start + CODEBASE_CHUNK_LINES]).strip()
                if not chunk:
                    continue
                ids.append(f"{path}:{start + 1}")
                documents.append(chunk)
                metadatas.append({"path": str(path), "line": start + 1})
    if not documents:
        return "Is folder mein code file nahi mili."
    collection = chromadb.PersistentClient(path=str(CODEBASE_INDEX)).get_or_create_collection(name="codebase")
    for begin in range(0, len(ids), 256):
        collection.upsert(ids=ids[begin:begin + 256], documents=documents[begin:begin + 256],
                          metadatas=metadatas[begin:begin + 256])
    return f"{len(documents)} code chunks index ho gaye: {target}"


def search_codebase(query, limit=5):
    try:
        import chromadb
    except ImportError:
        return "Codebase search ke liye chromadb chahiye. Terminal mein 'pip install chromadb' chalayein."
    if not CODEBASE_INDEX.exists():
        return "Codebase abhi index nahi hai. Pehle index_codebase chalayein."
    collection = chromadb.PersistentClient(path=str(CODEBASE_INDEX)).get_or_create_collection(name="codebase")
    count = collection.count()
    if count == 0:
        return "Index khaali hai. Pehle index_codebase chalayein."
    result = collection.query(query_texts=[query], n_results=max(1, min(int(limit), 10, count)))
    parts = [f"{meta['path']} (line {meta['line']}):\n{document[:800]}"
             for meta, document in zip(result["metadatas"][0], result["documents"][0])]
    return trim("\n\n---\n\n".join(parts) or "Kuch relevant nahi mila.")


TOOL_FUNCTIONS = {
    "run_command": run_command,
    "open_app": open_app,
    "open_url": open_url,
    "open_settings": open_settings,
    "system_info": system_info,
    "list_processes": list_processes,
    "kill_process": kill_process,
    "power_action": power_action,
    "read_file": read_file,
    "write_file": write_file,
    "list_dir": list_dir,
    "delete_path": delete_path,
    "search_files": search_files,
    "learn_from_file": learn_from_file,
    "learn_from_url": learn_from_url,
    "save_knowledge": save_knowledge,
    "recall": recall,
    "web_search": web_search,
}
TOOL_FUNCTIONS.update({
    "edit_file": edit_file,
    "search_code": search_code,
    "open_vscode": open_vscode,
    "setup_repo": setup_repo,
    "take_screenshot": take_screenshot,
    "browse_web": browse_web,
})
TOOL_FUNCTIONS.update({
    "index_codebase": index_codebase,
    "search_codebase": search_codebase,
})


def tool(name, description, properties, required):
    return {"type": "function", "function": {"name": name, "description": description,
            "parameters": {"type": "object", "properties": properties, "required": required}}}


TEXT_SCHEMA = {"type": "string"}
TOOL_SCHEMAS = [
    tool("run_command", "Run a PowerShell (default) or cmd command on the PC and return its output. "
         "Use it for settings, registry, services, networking and anything without a dedicated tool.",
         {"command": TEXT_SCHEMA, "shell": {"type": "string", "enum": ["powershell", "cmd"]}}, ["command"]),
    tool("open_app", "Open or start an application or .exe, with optional arguments.",
         {"path": TEXT_SCHEMA, "args": {"type": "array", "items": TEXT_SCHEMA}}, ["path"]),
    tool("open_url", "Open a web address in the default browser.", {"url": TEXT_SCHEMA}, ["url"]),
    tool("open_settings", "Open a Windows Settings page, for example display, sound, network-wifi, "
         "bluetooth, windowsupdate, batterysaver, privacy. Empty page opens the Settings home.",
         {"page": TEXT_SCHEMA}, []),
    tool("system_info", "Report CPU, RAM, disk, uptime and battery status.", {}, []),
    tool("list_processes", "List running processes, optionally filtered by name.", {"name_filter": TEXT_SCHEMA}, []),
    tool("kill_process", "Force-close a running process by its name, for example chrome or notepad.",
         {"name": TEXT_SCHEMA}, ["name"]),
    tool("power_action", "Lock the screen, sleep, shut down or restart the PC (shutdown and restart wait 30 "
         "seconds), or cancel a pending shutdown.",
         {"action": {"type": "string", "enum": list(POWER_COMMANDS)}}, ["action"]),
    tool("read_file", "Read a text file from the PC.", {"path": TEXT_SCHEMA}, ["path"]),
    tool("write_file", "Create or overwrite a text file on the PC.", {"path": TEXT_SCHEMA, "content": TEXT_SCHEMA},
         ["path", "content"]),
    tool("list_dir", "List the files and folders in a directory.", {"path": TEXT_SCHEMA}, ["path"]),
    tool("delete_path", "Delete a file or folder permanently. Only when the user clearly asked.",
         {"path": TEXT_SCHEMA}, ["path"]),
    tool("search_files", "Search file and folder names under a directory (default: user home).",
         {"query": TEXT_SCHEMA, "root": TEXT_SCHEMA}, ["query"]),
    tool("learn_from_file", "Read a file the user gave and save it to Jarvis memory.", {"path": TEXT_SCHEMA}, ["path"]),
    tool("learn_from_url", "Fetch a web page (online) and save its text to Jarvis memory.", {"url": TEXT_SCHEMA}, ["url"]),
    tool("save_knowledge", "Save a note or fact the user taught to Jarvis memory.",
         {"title": TEXT_SCHEMA, "text": TEXT_SCHEMA}, ["title", "text"]),
    tool("recall", "Search Jarvis memory for saved knowledge relevant to a query.", {"query": TEXT_SCHEMA}, ["query"]),
    tool("web_search", "Search the internet for a question or topic and return top results with links and snippets. "
         "Use it to find up-to-date information, then open_url or learn_from_url for details.",
         {"query": TEXT_SCHEMA, "limit": {"type": "integer"}}, ["query"]),
]
TOOL_SCHEMAS += [
    tool("edit_file", "Edit part of an existing file in place: replace an exact text block (old_text) with new_text, "
         "or replace a line range (start_line to end_line) with new_text. Only those lines change. Use read_file "
         "first to get the exact text or line numbers.",
         {"path": TEXT_SCHEMA, "old_text": TEXT_SCHEMA, "new_text": TEXT_SCHEMA,
          "start_line": {"type": "integer"}, "end_line": {"type": "integer"}}, ["path", "new_text"]),
    tool("search_code", "Search the text inside code files under a folder (default: user home) for a word or phrase. "
         "Returns file path, line number and the line. Use it to find which file holds a feature.",
         {"query": TEXT_SCHEMA, "root": TEXT_SCHEMA}, ["query"]),
    tool("open_vscode", "Open a project folder in VS Code.", {"folder_path": TEXT_SCHEMA}, ["folder_path"]),
    tool("setup_repo", "Set up a GitHub repo from its URL: clone it (or download the zip), read its README, and "
         "install dependencies (npm install, or .venv with pip install -r requirements.txt). Returns the steps and output.",
         {"url": TEXT_SCHEMA, "folder": TEXT_SCHEMA}, ["url"]),
    tool("take_screenshot", "Capture the PC screen and ask the Ollama vision model about it, for example to read an "
         "error on screen. Returns the vision model's answer.", {"question": TEXT_SCHEMA}, []),
    tool("browse_web", "Open a web page in a headless browser (JavaScript runs) and return its title and visible text. "
         "Use it to read documentation or check a website.", {"url": TEXT_SCHEMA}, ["url"]),
]
TOOL_SCHEMAS += [
    tool("index_codebase", "Index all code files under a project folder into a local vector database (ChromaDB) "
         "so they can be searched by meaning. Run it once per project, or again after big changes.",
         {"folder_path": TEXT_SCHEMA}, ["folder_path"]),
    tool("search_codebase", "Find the code most related to a question or feature, by meaning, from the indexed "
         "project. Returns file paths, line numbers and code snippets.",
         {"query": TEXT_SCHEMA, "limit": {"type": "integer"}}, ["query"]),
]


def execute(name, args):
    function = TOOL_FUNCTIONS.get(name)
    if function is None:
        return f"Unknown tool: {name}"
    try:
        return str(function(**args))
    except Exception as error:
        return f"Error: {type(error).__name__}: {error}"


def log_action(name, args, result):
    with ACTION_LOG.open("a", encoding="utf-8") as file:
        stamp = datetime.datetime.now().isoformat(timespec="seconds")
        file.write(f"{stamp} {name} {json.dumps(args, ensure_ascii=False)} -> {result[:300]!r}\n")


def ask_model(messages):
    response = requests.post(f"{SETTINGS['ollama_url']}/api/chat", json={
        "model": SETTINGS["model"], "messages": messages, "tools": TOOL_SCHEMAS, "stream": False,
    }, timeout=600)
    response.raise_for_status()
    return response.json()["message"]


def parse_arguments(raw):
    if isinstance(raw, dict):
        return raw
    try:
        return json.loads(raw or "{}")
    except ValueError:
        return {}


CONFIRM_TOOLS = {"delete_path", "kill_process", "power_action", "write_file", "edit_file", "setup_repo"}


def run_turn(messages, on_tool, on_plan, confirm, cancel):
    limit = int(SETTINGS["max_agent_steps"])
    for step in range(1, limit + 1):
        if cancel.is_set():
            return None, "Kaam aapke kehne par rok diya gaya."
        try:
            message = ask_model(messages)
        except requests.RequestException as error:
            return None, f"Ollama se connect nahi ho paa raha ({error}). Ollama app kholiye."
        messages.append(message)
        calls = message.get("tool_calls") or []
        if not calls:
            return (message.get("content") or "").strip() or "Theek hai.", None
        if message.get("content"):
            on_plan(message["content"].strip())
        for call in calls:
            function = call.get("function", {})
            name = function.get("name", "")
            args = parse_arguments(function.get("arguments"))
            on_tool(step, limit, name, args)
            if name in CONFIRM_TOOLS and SETTINGS["confirm_destructive"] and not confirm(name, args):
                result = "User ne is action ki permission nahi di. Ise skip karke batayein."
            else:
                result = execute(name, args)
            log_action(name, args, result)
            messages.append({"role": "tool", "content": result})
    return None, f"Kaam {limit} steps mein poora nahi hua. Chhota sawaal poochiye ya Settings mein steps badhayein."


def trim_history(messages):
    if len(messages) > MAX_HISTORY + 1:
        del messages[1:len(messages) - MAX_HISTORY]


def record_utterance(stop_event, on_level=None, max_seconds=15.0, silence_seconds=1.2):
    block = SAMPLE_RATE // 10
    threshold = SETTINGS["mic_threshold"]
    frames, heard, silent_for = [], False, 0.0
    started = time.time()
    with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="int16", blocksize=block) as stream:
        while not stop_event.is_set() and time.time() - started < max_seconds:
            data, _ = stream.read(block)
            frames.append(data.copy())
            level = float(np.abs(data).mean())
            if on_level:
                on_level(min(1.0, level / 3000))
            if level > threshold:
                heard, silent_for = True, 0.0
            elif heard:
                silent_for += 0.1
                if silent_for >= silence_seconds:
                    break
    if not heard:
        return None
    return np.concatenate(frames).tobytes()


def transcribe(recognizer, raw):
    audio = sr.AudioData(raw, SAMPLE_RATE, 2)
    try:
        return recognizer.recognize_google(audio, language=SETTINGS["language"]).strip()
    except sr.UnknownValueError:
        return ""


def check_mic():
    try:
        device = sd.query_devices(kind="input")
    except Exception as error:
        return False, f"Mic device nahi mila: {error}"
    if not device or device.get("max_input_channels", 0) < 1:
        return False, "Mic device nahi mila"
    try:
        with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="int16", blocksize=SAMPLE_RATE // 10):
            pass
    except Exception as error:
        return False, f"Mic chalu nahi ho paa raha (permission ya device check karein): {error}"
    return True, f"Mic ready: {device.get('name', 'input device')}"


SPEECH_LOCK = threading.Lock()


def speak(text):
    if not SETTINGS["voice_enabled"]:
        return
    spoken = re.sub(r"[*_`#>|]+", " ", text)[:SPEECH_LIMIT]
    with SPEECH_LOCK:
        try:
            engine = pyttsx3.init()
            engine.setProperty("rate", int(SETTINGS["speech_rate"]))
            engine.say(spoken)
            engine.runAndWait()
            engine.stop()
        except Exception:
            pass


STATE_INFO = {
    "idle": ("STANDBY", "Mic dabaiye ya type karein.", CYAN),
    "listening": ("LISTENING", "Sun raha hoon... rokne ke liye MIC dobara dabaiye.", GREEN),
    "thinking": ("PROCESSING", "Soch raha hoon...", AMBER),
    "speaking": ("RESPONDING", "Bol raha hoon...", MAGENTA),
}


class Jarvis:
    def __init__(self, root):
        self.root = root
        self.events = queue.Queue()
        self.messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        self.recognizer = sr.Recognizer()
        self.stop_listening = threading.Event()
        self.cancel = threading.Event()
        self.mic_ready = False
        self.busy = False
        self.state = "idle"
        self.level = 0.0
        self.amp = 0.05
        self.tick = 0
        self.build_ui()
        threading.Thread(target=self.check_ollama, daemon=True).start()
        threading.Thread(target=self.check_mic_status, daemon=True).start()
        self.root.after(50, self.poll)
        self.root.after(40, self.animate)

    def build_ui(self):
        root = self.root
        root.title("J.A.R.V.I.S.")
        root.geometry("980x760")
        root.minsize(800, 660)
        root.configure(bg=BG)

        header = tk.Frame(root, bg=BG)
        header.pack(fill="x", padx=24, pady=(18, 0))
        tk.Label(header, text="J . A . R . V . I . S", font=(FONT, 20, "bold"), fg=CYAN,
                 bg=BG).pack(side="left")
        self.mode_label = tk.Label(header, text="STANDBY", font=(FONT, 10, "bold"), fg=CYAN, bg=BG)
        self.mode_label.pack(side="right")
        self.dot = tk.Canvas(header, width=12, height=12, bg=BG, highlightthickness=0)
        self.dot.pack(side="right", padx=(0, 8))
        self.dot_item = self.dot.create_oval(2, 2, 10, 10, fill=CYAN, outline="")

        self.wave = tk.Canvas(root, height=150, bg=PANEL, highlightthickness=1,
                              highlightbackground=PANEL_EDGE)
        self.wave.pack(fill="x", padx=24, pady=(14, 0))

        self.hint = tk.Label(root, text=STATE_INFO["idle"][1], font=(FONT, 10), fg=MUTED, bg=BG,
                             anchor="w")
        self.hint.pack(fill="x", padx=26, pady=(8, 0))

        status = tk.Frame(root, bg=BG)
        status.pack(fill="x", padx=26, pady=(6, 0))
        self.activity = tk.Label(status, text="Agent: idle", font=(FONT, 9, "bold"), fg=CYAN, bg=BG, anchor="w")
        self.activity.pack(side="left", fill="x", expand=True)
        self.make_button(status, "STOP", self.stop_agent).pack(side="right", padx=(6, 0))
        self.make_button(status, "LOGS", self.open_logs).pack(side="right")

        chat_frame = tk.Frame(root, bg=PANEL, highlightthickness=1, highlightbackground=PANEL_EDGE)
        chat_frame.pack(fill="both", expand=True, padx=24, pady=(10, 12))
        self.chat = tk.Text(chat_frame, bg=PANEL, fg=TEXT, font=(FONT, 11), wrap="word", height=8,
                            relief="flat", padx=18, pady=14, highlightthickness=0, borderwidth=0,
                            state="disabled", cursor="arrow")
        self.chat.pack(fill="both", expand=True)
        self.chat.tag_configure("you", foreground=CYAN, font=(FONT, 9, "bold"))
        self.chat.tag_configure("jarvis", foreground=GREEN, font=(FONT, 9, "bold"))
        self.chat.tag_configure("tool", foreground=AMBER, font=(FONT, 9, "bold"))
        self.chat.tag_configure("error", foreground=RED, font=(FONT, 9, "bold"))
        self.chat.tag_configure("info", foreground=MUTED, font=(FONT, 9, "bold"))
        self.chat.tag_configure("body", foreground=TEXT)
        self.chat.tag_configure("muted", foreground=MUTED, font=(FONT, 10))
        self.add_line("SYSTEM", "Namaste! Mic dabaiye aur kuch bhi poochiye, karwaiye ya sikhaiye.", "info", "muted")

        bar = tk.Frame(root, bg=BG)
        bar.pack(fill="x", padx=24, pady=(0, 8))
        self.entry = tk.Entry(bar, font=(FONT, 11), bg=PANEL, fg=TEXT, insertbackground=CYAN,
                              relief="flat", highlightthickness=1, highlightbackground=PANEL_EDGE,
                              highlightcolor=CYAN)
        self.entry.pack(side="left", fill="x", expand=True, ipady=8, padx=(0, 6))
        self.entry.bind("<Return>", self.on_text)
        for text, command in (("SEND", self.on_text), ("MIC", self.toggle_listen),
                              ("UPLOAD", self.upload_file), ("TEACH", self.open_teach),
                              ("SETTINGS", self.open_settings)):
            self.make_button(bar, text, command).pack(side="left", padx=(6, 0))

        footer_bar = tk.Frame(root, bg=BG)
        footer_bar.pack(fill="x", padx=24, pady=(0, 10))
        self.footer = tk.Label(footer_bar, text=f"Model: {SETTINGS['model']}  |  Ollama check ho raha hai...",
                               font=(FONT, 8), fg=MUTED, bg=BG, anchor="w")
        self.footer.pack(side="left", fill="x", expand=True)
        model_choices = list(MODEL_CHOICES)
        if SETTINGS["model"] not in model_choices:
            model_choices.append(SETTINGS["model"])
        self.model_var = tk.StringVar(value=SETTINGS["model"])
        model_menu = tk.OptionMenu(footer_bar, self.model_var, *model_choices, command=self.switch_model)
        model_menu.configure(font=(FONT, 9, "bold"), fg=CYAN, bg=PANEL, activeforeground=BG,
                             activebackground=CYAN, relief="flat", bd=0, highlightthickness=1,
                             highlightbackground=PANEL_EDGE, cursor="hand2")
        model_menu["menu"].configure(font=(FONT, 9), fg=TEXT, bg=PANEL, activeforeground=BG,
                                     activebackground=CYAN)
        model_menu.pack(side="right", padx=(8, 0))
        root.protocol("WM_DELETE_WINDOW", root.destroy)

    def make_button(self, parent, text, command):
        return tk.Button(parent, text=text, command=command, font=(FONT, 9, "bold"), fg=CYAN, bg=PANEL,
                         activeforeground=BG, activebackground=CYAN, relief="flat", bd=0, padx=12, pady=8,
                         cursor="hand2", highlightthickness=1, highlightbackground=PANEL_EDGE)

    def add_line(self, label, body, label_tag, body_tag):
        self.chat.configure(state="normal")
        self.chat.insert("end", f"{label}\n", label_tag)
        self.chat.insert("end", f"{body}\n\n", body_tag)
        self.chat.configure(state="disabled")
        self.chat.see("end")

    def emit(self, kind, value):
        self.events.put((kind, value))

    def check_ollama(self):
        try:
            requests.get(f"{SETTINGS['ollama_url']}/api/version", timeout=2).raise_for_status()
            text = f"Model: {SETTINGS['model']}  |  Ollama connected"
        except requests.RequestException:
            text = f"Model: {SETTINGS['model']}  |  Ollama band hai, Ollama app kholiye"
        self.emit("footer", text)

    def check_mic_status(self):
        ok, text = check_mic()
        self.mic_ready = ok
        self.emit("info", text if ok else f"{text}. Abhi sirf text se baat ho sakti hai.")

    def toggle_listen(self):
        if self.busy:
            if self.state == "listening":
                self.stop_listening.set()
            return
        if not self.mic_ready:
            threading.Thread(target=self.check_mic_status, daemon=True).start()
            self.emit("info", "Mic abhi ready nahi hai. Mic check ho raha hai, text se poochiye.")
            return
        self.stop_listening.clear()
        self.start(self.voice_turn)

    def on_text(self, _event=None):
        text = self.entry.get().strip()
        if not text:
            return
        if self.busy:
            messagebox.showinfo("Jarvis", "Jarvis abhi kaam kar raha hai, thodi der baad poochiye.")
            return
        self.entry.delete(0, "end")
        self.start(self.text_turn, text)

    def start(self, target, *args):
        self.busy = True
        self.cancel.clear()
        threading.Thread(target=target, args=args, daemon=True).start()

    def voice_turn(self):
        self.emit("state", "listening")
        try:
            raw = record_utterance(self.stop_listening, lambda level: self.emit("level", level))
        except Exception as error:
            self.emit("error", f"Mic nahi chal raha: {error}")
            return self.finish()
        if raw is None:
            self.emit("info", "Kuch sunai nahi diya.")
            return self.finish()
        self.emit("state", "thinking")
        try:
            text = transcribe(self.recognizer, raw)
        except sr.RequestError:
            self.emit("error", "Speech samajhne ke liye internet chahiye.")
            return self.finish()
        if not text:
            self.emit("info", "Samajh nahi aaya, dobara bolein.")
            return self.finish()
        self.respond(text)
        self.finish()

    def text_turn(self, text):
        self.emit("state", "thinking")
        self.respond(text)
        self.finish()

    def upload_file(self):
        if self.busy:
            messagebox.showinfo("Jarvis", "Jarvis abhi kaam kar raha hai, thodi der baad try kijiye.")
            return
        path = filedialog.askopenfilename(
            title="Jarvis ko file sikhayein",
            filetypes=[("Text aur code files", "*.txt *.md *.py *.js *.jsx *.json *.csv *.log *.html *.css"),
                       ("Sab files", "*.*")])
        if path:
            self.start(self.learn_file_turn, path)

    def learn_file_turn(self, path):
        self.emit("state", "thinking")
        try:
            result = read_upload(path)
            self.emit("info", f"{Path(path).name} sikh li. {result}.")
            speak("File sikh li hai.")
        except Exception as error:
            self.emit("error", f"File sikh nahi paayi: {error}")
        self.finish()

    def open_teach(self):
        if self.busy:
            messagebox.showinfo("Jarvis", "Jarvis abhi kaam kar raha hai, thodi der baad try kijiye.")
            return
        win = self.make_dialog("JARVIS KO SIKHAYEIN", 560, 460)
        tk.Label(win, text="TOPIC / TITLE", font=(FONT, 9, "bold"), fg=CYAN, bg=BG,
                 anchor="w").pack(fill="x", padx=22, pady=(18, 4))
        title_entry = tk.Entry(win, font=(FONT, 11), bg=PANEL, fg=TEXT, insertbackground=CYAN,
                               relief="flat", highlightthickness=1, highlightbackground=PANEL_EDGE)
        title_entry.pack(fill="x", padx=22, ipady=6)
        tk.Label(win, text="JO SIKHANA HAI", font=(FONT, 9, "bold"), fg=CYAN, bg=BG,
                 anchor="w").pack(fill="x", padx=22, pady=(14, 4))
        body = tk.Text(win, height=10, font=(FONT, 10), bg=PANEL, fg=TEXT, insertbackground=CYAN,
                       relief="flat", wrap="word", highlightthickness=1, highlightbackground=PANEL_EDGE)
        body.pack(fill="both", expand=True, padx=22)

        def save():
            title = title_entry.get().strip()
            text = body.get("1.0", "end").strip()
            if not title or not text:
                messagebox.showwarning("Jarvis", "Title aur text dono likhiye.", parent=win)
                return
            win.destroy()
            self.start(self.teach_turn, title, text)

        buttons = tk.Frame(win, bg=BG)
        buttons.pack(fill="x", padx=22, pady=16)
        self.make_button(buttons, "SAVE", save).pack(side="right")
        self.make_button(buttons, "CANCEL", win.destroy).pack(side="right", padx=(0, 8))

    def teach_turn(self, title, text):
        self.emit("state", "thinking")
        try:
            result = save_knowledge(title, text)
            self.emit("info", f"Yaad kar liya: {title}. {result}.")
            speak("Theek hai, yaad kar liya.")
        except Exception as error:
            self.emit("error", f"Yaad nahi kar paya: {error}")
        self.finish()

    def open_settings(self):
        win = self.make_dialog("SETTINGS", 520, 880)

    def switch_model(self, model):
        SETTINGS["model"] = model
        save_settings(SETTINGS)
        self.footer.configure(text=f"Model: {model}  |  Ollama check ho raha hai...")
        threading.Thread(target=self.check_ollama, daemon=True).start()
        self.emit("info", f"Model switch ho gaya: {model}")

    def open_settings(self):
        win = self.make_dialog("SETTINGS", 520, 880)
        fields = {}
        for key, label in (("model", "OLLAMA MODEL"), ("ollama_url", "OLLAMA URL"),
                           ("language", "BOLNE KI LANGUAGE (hi-IN, en-IN, en-US)")):
            tk.Label(win, text=label, font=(FONT, 9, "bold"), fg=CYAN, bg=BG,
                     anchor="w").pack(fill="x", padx=22, pady=(14, 4))
            entry = tk.Entry(win, font=(FONT, 11), bg=PANEL, fg=TEXT, insertbackground=CYAN,
                             relief="flat", highlightthickness=1, highlightbackground=PANEL_EDGE)
            entry.insert(0, str(SETTINGS[key]))
            entry.pack(fill="x", padx=22, ipady=6)
            fields[key] = entry

        voice_var = tk.BooleanVar(value=bool(SETTINGS["voice_enabled"]))
        tk.Checkbutton(win, text="Jarvis bolkar jawab de (voice output)", variable=voice_var,
                       font=(FONT, 10), fg=TEXT, bg=BG, selectcolor=PANEL, activebackground=BG,
                       activeforeground=TEXT).pack(anchor="w", padx=22, pady=(18, 0))
        rate_var = tk.IntVar(value=int(SETTINGS["speech_rate"]))
        tk.Label(win, text="BOLNE KI SPEED", font=(FONT, 9, "bold"), fg=CYAN, bg=BG,
                 anchor="w").pack(fill="x", padx=22, pady=(14, 0))
        tk.Scale(win, from_=120, to=260, orient="horizontal", variable=rate_var, bg=BG, fg=TEXT,
                 troughcolor=PANEL, highlightthickness=0, activebackground=CYAN).pack(fill="x", padx=22)
        threshold_var = tk.IntVar(value=int(SETTINGS["mic_threshold"]))
        tk.Label(win, text="MIC SENSITIVITY (kam value = zyada sensitive)", font=(FONT, 9, "bold"), fg=CYAN,
                 bg=BG, anchor="w").pack(fill="x", padx=22, pady=(14, 0))
        tk.Scale(win, from_=100, to=1500, orient="horizontal", variable=threshold_var, bg=BG, fg=TEXT,
                 troughcolor=PANEL, highlightthickness=0, activebackground=CYAN).pack(fill="x", padx=22)

        steps_var = tk.IntVar(value=int(SETTINGS["max_agent_steps"]))
        tk.Label(win, text="AGENT STEPS (ek kaam mein maximum tool calls)", font=(FONT, 9, "bold"), fg=CYAN, bg=BG,
                 anchor="w").pack(fill="x", padx=22, pady=(14, 0))
        tk.Scale(win, from_=3, to=30, orient="horizontal", variable=steps_var, bg=BG, fg=TEXT,
                 troughcolor=PANEL, highlightthickness=0, activebackground=CYAN).pack(fill="x", padx=22)
        confirm_var = tk.BooleanVar(value=bool(SETTINGS["confirm_destructive"]))
        tk.Checkbutton(win, text="Delete, kill, power aur file overwrite se pehle poochho", variable=confirm_var,
                       font=(FONT, 10), fg=TEXT, bg=BG, selectcolor=PANEL, activebackground=BG,
                       activeforeground=TEXT).pack(anchor="w", padx=22, pady=(14, 0))

        def save():
            for key, entry in fields.items():
                value = entry.get().strip()
                if not value:
                    messagebox.showwarning("Jarvis", "Khaali field nahi chal sakti.", parent=win)
                    return
                SETTINGS[key] = value.rstrip("/") if key == "ollama_url" else value
            SETTINGS["voice_enabled"] = bool(voice_var.get())
            SETTINGS["speech_rate"] = int(rate_var.get())
            SETTINGS["mic_threshold"] = int(threshold_var.get())
            SETTINGS["max_agent_steps"] = int(steps_var.get())
            SETTINGS["confirm_destructive"] = bool(confirm_var.get())
            save_settings(SETTINGS)
            win.destroy()
            self.footer.configure(text=f"Model: {SETTINGS['model']}  |  Ollama check ho raha hai...")
            threading.Thread(target=self.check_ollama, daemon=True).start()

        buttons = tk.Frame(win, bg=BG)
        buttons.pack(fill="x", padx=22, pady=18, side="bottom")
        self.make_button(buttons, "SAVE", save).pack(side="right")
        self.make_button(buttons, "CANCEL", win.destroy).pack(side="right", padx=(0, 8))

    def make_dialog(self, title, width, height):
        win = tk.Toplevel(self.root)
        win.title(title)
        win.geometry(f"{width}x{height}")
        win.configure(bg=BG)
        win.transient(self.root)
        win.grab_set()
        tk.Label(win, text=title, font=(FONT, 14, "bold"), fg=CYAN, bg=BG).pack(anchor="w", padx=22, pady=(18, 0))
        return win

    def respond(self, text):
        self.emit("user", text)
        self.messages.append({"role": "user", "content": text})
        reply, error = run_turn(self.messages, self.report_tool, self.report_plan, self.confirm_tool, self.cancel)

    def report_tool(self, step, limit, name, args):
        detail = json.dumps(args, ensure_ascii=False)[:160]
        self.emit("activity", f"Step {step}/{limit}: {name} {detail}")
        self.emit("tool", f"{name} {detail}")

    def report_plan(self, text):
        self.emit("plan", text)

    def confirm_tool(self, name, args):
        answer = {"ok": False}
        asked = threading.Event()
        self.emit("confirm", (name, args, answer, asked))
        asked.wait(300)
        return answer["ok"]

    def stop_agent(self):
        self.cancel.set()
        self.emit("info", "Stop ka signal bheja gaya. Jarvis current step ke baad ruk jayega.")

    def open_logs(self):
        win = self.make_dialog("ACTION LOG", 760, 520)
        view = tk.Text(win, font=(FONT, 9), bg=PANEL, fg=TEXT, relief="flat", wrap="none",
                       highlightthickness=1, highlightbackground=PANEL_EDGE)

        def refresh():
            lines = ACTION_LOG.read_text(encoding="utf-8", errors="replace").splitlines()[-300:] if ACTION_LOG.exists() else []
            view.configure(state="normal")
            view.delete("1.0", "end")
            view.insert("1.0", "\n".join(lines) or "Abhi koi action log nahi hai.")
            view.configure(state="disabled")
            view.see("end")

        buttons = tk.Frame(win, bg=BG)
        buttons.pack(fill="x", padx=22, pady=14, side="bottom")
        self.make_button(buttons, "REFRESH", refresh).pack(side="right")
        self.make_button(buttons, "CLOSE", win.destroy).pack(side="right", padx=(0, 8))
        view.pack(fill="both", expand=True, padx=22, pady=(10, 0))
        refresh()
        trim_history(self.messages)
        if error:
            self.emit("error", error)
            speak(error)
            return
        self.emit("answer", reply)
        if SETTINGS["voice_enabled"]:
            self.emit("state", "speaking")
        speak(reply)

    def finish(self):
        self.emit("state", "idle")
        self.emit("done", "")

    def set_state(self, state):
        self.state = state
        mode, hint, color = STATE_INFO[state]
        self.mode_label.configure(text=mode, fg=color)
        self.dot.itemconfigure(self.dot_item, fill=color)
        self.hint.configure(text=hint)

    def animate(self):
        self.tick += 1
        if self.state != "listening":
            self.level = 0.0
        canvas = self.wave
        width = max(canvas.winfo_width(), 200)
        height = max(canvas.winfo_height(), 120)
        t = self.tick * 0.12
        if self.state == "listening":
            target = 0.08 + min(1.0, self.level * 3.0) * random.uniform(0.7, 1.1)
        elif self.state == "thinking":
            target = 0.18 + 0.1 * math.sin(t * 2)
        elif self.state == "speaking":
            target = 0.45 + 0.25 * math.sin(t * 3)
        else:
            target = 0.06 + 0.03 * math.sin(t)
        self.amp += (target - self.amp) * 0.35
        color = STATE_INFO[self.state][2]
        canvas.delete("all")
        for x in range(0, width, 40):
            canvas.create_line(x, 0, x, height, fill=GRID)
        for y in range(0, height, 30):
            canvas.create_line(0, y, width, y, fill=GRID)
        mid = height / 2
        count = max(24, width // 16)
        step = width / count
        speed = 3 if self.state == "speaking" else 1.5
        for i in range(count):
            wobble = 0.5 + 0.5 * math.sin(i * 0.45 + t * speed)
            jitter = random.uniform(0.85, 1.15) if self.state in ("listening", "speaking") else 1.0
            half = max(2.0, self.amp * wobble * jitter * mid * 0.9)
            x = i * step + step / 2
            canvas.create_rectangle(x - 2, mid - half, x + 2, mid + half, fill=color, outline="")
        self.root.after(40, self.animate)

    def poll(self):
        while True:
            try:
                kind, value = self.events.get_nowait()
            except queue.Empty:
                break
            if kind == "state":
                self.set_state(value)
            elif kind == "level":
                self.level = value
            elif kind == "user":
                self.add_line("YOU", value, "you", "body")
            elif kind == "answer":
                self.add_line("JARVIS", value, "jarvis", "body")
            elif kind == "tool":
                self.add_line("TOOL", value, "tool", "muted")
            elif kind == "error":
                self.add_line("ERROR", value, "error", "body")
            elif kind == "info":
                self.add_line("SYSTEM", value, "info", "muted")
            elif kind == "footer":
                self.footer.configure(text=value)
            elif kind == "activity":
                self.activity.configure(text=value)
            elif kind == "plan":
                self.add_line("PLAN", value, "info", "muted")
            elif kind == "confirm":
                name, args, answer, asked = value
                answer["ok"] = messagebox.askyesno(
                    "Jarvis - Permission",
                    f"Jarvis ye action chalana chahta hai:\n\n{name}\n{json.dumps(args, ensure_ascii=False)[:400]}\n\nAllow karein?",
                    parent=self.root)
                asked.set()
            elif kind == "done":
                self.busy = False
                self.set_state("idle")
                self.activity.configure(text="Agent: idle")
                self.entry.focus_set()
        self.root.after(50, self.poll)


def main():
    root = tk.Tk()
    Jarvis(root)
    root.mainloop()


if __name__ == "__main__":
    main()