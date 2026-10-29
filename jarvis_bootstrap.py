#!/usr/bin/env python3
"""Jarvis preflight launcher (Python 3.11).

Run alongside the downloaded Jarvis modules: python jarvis_bootstrap.py
Use --no-elevate for the recommended normal-user desktop/audio session.
Repairs require confirmation; --repair authorizes only the predefined repairs.
No firewall, ACL, privacy setting, or LLM-generated command is changed/executed.
"""

import argparse
import ctypes
import importlib.util
import json
import logging
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
from urllib.parse import urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
LOG = logging.getLogger("jarvis.bootstrap")
PLATFORM = sys.platform


def command_text(command):
    """Render copyable commands without ever invoking a shell."""
    return subprocess.list2cmdline(command) if os.name == "nt" else shlex.join(command)


def run(command, timeout=30):
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True,
                            errors="replace", timeout=timeout, check=False)
    if result.returncode:
        raise RuntimeError(f"{command_text(command)} exited {result.returncode}: "
                           f"{result.stderr or result.stdout}")
    return result.stdout.strip()


def approved(args, action):
    if args.repair:
        return True
    if not sys.stdin.isatty():
        LOG.warning("Confirmation unavailable; skipped: %s", action)
        return False
    return input(f"Allow {action}? [y/N] ").strip().lower() == "y"


def elevated():
    if os.name == "nt":
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    return os.geteuid() == 0


def request_elevation(args):
    """UAC and sudo require OS consent; neither grants unrestricted access.

    Refuse repeated elevation attempts. The normal-user option is important:
    root may lose access to PipeWire/PulseAudio and the user's graphical session.
    Windows uses ShellExecuteEx to wait for and propagate the elevated exit code.
    """
    if elevated() or args.no_elevate:
        LOG.info("Privilege mode: %s", "elevated" if elevated() else "normal user")
        return None
    if args.elevation_attempted:
        raise PermissionError("Elevation did not take effect; use --no-elevate or contact your administrator.")
    command = [sys.executable, str(Path(__file__).resolve()), *sys.argv[1:],
               "--elevation-attempted"]
    if os.name != "nt":
        if not sys.stdin.isatty() or not approved(args, "restart using sudo (desktop audio may be unavailable)"):
            raise PermissionError("Elevation not approved. Run python jarvis_bootstrap.py --no-elevate for desktop use.")
        sudo = shutil.which("sudo")
        if not sudo:
            raise FileNotFoundError("sudo is not installed. Use --no-elevate or your OS administrator's approved elevation method.")
        return subprocess.call([sudo, "--", *command], cwd=ROOT)

    from ctypes import wintypes

    class ShellExecuteInfo(ctypes.Structure):
        _fields_ = [("cbSize", wintypes.DWORD), ("fMask", wintypes.ULONG),
                    ("hwnd", wintypes.HWND), ("lpVerb", wintypes.LPCWSTR),
                    ("lpFile", wintypes.LPCWSTR), ("lpParameters", wintypes.LPCWSTR),
                    ("lpDirectory", wintypes.LPCWSTR), ("nShow", ctypes.c_int),
                    ("hInstApp", wintypes.HINSTANCE), ("lpIDList", ctypes.c_void_p),
                    ("lpClass", wintypes.LPCWSTR), ("hkeyClass", wintypes.HKEY),
                    ("dwHotKey", wintypes.DWORD), ("hIcon", wintypes.HANDLE),
                    ("hProcess", wintypes.HANDLE)]

    shell = ctypes.WinDLL("shell32", use_last_error=True)
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    shell.ShellExecuteExW.argtypes = [ctypes.POINTER(ShellExecuteInfo)]
    shell.ShellExecuteExW.restype = wintypes.BOOL
    kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    kernel.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    info = ShellExecuteInfo()
    info.cbSize, info.fMask = ctypes.sizeof(info), 0x00000040
    info.lpVerb, info.lpFile = "runas", command[0]
    info.lpParameters = subprocess.list2cmdline(command[1:])
    info.lpDirectory, info.nShow = str(ROOT), 1
    if not shell.ShellExecuteExW(ctypes.byref(info)):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        if kernel.WaitForSingleObject(info.hProcess, 0xFFFFFFFF) == 0xFFFFFFFF:
            raise ctypes.WinError(ctypes.get_last_error())
        code = wintypes.DWORD()
        if not kernel.GetExitCodeProcess(info.hProcess, ctypes.byref(code)):
            raise ctypes.WinError(ctypes.get_last_error())
        return code.value
    finally:
        kernel.CloseHandle(info.hProcess)


