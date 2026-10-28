// Native Android cold-start regression. Dedicated QA emulator only; no UI inputs.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readConfig, bindingFor, root } from './demo/sandbox.mjs';

const app = 'com.huangg49.mobilereactnative';
export function validateTarget(name, device, count, reverses) {
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(name ?? '') || !/^emulator-\d+$/.test(device ?? '')
      || !Number.isInteger(count) || count < 1 || count > 30) {
    throw new Error('Use <QA-run-name> --device emulator-N --count 1..30.');
  }
  if (reverses !== undefined && (!/\btcp:8081 tcp:8081\s*$/m.test(reverses) || !/\btcp:3009 tcp:3048\s*$/m.test(reverses))) {
    throw new Error('Dedicated emulator reverses must use Metro8081 and QA API3009 -> pilot proxy3048.');
  }
}
export function reachedHome(xml) {
  return xml.includes('content-desc="Tìm sách theo tên, tác giả hoặc ISBN"')
    && xml.includes('content-desc="Tài khoản"');
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    device: { type: 'string' }, count: { type: 'string', default: '10' },
  } });
  const [name] = positionals, count = Number(values.count), device = values.device;
  // Validate arguments before looking up a device or run directory.
  validateTarget(name, device, count);
  if (positionals.length !== 1) throw new Error('Specify exactly one QA run name.');
  const output = path.join(root, '.tmp/native-startup');
  await mkdir(output, { recursive: true });
  const result = { status: 'RUNNING', startedAt: new Date().toISOString(), count, trials: [],
    sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    dirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
    limits: ['Debug x86_64 emulator', 'Native UI/launch only; not full journeys', 'Fake storage', 'No TalkBack audio/human/ARM/iOS acceptance', 'No READINESS closure'],
  };
  const save = () => writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  await save();
  try {
    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(process.env.LOCALAPPDATA ?? '', 'Android/Sdk');
    const adb = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
    const run = (...args) => {
      try { return execFileSync(adb, ['-s', device, ...args], { windowsHide: true, timeout: 25000, stdio: ['ignore', 'pipe', 'pipe'] }); }
      catch { throw new Error('Native command failed; inspect the selected QA emulator locally. Raw command output suppressed.'); }
    };
    validateTarget(name, device, count, run('reverse', '--list').toString());
    if (run('shell', 'getprop', 'ro.product.cpu.abi').toString().trim() !== 'x86_64') throw new Error('Use an x86_64 QA emulator for this gate.');
    const config = await readConfig(path.join(root, '.tmp/demo', name));
    if (config.storage !== 'fixture' || config.port !== 3046) throw new Error('Use a dedicated Android pilot fixture on3046.');
    const manifest = JSON.parse(await readFile(path.join(root, '.tmp/demo', name, 'pilot-fixtures.json'), 'utf8'));
    if (manifest.binding !== bindingFor(config)) throw new Error('This QA manifest belongs to another dataset.');
    const response = await fetch(`http://127.0.0.1:3046/api/v1/listings/${manifest.target}`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok || (await response.json()).id !== manifest.target) throw new Error('This QA pilot is not ready.');
    if (!run('shell', 'dumpsys', 'package', app).toString().includes('DEBUGGABLE')) throw new Error('Install the current debug APK first.');
    const apk = await readFile(path.join(root, 'apps/mobile-react-native/android/app/build/outputs/apk/debug/app-debug.apk'));
    result.apkSha256 = createHash('sha256').update(apk).digest('hex');
    const installed = run('shell', 'pm', 'path', app).toString().trim().split(/\r?\n/);
    if (installed.length !== 1 || !/^package:\/data\/app\/.+\/base\.apk$/.test(installed[0])) throw new Error('Expected one installed debug APK.');
    const installedHash = run('shell', 'sha256sum', installed[0].slice('package:'.length)).toString().split(/\s+/)[0];
    if (installedHash !== result.apkSha256) throw new Error('Installed APK differs from current build artifact.');
    const crashBefore = run('logcat', '-d', '-b', 'crash').toString();
    const xml = () => {
      run('shell', 'uiautomator', 'dump', '--compressed', '/sdcard/latlai-startup-qa.xml');
      return run('exec-out', 'cat', '/sdcard/latlai-startup-qa.xml').toString();
    };
    for (let i = 0; i < count; i++) {
      const started = Date.now();
      run('shell', 'am', 'force-stop', app);
      run('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d',
        'mobilereactnative://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081', app);
      let visible = false;
      for (let poll = 0; poll < 8; poll++) {
        await sleep(1000);
        if (reachedHome(xml())) { visible = true; break; }
      }
      const newCrash = /Fatal signal[^\n]*bilereactnative/.test(run('logcat', '-d', '-b', 'crash').toString().slice(crashBefore.length));
      result.trials.push({ launch: i + 1, nativeHomeVisible: visible, newNativeFatalSignal: newCrash, elapsedMs: Date.now() - started });
      await save();
      console.log(`Native launch ${i + 1}/${count}: ${visible && !newCrash ? 'PASS' : 'FAIL'}`);
      if (!visible || newCrash) throw new Error('Native startup failed. Preserve the crash buffer; do not count a launch without business UI.');
    }
    result.status = 'PASS';
  } catch (error) {
    result.status = result.trials.length ? 'FAIL' : 'BLOCKED';
    // Only our fixed/sanitized errors reach this report. Never store raw adb/UI/HTTP data.
    result.reason = error.message.startsWith('Native') || error.message.startsWith('Use ') || error.message.startsWith('Dedicated')
      || error.message.startsWith('Install') || error.message.startsWith('Installed') || error.message.startsWith('Expected')
      || error.message.startsWith('This QA') ? error.message : 'Native preflight failed; inspect QA tools/artifacts without exposing private configuration.';
    process.exitCode = 1;
  }
  result.finishedAt = new Date().toISOString();
  await save();
  console.log(`Native startup: ${result.status}; matrix .tmp/native-startup/result.json`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch(() => { console.error('Invalid native startup invocation; use <run> --device emulator-N --count 1..30.'); process.exitCode = 1; });
}
