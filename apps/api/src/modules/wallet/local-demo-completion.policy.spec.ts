import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { LocalDemoCompletionPolicy } from './local-demo-completion.policy.js';
const make = (override: Record<string, string | undefined> = {}) => {
  const values = { NODE_ENV: 'development', MONGODB_URL: 'mongodb://localhost:58017/latlai', PAYMENT_SIMULATOR_SECRET: 'qa-only', LOCAL_DEMO_COMPLETION_ENABLED: 'true', ...override };
  return new LocalDemoCompletionPolicy({ get: (key: keyof typeof values) => values[key], getOrThrow: (key: keyof typeof values) => values[key] } as unknown as ConfigService);
};
describe('single local demo completion switch', () => {
  it('permits local demo Orders without an ID allowlist', () => {
    expect(make().allows('00000000-0000-4000-8000-000000000001')).toBe(true);
    expect(make().allows('00000000-0000-4000-8000-000000000002')).toBe(true);
  });
  it.each([
    { NODE_ENV: 'production' }, { NODE_ENV: 'staging' }, { MONGODB_URL: 'mongodb://remote.example/latlai' },
    { PAYMENT_SIMULATOR_SECRET: '' }, { LOCAL_DEMO_COMPLETION_ENABLED: undefined },
    { LOCAL_DEMO_COMPLETION_ENABLED: '' },
    { LOCAL_DEMO_COMPLETION_ENABLED: 'false' }, { LOCAL_DEMO_COMPLETION_ENABLED: '1' },
  ])('fails closed for %j', value => expect(make(value).enabled()).toBe(false));
  it('ignores the former ID setting while the switch is off', () => {
    expect(make({ LOCAL_DEMO_COMPLETION_ENABLED: 'false', LOCAL_DEMO_DIRECT_ORDER_IDS: '00000000-0000-4000-8000-000000000001' }).enabled()).toBe(false);
  });
});
