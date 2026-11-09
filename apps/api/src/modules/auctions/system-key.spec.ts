import { UUID_PATTERN } from '../../database/mongo/schema-dsl.js';
import { stepKey } from './system-key.js';

describe('stepKey', () => {
  const id = '6f1c2a4e-1b2c-4d5e-8f90-1234567890ab';
  it('is a deterministic UUID per aggregate version', () => {
    expect(stepKey(id, 3)).toBe(stepKey(id, 3));
    expect(stepKey(id, 3)).toMatch(new RegExp(UUID_PATTERN));
  });
  it('differs between versions and aggregates', () => {
    expect(stepKey(id, 3)).not.toBe(stepKey(id, 4));
    expect(stepKey(id, 3)).not.toBe(
      stepKey('7f1c2a4e-1b2c-4d5e-8f90-1234567890ab', 3),
    );
  });
});

describe('stepKey per worker step (ADR 0083)', () => {
  const id = '6f1c2a4e-1b2c-4d5e-8f90-1234567890ab';
  it('gives each step sharing a system actor its own key', () => {
    const keys = ['close', 'expireRegistration', 'expireHold'].map((s) =>
      stepKey(id, 3, s),
    );
    expect(new Set(keys).size).toBe(3);
    for (const k of keys) {
      expect(k).toMatch(new RegExp(UUID_PATTERN));
      expect(k).not.toBe(stepKey(id, 3));
    }
    expect(stepKey(id, 3, 'close')).toBe(stepKey(id, 3, 'close'));
  });
});
