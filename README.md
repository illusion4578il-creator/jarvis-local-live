# Jarvis Local AI Studio — Hinglish Setup & Usage Manual

Jarvis ka web studio aur local Python assistant alag programs hain. Web app ka simulator browser mein chalta hai; real PC mic, PyQt5 HUD aur OS tools Python process mein chalte hain. Web CRUD records automatically local ChromaDB, skills ya memory ke saath sync **nahi** hote.

## 1. Download / GitHub se use karein

App mein **Python Codebase → Download complete ZIP** click karein. ZIP extract karne ke baad `jarvis_assistant` folder kholein. Ismein Python modules, bootstrap, requirements, `.env.example` aur yeh manual milenge. Python assistant chalane ke liye React app install karna zaroori nahi.

GitHub par is repository ka **Code → Download ZIP** use karein, extract karein, aur repository root se Node.js 22 ke saath:

```sh
node scripts/export-jarvis.mjs
```

Is command ko npm install ya web build ki zaroorat nahi. Yeh `jarvis-release/jarvis_assistant/` mein actual Python files aur `jarvis-release/jarvis-assistant.zip` banata hai. Existing output ko overwrite nahi karta. Naya destination dene ke liye:

```sh
node scripts/export-jarvis.mjs jarvis-release-new
```

Exported `jarvis_assistant` folder ko standalone GitHub repository mein upload kar sakte hain. Apna actual GitHub URL share karein; is manual mein koi fabricated repository URL nahi diya gaya. Model weights, personal books aur speaker recording ZIP mein included nahi hain. Third-party code/model licences separately apply; publish karne se pehle apne source distribution rights review karein.

### GitHub par publish karein (browser se, Git commands ke bina)

1. App ke **Python Codebase → Download complete ZIP** se package download aur extract karein.
2. https://github.com/new par sign in karke naya repository banayein. Sabko download allow karna ho to **Public** select karein; pehle source aur third-party licences review karein.
3. Repository mein **Add file → Upload files** kholein. Extracted `jarvis_assistant` folder ke **andar ke files aur subfolders** upload karein, taaki `README.md` aur Python entry files repository root mein hon. Sirf ZIP upload karne se source browse nahi hoga.
4. Upload list manually check karein: `.env.example` aur `.gitignore` include hon; actual `.env`, API keys, recordings, personal books, memory databases aur logs include **na** hon. Browser upload mein `.gitignore` ko automatic protection na samjhein. Hidden files nazar nahi aa rahe hon to file explorer mein hidden files enable karein.
5. **Commit changes** click karein. Repository ka actual URL share karein; doosre log **Code → Download ZIP** se download karke isi manual ke local setup steps follow kar sakte hain.
6. Ready-made assistant ZIP bhi dena ho to repository ke **Releases → Draft a new release** mein version tag banayein, downloaded package ZIP attach karein aur release publish karein. GitHub browser source upload mein per-file limit 25 MiB hai; bade model weights upload na karein.

GitHub upload aapke signed-in GitHub account se hota hai. Is studio ka ZIP download khud se repository create ya publish nahi karta. GitHub password ya personal access token chat mein share na karein.

## 2. Prerequisites aur safety

- Python **3.11**, Ollama, working default microphone/speaker, aur graphical desktop session.
- First run par Ollama, Whisper, Silero, embeddings aur XTTS models download ho sakte hain: internet aur sufficient disk/RAM required. Offline use ke liye pehle caches populate karein.
- GPU optional hai; CPU par Whisper/XTTS slow ho sakte hain. CUDA PyTorch build apne driver ke compatible official instructions se choose karein; arbitrary CUDA version force na karein.
- **Normal user account** use karein. Admin/root microphone privacy blocks ko bypass nahi karta.
- Existing OS tools generated Python execute karte hain aur saved skills run karte hain. Yeh sandboxed nahi hain. Sensitive PC par chalane se pehle code review karein; separate test account/VM aur backups recommended. Untrusted books/instructions ko execution authority na dein.
- Abliterated model ka naam tool-calling compatibility ya “zero refusals” guarantee nahi karta.

## 3. Python environment install

Terminal ka working folder extracted `jarvis_assistant` hona chahiye.