def load_environment():
    """Load project .env without requiring third-party packages to start.

    Existing environment variables take precedence. This intentionally supports
    literal KEY=value only (no shell expansion, execution, or multiline secrets).
    """
    path = ROOT / ".env"
    if not path.exists():
        LOG.info("No .env; using local backend defaults.")
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.removeprefix("export ").partition("=")
        key, value = key.strip(), value.strip()
        if not separator or not key.isidentifier():
            raise ValueError("Invalid .env entry; use KEY=value, one setting per line.")
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        os.environ.setdefault(key, value)


def local_url(value):
    """Never send diagnostics to an arbitrary remote server."""
    parsed = urlparse(value)
    if (parsed.scheme not in ("http", "https") or
            parsed.hostname not in ("localhost", "127.0.0.1", "::1") or
            parsed.username or parsed.password or parsed.query or parsed.fragment):
        raise ValueError("Backend URL must be an HTTP(S) loopback URL without credentials/query/fragment.")
    return value.rstrip("/")


def http(url, body=None, timeout=6):
    payload = None if body is None else json.dumps(body).encode("utf-8")
    request = Request(url, data=payload, headers={"Content-Type": "application/json"})
    with urlopen(request, timeout=timeout) as response:
        # Bounded reads also protect the doctor from oversized responses.
        return response.read(262144).decode("utf-8", errors="replace")


def check_files():
    ROOT.joinpath("jarvis_bootstrap.py").read_bytes()
    with tempfile.TemporaryFile(dir=ROOT) as probe:
        probe.write(b"jarvis-preflight")
        probe.seek(0)
        if probe.read() != b"jarvis-preflight":
            raise OSError("Project read/write probe failed")
    return "Project read/write OK (probe removed)"


AUDIO_PROBE = '''
import importlib.util
if importlib.util.find_spec("sounddevice"):
    import sounddevice as sd
    with sd.RawInputStream(channels=1, dtype="int16") as microphone:
        microphone.read(256)
    with sd.RawOutputStream(channels=1, dtype="int16") as speaker:
        speaker.write(bytes(512))
elif importlib.util.find_spec("pyaudio"):
    import pyaudio
    audio = pyaudio.PyAudio()
    try:
        for is_input in (True, False):
            stream = audio.open(format=pyaudio.paInt16, channels=1, rate=16000,
                                input=is_input, output=not is_input,
                                frames_per_buffer=256)
            try:
                if is_input:
                    stream.read(256, exception_on_overflow=False)
                else:
                    stream.write(bytes(512))
            finally:
                stream.stop_stream()
                stream.close()
    finally:
        audio.terminate()
else:
    raise ModuleNotFoundError("Install sounddevice or pyaudio")
print("Microphone capture and speaker stream OK (silent output probe)")
'''


def check_audio():
    # Isolate native audio drivers with a timeout. Only a tiny transient capture
    # is read; nothing is saved or transmitted, and output is silent, not a tone.
    return run([sys.executable, "-c", AUDIO_PROBE], timeout=15)


def check_modules(entry):
    # Compile without importing the agent (imports may load GPU models or tools).
    for name in (entry, "voice_loop.py", "agent.py", "tools.py"):
        source = ROOT / name
        compile(source.read_text(encoding="utf-8"), str(source), "exec")
    modules = ["dotenv", "numpy", "sounddevice", "torch", "faster_whisper",
               "langchain", "langchain_ollama", "langchain_chroma", "chromadb"]
    if entry == "gui_app.py":
        modules.append("PyQt5")
    missing = [name for name in modules if importlib.util.find_spec(name) is None]
    if missing:
        raise ModuleNotFoundError("Missing modules: " + ", ".join(missing))
    return "Startup source files compile and core dependencies exist"


def backend_diagnosis():
    """Read-only observations; never kill processes or create Docker containers."""
    if shutil.which("ollama"):
        LOG.info("Ollama executable: %s", shutil.which("ollama"))
    else:
        LOG.warning("Ollama CLI missing from PATH; install from https://ollama.com/download")
    if shutil.which("docker"):
        try:
            LOG.info("Docker containers:\n%s", run([
                "docker", "ps", "-a", "--format", "{{.Names}}: {{.Status}} | {{.Ports}}"] ))
        except Exception:
            LOG.error("Docker diagnostic:\n%s", traceback.format_exc())
    else:
        LOG.info("Docker not on PATH. A native Odysseus server is also supported.")


