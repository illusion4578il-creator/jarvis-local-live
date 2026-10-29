#!/usr/bin/env python3
"""Jarvis: local AI assistant (Ollama) with access to this PC's files, shell and programs."""

import datetime
import json
import os
import re
import subprocess
import threading
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")
KNOWLEDGE = ROOT / "knowledge"
ACTION_LOG = ROOT / "jarvis-actions.log"
OUTPUT_LIMIT = 8000
SOURCE_LIMIT = 200000
SYSTEM_PROMPT = (
    "You are Jarvis, a personal assistant running on the user's own PC. "
    "You can run PowerShell or cmd commands, start programs, read and write files, "
    "learn from files and web pages the user gives you, and recall that saved knowledge. "
    "Use tools when they help; otherwise answer directly. "
    "Reply in the same language the user writes in (Hindi, Hinglish or English)."
)


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


def run_program(path, args=None):
    if isinstance(args, str):
        args = [args]
    process = subprocess.Popen([path, *[str(item) for item in (args or [])]], cwd=Path.home())
    return f"Started {path} (pid {process.pid})."


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
    "run_program": run_program,
    "read_file": read_file,
    "write_file": write_file,
    "list_dir": list_dir,
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
    tool("run_command", "Run a PowerShell (default) or cmd command on the user's PC and return its output.",
         {"command": TEXT, "shell": {"type": "string", "enum": ["powershell", "cmd"]}}, ["command"]),
    tool("run_program", "Start an .exe or other program, with optional arguments.",
         {"path": TEXT, "args": {"type": "array", "items": TEXT}}, ["path"]),
    tool("read_file", "Read a text file from the PC.", {"path": TEXT}, ["path"]),
    tool("write_file", "Create or overwrite a text file on the PC.", {"path": TEXT, "content": TEXT},
         ["path", "content"]),
    tool("list_dir", "List the files and folders in a directory.", {"path": TEXT}, ["path"]),
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
        return function(**args)
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


def run_turn(messages, emit):
    for _ in range(12):
        try:
            message = ask_model(messages)
        except requests.RequestException as error:
            emit("error", f"Ollama se connect nahi ho paa raha ({error}). Ollama app kholiye ya 'ollama serve' chalaiye.")
            return
        messages.append(message)
        calls = message.get("tool_calls") or []
        if not calls:
            emit("answer", message.get("content", ""))
            return
        for call in calls:
            function = call.get("function", {})
            name = function.get("name", "")
            args = parse_arguments(function.get("arguments"))
            emit("tool", name)
            result = execute(name, args)
            log_action(name, args, result)
            messages.append({"role": "tool", "content": result})
    emit("error", "Kaam bahut lamba ho gaya. Chhota sawaal poochiye.")


def ollama_online():
    try:
        requests.get(f"{OLLAMA_URL}/api/version", timeout=2).raise_for_status()
        return True
    except requests.RequestException:
        return False


def run_gui():
    import tkinter as tk
    from tkinter import scrolledtext

    root = tk.Tk()
    root.title(f"Jarvis ({MODEL})")
    root.geometry("800x640")
    root.minsize(520, 400)
    font = ("Segoe UI", 11)

    chat = scrolledtext.ScrolledText(root, wrap="word", font=font, state="disabled", padx=10, pady=10)
    chat.pack(fill="both", expand=True, padx=12, pady=(12, 6))
    chat.tag_config("you", font=("Segoe UI", 11, "bold"))
    chat.tag_config("jarvis", font=("Segoe UI", 11, "bold"), foreground="#16A34A")
    chat.tag_config("tool", font=("Segoe UI", 9, "italic"), foreground="#6B7280")

    bottom = tk.Frame(root)
    bottom.pack(fill="x", padx=12, pady=(0, 6))
    entry = tk.Entry(bottom, font=font)
    entry.pack(side="left", fill="x", expand=True, ipady=6)
    send_button = tk.Button(bottom, text="Bhejein", width=10)
    send_button.pack(side="left", padx=(8, 0))
    status = tk.Label(root, anchor="w")
    status.pack(fill="x", padx=12, pady=(0, 8))

    events = queue.Queue()
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    busy = {"value": False}

    def write(who, text, tag):
        chat.configure(state="normal")
        chat.insert("end", f"{who}: ", tag)
        chat.insert("end", f"{text}\n\n")
        chat.see("end")
        chat.configure(state="disabled")

    def worker(text):
        messages.append({"role": "user", "content": text})
        run_turn(messages, lambda kind, value: events.put((kind, value)))
        events.put(("done", ""))

    def send(_event=None):
        text = entry.get().strip()
        if not text or busy["value"]:
            return
        entry.delete(0, "end")
        write("You", text, "you")
        busy["value"] = True
        send_button.configure(state="disabled")
        status.configure(text="Jarvis soch raha hai...")
        threading.Thread(target=worker, args=(text,), daemon=True).start()

    def poll():
        while True:
            try:
                kind, value = events.get_nowait()
            except queue.Empty:
                break
            if kind == "tool":
                status.configure(text=f"Kaam kar raha hoon: {value}")
                write("  tool", value, "tool")
            elif kind in ("answer", "error"):
                write("Jarvis", value, "jarvis")
            elif kind == "done":
                busy["value"] = False
                send_button.configure(state="normal")
                status.configure(text="Ready")
                entry.focus_set()
        root.after(100, poll)

    if ollama_online():
        status.configure(text=f"Ollama connected - model: {MODEL}")
    else:
        status.configure(text="Ollama band hai - Ollama app kholiye ya 'ollama serve' chalaiye")
    write("Jarvis", "Namaste! Main Jarvis hoon. PC ke kaam, files, programs, ya kuch naya seekhna - bas likhiye.", "jarvis")

    entry.bind("<Return>", send)
    send_button.configure(command=send)
    root.protocol("WM_DELETE_WINDOW", root.destroy)
    entry.focus_set()
    root.after(100, poll)
    root.mainloop()


def run_terminal():
    print(f"Jarvis ready (model: {MODEL}). Likhiye aur Enter dabaiye. 'exit' se band karein.")
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    while True:
        try:
            user_text = input("\nYou: ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if user_text.lower() in ("exit", "quit"):
            break
        if not user_text:
            continue
        messages.append({"role": "user", "content": user_text})
        run_turn(messages, print_event)


def print_event(kind, value):
    if kind == "tool":
        print(f"  [tool] {value}")
    else:
        print(f"\nJarvis: {value}")


def main():
    try:
        import tkinter  # noqa: F401
    except ImportError:
        run_terminal()
        return
    run_gui()


if __name__ == "__main__":
    main()