Windows PowerShell:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Direct venv interpreter use karne se PowerShell execution policy change karne ki zaroorat nahi.

Linux / macOS:

```sh
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
cp .env.example .env
```

Linux par PortAudio headers, Python development headers aur C compiler PyAudio build ke liye required ho sakte hain. Debian/Ubuntu example: `sudo apt-get install libportaudio2 portaudio19-dev python3-dev build-essential`. macOS par PortAudio ke liye `brew install portaudio`. Installer conflict aaye to exact resolver output save karein; legacy blueprint dependencies har OS/Python build par verified nahi hain. Dependencies ko blindly force-install (`--no-deps`) na karein.

## 4. Ollama model setup

Ollama install: https://ollama.com/download . Service start nahi ho to separate terminal mein `ollama serve` run karein. Already running server ko duplicate start na karein.

```sh
ollama pull huihui_ai/llama3.1-abliterated:8b
ollama cp huihui_ai/llama3.1-abliterated:8b llama-3.1-8b-instruct-abliterated
ollama list
curl http://localhost:11434/api/version
```

`.env` mein `OLLAMA_MODEL` exact installed name hona chahiye. Agent LangChain tool-calling use karta hai: unsupported tools error aaye to installed model ki capability check karein aur compatible tool-calling model choose karein. Custom `OLLAMA_BASE_URL` agent ke main client ko configure karta hai; legacy auto-debug helper default Ollama endpoint use karta hai.

## 5. Environment configuration

`.env.example` ko `.env` copy karke settings edit karein:

| Setting | Use |
| --- | --- |
| `OLLAMA_BASE_URL` | Local Ollama server, default `http://localhost:11434` |
| `OLLAMA_MODEL` | Installed model name |
| `ODYSSEUS_BASE_URL` | Existing local backend, default `http://localhost:7011` |
| `ODYSSEUS_HEALTH_PATH` | Backend ka documented unauthenticated health path; `/` sirf initial default hai |
| `JARVIS_WAKE_WORD` | Initial wake phrase, default `Hello Jarvis` |
| `JARVIS_TTS_ENGINE` | `xtts` real audio synthesis ke liye |
| `WHISPER_MODEL_SIZE` | `medium` default; low-resource PC par `base`/`small` try karein |

Bootstrap `.env` load karke child process ko environment deta hai. Direct `python gui_app.py` existing blueprint mein `.env` automatically load nahi karta; recommended launcher bootstrap hai. Existing shell environment `.env` se higher priority rakhta hai. Values `KEY=value`, one per line; shell expressions nahi.

## 6. Odysseus setup aur actual integration boundary

Apne Odysseus distribution ki official deployment instructions follow karein. Included old `SETUP_INSTRUCTIONS.md` legacy reference hai; backend endpoints/config keys us version ke docs se verify karein. Koi unspecified API route, Docker image ya authentication scheme assume na karein.

Existing container deployment ke liye `docker ps -a`, `docker logs YOUR_CONTAINER` aur documented native/Docker startup command use karein. Backend ko loopback par publish karein. Optional `.env` setting `ODYSSEUS_CONTAINER` mein actual existing container name dene par bootstrap consent ke baad us stopped container ko start kar sakta hai.

```sh
curl http://localhost:7011/
```

Health path `/` nahi hai to command aur `ODYSSEUS_HEALTH_PATH` dono update karein. **404** = server reachable, route wrong; **401/403** = authentication required; connection refused = service/port issue.

**Important:** Included agent currently Ollama directly call karta hai. Bootstrap Odysseus ki HTTP connectivity check karta hai, lekin Odysseus agent/task bridge implemented nahi hai. Health check pass hone ka matlab tasks Odysseus tak route hona nahi. Bootstrap currently Odysseus health check mandatory rakhta hai—even direct Ollama flow ke liye. Backend deploy/configure karke check pass karein; web simulator ko bridge na samjhein.

## 7. XTTS speaker reference

Apni/consented voice recording `voices/jarvis_reference.wav` mein rakhein. XTTS model licence review karein. Missing reference ya failed XTTS load par current blueprint console text aur simulated TTS waveform pulses deta hai, **real speech nahi**. Piper dependency listed hai, lekin Piper synthesis wired nahi hai. Isliye waveform movement ko audio playback proof na samjhein.

