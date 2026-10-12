import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { verify } from 'argon2';
import request from 'supertest';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';
import { AuthMailService } from '../src/modules/auth/auth-mail.service.js';
import { MongoService } from '../src/database/mongo/mongo.service.js';

describe('registration, verification and password recovery', () => {
  let app: INestApplication;
  let db: MongoFixtures;
  let mail: AuthMailService;
  let email: string;
  const password = 'Integration-reader-password-42';
  const nextPassword = 'A-new-reader-password-123';
  const post = (path: string, body: object) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/' + path)
      .send(body);
  const register = () =>
    post('register', {
      email,
      password,
      displayName: 'Người đọc mới',
      acceptedRules: true,
    });
  const user = () => db.c.users.findOne({ emailNormalized: email });
  async function token(purpose: 'VerifyEmail' | 'ResetPassword') {
    const account = await user();
    const row = await db.c.auth_action_tokens.findOne({
      userId: account!._id,
      purpose,
      consumedAt: null,
    });
    const job = await db.c.auth_mail_jobs.findOne({ tokenId: row!._id });
    return { raw: mail.decrypt(job!.encryptedPayload).token!, row: row! };
  }
  async function activate() {
    await register().expect(202);
    const link = await token('VerifyEmail');
    await post('verify-email', { token: link.raw }).expect(204);
  }
  async function age(purpose: 'VerifyEmail' | 'ResetPassword') {
    await db.c.auth_action_tokens.updateMany(
      { userId: (await user())!._id, purpose },
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
    email = `account-${randomUUID()}@example.com`;
    await db.c.login_attempts.deleteMany({});
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    const account = await user();
    if (account) {
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

  it('normalizes email, hashes password, grants MEMBER only and blocks login until verification', async () => {
    const result = await post('register', {
      email: ` ${email.toUpperCase()} `,
      password,
      displayName: ' Người đọc ',
      acceptedRules: true,
    }).expect(202);
    expect(Object.keys(result.body)).toEqual(['message']);
    expect(result.headers['cache-control']).toBe('no-store');
    const account = (await user())!;
    expect(account.displayName).toBe('Người đọc');
    expect(account.status).toBe('PENDING_VERIFICATION');
    expect(account.emailVerifiedAt).toBeNull();
    expect(account.roles.map((r) => r.role)).toEqual(['MEMBER']);
    expect(await verify(account.passwordHash, password)).toBe(true);
    await post('login', { email, password }).expect(401);
    const link = await token('VerifyEmail');
    expect(link.row.tokenHash).toBe(
      createHash('sha256').update(link.raw).digest('hex'),
    );
    expect(link.row.expiresAt.getTime() - link.row.createdAt.getTime()).toBe(
      30 * 60_000,
    );
    const job = await db.c.auth_mail_jobs.findOne({ tokenId: link.row._id });
    expect(job!.encryptedPayload).not.toContain(link.raw);
    await post('verify-email', { token: link.raw }).expect(204);
    await post('login', { email, password }).expect(200);
    expect(await db.c.auth_events.countDocuments({ userId: account._id })).toBe(
      2,
    );
  });
  it.each([
    { password: 'short' },
    { password: 'a'.repeat(129) },
    { acceptedRules: false },
    { displayName: '   ' },
    { displayName: 'a'.repeat(81) },
    { email: 'wrong-email' },
    { roles: ['ADMIN'] },
    { status: 'ACTIVE' },
    { emailVerifiedAt: new Date().toISOString() },
  ])(
    'rejects invalid registration or injected privilege fields %#',
    async (override) => {
      await post('register', {
        email,
        password,
        displayName: 'Reader',
        acceptedRules: true,
        ...override,
      }).expect(400);
      expect(await user()).toBeNull();
    },
  );
  it('returns identical acknowledgements for duplicate registration and never overwrites credentials', async () => {
    const first = await register().expect(202);
    const duplicate = await post('register', {
      email,
      password: nextPassword,
      displayName: 'Overwrite',
      acceptedRules: true,
    }).expect(202);
    expect(duplicate.body).toEqual(first.body);
    const account = (await user())!;
    expect(account.displayName).toBe('Người đọc mới');
    expect(await verify(account.passwordHash, password)).toBe(true);
    expect(
      await db.c.auth_action_tokens.countDocuments({ userId: account._id }),
    ).toBe(1);
  });
  it('concurrent registration has one user, one verification link and one audit event', async () => {
    const results = await Promise.all([register(), register()]);
    expect(results.map((r) => r.status)).toEqual([202, 202]);
    const account = (await user())!;
    expect(await db.c.users.countDocuments({ emailNormalized: email })).toBe(1);
    expect(
      await db.c.auth_mail_jobs.countDocuments({ userId: account._id }),
    ).toBe(1);
    expect(await db.c.auth_events.countDocuments({ userId: account._id })).toBe(
      1,
    );
  });
  it('enforces resend cooldown, invalidates the old link and has one concurrent verification winner', async () => {
    await register().expect(202);
    const old = await token('VerifyEmail');
    await post('verification/resend', { email }).expect(202);
    expect(
      await db.c.auth_action_tokens.countDocuments({ userId: old.row.userId }),
    ).toBe(1);
    await age('VerifyEmail');
    await Promise.all([
      post('verification/resend', { email }),
      post('verification/resend', { email }),
    ]);
    expect(
      await db.c.auth_action_tokens.countDocuments({ userId: old.row.userId }),
    ).toBe(2);
    await post('verify-email', { token: old.raw }).expect(400);
    const current = await token('VerifyEmail');
    const results = await Promise.all([
      post('verify-email', { token: current.raw }),
      post('verify-email', { token: current.raw }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([204, 400]);
    await post('verify-email', { token: current.raw }).expect(400);
  });
  it('rejects an expired verification token without activating the user', async () => {
    await register().expect(202);
    const link = await token('VerifyEmail');
    await db.c.auth_action_tokens.updateOne(
      { _id: link.row._id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    await post('verify-email', { token: link.raw }).expect(400);
    expect((await user())!.status).toBe('PENDING_VERIFICATION');
  });
  it('acknowledges unknown, unverified, disabled and cooldown recovery requests identically', async () => {
    const unknown = await post('forgot-password', { email }).expect(202);
    await register().expect(202);
    const pending = await post('forgot-password', { email }).expect(202);
    expect(pending.body).toEqual(unknown.body);
    const link = await token('VerifyEmail');
    await post('verify-email', { token: link.raw }).expect(204);
    const active = await post('forgot-password', { email }).expect(202);
    const cooldown = await post('forgot-password', { email }).expect(202);
    expect(active.body).toEqual(unknown.body);
    expect(cooldown.body).toEqual(unknown.body);
    expect(
      await db.c.auth_action_tokens.countDocuments({
        userId: link.row.userId,
        purpose: 'ResetPassword',
      }),
    ).toBe(1);
    await db.c.users.updateOne(
      { _id: link.row.userId },
      { $set: { status: 'DISABLED' } },
    );
    await age('ResetPassword');
    const disabled = await post('forgot-password', { email }).expect(202);
    expect(disabled.body).toEqual(unknown.body);
    expect(
      await db.c.auth_action_tokens.countDocuments({
        userId: link.row.userId,
        purpose: 'ResetPassword',
      }),
    ).toBe(1);
  });
  it('resets once, revokes all old sessions/access tokens and accepts only the new password', async () => {
    await activate();
    const first = await post('login', { email, password }).expect(200);
    const second = await post('login', { email, password }).expect(200);
    await post('forgot-password', { email }).expect(202);
    const link = await token('ResetPassword');
    expect(link.row.expiresAt.getTime() - link.row.createdAt.getTime()).toBe(
      15 * 60_000,
    );
    await post('reset-password', {
      token: link.raw,
      password: nextPassword,
    }).expect(204);
    await post('reset-password', { token: link.raw, password }).expect(400);
    for (const session of [first, second]) {
      await post('refresh', { refreshToken: session.body.refreshToken }).expect(
        401,
      );
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .auth(session.body.accessToken, { type: 'bearer' })
        .expect(401);
    }
    await post('login', { email, password }).expect(401);
    await post('login', { email, password: nextPassword }).expect(200);
    expect((await user())!.status).toBe('ACTIVE');
    expect(
      await db.c.auth_mail_jobs.countDocuments({
        userId: link.row.userId,
        tokenId: null,
      }),
    ).toBe(1);
  });
  it('reset racing reset/refresh/old-password login cannot leave a surviving old session', async () => {
    await activate();
    const session = await post('login', { email, password }).expect(200);
    await post('forgot-password', { email }).expect(202);
    const link = await token('ResetPassword');
    const [a, b, refreshed, logged] = await Promise.all([
      post('reset-password', { token: link.raw, password: nextPassword }),
      post('reset-password', { token: link.raw, password: nextPassword }),
      post('refresh', { refreshToken: session.body.refreshToken }),
      post('login', { email, password }),
    ]);
    expect([a.status, b.status].sort()).toEqual([204, 400]);
    for (const result of [refreshed, logged])
      if (result.status === 200) {
        await request(app.getHttpServer())
          .get('/api/v1/auth/me')
          .auth(result.body.accessToken, { type: 'bearer' })
          .expect(401);
      }
    expect(
      await db.c.auth_sessions.countDocuments({
        userId: link.row.userId,
        revokedAt: null,
      }),
    ).toBe(0);
  });
  it('uses the database clock for reset expiry even when the API clock is ahead', async () => {
    await activate();
    await post('forgot-password', { email }).expect(202);
    const link = await token('ResetPassword');
    const ahead = Date.now() + 3600_000;
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(ahead);
      await post('reset-password', {
        token: link.raw,
        password: nextPassword,
      }).expect(204);
    } finally {
      vi.useRealTimers();
    }
    expect(await verify((await user())!.passwordHash, nextPassword)).toBe(true);
  });
  it('keeps LOCKED status on reset; rejects disabled accounts, wrong purpose and expired links', async () => {
    await activate();
    await post('forgot-password', { email }).expect(202);
    const link = await token('ResetPassword');
    await post('verify-email', { token: link.raw }).expect(400);
    await db.c.users.updateOne(
      { _id: link.row.userId },
      { $set: { status: 'DISABLED' } },
    );
    await post('reset-password', {
      token: link.raw,
      password: nextPassword,
    }).expect(400);
    await db.c.users.updateOne(
      { _id: link.row.userId },
      { $set: { status: 'LOCKED' } },
    );
    await post('reset-password', {
      token: link.raw,
      password: nextPassword,
    }).expect(204);
    expect((await user())!.status).toBe('LOCKED');
    await age('ResetPassword');
    await post('forgot-password', { email }).expect(202);
    const expired = await token('ResetPassword');
    await db.c.auth_action_tokens.updateOne(
      { _id: expired.row._id },
      { $set: { expiresAt: new Date(0) } },
    );
    await post('reset-password', { token: expired.raw, password }).expect(400);
  });
  it('rolls back user/token/audit/password/session changes when durable mail enqueue fails', async () => {
    const fail = vi
      .spyOn(mail, 'enqueue')
      .mockRejectedValue(new Error('Synthetic queue failure'));
    await register().expect(500);
    expect(await user()).toBeNull();
    fail.mockRestore();
    await activate();
    const session = await post('login', { email, password }).expect(200);
    await post('forgot-password', { email }).expect(202);
    const link = await token('ResetPassword');
    vi.spyOn(mail, 'enqueue').mockRejectedValue(
      new Error('Synthetic queue failure'),
    );
    await post('reset-password', {
      token: link.raw,
      password: nextPassword,
    }).expect(500);
    expect(await verify((await user())!.passwordHash, password)).toBe(true);
    expect(
      (await db.c.auth_action_tokens.findOne({ _id: link.row._id }))!
        .consumedAt,
    ).toBeNull();
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(session.body.accessToken, { type: 'bearer' })
      .expect(200);
  });
  it('retries failed mail delivery, uses a lease and erases encrypted content after delivery', async () => {
    await register().expect(202);
    const link = await token('VerifyEmail');
    const deliver = vi
      .spyOn(mail, 'deliver')
      .mockRejectedValueOnce(new Error('Synthetic provider failure'))
      .mockResolvedValue();
    await mail.drain();
    const failed = (await db.c.auth_mail_jobs.findOne({
      tokenId: link.row._id,
    }))!;
    expect(failed.status).toBe('Pending');
    expect(failed.attempts).toBe(1);
    expect(failed.encryptedPayload).not.toBe('');
    await db.c.auth_mail_jobs.updateOne(
      { _id: failed._id },
      { $set: { nextAttemptAt: new Date(0) } },
    );
    await Promise.all([mail.drain(), mail.drain()]);
    const sent = (await db.c.auth_mail_jobs.findOne({ _id: failed._id }))!;
    expect(sent.status).toBe('Sent');
    expect(sent.encryptedPayload).toBe('');
    expect(deliver).toHaveBeenCalledTimes(2);
  });
  it('closes the final mail attempt after a crashed worker lease expires', async () => {
    await register().expect(202);
    const link = await token('VerifyEmail');
    await db.c.auth_mail_jobs.updateOne(
      { tokenId: link.row._id },
      {
        $set: {
          status: 'Sending',
          attempts: 8,
          leaseId: randomUUID(),
          leaseUntil: new Date(0),
        },
      },
    );
    const deliver = vi.spyOn(mail, 'deliver').mockResolvedValue();
    await mail.drain();
    const closed = (await db.c.auth_mail_jobs.findOne({
      tokenId: link.row._id,
    }))!;
    expect(closed.status).toBe('Failed');
    expect(closed.encryptedPayload).toBe('');
    expect(closed.leaseId).toBeNull();
    expect(deliver).not.toHaveBeenCalled();
  });
  it('cancels superseded delivery and rate limits account requests independently of login', async () => {
    await register().expect(202);
    const old = await token('VerifyEmail');
    await age('VerifyEmail');
    await post('verification/resend', { email }).expect(202);
    vi.spyOn(mail, 'deliver').mockResolvedValue();
    await mail.drain();
    expect(
      (await db.c.auth_mail_jobs.findOne({ tokenId: old.row._id }))!.status,
    ).toBe('Cancelled');
    for (let i = 0; i < 5; i++)
      await post('forgot-password', { email }).expect(202);
    await post('forgot-password', { email }).expect(429);
    const current = await db.c.users.findOne({ emailNormalized: email });
    await db.c.users.updateOne(
      { _id: current!._id },
      { $set: { status: 'ACTIVE', emailVerifiedAt: new Date() } },
    );
    await post('login', { email, password }).expect(200);
  });
  it('stores auth audit append-only under the application role', async () => {
    await register().expect(202);
    const mongo = app.get(MongoService);
    const event = await db.c.auth_events.findOne({
      userId: (await user())!._id,
    });
    await expect(
      mongo.c.auth_events.updateOne(
        { _id: event!._id },
        { $set: { action: 'PasswordReset' } },
      ),
    ).rejects.toMatchObject({ code: 13 });
  });
});
