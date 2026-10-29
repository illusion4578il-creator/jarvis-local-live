export function getPackageFiles(sourceFiles, manual) {
  return [
    ...sourceFiles,
    { filename: 'README.md', content: manual },
    { filename: '.env.example', content: `OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama-3.1-8b-instruct-abliterated
ODYSSEUS_BASE_URL=http://localhost:7011
# Replace with your deployment's documented unauthenticated health path.
ODYSSEUS_HEALTH_PATH=/
JARVIS_WAKE_WORD=Hello Jarvis
JARVIS_TTS_ENGINE=xtts
WHISPER_MODEL_SIZE=medium
` },
    { filename: '.gitignore', content: `.env
.venv/
venv/
__pycache__/
*.pyc
*.log
_temp_exec_*.py
chroma_db/
memory_store/
knowledge_base/*
!knowledge_base/.gitkeep
voices/*
!voices/.gitkeep
skills/*
!skills/.gitkeep
` },
    ...['knowledge_base', 'voices', 'skills'].map(folder => ({ filename: `${folder}/.gitkeep`, content: '' })),
  ];
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Stored ZIP entries need no compression dependency and preserve UTF-8 sources.
export function createPackageZip(files) {
  const encoder = new TextEncoder();
  const entries = [];
  const directory = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(`jarvis_assistant/${file.filename}`);
    const content = encoder.encode(file.content);
    const crc = crc32(content);
    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true);
    view.setUint16(12, 33, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, content.length, true);
    view.setUint32(22, content.length, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(14, 33, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, content.length, true);
    centralView.setUint32(24, content.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    entries.push(local, content);
    directory.push(central);
    offset += local.length + content.length;
  }
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, directory.reduce((sum, entry) => sum + entry.length, 0), true);
  endView.setUint32(16, offset, true);
  return new Blob([...entries, ...directory, end], { type: 'application/zip' });
}