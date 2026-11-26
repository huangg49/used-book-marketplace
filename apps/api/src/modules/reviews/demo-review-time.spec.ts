import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { MongoCommandService } from '../commands/mongo-command.service.js';
import { DemoReviewTime } from './demo-review-time.js';

const EXCHANGE_ID = '11111111-1111-4111-8111-111111111111';

function make(override: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    NODE_ENV: 'development',
    MONGODB_URL: 'mongodb://localhost:27017/latlai',
    DEMO_REVIEW_TIME_ENABLED: 'true',
    DEMO_REVIEW_EXCHANGE_IDS: EXCHANGE_ID,
    PAYMENT_SIMULATOR_SECRET: 'qa-only-secret-at-least-32-characters',
    ...override,
  };
  const service = new DemoReviewTime(
    {} as MongoCommandService,
    {
      get: (key: string, fallback?: string) => values[key] ?? fallback,
    } as unknown as ConfigService,
  );
  return (service as unknown as { enabled(id: string): boolean }).enabled(
    EXCHANGE_ID,
  );
}

describe('DemoReviewTime remote demo gate', () => {
  it('permits loopback Mongo in development by default', () => {
    expect(make()).toBe(true);
  });

  it('rejects remote Mongo unless DEMO_ALLOW_REMOTE_HOST=true with simulator secret', () => {
    const atlas = 'mongodb+srv://user:pass@cluster.mongodb.net/latlai';
    expect(make({ MONGODB_URL: atlas })).toBe(false);
    expect(
      make({ MONGODB_URL: atlas, DEMO_ALLOW_REMOTE_HOST: 'true' }),
    ).toBe(true);
    expect(
      make({
        MONGODB_URL: atlas,
        DEMO_ALLOW_REMOTE_HOST: 'true',
        PAYMENT_SIMULATOR_SECRET: '',
      }),
    ).toBe(false);
    expect(
      make({
        NODE_ENV: 'production',
        MONGODB_URL: atlas,
        DEMO_ALLOW_REMOTE_HOST: 'true',
      }),
    ).toBe(false);
  });
});
