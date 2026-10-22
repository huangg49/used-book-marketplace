import { ConfigService } from '@nestjs/config';
import { vi } from 'vitest';
import type { MongoService } from '../../database/mongo/mongo.service.js';
import { LoginLimiter } from './login-limiter.service.js';

function fixture(environment: Record<string, string | undefined>) {
  const attempts = new Map<string, number>();
  const update = vi.fn(async ({ _id }: { _id: string }) => {
    const count = (attempts.get(_id) ?? 0) + 1;
    attempts.set(_id, count);
    return { attempts: count };
  });
  const cleanup = vi.fn(async () => undefined);
  const collections = {
    login_attempts: { findOneAndUpdate: update, deleteMany: cleanup },
  };
  const tx = vi.fn(
    async (work: (context: { c: typeof collections }) => Promise<unknown>) =>
      work({ c: collections }),
  );
  const mongo = { tx, c: collections } as unknown as MongoService;
  const config = new ConfigService({
    JWT_ACCESS_SECRET: 'unit-test-only-login-limiter-secret-00000',
    ...environment,
  });
  return { limiter: new LoginLimiter(mongo, config), tx };
}

describe('login demo limit override', () => {
  it('allows repeated development logins without consuming stored counters', async () => {
    const { limiter, tx } = fixture({
      NODE_ENV: 'development',
      LOGIN_RATE_LIMIT_DISABLED: 'true',
    });
    for (let i = 0; i < 12; i++)
      await limiter.consume('demo@example.test', '127.0.0.1');
    expect(tx).not.toHaveBeenCalled();
  });

  it.each([
    { NODE_ENV: 'production', LOGIN_RATE_LIMIT_DISABLED: 'true' },
    { NODE_ENV: 'test', LOGIN_RATE_LIMIT_DISABLED: 'true' },
    { NODE_ENV: undefined, LOGIN_RATE_LIMIT_DISABLED: 'true' },
    { NODE_ENV: 'development', LOGIN_RATE_LIMIT_DISABLED: 'false' },
    { NODE_ENV: 'development', LOGIN_RATE_LIMIT_DISABLED: undefined },
  ])('keeps the login limit with %j', async (env) => {
    const { limiter } = fixture(env);
    for (let i = 0; i < 5; i++)
      await limiter.consume('demo@example.test', '127.0.0.1');
    await expect(
      limiter.consume('demo@example.test', '127.0.0.1'),
    ).rejects.toMatchObject({ status: 429 });
  });

  it.each([
    'register',
    'VerifyEmail',
    'ResetPassword',
    'verify-token',
    'reset-token',
    'otp-code',
  ])('keeps %s limited with the demo override enabled', async (scope) => {
    const { limiter } = fixture({
      NODE_ENV: 'development',
      LOGIN_RATE_LIMIT_DISABLED: 'true',
    });
    for (let i = 0; i < 5; i++)
      await limiter.consume('demo@example.test', '127.0.0.1', scope);
    await expect(
      limiter.consume('demo@example.test', '127.0.0.1', scope),
    ).rejects.toMatchObject({ status: 429 });
  });
});
