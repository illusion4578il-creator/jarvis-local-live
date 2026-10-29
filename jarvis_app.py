#!/usr/bin/env python3
"""Jarvis: voice-first desktop assistant. Ollama is the brain; tools give it control of this Windows PC."""

import datetime
import json
import os
import queue
import re
import shutil
import subprocess
import threading
import time
import tkinter as tk
import webbrowser
from pathlib import Path

import numpy as np
import psutil
import pyttsx3
import requests
import sounddevice as sd
import speech_recognition as sr
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")
LANGUAGE = os.getenv("JARVIS_LANGUAGE", "hi-IN")
KNOWLEDGE = ROOT / "knowledge"
ACTION_LOG = ROOT / "jarvis-actions.log"
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

BG = "#0B0F17"
CARD = "#131A26"
TEXT = "#E5E7EB"
MUTED = "#8B95A7"
ORB_IDLE = "#1B2433"
ORB_IDLE_EDGE = "#3B82F6"
ORB_LISTEN = "#16A34A"
ORB_THINK = "#F59E0B"
ORB_SPEAK = "#3B82F6"


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


TEXT = {"type": "string"}
TOOL_SCHEMAS = [
    tool("run_command", "Run a PowerShell (default) or cmd command on the PC and return its output. "
         "Use it for settings, registry, services, networking and anything without a dedicated tool.",
         {"command": TEXT, "shell": {"type": "string", "enum": ["powershell", "cmd"]}}, ["command"]),
    tool("open_app", "Open or start an application or .exe, with optional arguments.",
         {"path": TEXT, "args": {"type": "array", "items": TEXT}}, ["path"]),
    tool("open_url", "Open a web address in the default browser.", {"url": TEXT}, ["url"]),
    tool("open_settings", "Open a Windows Settings page, for example display, sound, network-wifi, "
         "bluetooth, windowsupdate, batterysaver, privacy. Empty page opens the Settings home.",
         {"page": TEXT}, []),
    tool("system_info", "Report CPU, RAM, disk, uptime and battery status.", {}, []),
    tool("list_processes", "List running processes, optionally filtered by name.", {"name_filter": TEXT}, []),
    tool("kill_process", "Force-close a running process by its name, for example chrome or notepad.",
         {"name": TEXT}, ["name"]),
    tool("power_action", "Lock the screen, sleep, shut down or restart the PC (shutdown and restart wait 30 "
         "seconds), or cancel a pending shutdown.",
         {"action": {"type": "string", "enum": list(POWER_COMMANDS)}}, ["action"]),
    tool("read_file", "Read a text file from the PC.", {"path": TEXT}, ["path"]),
    tool("write_file", "Create or overwrite a text file on the PC.", {"path": TEXT, "content": TEXT},
         ["path", "content"]),
    tool("list_dir", "List the files and folders in a directory.", {"path": TEXT}, ["path"]),
    tool("delete_path", "Delete a file or folder permanently. Only when the user clearly asked.",
         {"path": TEXT}, ["path"]),
    tool("search_files", "Search file and folder names under a directory (default: user home).",
         {"query": TEXT, "root": TEXT}, ["query"]),
    tool("learn_from_file", "Read a file the user gave and save it to Jarvis memory.", {"path": TEXT}, ["path"]),
    tool("learn_from_url", "Fetch a web page (online) and save its text to Jarvis memory.", {"url": TEXT}, ["url"]),
    tool("save_knowledge", "Save a note or fact the user taught to Jarvis memory.",
         {"title": TEXT, "text": TEXT}, ["title", "text"]),
    tool("recall", "Search Jarvis memory for saved knowledge relevant to a query.", {"query": TEXT}, ["query"]),
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
    response = requests.post(f"{OLLAMA_URL}/api/chat", json={
        "model": MODEL, "messages": messages, "tools": TOOL_SCHEMAS, "stream": False,
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


def record_utterance(stop_event, max_seconds=15.0, silence_seconds=1.2, threshold=400):
    block = SAMPLE_RATE // 10
    frames, heard, silent_for = [], False, 0.0
    started = time.time()
    with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="int16", blocksize=block) as stream:
        while not stop_event.is_set() and time.time() - started < max_seconds:
            data, _ = stream.read(block)
            frames.append(data.copy())
            if float(np.abs(data).mean()) > threshold:
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
        return recognizer.recognize_google(audio, language=LANGUAGE).strip()
    except sr.UnknownValueError:
        return ""


SPEECH_LOCK = threading.Lock()


def speak(text):
    spoken = re.sub(r"[*_`#>|]+", " ", text)[:SPEECH_LIMIT]
    with SPEECH_LOCK:
        try:
            engine = pyttsx3.init()
            engine.setProperty("rate", 180)
            engine.say(spoken)
            engine.runAndWait()
            engine.stop()
        except Exception:
            pass


STATE_STYLE = {
    "idle": ("Ready. Mic dabaiye aur bolein.", ORB_IDLE, "MIC"),
    "listening": ("Sun raha hoon... rokne ke liye dobara dabaiye.", ORB_LISTEN, "SUN RAHA"),
    "thinking": ("Soch raha hoon...", ORB_THINK, "SOCH RAHA"),
    "speaking": ("Bol raha hoon...", ORB_SPEAK, "BOL RAHA"),
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
        self.build_ui()
        threading.Thread(target=self.check_ollama, daemon=True).start()
        self.root.after(60, self.poll)

    def build_ui(self):
        root = self.root
        root.title("Jarvis")
        root.geometry("460x660")
        root.minsize(400, 580)
        root.configure(bg=BG)

        tk.Label(root, text="JARVIS", font=("Segoe UI", 22, "bold"), fg=TEXT, bg=BG).pack(pady=(22, 0))
        self.status = tk.Label(root, text=STATE_STYLE["idle"][0], font=("Segoe UI", 10), fg=MUTED, bg=BG)
        self.status.pack(pady=(2, 14))

        self.orb = tk.Canvas(root, width=200, height=200, bg=BG, highlightthickness=0, cursor="hand2")
        self.orb.pack()
        self.orb_ring = self.orb.create_oval(14, 14, 186, 186, fill=ORB_IDLE, outline=ORB_IDLE_EDGE, width=3)
        self.orb_label = self.orb.create_text(100, 100, text="MIC", fill=TEXT, font=("Segoe UI", 13, "bold"))
        self.orb.bind("<Button-1>", lambda _event: self.toggle_listen())

        panel = tk.Frame(root, bg=CARD)
        panel.pack(fill="both", expand=True, padx=20, pady=(16, 8))
        tk.Label(panel, text="AAPNE", font=("Segoe UI", 8, "bold"), fg=MUTED, bg=CARD,
                 anchor="w").pack(fill="x", padx=18, pady=(14, 0))
        self.user_text = tk.Label(panel, text="-", font=("Segoe UI", 12), fg=TEXT, bg=CARD,
                                  wraplength=360, justify="left", anchor="w")
        self.user_text.pack(fill="x", padx=18, pady=(2, 14))
        tk.Label(panel, text="JARVIS", font=("Segoe UI", 8, "bold"), fg=MUTED, bg=CARD,
                 anchor="w").pack(fill="x", padx=18)
        self.reply_text = tk.Label(panel, text="Namaste! Mic dabaiye aur kuch bhi poochiye ya karwaiye.",
                                   font=("Segoe UI", 12), fg=TEXT, bg=CARD, wraplength=360,
                                   justify="left", anchor="w")
        self.reply_text.pack(fill="x", padx=18, pady=(2, 16))

        bottom = tk.Frame(root, bg=BG)
        bottom.pack(fill="x", padx=20, pady=(0, 6))
        self.entry = tk.Entry(bottom, font=("Segoe UI", 11), bg=CARD, fg=TEXT,
                              insertbackground=TEXT, relief="flat")
        self.entry.pack(side="left", fill="x", expand=True, ipady=7)
        self.entry.bind("<Return>", self.on_text)

        self.footer = tk.Label(root, text=f"Model: {MODEL}  |  Ollama check ho raha hai...",
                               font=("Segoe UI", 8), fg=MUTED, bg=BG, anchor="w")
        self.footer.pack(fill="x", padx=20, pady=(0, 10))

        root.bind("<Configure>", self.on_resize)
        root.protocol("WM_DELETE_WINDOW", root.destroy)

    def on_resize(self, event):
        if event.widget is self.root:
            wrap = max(240, event.width - 100)
            self.user_text.configure(wraplength=wrap)
            self.reply_text.configure(wraplength=wrap)

    def emit(self, kind, value):
        self.events.put((kind, value))

    def check_ollama(self):
        try:
            requests.get(f"{OLLAMA_URL}/api/version", timeout=2).raise_for_status()
            text = f"Model: {MODEL}  |  Ollama connected"
        except requests.RequestException:
            text = f"Model: {MODEL}  |  Ollama band hai, Ollama app kholiye"
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
        if not text or self.busy:
            return
        self.entry.delete(0, "end")
        self.start(self.text_turn, text)

    def start(self, target, *args):
        self.busy = True
        threading.Thread(target=target, args=args, daemon=True).start()

    def voice_turn(self):
        self.emit("state", "listening")
        try:
            raw = record_utterance(self.stop_listening)
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
        self.emit("state", "speaking")
        speak(reply)

    def finish(self):
        self.emit("state", "idle")
        self.emit("done", "")

    def set_state(self, state):
        self.state = state
        text, color, label = STATE_STYLE[state]
        self.orb.itemconfigure(self.orb_ring, fill=color)
        self.orb.itemconfigure(self.orb_label, text=label)
        self.status.configure(text=text)

    def poll(self):
        while True:
            try:
                kind, value = self.events.get_nowait()
            except queue.Empty:
                break
            if kind == "state":
                self.set_state(value)
            elif kind == "user":
                self.user_text.configure(text=value)
            elif kind == "tool":
                self.status.configure(text=f"Kaam kar raha hoon: {value}")
            elif kind in ("answer", "error", "info"):
                self.reply_text.configure(text=value)
            elif kind == "footer":
                self.footer.configure(text=value)
            elif kind == "done":
                self.busy = False
                self.set_state("idle")
                self.entry.focus_set()
        self.root.after(60, self.poll)


def main():
    root = tk.Tk()
    Jarvis(root)
    root.mainloop()


if __name__ == "__main__":
    main()