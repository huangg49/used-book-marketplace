// A serial, explicit browser evidence gate. It never starts/migrates the main DB.
import { spawn, execFileSync } from 'node:child_process';
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const suites = [
  { id: 'chat', script: 'apps/user-web/tests/chat-guidance.mjs', scope: 'Web; intercepted HTTP + isolated Socket.IO; no application DB' },
  { id: 'seller-order', script: 'apps/user-web/tests/seller-order.mjs', mongo: true, scope: 'Web; real HTTP/Mongo; order creation/payment; stops before fulfillment; fake storage' },
  { id: 'exchange', script: 'apps/user-web/tests/exchange-integration.mjs', mongo: true, scope: 'Web; real HTTP/Mongo; proposal/accept/cancel/funding denial; fake storage' },
  { id: 'operations', script: 'apps/admin-web/tests/browser.mjs', mongo: true, scope: 'Staff/Admin web; real HTTP/Mongo; catalog/listing moderation/session; fake storage' },
  { id: 'member-rn-web', script: 'scripts/test-public-shelf.mjs', mongo: true, rn: true, scope: 'RN web export; real HTTP/Mongo; shelf/listing/media/address/member data; fake storage; not native' },
  { id: 'reviews', script: 'scripts/test-transaction-reviews.mjs', mongo: true, rn: true, scope: 'Web/RN web/Staff; real HTTP/Mongo; synthetic Completed fixtures; fake storage; no fulfillment claim' },
  { id: 'work-inbox', script: 'scripts/test-work-inbox.mjs', mongo: true, rn: true, scope: 'Web/RN web/Staff/Admin; real HTTP/Mongo; commands + synthetic paging/intakes; fake storage' },
  { id: 'auction-ui', script: 'apps/user-web/tests/auction-stage.mjs', scope: 'Web auction interface/motion; intercepted fixtures; not cross-role intake/auction fulfillment' },
  { id: 'auction-journey', script: 'scripts/test-auction-journey.mjs', mongo: true, rn: true, scope: 'Member/Staff web + RN web; real intake/inspection/publish/bid/Buy Now/worker/payment; fake storage; stops at payment hold' },
];

export function selectSuites(args) {
  if (!args.length) return suites;
  if (args.length === 1 && args[0] === '--list') return [];
  if (args.length !== 1 || !args[0].startsWith('--only=')) throw new Error('Use --list or --only=id1,id2 (see --list).');
  const ids = args[0].slice('--only='.length).split(',');
  if (ids.some(id => !suites.some(suite => suite.id === id)) || new Set(ids).size !== ids.length) {
    throw new Error('Unknown, empty or duplicate suite ID (see --list).');
  }
  // Keep fixed ordering even when callers supply a different order.
  return suites.filter(suite => ids.includes(suite.id));
}

export function requireQaMongo(raw) {
  const message = 'MONGO_TEST_URL must use local QA: mongodb://127.0.0.1:57017/<name>_test?replicaSet=rs-test (credentials/authSource per START_HERE).';
  let url;
  try { url = new URL(raw); } catch { throw new Error(message); }
  if (url.protocol !== 'mongodb:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.port !== '57017' || !/^\/[a-zA-Z0-9_]+_test$/.test(url.pathname)
      || url.searchParams.getAll('replicaSet').length !== 1
      || url.searchParams.get('replicaSet') !== 'rs-test' || url.hash
      || [...url.searchParams.keys()].some(key => !['replicaSet', 'authSource'].includes(key))
      || url.searchParams.getAll('authSource').length > 1
      || (url.searchParams.has('authSource') && url.searchParams.get('authSource') !== 'admin')) {
    throw new Error(message);
  }
  // Do not return/log the URL or its credentials.
}

export function overallStatus(rows) {
  if (rows.some(row => row.status === 'FAIL')) return 'FAIL';
  return rows.every(row => row.status === 'PASS') ? 'PASS' : 'PARTIAL';
}

export async function rnUsesQaApi(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, item.name);
    if (item.isDirectory() && await rnUsesQaApi(target)) return true;
    if (item.isFile() && item.name.endsWith('.js')
        && (await readFile(target, 'utf8')).includes('http://127.0.0.1:3009/api/v1')) return true;
  }
  return false;
}

async function preflight(selected) {
  if (selected.some(suite => suite.mongo)) {
    requireQaMongo(process.env.MONGO_TEST_URL);
    try { await access(path.join(root, 'apps/api/dist/app.module.js')); }
    catch { throw new Error('Build the API from the current source before running the gate.'); }
  }
  if (selected.some(suite => suite.rn)) {
    const dist = path.join(root, 'apps/mobile-react-native/dist');
    try { await access(path.join(dist, 'index.html')); }
    catch { throw new Error('Export RN web from current source with EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3009/api/v1.'); }
    if (!await rnUsesQaApi(dist)) throw new Error('RN export does not contain the QA API base on port 3009. Re-export with the QA API base.');
  }
}

async function main() {
  const selected = selectSuites(process.argv.slice(2));
  if (!selected.length) {
    suites.forEach(suite => console.log(`${suite.id}: ${suite.scope}`));
    return;
  }
  const selectedIds = new Set(selected.map(suite => suite.id));
  const report = {
    startedAt: new Date().toISOString(), status: 'RUNNING',
    sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    dirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
    artifactLimit: 'Existence/QA-base preflight only. Build/export freshness requires the documented preparation commands.',
    limits: ['No GHN/carrier/Driver', 'No main DB', 'Fake storage', 'No native/human acceptance', 'No READINESS gate closure', 'Auction UI fixtures are not real cross-role auction evidence'],
    suites: suites.map(({ id, scope }) => ({ id, scope, selected: selectedIds.has(id), status: 'NOT_RUN' })),
  };
  const output = path.join(root, '.tmp/journey-gate/result.json');
  await mkdir(path.dirname(output), { recursive: true });
  const save = () => writeFile(output, JSON.stringify(report, null, 2) + '\n');
  await save(); // An old PASS must not survive a failed preflight/new run.
  try { await preflight(selected); }
  catch (error) {
    report.status = 'BLOCKED';
    report.reason = error.message;
    await save();
    throw error;
  }
  for (const suite of selected) {
    const row = report.suites.find(item => item.id === suite.id);
    const started = Date.now();
    row.status = 'RUNNING';
    await save();
    console.log(`\n[${suite.id}] ${suite.scope}`);
    const result = await new Promise(resolve => {
      const child = spawn(process.execPath, [suite.script], {
        cwd: root, stdio: 'inherit', windowsHide: true,
        env: { ...process.env, AUCTION_MOTION_EVIDENCE: '.tmp/journey-gate/auction-ui' },
      });
      child.once('error', () => resolve({ code: null, signal: null }));
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    Object.assign(row, { status: result.code === 0 ? 'PASS' : 'FAIL', exitCode: result.code, signal: result.signal, durationMs: Date.now() - started });
    await save();
    if (row.status === 'FAIL') break; // Shared ports: fix/clean up before dependent suites.
  }
  report.status = overallStatus(report.suites);
  report.finishedAt = new Date().toISOString();
  await save();
  report.suites.forEach(row => console.log(`${row.id}: ${row.status}`));
  console.log(`Evidence matrix: ${output}`);
  if (report.status === 'FAIL') process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