def repair(name, args, ollama):
    """Small allowlist of consented actions, attempted once per failed check."""
    if name in ("dependencies", "audio"):
        if elevated():
            LOG.warning("Do not install Python packages as root/admin. Activate your user venv and install requirements there.")
            return
        if not (ROOT / "requirements.txt").is_file():
            LOG.warning("Download requirements.txt from the blueprint first.")
            return
        if approved(args, "install project requirements into this Python environment"):
            run([sys.executable, "-m", "pip", "install", "-r", str(ROOT / "requirements.txt")], timeout=600)
    elif name == "ollama" and shutil.which("ollama"):
        parsed = urlparse(ollama)
        if parsed.port not in (None, 11434):
            LOG.warning("Custom Ollama port: start your configured server manually.")
            return
        if approved(args, "start the installed local Ollama server"):
            with (ROOT / "ollama-bootstrap.log").open("a", encoding="utf-8") as output:
                subprocess.Popen([shutil.which("ollama"), "serve"], cwd=ROOT,
                                 stdout=output, stderr=subprocess.STDOUT,
                                 env={**os.environ, "OLLAMA_HOST": "127.0.0.1:11434"})
            time.sleep(3)
    elif name == "odysseus":
        container = os.getenv("ODYSSEUS_CONTAINER", "")
        if container and not container.startswith("-") and shutil.which("docker"):
            # Only start an existing, explicitly configured stopped container.
            state = json.loads(run(["docker", "inspect", container]))[0]["State"]
            if not state["Running"] and approved(args, f"start existing Docker container {container}"):
                run(["docker", "start", container])
                time.sleep(3)


def doctor(errors, ollama):
    """Ask a reachable local LLM for advice only, never executable repairs.

    Tracebacks remain in local logs. The LLM receives only bounded check labels
    and exception types, not paths, captured audio, environment values or secrets.
    """
    try:
        http(ollama + "/api/version")
        result = json.loads(http(ollama + "/api/generate", {
            "model": os.getenv("OLLAMA_MODEL", "llama-3.1-8b-instruct-abliterated"),
            "stream": False,
            "prompt": "Suggest manual troubleshooting steps only. Never disable security controls. "
                      "Jarvis local preflight failures: " + ", ".join(
                          f"{name}: {type(error).__name__}" for name, error in errors.items()),
            "options": {"num_predict": 256, "temperature": 0.1},
        }, timeout=25))
        LOG.info("Local AI advice (untrusted, review before using):\n%s", result.get("response", "No advice returned"))
    except Exception:
        LOG.info("Local AI doctor unavailable; use the deterministic instructions below.")


