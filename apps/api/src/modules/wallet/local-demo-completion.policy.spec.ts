import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { LocalDemoCompletionPolicy } from './local-demo-completion.policy.js';

const id = '00000000-0000-4000-8000-000000000001';
const make = (override: Record<string, string | undefined> = {}) => {
  const values = { NODE_ENV: 'development', MONGODB_URL: 'mongodb://localhost:58017/latlai', PAYMENT_SIMULATOR_SECRET: 'qa-only', LOCAL_DEMO_DIRECT_ORDER_IDS: id, ...override };
  return new LocalDemoCompletionPolicy({ get: (key: keyof typeof values) => values[key], getOrThrow: (key: keyof typeof values) => values[key] } as unknown as ConfigService);
};
describe('explicit local demo completion permission', () => {
  it('permits only the exact configured Order', () => {
    expect(make().allows(id)).toBe(true);
    expect(make().allows('00000000-0000-4000-8000-000000000002')).toBe(false);
  });
  it.each([
    { NODE_ENV: 'production' }, { NODE_ENV: 'staging' }, { MONGODB_URL: 'mongodb://remote.example/latlai' },
    { PAYMENT_SIMULATOR_SECRET: '' }, { LOCAL_DEMO_DIRECT_ORDER_IDS: '' }, { LOCAL_DEMO_DIRECT_ORDER_IDS: '*' },
  ])('fails closed for %j', value => expect(make(value).allows(id)).toBe(false));
});
