import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, chmod, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const skill = path.join(root, '.agents/skills/impeccable');
const lock = JSON.parse(await readFile(path.join(skill, 'upstream.lock.json'), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const normalize = bytes => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));

async function verifyVendor() {
  for (const [file, digest] of Object.entries(lock.upstreamSha256)) {
    let bytes = normalize(await readFile(path.join(skill, file)));
    if (file === 'SKILL.md') {
      const body = bytes.toString().split(lock.localPreamble)[1];
      if (body === undefined) throw new Error('Impeccable project preamble changed; review the lock.');
      bytes = Buffer.from(lock.upstreamFrontmatter + body);
    }
    if (hash(bytes) !== (lock.localSha256?.[file] ?? digest)) throw new Error(`Impeccable vendor drift: ${file}. Review the pinned update; do not silently refresh.`);
  }
}

try {
  await verifyVendor();
  if (process.argv[2] === '--verify-vendor') {
    console.log(`PASS: Impeccable ${lock.skillVersion}, ${Object.keys(lock.upstreamSha256).length} pinned vendor files, revision ${lock.revision}.`);
  } else {
    const requestedKey = `${process.platform}-${process.arch}`;
    const key = requestedKey === 'win32-arm64' ? 'win32-x64' : requestedKey;
    const asset = lock.engines[key];
    if (!asset) throw new Error(`Pinned engine is unavailable for ${key}. Read docs/design/IMPECCABLE_WORKFLOW.md for the documented fallback.`);
    if (key !== requestedKey) console.error('Using the pinned Windows x64 engine through Windows ARM emulation; native ARM execution is not verified.');
    const cache = path.join(root, '.tmp/impeccable/engine', lock.engineVersion, key);
    const binary = path.join(cache, process.platform === 'win32' ? 'impeccable.exe' : 'impeccable');
    let bytes;
    try { bytes = await readFile(binary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (bytes && hash(bytes) !== asset.sha256) throw new Error('Pinned Impeccable engine checksum mismatch; refusing to execute cached file.');
    if (!bytes) {
      const response = await fetch(asset.url, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`Engine download failed: HTTP ${response.status}.`);
      bytes = Buffer.from(await response.arrayBuffer());
      if (hash(bytes) !== asset.sha256) throw new Error('Impeccable engine download checksum mismatch; refusing to execute.');
      await mkdir(cache, { recursive: true });
      const staging = `${binary}.${process.pid}.part`;
      try {
        await writeFile(staging, bytes, { flag: 'wx', mode: 0o755 });
        await rename(staging, binary);
      } finally { await rm(staging, { force: true }); }
    }
    if (process.platform !== 'win32') await chmod(binary, 0o755);
    const child = spawn(binary, process.argv.slice(2), {
      cwd: root, windowsHide: true, stdio: 'inherit',
      env: { ...process.env, IMPECCABLE_SKILL_DIR: skill, IMPECCABLE_HOME: path.join(root, '.tmp/impeccable/runtime') },
    });
    child.on('error', error => { console.error(error.message); process.exitCode = 1; });
    child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
