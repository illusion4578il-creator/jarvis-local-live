#!/usr/bin/env python3
"""Jarvis: voice-first desktop assistant. Ollama is the brain; tools give it control of this Windows PC."""

import datetime
import json
import math
import os
import queue
import random
import re
import shutil
import subprocess
import threading
import time
import tkinter as tk
import webbrowser
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
    "when a tool can do it. Only delete, kill, shut down or restart when the user clearly asked for it. "
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
}


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
    return trim(Path(path).expanduser().read_text(encoding="utf-8", errors="replace"))


def write_file(path, content):
    target = Path(path).expanduser()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return f"Wrote {len(content)} characters to {target}"


def list_dir(path="."):
    entries = sorted(Path(path).expanduser().iterdir(), key=lambda item: item.name.lower())
    return trim("\n".join(f"{'[DIR] ' if item.is_dir() else ''}{item.name}" for item in entries))


def delete_path(path):
    target = Path(path).expanduser()
    if target.is_dir():
        shutil.rmtree(target)
    elif target.exists():
        target.unlink()
    else:
        return f"Nahi mila: {target}"
    return f"Deleted {target}"


def search_files(query, root=""):
    base = str(Path(root).expanduser()) if root else str(Path.home())
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


def learn_from_file(path):
    source = Path(path).expanduser()
    return save_knowledge(source.stem, source.read_text(encoding="utf-8", errors="replace"))


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
}


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


def run_turn(messages, on_tool):
    for _ in range(12):
        try:
            message = ask_model(messages)
        except requests.RequestException as error:
            return None, f"Ollama se connect nahi ho paa raha ({error}). Ollama app kholiye."
        messages.append(message)
        calls = message.get("tool_calls") or []
        if not calls:
            return (message.get("content") or "").strip() or "Theek hai.", None
        for call in calls:
            function = call.get("function", {})
            name = function.get("name", "")
            args = parse_arguments(function.get("arguments"))
            on_tool(name)
            result = execute(name, args)
            log_action(name, args, result)
            messages.append({"role": "tool", "content": result})
    return None, "Kaam bahut lamba ho gaya. Chhota sawaal poochiye."


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
        self.busy = False
        self.state = "idle"
        self.level = 0.0
        self.amp = 0.05
        self.tick = 0
        self.build_ui()
        threading.Thread(target=self.check_ollama, daemon=True).start()
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

        self.footer = tk.Label(root, text=f"Model: {SETTINGS['model']}  |  Ollama check ho raha hai...",
                               font=(FONT, 8), fg=MUTED, bg=BG, anchor="w")
        self.footer.pack(fill="x", padx=24, pady=(0, 10))
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

    def toggle_listen(self):
        if self.busy:
            if self.state == "listening":
                self.stop_listening.set()
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
            result = learn_from_file(path)
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
        win = self.make_dialog("SETTINGS", 520, 620)
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
        reply, error = run_turn(self.messages, lambda name: self.emit("tool", name))
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
            elif kind == "done":
                self.busy = False
                self.set_state("idle")
                self.entry.focus_set()
        self.root.after(50, self.poll)


def main():
    root = tk.Tk()
    Jarvis(root)
    root.mainloop()


if __name__ == "__main__":
    main()