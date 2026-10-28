import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTarget, reachedHome } from './test-native-startup.mjs';
const qa = 'host tcp:8081 tcp:8081\nhost tcp:3009 tcp:3048\n';
test('native regression refuses physical devices, invalid run paths/counts and main API mappings', () => {
  assert.doesNotThrow(() => validateTarget('native-qa', 'emulator-5554', 20, qa));
  for (const args of [ ['../main', 'emulator-5554', 20, qa], ['native-qa', 'physical-device', 20, qa],
    ['native-qa', 'emulator-5554', 0, qa], ['native-qa', 'emulator-5554', 31, qa],
    ['native-qa', 'emulator-5554', 2.5, qa], ['native-qa', 'emulator-5554', 2, 'tcp:8081 tcp:8081\ntcp:3009 tcp:3000'] ]) {
    assert.throws(() => validateTarget(...args));
  }
});
test('a launcher, splash or dev menu is never proof that React business UI mounted', () => {
  for (const xml of ['<node content-desc="Lật lại"/>', '<node text="Loading from 127.0.0.1:8081"/>', '<node content-desc="Tools"/>', '<node content-desc="Tài khoản"/>']) assert.equal(reachedHome(xml), false);
  assert.equal(reachedHome('<node content-desc="Tìm sách theo tên, tác giả hoặc ISBN"/><node content-desc="Tài khoản"/>'), true);
});
