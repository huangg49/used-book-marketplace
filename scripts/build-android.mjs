// Reproducible local debug APK build; no publishing, signing-key changes or emulator launch.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = resolve(root, 'apps/mobile-react-native');
const require = createRequire(resolve(app, 'package.json'));
const env = { ...process.env, CI: '1', NODE_ENV: 'development' };
if (process.platform === 'win32') {
  env.LATLAI_NINJA ||= resolve(root, '.tmp/ninja-1.12.1/ninja.exe');
  const ninja = spawnSync(env.LATLAI_NINJA, ['--version'], { encoding: 'utf8', windowsHide: true });
  const [major, minor] = (ninja.stdout?.trim() || '').split('.').map(Number);
  if (ninja.status !== 0 || !(major > 1 || (major === 1 && minor >= 12))) {
    console.error('Windows needs Ninja >=1.12. Set LATLAI_NINJA to ninja.exe; see docs/ANDROID_QUALITY.md.');
    process.exit(1);
  }
}
if (!env.ANDROID_HOME && process.platform === 'win32' && env.LOCALAPPDATA) {
  const sdk = resolve(env.LOCALAPPDATA, 'Android/Sdk');
  if (existsSync(sdk)) env.ANDROID_HOME = sdk;
}
if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT) {
  console.error('Set ANDROID_HOME to your Android SDK. See docs/ANDROID_QUALITY.md.');
  process.exit(1);
}
function run(command, args, cwd) {
  const child = spawnSync(command, args, { cwd, env, stdio: 'inherit', windowsHide: true });
  if (child.error || child.status !== 0) {
    console.error('Android build step failed; inspect diagnostics above. No database or credentials were changed.');
    process.exit(child.status || 1);
  }
}
const expo = resolve(dirname(require.resolve('expo/package.json')), 'bin/cli');
run(process.execPath, [expo, 'prebuild', '--platform', 'android', '--no-install'], app);
const args = [':app:assembleDebug', '--console=plain', '--max-workers=2'];
if (process.platform === 'win32') args.push('--init-script', '../../../scripts/android-paths.gradle');
if (process.argv.includes('--emulator')) args.push('-PreactNativeArchitectures=x86_64');
const android = resolve(app, 'android');
if (process.platform === 'win32') {
  // Fixed executable/arguments only; no user-controlled values are interpolated into shell code.
  // Explicit .\ path: cmd skips the current directory when NoDefaultCurrentDirectoryInExePath is set.
  run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `.\\gradlew.bat ${args.join(' ')}`], android);
} else run('./gradlew', args, android);
console.log('Debug APK: apps/mobile-react-native/android/app/build/outputs/apk/debug/app-debug.apk');
console.log('Debug builds need Metro. This is not a release/store-signed artifact or a device test.');
