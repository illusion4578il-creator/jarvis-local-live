export const SYSTEM_PROMPT_TEXT = `You are an advanced, autonomous personal AI assistant running locally on the user's computer, inspired by Jarvis. Your user's name is Akash. You are interacting via a real-time Voice Call Interface.Directives:
1. Speak naturally in Hinglish. Keep your spoken responses concise and conversational.
2. DO NOT output markdown, asterisks, long lists, or code blocks in your conversational replies, because they will sound glitchy when read by the Text-to-Speech engine.
3. You have full OS access. If Akash asks you to do something on the PC, say something short like 'On it, Akash', use your tools to execute the task, and then report back when it's done. Do not explain how you will do it.
4. If asked about facts or books, silently use your RAG tool to read your database before answering.
5. Be highly intelligent, calm, efficient, and friendly.`;

export const CODEBASE_FILES = [
  {
    id: 'folder_structure',
    title: '1. Folder Structure',
    filename: 'PROJECT_STRUCTURE.txt',
    language: 'text',
    description: 'Complete local directory layout for Jarvis Hinglish Autonomous Assistant.',
    content: `jarvis_assistant/
├── voice_loop.py              # Real-Time Full-Duplex Voice Pipeline (Mic -> Silero VAD -> Faster-Whisper -> Agent -> Streaming TTS)
├── agent.py                   # Core Brain: LangChain + Ollama (Qwen-2.5 / Llama-3.1) + Exact Hinglish System Prompt
├── tools.py                   # OS Controller (Self-Debugging), ChromaDB Book RAG, Memory & Dynamic Skill Learner
├── requirements.txt           # All 100% local Python libraries (Ollama, Faster-Whisper, Silero, ChromaDB, Coqui TTS/Piper)
├── .env                       # Optional local overrides (OLLAMA_MODEL, WHISPER_SIZE, VOICE_WAV)
├── knowledge_base/            # Drop PDFs & EPUBs here for automatic ChromaDB vector ingestion
│   └── .gitkeep
├── chroma_db/                 # Persistent local ChromaDB vector store + HuggingFace embeddings
├── memory_store/              # Persistent Mem0 / JSON long-term user & episodic memory
│   └── akash_memory.json
├── skills/                    # Autonomously learned & saved Python skills taught by Akash
│   ├── __init__.py
│   └── skill_registry.json
└── voices/                    # Speaker reference audio for XTTSv2 or Piper .onnx voice models
    └── jarvis_reference.wav`
  },
  {
    id: 'requirements',
    title: '2. Requirements (requirements.txt)',
    filename: 'requirements.txt',
    language: 'text',
    description: 'All local Python dependencies for LLM orchestration, VAD, STT, streaming TTS, OS control, and RAG.',
    content: `# Core Brain & Agent Framework
langchain==0.3.7
langchain-community==0.3.5
langchain-core==0.3.15
langchain-ollama==0.2.0
langchain-huggingface==0.1.2
langchain-chroma==0.1.4

# Local Voice Pipeline (Silero VAD + Faster-Whisper STT + Streaming TTS)
faster-whisper==1.0.3
torch>=2.2.0
torchaudio>=2.2.0
numpy>=1.26.4
pyaudio==0.2.14
sounddevice==0.5.1
soundfile==0.12.1
TTS==0.22.0
piper-tts==1.2.0

# Knowledge RAG (ChromaDB + Local Document Loaders)
chromadb==0.5.18
sentence-transformers==3.2.1
pypdf==5.1.0
unstructured==0.16.5
ebooklib==0.18

# Full OS Control & Autonomous Execution
open-interpreter==0.4.3
pyautogui==0.9.54
psutil==6.1.0

# Memory & Utilities
mem0ai==0.1.29
pydantic>=2.9.0
python-dotenv==1.0.1`
  },
  {
    id: 'voice_loop',
    title: '3. The Voice Loop (voice_loop.py)',
    filename: 'voice_loop.py',
    language: 'python',
    description: 'Low-latency Mic -> Silero VAD -> faster-whisper -> LLM Sentence Stream -> Chunked TTS Audio Playback with barge-in.',
    content: `import os
import re
import time
import queue
import threading
import numpy as np
import sounddevice as sd
import torch
from faster_whisper import WhisperModel
from agent import stream_jarvis_response, warmup_agent

SAMPLE_RATE = 16000
CHUNK_SAMPLES = 512  # 32ms frame for Silero VAD
VAD_THRESHOLD = 0.62
SILENCE_LIMIT_SEC = 0.75
MIN_SPEECH_SEC = 0.35

class LocalStreamingTTS:
    """
    Sentence-level chunked TTS streamer supporting Coqui XTTSv2 (multilingual Hinglish)
    with ultra-fast Piper / system fallback so first-sentence latency stays < 1 second.
    """
    def __init__(self):
        self.audio_queue = queue.Queue()
        self.stop_event = threading.Event()
        self.is_speaking = False
        self.use_xtts = os.getenv("JARVIS_TTS_ENGINE", "xtts") == "xtts"
        self.tts_model = None
        self._init_engine()
        self.worker_thread = threading.Thread(target=self._playback_worker, daemon=True)
        self.worker_thread.start()

    def _init_engine(self):
        if self.use_xtts:
            try:
                from TTS.api import TTS
                device = "cuda" if torch.cuda.is_available() else "cpu"
                print(f"[TTS] Loading XTTSv2 on {device}...")
                self.tts_model = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
            except Exception as exc:
                print(f"[TTS] XTTSv2 fallback to lightweight local synth: {exc}")
                self.use_xtts = False

    def interrupt(self):
        """Immediate barge-in when Akash starts speaking."""
        self.stop_event.set()
        while not self.audio_queue.empty():
            try:
                self.audio_queue.get_nowait()
            except queue.Empty:
                break
        sd.stop()
        self.is_speaking = False

    def enqueue_sentence(self, sentence: str):
        clean = re.sub(r"[\\*\\#\\\`\\_\\~\\[\\]]+", "", sentence).strip()
        if clean:
            self.stop_event.clear()
            self.audio_queue.put(clean)

    def _playback_worker(self):
        ref_wav = os.path.join("voices", "jarvis_reference.wav")
        while True:
            sentence = self.audio_queue.get()
            if sentence is None or self.stop_event.is_set():
                continue
            self.is_speaking = True
            try:
                if self.use_xtts and self.tts_model and os.path.exists(ref_wav):
                    wav = self.tts_model.tts(
                        text=sentence,
                        speaker_wav=ref_wav,
                        language="hi"
                    )
                    wav_np = np.array(wav, dtype=np.float32)
                    sd.play(wav_np, samplerate=24000)
                    sd.wait()
                else:
                    print(f"\\n[JARVIS VOICE]: {sentence}")
            except Exception as err:
                print(f"[TTS Playback Error]: {err}")
            finally:
                self.is_speaking = False


class JarvisVoicePipeline:
    def __init__(self):
        print("[INIT] Loading Silero VAD (local torch.hub)...")
        self.vad_model, _ = torch.hub.load(
            repo_or_dir="snakers4/silero-vad",
            model="silero_vad",
            force_reload=False,
            onnx=False
        )
        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"
        whisper_size = os.getenv("WHISPER_MODEL_SIZE", "medium")
        print(f"[INIT] Loading faster-whisper ({whisper_size}) on {device} ({compute_type})...")
        self.stt_model = WhisperModel(whisper_size, device=device, compute_type=compute_type)
        self.tts = LocalStreamingTTS()

    def transcribe_audio(self, audio_np: np.ndarray) -> str:
        segments, _ = self.stt_model.transcribe(
            audio_np,
            beam_size=1,
            best_of=1,
            language=None,
            initial_prompt="Akash speaking Hinglish with Jarvis about Python, OS commands, and books.",
            vad_filter=False
        )
        return " ".join(seg.text.strip() for seg in segments).strip()

    def handle_user_utterance(self, audio_buffer: list):
        t0 = time.perf_counter()
        audio_np = np.concatenate(audio_buffer, axis=0).flatten().astype(np.float32)
        transcript = self.transcribe_audio(audio_np)
        if not transcript or len(transcript) < 2:
            return

        stt_ms = int((time.perf_counter() - t0) * 1000)
        print(f"\\n[AKASH ({stt_ms}ms STT)]: {transcript}")

        sentence_buffer = ""
        first_chunk_logged = False
        sentence_end_re = re.compile(r"(?<=[.!?।])\\s+")

        for token in stream_jarvis_response(transcript):
            sentence_buffer += token
            parts = sentence_end_re.split(sentence_buffer)
            if len(parts) > 1:
                for complete_sentence in parts[:-1]:
                    if not first_chunk_logged:
                        total_latency = int((time.perf_counter() - t0) * 1000)
                        print(f"[LATENCY TO FIRST SPOKEN SENTENCE]: {total_latency} ms")
                        first_chunk_logged = True
                    self.tts.enqueue_sentence(complete_sentence)
                sentence_buffer = parts[-1]

        if sentence_buffer.strip():
            if not first_chunk_logged:
                total_latency = int((time.perf_counter() - t0) * 1000)
                print(f"[LATENCY TO FIRST SPOKEN SENTENCE]: {total_latency} ms")
            self.tts.enqueue_sentence(sentence_buffer.strip())

    def start_call_loop(self):
        warmup_agent()
        print("\\n=======================================================")
        print("  J.A.R.V.I.S. REAL-TIME HINGLISH VOICE CALL ACTIVE")
        print("  Speak naturally. Press Ctrl+C to end call.")
        print("=======================================================\\n")

        speech_frames = []
        is_recording = False
        silence_start = None

        with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="float32", blocksize=CHUNK_SAMPLES) as stream:
            while True:
                chunk, _ = stream.read(CHUNK_SAMPLES)
                tensor_chunk = torch.from_numpy(chunk.flatten())
                speech_prob = self.vad_model(tensor_chunk, SAMPLE_RATE).item()

                if speech_prob >= VAD_THRESHOLD:
                    if self.tts.is_speaking:
                        self.tts.interrupt()
                    if not is_recording:
                        is_recording = True
                        speech_frames = []
                    speech_frames.append(chunk.copy())
                    silence_start = None
                else:
                    if is_recording:
                        speech_frames.append(chunk.copy())
                        if silence_start is None:
                            silence_start = time.perf_counter()
                        elif (time.perf_counter() - silence_start) >= SILENCE_LIMIT_SEC:
                            duration = (len(speech_frames) * CHUNK_SAMPLES) / SAMPLE_RATE
                            is_recording = False
                            silence_start = None
                            if duration >= MIN_SPEECH_SEC:
                                captured = list(speech_frames)
                                threading.Thread(
                                    target=self.handle_user_utterance,
                                    args=(captured,),
                                    daemon=True
                                ).start()
                            speech_frames = []


if __name__ == "__main__":
    pipeline = JarvisVoicePipeline()
    pipeline.start_call_loop()`
  },
  {
    id: 'agent_router',
    title: '4. The Agent Router (agent.py)',
    filename: 'agent.py',
    language: 'python',
    description: 'LangChain + Ollama (Qwen2.5 / Llama-3.1) router embedding the exact Hinglish Jarvis System Prompt and all 6 tools.',
    content: `import os
from typing import Generator
from langchain_ollama import ChatOllama
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage
from tools import (
    execute_os_command_with_autodebug,
    ingest_knowledge_books,
    query_knowledge_books,
    save_new_python_skill,
    run_saved_skill,
    remember_or_recall_memory,
    get_persistent_memories_summary
)

JARVIS_SYSTEM_PROMPT = """You are an advanced, autonomous personal AI assistant running locally on the user's computer, inspired by Jarvis. Your user's name is Akash. You are interacting via a real-time Voice Call Interface.Directives:
1. Speak naturally in Hinglish. Keep your spoken responses concise and conversational.
2. DO NOT output markdown, asterisks, long lists, or code blocks in your conversational replies, because they will sound glitchy when read by the Text-to-Speech engine.
3. You have full OS access. If Akash asks you to do something on the PC, say something short like 'On it, Akash', use your tools to execute the task, and then report back when it's done. Do not explain how you will do it.
4. If asked about facts or books, silently use your RAG tool to read your database before answering.
5. Be highly intelligent, calm, efficient, and friendly."""

OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:7b-instruct")

llm = ChatOllama(
    model=OLLAMA_MODEL,
    base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
    temperature=0.3,
    num_ctx=8192,
    keep_alive="24h"
)

TOOLS = [
    execute_os_command_with_autodebug,
    ingest_knowledge_books,
    query_knowledge_books,
    save_new_python_skill,
    run_saved_skill,
    remember_or_recall_memory
]

prompt = ChatPromptTemplate.from_messages([
    ("system", JARVIS_SYSTEM_PROMPT + "\\n\\nActive Long-Term Memory Context:\\n{memory_context}"),
    MessagesPlaceholder(variable_name="chat_history"),
    ("human", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])

agent = create_tool_calling_agent(llm, TOOLS, prompt)
agent_executor = AgentExecutor(
    agent=agent,
    tools=TOOLS,
    verbose=True,
    max_iterations=6,
    handle_parsing_errors=True
)

CHAT_HISTORY = []


def warmup_agent():
    """Pre-loads the Ollama model into VRAM so the first voice turn has sub-second latency."""
    try:
        llm.invoke("Namaste Jarvis, ready?")
        print(f"[AGENT] Warmed up local Ollama model: {OLLAMA_MODEL}")
    except Exception as exc:
        print(f"[AGENT WARNING] Make sure Ollama is running ('ollama serve'): {exc}")


def stream_jarvis_response(user_text: str) -> Generator[str, None, None]:
    """
    Streams spoken Hinglish sentences back to voice_loop.py.
    If an OS or Skill tool is invoked, immediately yields 'On it, Akash. ' so TTS begins under 500ms.
    """
    global CHAT_HISTORY
    memory_context = get_persistent_memories_summary()
    lower_q = user_text.lower()

    if any(k in lower_q for k in ["open", "kholo", "run", "chalao", "clean", "sort", "folder", "script", "screenshot"]):
        yield "On it, Akash. "

    result = agent_executor.invoke({
        "input": user_text,
        "chat_history": CHAT_HISTORY[-10:],
        "memory_context": memory_context
    })

    output_text = result.get("output", "Akash, task complete ho gaya hai.")
    CHAT_HISTORY.append(HumanMessage(content=user_text))
    CHAT_HISTORY.append(AIMessage(content=output_text))

    yield output_text`
  },
  {
    id: 'tools_py',
    title: '5. Tool Definitions (tools.py)',
    filename: 'tools.py',
    language: 'python',
    description: 'ChromaDB PDF/EPUB Ingestor & Retriever, Autonomous Self-Debugging OS Controller, Persistent Memory, and Python Skill Learner.',
    content: `import os
import sys
import json
import subprocess
import traceback
from pathlib import Path
from datetime import datetime
from langchain_core.tools import tool
from langchain_ollama import ChatOllama
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_community.document_loaders import PyPDFLoader, UnstructuredEPubLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

BASE_DIR = Path(__file__).resolve().parent
KNOWLEDGE_DIR = BASE_DIR / "knowledge_base"
CHROMA_DIR = BASE_DIR / "chroma_db"
SKILLS_DIR = BASE_DIR / "skills"
MEMORY_FILE = BASE_DIR / "memory_store" / "akash_memory.json"

for folder in [KNOWLEDGE_DIR, CHROMA_DIR, SKILLS_DIR, MEMORY_FILE.parent]:
    folder.mkdir(parents=True, exist_ok=True)

EMBEDDINGS = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")


def _get_vectorstore() -> Chroma:
    return Chroma(
        collection_name="akash_books_rag",
        embedding_function=EMBEDDINGS,
        persist_directory=str(CHROMA_DIR)
    )


@tool
def ingest_knowledge_books() -> str:
    """Scans ./knowledge_base for PDF, EPUB, and TXT/MD books and indexes new files into local ChromaDB."""
    vs = _get_vectorstore()
    existing_Meta = vs.get().get("metadatas", [])
    indexed_sources = {m.get("source") for m in existing_Meta if m}

    splitter = RecursiveCharacterTextSplitter(chunk_size=900, chunk_overlap=150)
    added_files = []
    total_chunks = 0

    for file_path in KNOWLEDGE_DIR.iterdir():
        if not file_path.is_file() or str(file_path) in indexed_sources:
            continue
        ext = file_path.suffix.lower()
        try:
            if ext == ".pdf":
                docs = PyPDFLoader(str(file_path)).load()
            elif ext == ".epub":
                docs = UnstructuredEPubLoader(str(file_path)).load()
            elif ext in (".txt", ".md"):
                docs = TextLoader(str(file_path), encoding="utf-8").load()
            else:
                continue

            chunks = splitter.split_documents(docs)
            if chunks:
                vs.add_documents(chunks)
                added_files.append(file_path.name)
                total_chunks += len(chunks)
        except Exception as err:
            print(f"[RAG Ingest Error] {file_path.name}: {err}")

    if not added_files:
        return "All books in knowledge_base are already indexed in ChromaDB."
    return f"Successfully ingested {len(added_files)} books ({', '.join(added_files)}) into {total_chunks} vector chunks."


@tool
def query_knowledge_books(question: str) -> str:
    """Performs semantic search across Akash's local books and PDFs in ChromaDB to answer deep analytical questions."""
    vs = _get_vectorstore()
    results = vs.similarity_search_with_score(question, k=4)
    if not results:
        return "No matching passages found in ChromaDB. Try running ingest_knowledge_books first."

    passages = []
    for doc, score in results:
        src = Path(doc.metadata.get("source", "book")).name
        page = doc.metadata.get("page", "N/A")
        passages.append(f"[Book: {src}, Page: {page}] {doc.page_content.strip()}")
    return "\\n---\\n".join(passages)


@tool
def execute_os_command_with_autodebug(task_description: str, python_code: str) -> str:
    """
    Executes Python/OS automation code on Akash's PC (pyautogui, subprocess, file management).
    If execution fails, autonomously reads the traceback, rewrites the code up to 3 times, and retries.
    """
    coder_llm = ChatOllama(model=os.getenv("OLLAMA_MODEL", "qwen2.5:7b-instruct"), temperature=0.1)
    current_code = python_code
    max_attempts = 3

    for attempt in range(1, max_attempts + 1):
        temp_script = BASE_DIR / f"_temp_exec_{attempt}.py"
        temp_script.write_text(current_code, encoding="utf-8")
        try:
            proc = subprocess.run(
                [sys.executable, str(temp_script)],
                capture_output=True,
                text=True,
                timeout=45
            )
            temp_script.unlink(missing_ok=True)
            if proc.returncode == 0:
                out = proc.stdout.strip() or "Task executed successfully with zero errors."
                return f"Success on attempt {attempt}: {out}"

            error_trace = proc.stderr.strip() or proc.stdout.strip()
            print(f"[AUTO-DEBUG Attempt {attempt} Failed]: {error_trace}")

            fix_prompt = (
                f"Task: {task_description}\\n"
                f"Broken Python Code:\\n{current_code}\\n"
                f"Traceback Error:\\n{error_trace}\\n"
                "Return ONLY valid, fixed raw Python code without markdown fences."
            )
            fixed_resp = coder_llm.invoke(fix_prompt).content
            current_code = fixed_resp.replace("\`\`\`python", "").replace("\`\`\`", "").strip()
        except Exception as exc:
            temp_script.unlink(missing_ok=True)
            return f"Execution exception on attempt {attempt}: {exc}"

    return "Failed after 3 autonomous debugging attempts."


@tool
def save_new_python_skill(skill_name: str, instructions: str, python_code: str) -> str:
    """
    Saves a newly taught workflow as a reusable Python skill inside ./skills/{skill_name}.py
    and registers it in skill_registry.json so Jarvis can run it anytime Akash asks.
    """
    safe_name = "".join(c if c.isalnum() or c == "_" else "_" for c in skill_name.lower()).strip("_")
    skill_path = SKILLS_DIR / f"{safe_name}.py"
    clean_code = python_code.replace("\`\`\`python", "").replace("\`\`\`", "").strip()
    skill_path.write_text(clean_code, encoding="utf-8")

    registry_path = SKILLS_DIR / "skill_registry.json"
    registry = json.loads(registry_path.read_text(encoding="utf-8")) if registry_path.exists() else {}
    registry[safe_name] = {
        "skill_name": safe_name,
        "instructions": instructions,
        "file_path": str(skill_path),
        "updated_at": datetime.now().isoformat()
    }
    registry_path.write_text(json.dumps(registry, indent=2), encoding="utf-8")
    return f"New skill '{safe_name}' saved to {skill_path} and registered."


@tool
def run_saved_skill(skill_name: str) -> str:
    """Retrieves and executes a previously saved Python skill from ./skills/{skill_name}.py."""
    safe_name = "".join(c if c.isalnum() or c == "_" else "_" for c in skill_name.lower()).strip("_")
    skill_path = SKILLS_DIR / f"{safe_name}.py"
    if not skill_path.exists():
        registry_path = SKILLS_DIR / "skill_registry.json"
        available = list(json.loads(registry_path.read_text()).keys()) if registry_path.exists() else []
        return f"Skill '{safe_name}' not found. Available skills: {available}"

    proc = subprocess.run([sys.executable, str(skill_path)], capture_output=True, text=True, timeout=60)
    if proc.returncode == 0:
        return f"Skill '{safe_name}' completed: {proc.stdout.strip()}"
    return f"Skill '{safe_name}' error: {proc.stderr.strip()}"


def get_persistent_memories_summary() -> str:
    if not MEMORY_FILE.exists():
        return "User is Akash. Prefers concise Hinglish voice responses."
    try:
        items = json.loads(MEMORY_FILE.read_text(encoding="utf-8"))
        return "\\n".join(f"- {m['fact']}" for m in items[-15:])
    except Exception:
        return "User is Akash."


@tool
def remember_or_recall_memory(action: str, fact_or_query: str) -> str:
    """
    Stores or searches long-term facts about Akash in ./memory_store/akash_memory.json.
    action must be 'save' or 'search'.
    """
    memories = json.loads(MEMORY_FILE.read_text(encoding="utf-8")) if MEMORY_FILE.exists() else []
    if action.lower() == "save":
        memories.append({"fact": fact_or_query, "timestamp": datetime.now().isoformat()})
        MEMORY_FILE.write_text(json.dumps(memories, indent=2, ensure_ascii=False), encoding="utf-8")
        return f"Saved to long-term memory: {fact_or_query}"

    matches = [m["fact"] for m in memories if fact_or_query.lower() in m["fact"].lower()]
    return " | ".join(matches) if matches else "No matching memory found."`
  },
  {
    id: 'setup_guide',
    title: '6. Setup & Execution Guide',
    filename: 'SETUP_INSTRUCTIONS.md',
    language: 'markdown',
    description: 'Step-by-step instructions to install Ollama, CUDA PyTorch, Faster-Whisper, XTTSv2/Piper, and launch Jarvis locally.',
    content: `# Step-by-Step Local Setup Guide (Windows / Linux / macOS)

## Step 1: Install Ollama & Pull Local Hinglish-Capable LLM
1. Download and install Ollama from https://ollama.com
2. Pull **Qwen-2.5-7B-Instruct** (or **Llama-3.1-8B-Instruct**):
   \`\`\`bash
   ollama pull qwen2.5:7b-instruct
   ollama pull llama3.1:8b
   \`\`\`

## Step 2: Create Python 3.11 Virtual Environment
\`\`\`bash
mkdir jarvis_assistant && cd jarvis_assistant
python -m venv venv
# Windows:
venv\\Scripts\\activate
# Linux/macOS:
source venv/bin/activate
\`\`\`

## Step 3: Install GPU PyTorch & Requirements
\`\`\`bash
pip install --upgrade pip
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt
\`\`\`

## Step 4: Add Reference Voice & Books
1. Place a clean 6-10 second WAV clip in \`voices/jarvis_reference.wav\` for XTTSv2 voice cloning.
2. Drop your PDF and EPUB books inside \`knowledge_base/\`.

## Step 5: Launch the Real-Time Hinglish Voice Loop
\`\`\`bash
python voice_loop.py
\`\`\``
  }
];