def instructions(errors, ollama, odysseus):
    pip = command_text([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
    LOG.error("PREFLIGHT FAILED. Jarvis was NOT launched. Follow these steps:")
    for name in errors:
        LOG.error("--- %s ---", name)
        if name in ("dependencies", "audio"):
            LOG.error("1. Download all blueprint files into one folder. Create a Python 3.11 user venv: python -m venv venv")
            LOG.error("2. Activate it: %s", "venv\\Scripts\\activate" if os.name == "nt" else "source venv/bin/activate")
            LOG.error("3. Install requirements: %s", pip)
            LOG.error("4. Install PortAudio if needed: %s", "use a compatible PyAudio wheel or sounddevice" if os.name == "nt" else (
                "brew install portaudio" if PLATFORM == "darwin" else "Debian/Ubuntu: sudo apt-get install libportaudio2 portaudio19-dev python3-dev (use your distro equivalent otherwise)"))
            LOG.error("5. Select working default input/output devices. Close apps holding exclusive audio access.")
            LOG.error("6. Allow microphone access: %s", "Settings > Privacy & security > Microphone > Allow desktop apps" if os.name == "nt" else (
                "System Settings > Privacy & Security > Microphone > enable your terminal/Python app" if PLATFORM == "darwin" else "Use your normal logged-in desktop session; inspect PipeWire/PulseAudio with pactl info"))
            LOG.error("7. Retry without elevation: python jarvis_bootstrap.py --no-elevate")
        elif name == "files":
            LOG.error("1. Move the project to a writable folder under your own home directory.")
            LOG.error("2. Avoid system directories and read-only mounts; verify ownership/ACLs with your administrator.")
            LOG.error("3. Retry: python jarvis_bootstrap.py --no-elevate")
        elif name == "ollama":
            LOG.error("1. Install Ollama from https://ollama.com/download and reopen your terminal.")
            LOG.error("2. In a separate terminal run: ollama serve")
            LOG.error("3. Test: curl %s/api/version", ollama)
            LOG.error("4. Set OLLAMA_BASE_URL=%s in .env. Inspect ollama-bootstrap.log if automatic startup failed.", ollama)
        elif name == "model":
            LOG.error("1. Run: ollama pull huihui_ai/llama3.1-abliterated:8b")
            LOG.error("2. Run: ollama cp huihui_ai/llama3.1-abliterated:8b llama-3.1-8b-instruct-abliterated")
            LOG.error("3. Verify: ollama list; set OLLAMA_MODEL to an exact installed name in .env.")
        elif name == "odysseus":
            LOG.error("1. Open Docker Desktop/start your Docker daemon if using containers: docker info")
            LOG.error("2. Inspect existing containers: docker ps -a; inspect logs: docker logs <your-container-name>")
            LOG.error("3. Start your existing deployment: docker start <your-container-name>, or its documented native startup command.")
            LOG.error("4. Ensure its API is published to loopback port 7011. Test: curl %s", odysseus)
            LOG.error("5. Set ODYSSEUS_BASE_URL and ODYSSEUS_HEALTH_PATH to your deployment's documented unauthenticated health endpoint.")
            LOG.error("6. A 404 means the server answered but the path is wrong; 401/403 means authentication needs configuring, not a dead port.")
        LOG.error("Review jarvis-bootstrap.log for the exact traceback. Never disable your firewall; check app-specific loopback rules with your administrator.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-elevate", action="store_true", help="Keep your normal desktop/audio user session")
    parser.add_argument("--repair", action="store_true", help="Authorize predefined repairs (not arbitrary commands)")
    parser.add_argument("--check-only", action="store_true", help="Run preflight without launching Jarvis")
    parser.add_argument("--entry", choices=["gui_app.py", "voice_engine.py", "voice_loop.py"], default="gui_app.py")
    parser.add_argument("--elevation-attempted", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        file_log = logging.FileHandler(ROOT / "jarvis-bootstrap.log", encoding="utf-8")
        file_log.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
        LOG.addHandler(file_log)
    except OSError:
        LOG.warning("Cannot write diagnostic log; errors will still print to the console.")
    try:
        status = request_elevation(args)
        if status is not None:
            return status
        load_environment()
        ollama = local_url(os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"))
        odysseus = local_url(os.getenv("ODYSSEUS_BASE_URL", "http://localhost:7011"))
        health = os.getenv("ODYSSEUS_HEALTH_PATH", "/")
        if not health.startswith("/") or health.startswith("//"):
            raise ValueError("ODYSSEUS_HEALTH_PATH must be a relative absolute path such as /health")
        LOG.info("Audio probe briefly opens the mic and plays silence; no audio is stored.")

        def check_model():
            installed = json.loads(http(ollama + "/api/tags")).get("models", [])
            model = os.getenv("OLLAMA_MODEL", "llama-3.1-8b-instruct-abliterated")
            names = {item.get("name") for item in installed}
            if model not in names and model + ":latest" not in names:
                raise RuntimeError("Configured Ollama model is not installed")
            return "Configured model installed"

        checks = {"files": check_files,
                  "dependencies": lambda: check_modules(args.entry),
                  "audio": check_audio,
                  "ollama": lambda: http(ollama + "/api/version"),
                  "odysseus": lambda: http(odysseus + health),
                  "model": check_model}
        errors = {}
        # Two passes maximum: one repair attempt per failure, then a fresh check.
        # Run every check so one failure does not conceal the rest of the report.
        for name, check in checks.items():
            try:
                check()
                LOG.info("%s: OK", name)
                continue
            except Exception as error:
                errors[name] = error
                LOG.error("%s failed:\n%s", name, traceback.format_exc())
            if name in ("ollama", "odysseus"):
                backend_diagnosis()
            try:
                repair(name, args, ollama)
                check()
                del errors[name]
                LOG.info("%s: OK after retry", name)
            except Exception as error:
                errors[name] = error
                LOG.error("%s still failing:\n%s", name, traceback.format_exc())
        if errors:
            doctor(errors, ollama)
            instructions(errors, ollama, odysseus)
            return 1
        LOG.info("Preflight passed. This checks connectivity, not Odysseus agent integration or model tool compatibility.")
        if args.check_only:
            return 0
        LOG.info("Launching %s; child exit status will be propagated.", args.entry)
        # Inherit the loaded environment and console; do not use shell=True.
        return subprocess.call([sys.executable, str(ROOT / args.entry)], cwd=ROOT, env=os.environ.copy())
    except KeyboardInterrupt:
        LOG.warning("Startup cancelled.")
        return 130
    except Exception:
        LOG.error("Bootstrap initialization failed:\n%s", traceback.format_exc())
        LOG.error("Check .env syntax and loopback URLs. If elevation was denied, retry: python jarvis_bootstrap.py --no-elevate")
        return 1


if __name__ == "__main__":
    sys.exit(main())