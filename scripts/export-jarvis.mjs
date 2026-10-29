import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPackageFiles, createPackageZip } from '../src/data/jarvisPackage.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(process.cwd(), process.argv[2] || 'jarvis-release');
// Refuse overwrites so re-exporting cannot erase a user's memory or configuration.
try {
  await access(destination);
  throw new Error(`Destination exists: ${destination}. Choose a new folder.`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
let source = await readFile(resolve(root, 'src/data/jarvisCodebase.js'), 'utf8');
const rawImport = /import (\w+) from '([^']+)\?raw';/g;
for (const match of source.matchAll(rawImport)) {
  const raw = await readFile(resolve(root, 'src/data', match[2]), 'utf8');
  source = source.replace(match[0], `const ${match[1]} = ${JSON.stringify(raw)};`);
}
const { CODEBASE_FILES } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const manual = await readFile(resolve(root, 'README.md'), 'utf8');
const files = getPackageFiles(CODEBASE_FILES, manual);
const output = resolve(destination, 'jarvis_assistant');
await mkdir(output, { recursive: true });
for (const file of files) {
  const path = resolve(output, file.filename);
  if (!path.startsWith(output + sep)) throw new Error(`Invalid package path: ${file.filename}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, file.content, 'utf8');
}
await writeFile(resolve(destination, 'jarvis-assistant.zip'), Buffer.from(await createPackageZip(files).arrayBuffer()));
console.log(`Exported Python sources and ZIP to ${destination}. Read jarvis_assistant/README.md before starting.`);