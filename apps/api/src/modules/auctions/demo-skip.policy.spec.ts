import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { DomainError } from '../commands/domain-error.js';
import { DemoSkipPolicy } from './demo-skip.policy.js';

const make = (override: Record<string, string | undefined> = {}) => {
  const values = {
    NODE_ENV: 'development',
    MONGODB_URL: 'mongodb://localhost:58017/latlai',
    PAYMENT_SIMULATOR_SECRET: 'qa-only',
    DEMO_SKIP_ENABLED: 'true',
    ...override,
  };
  return new DemoSkipPolicy({
    get: (key: keyof typeof values) => values[key],
    getOrThrow: (key: keyof typeof values) => values[key],
  } as unknown as ConfigService);
};

describe('local demo skip gate', () => {
  it('allows the local demo without an entity allowlist', () => {
    expect(make().enabled()).toBe(true);
  });

  it.each([
    { NODE_ENV: 'production' },
    { NODE_ENV: 'staging' },
    { MONGODB_URL: 'mongodb://remote.example/latlai' },
    { MONGODB_URL: 'not a url' },
    { PAYMENT_SIMULATOR_SECRET: '' },
    { DEMO_SKIP_ENABLED: undefined },
    { DEMO_SKIP_ENABLED: '' },
    { DEMO_SKIP_ENABLED: 'false' },
    { DEMO_SKIP_ENABLED: '1' },
  ])('fails closed for %j', (value) => {
    expect(make(value).enabled()).toBe(false);
    expect(() => make(value).assertEnabled()).toThrow(DomainError);
  });
});
