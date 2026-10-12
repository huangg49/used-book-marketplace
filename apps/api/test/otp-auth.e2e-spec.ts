import { createHash, createHmac, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { verify } from 'argon2';
import request from 'supertest';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { AuthMailService } from '../src/modules/auth/auth-mail.service.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';

describe('purpose-bound email OTP', () => {
  let app: INestApplication,
    db: MongoFixtures,
    mail: AuthMailService,
    email: string;
  let challenges: string[];
  const password = 'Otp-reader-integration-password-42';
  const replacement = 'Replacement-reader-password-42';
  const post = (path: string, body: object) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/' + path)
      .send(body);
  const user = () => db.c.users.findOne({ emailNormalized: email });
  const register = (override = {}) =>
    post('otp/register', {
      email,
      password,
      displayName: 'Người đọc',
      acceptedRules: true,
      ...override,
    });
  async function issue(purpose: 'VerifyEmail' | 'ResetPassword') {
    const response = await post('otp/request', { email, purpose }).expect(202);
    challenges.push(response.body.challengeId);
    return response.body.challengeId as string;
  }
  async function code(id: string) {
    const row = await db.c.auth_otp_challenges.findOne({ _id: id });
    const jobs = await db.c.auth_mail_jobs
      .find({ userId: row!.userId! })
      .toArray();
    const job = jobs.find(
      (job) =>
        job.encryptedPayload &&
        mail.decrypt(job.encryptedPayload).challengeId === id,
    )!;
    return { row: row!, raw: mail.decrypt(job.encryptedPayload).code!, job };
  }
  async function pending() {
    const response = await register().expect(202);
    challenges.push(response.body.challengeId);
    return response.body.challengeId as string;
  }
  async function activate() {
    const id = await pending();
    const otp = await code(id);
    await post('otp/verify-email', { challengeId: id, code: otp.raw }).expect(
      204,
    );
  }
  async function age() {
    await db.c.auth_otp_challenges.updateMany(
      { userId: (await user())!._id },
      { $set: { createdAt: new Date(Date.now() - 61_000) } },
    );
    await db.c.auth_action_tokens.updateMany(
      { userId: (await user())!._id },
      { $set: { createdAt: new Date(Date.now() - 61_000) } },
    );
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app, { logRequests: false });
    await app.init();
    db = await MongoFixtures.connect();
    mail = app.get(AuthMailService);
  });
  beforeEach(async () => {
    email = `otp-${randomUUID()}@example.test`;
    challenges = [];
    await db.c.login_attempts.deleteMany({});
  });
  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    const account = await user();
    await db.c.auth_otp_challenges.deleteMany({ _id: { $in: challenges } });
    if (account) {
      await db.c.auth_otp_challenges.deleteMany({ userId: account._id });
      await db.c.auth_action_tokens.deleteMany({ userId: account._id });
      await db.c.auth_mail_jobs.deleteMany({ userId: account._id });
      await db.c.auth_events.deleteMany({ userId: account._id });
      await db.removeUsers([account._id]);
    }
  });
  afterAll(async () => {
    await db?.close();
    await app?.close();
  });

  it('normalizes registration, stores keyed codes, verifies once and creates no session', async () => {
    const response = await register({
      email: ` ${email.toUpperCase()} `,
    }).expect(202);
    const id = response.body.challengeId;
    challenges.push(id);
    expect(response.body).toMatchObject({ expiresIn: 300, resendAfter: 60 });
    expect(response.headers['cache-control']).toBe('no-store');
    const otp = await code(id),
      account = (await user())!;
    expect(otp.raw).toMatch(/^\d{6}$/);
    expect(otp.row.codeHash).not.toBe(
      createHash('sha256').update(otp.raw).digest('hex'),
    );
    expect(otp.job.encryptedPayload).not.toContain(otp.raw);
    expect(otp.row.expiresAt.getTime() - otp.row.createdAt.getTime()).toBe(
      300_000,
    );
    expect(account.roles.map((role) => role.role)).toEqual(['MEMBER']);
    await post('login', { email, password }).expect(401);
    await post('otp/verify-email', { challengeId: id, code: otp.raw }).expect(
      204,
    );
    await post('otp/verify-email', { challengeId: id, code: otp.raw }).expect(
      400,
    );
    expect((await user())!.status).toBe('ACTIVE');
    expect(
      await db.c.auth_sessions.countDocuments({ userId: account._id }),
    ).toBe(0);
  });
  it.each([
    { roles: ['ADMIN'] },
    { acceptedRules: false },
    { password: 'short' },
    { email: 'bad' },
  ])(
    'rejects privilege injection and invalid registration %#',
    async (override) => {
      await register(override).expect(400);
      expect(await user()).toBeNull();
    },
  );
  it('acknowledges duplicates and decoys uniformly without exposing or replacing the real challenge', async () => {
    const id = await pending(),
      real = await code(id);
    const duplicate = await register({
      password: replacement,
      displayName: 'Overwrite',
    }).expect(202);
    challenges.push(duplicate.body.challengeId);
    const cooldownId = await issue('VerifyEmail');
    const unknown = await post('otp/request', {
      email: `unknown-${randomUUID()}@example.test`,
      purpose: 'VerifyEmail',
    }).expect(202);
    challenges.push(unknown.body.challengeId);
    for (const decoy of [
      duplicate.body.challengeId,
      cooldownId,
      unknown.body.challengeId,
    ]) {
      expect(decoy).not.toBe(id);
      expect(
        (await db.c.auth_otp_challenges.findOne({ _id: decoy }))!.userId,
      ).toBeNull();
      await post('otp/verify-email', {
        challengeId: decoy,
        code: real.raw,
      }).expect(400);
    }
    expect(await verify((await user())!.passwordHash, password)).toBe(true);
    expect(
      await db.c.auth_mail_jobs.countDocuments({ userId: (await user())!._id }),
    ).toBe(1);
    await post('otp/verify-email', { challengeId: id, code: real.raw }).expect(
      204,
    );
  });
  it('commits five parallel wrong guesses and locks only that challenge', async () => {
    const id = await pending(),
      otp = await code(id);
    const wrong = otp.raw === '000000' ? '111111' : '000000';
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        post('otp/verify-email', { challengeId: id, code: wrong }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([400, 400, 400, 400, 400]);
    expect(
      results.filter((r) => r.body.code === 'OTP_ATTEMPTS_EXCEEDED'),
    ).toHaveLength(1);
    expect(
      (await db.c.auth_otp_challenges.findOne({ _id: id }))!.attempts,
    ).toBe(5);
    await db.c.login_attempts.deleteMany({});
    await post('otp/verify-email', { challengeId: id, code: otp.raw }).expect(
      400,
    );
    expect((await user())!.status).toBe('PENDING_VERIFICATION');
  });
  it('allows exactly one concurrent successful verification and preserves leading zeros', async () => {
    const id = await pending(),
      otp = await code(id);
    const keyed = createHmac(
      'sha256',
      app.get(ConfigService).getOrThrow<string>('AUTH_MAIL_ENCRYPTION_KEY'),
    )
      .update('latlai:auth-otp:v1:')
      .update(`${id}:VerifyEmail:012345`)
      .digest('hex');
    await db.c.auth_otp_challenges.updateOne(
      { _id: id },
      { $set: { codeHash: keyed } },
    );
    const results = await Promise.all([
      post('otp/verify-email', { challengeId: id, code: '012345' }),
      post('otp/verify-email', { challengeId: id, code: '012345' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([204, 400]);
    expect(
      await db.c.auth_events.countDocuments({
        userId: otp.row.userId!,
        action: 'EmailVerified',
      }),
    ).toBe(1);
  });
  it('replaces old OTP/legacy links after cooldown and cancels stale queued mail', async () => {
    const id = await pending(),
      old = await code(id);
    await age();
    const next = await issue('VerifyEmail'),
      current = await code(next);
    await post('otp/verify-email', { challengeId: id, code: old.raw }).expect(
      400,
    );
    const deliver = vi.spyOn(mail, 'deliver').mockResolvedValue();
    await mail.drain();
    expect(
      (await db.c.auth_mail_jobs.findOne({ _id: old.job._id }))!.status,
    ).toBe('Cancelled');
    expect(
      deliver.mock.calls.some(([, payload]) => payload.challengeId === next),
    ).toBe(true);
    await post('otp/verify-email', {
      challengeId: next,
      code: current.raw,
    }).expect(204);
  });
  it('legacy issuance invalidates OTP and OTP issuance invalidates legacy links', async () => {
    const id = await pending(),
      otp = await code(id);
    await age();
    await post('verification/resend', { email }).expect(202);
    await post('otp/verify-email', { challengeId: id, code: otp.raw }).expect(
      400,
    );
    const token = await db.c.auth_action_tokens.findOne({
      userId: (await user())!._id,
      consumedAt: null,
    });
    const job = await db.c.auth_mail_jobs.findOne({ tokenId: token!._id });
    const raw = mail.decrypt(job!.encryptedPayload).token!;
    await age();
    await issue('VerifyEmail');
    await post('verify-email', { token: raw }).expect(400);
  });
  it('denies expired and wrong-purpose codes without activating the account', async () => {
    const id = await pending(),
      otp = await code(id);
    await post('otp/reset-password', {
      challengeId: id,
      code: otp.raw,
      password: replacement,
    }).expect(400);
    await db.c.auth_otp_challenges.updateOne(
      { _id: id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    await post('otp/verify-email', { challengeId: id, code: otp.raw }).expect(
      400,
    );
    expect((await user())!.status).toBe('PENDING_VERIFICATION');
  });
  it('resets atomically while racing reset, refresh and old-password login; no old session survives', async () => {
    await activate();
    await db.c.login_attempts.deleteMany({});
    const login = await post('login', { email, password }).expect(200);
    const id = await issue('ResetPassword'),
      otp = await code(id);
    const [a, b, refreshed, logged] = await Promise.all([
      post('otp/reset-password', {
        challengeId: id,
        code: otp.raw,
        password: replacement,
      }),
      post('otp/reset-password', {
        challengeId: id,
        code: otp.raw,
        password: replacement,
      }),
      post('refresh', { refreshToken: login.body.refreshToken }),
      post('login', { email, password }),
    ]);
    expect([a.status, b.status].sort()).toEqual([204, 400]);
    for (const result of [login, refreshed, logged])
      if (result.status === 200) {
        await request(app.getHttpServer())
          .get('/api/v1/auth/me')
          .auth(result.body.accessToken, { type: 'bearer' })
          .expect(401);
        await post('refresh', {
          refreshToken: result.body.refreshToken,
        }).expect(401);
      }
    expect(
      await db.c.auth_sessions.countDocuments({
        userId: otp.row.userId!,
        revokedAt: null,
      }),
    ).toBe(0);
    expect(
      await db.c.auth_events.countDocuments({
        userId: otp.row.userId!,
        action: 'PasswordReset',
      }),
    ).toBe(1);
    expect(await verify((await user())!.passwordHash, replacement)).toBe(true);
    await post('login', { email, password: replacement }).expect(200);
  });
  it('uses DB time despite API clock skew and keeps LOCKED status', async () => {
    await activate();
    const id = await issue('ResetPassword'),
      otp = await code(id);
    await db.c.users.updateOne(
      { _id: otp.row.userId! },
      { $set: { status: 'LOCKED' } },
    );
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 3600_000);
    await post('otp/reset-password', {
      challengeId: id,
      code: otp.raw,
      password: replacement,
    }).expect(204);
    expect((await user())!.status).toBe('LOCKED');
  });
  it('blocks reset if the account becomes disabled after issuing the code', async () => {
    await activate();
    const id = await issue('ResetPassword'),
      otp = await code(id);
    await db.c.users.updateOne(
      { _id: otp.row.userId! },
      { $set: { status: 'DISABLED' } },
    );
    await post('otp/reset-password', {
      challengeId: id,
      code: otp.raw,
      password: replacement,
    }).expect(400);
    expect(await verify((await user())!.passwordHash, password)).toBe(true);
  });
  it('rolls back registration and reset if the durable mail queue fails', async () => {
    const before = await db.c.auth_otp_challenges.countDocuments();
    const failure = vi
      .spyOn(mail, 'enqueue')
      .mockRejectedValue(new Error('Synthetic OTP queue failure'));
    await register().expect(500);
    expect(await user()).toBeNull();
    expect(await db.c.auth_otp_challenges.countDocuments()).toBe(before);
    failure.mockRestore();
    await activate();
    await db.c.login_attempts.deleteMany({});
    const login = await post('login', { email, password }).expect(200);
    const id = await issue('ResetPassword'),
      otp = await code(id);
    vi.spyOn(mail, 'enqueue').mockRejectedValue(
      new Error('Synthetic OTP queue failure'),
    );
    await post('otp/reset-password', {
      challengeId: id,
      code: otp.raw,
      password: replacement,
    }).expect(500);
    expect(
      (await db.c.auth_otp_challenges.findOne({ _id: id }))!.consumedAt,
    ).toBeNull();
    expect(await verify((await user())!.passwordHash, password)).toBe(true);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(login.body.accessToken, { type: 'bearer' })
      .expect(200);
    expect(
      await db.c.auth_events.countDocuments({
        userId: otp.row.userId!,
        action: 'PasswordReset',
      }),
    ).toBe(0);
  });
  it.each([
    { code: 123456 },
    { code: '12345' },
    { code: 'abcdef' },
    { challengeId: 'not-a-uuid' },
  ])('rejects malformed OTP inputs %#', async (override) => {
    await post('otp/verify-email', {
      challengeId: randomUUID(),
      code: '012345',
      ...override,
    }).expect(400);
  });
});