## 8. Diagnostics aur launch

Windows PowerShell:

```powershell
.\.venv\Scripts\python.exe jarvis_bootstrap.py --no-elevate --check-only
.\.venv\Scripts\python.exe jarvis_bootstrap.py --no-elevate
```

Linux/macOS, activated venv:

```sh
python jarvis_bootstrap.py --no-elevate --check-only
python jarvis_bootstrap.py --no-elevate
```

Preflight project write access, Python sources/dependencies, audio streams, Ollama API, installed model aur Odysseus health check karta hai. Audio check briefly mic capture karta hai aur silence output karta hai; recording save/upload nahi hoti. Failure par GUI launch nahi hota; `jarvis-bootstrap.log` mein traceback milta hai.

Headless loop: `python jarvis_bootstrap.py --no-elevate --entry voice_loop.py`. `voice_engine.py` included nahi hai. Repairs confirmation maangte hain; `--repair` predefined repairs authorize karta hai, firewall rules ya arbitrary LLM commands nahi. AI doctor advice untrusted hai—review karein, blindly execute nahi.

## 9. Daily usage

1. GUI start hone par model loading complete hone dein.
2. **Jarvis ON** se mic arm karein; **OFF** mic close aur current playback stop karta hai.
3. Wake-word field mein apna phrase set karein; persistent initial phrase `.env` ke `JARVIS_WAKE_WORD` se change karein.
4. “Hello Jarvis, meri books mein yeh topic search karo” jaisa request bolein. Mic RMS waveform input se react karega; real XTTS output envelope playback se react karega.
5. PDF/EPUB/TXT/MD files `knowledge_base/` mein rakhein aur ingestion tool request karein. File copy alone automatic ingestion nahi karta. Already indexed files path se skip hote hain; edited books automatically reindex nahi hoti.
6. Skills `skills/` mein Python files + registry ke roop mein save hote hain. Execute karne se pehle inspect karein.
7. Memory currently `memory_store/akash_memory.json` mein JSON facts hai; Mem0 package listed hai, but actual Mem0 API integration nahi hai. Manual delete/edit ke liye assistant stop karke backup lein.

## 10. Troubleshooting

| Problem | Action |
| --- | --- |
| Mic permission denied | Windows Privacy & security → Microphone → desktop apps allow; macOS Privacy & Security → Microphone mein launching terminal/app allow; Linux normal desktop/PipeWire session use karein |
| Wrong input/output | OS default devices select karein; `python -m sounddevice` se devices list karein; exclusive audio apps close karein |
| GUI display/Qt error | Real logged-in desktop session use karein; headless server par `voice_loop.py` entry use karein |
| API unreachable | URL/port check karein, server logs dekhein; firewall blanket disable na karein |
| Model missing/tools unsupported | `ollama list`, exact `.env` name aur model tool capability check karein |
| CUDA/OOM/slow response | Compatible torch/torchaudio pair use karein; smaller Whisper model choose karein; GPU memory free karein |
| Bars move, voice silent | XTTS load log, reference WAV aur default output device check karein; console fallback real TTS nahi |
| RAG empty | Supported books add karke ingestion explicitly run karein; scanned PDFs may need OCR separately |
| Package export refuses | New output folder choose karein; user data overwrite safety intentional hai |

## 11. Sharing, updates, aur web studio

`.env`, recordings, books, ChromaDB, memory, execution logs aur generated skills public GitHub par commit na karein. Included Python `.gitignore` sensitive/runtime folders exclude karta hai. Updates nayi folder mein export karein, code/dependencies review karein, phir apna config/data backup se migrate karein. Private logs share karne se pehle redact karein.

Web studio separately run karna ho to repository root mein `npm install`, `npm run dev` use karein. Production preview ke liye apne PC/CI mein `npm run build` aur `npm run preview` use kar sakte hain. Web CRUD ke liye actual Apper app environment/authentication required hai; doosre user's GitHub checkout automatically aapke database ka access nahi deta. Python ZIP database credentials include nahi karta.

Yeh downloadable existing source blueprint hai, tested cross-platform binary installer nahi. Apne machine par preflight + actual mic, TTS, model tool-call aur backend tests run karein. Connectivity success ko end-to-end functionality guarantee na samjhein.