import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'argon2';
import request from 'supertest';
import sharp from 'sharp';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { MediaStorage } from '../src/modules/media/media-storage.js';
import { AuthMailService } from '../src/modules/auth/auth-mail.service.js';
import { ProfileAvatarWorker } from '../src/modules/profile/profile-avatar-worker.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';
import { Gate } from './helpers/mongo-gate.js';

class StorageFake {
  objects = new Map<string, Buffer>();
  failRemove = false;
  afterPut: (() => Promise<void>) | null = null;
  async check() {}
  async put(key: string, bytes: Buffer) {
    this.objects.set(key, Buffer.from(bytes));
    await this.afterPut?.();
  }
  async signedRead(key: string) {
    return {
      url: `https://storage.test/${key}`,
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    };
  }
  async remove(keys: string[]) {
    if (this.failRemove) throw new Error('QA delete unavailable');
    keys.forEach((k) => this.objects.delete(k));
  }
}
describe('Member profile HTTP/Mongo/Sharp; explicit storage and delivery fakes', () => {
  let app: INestApplication,
    db: MongoFixtures,
    mail: AuthMailService,
    passwordHash: string;
  let actor: { id: string; sid: string; token: string }, other: typeof actor;
  const storage = new StorageFake(),
    password = 'QA-member-profile-42';
  const body = {
    expectedVersion: 1,
    displayName: 'Người đọc cập nhật',
    contactPhone: '+84 900 000 001',
    avatarId: null,
  };
  async function reader() {
    const user = await db.user({ passwordHash }),
      sid = await db.session(user._id);
    return {
      id: user._id,
      sid,
      token: await app.get(JwtService).signAsync({ sub: user._id, sid }),
    };
  }
  const get = (path = '', who = actor) =>
    request(app.getHttpServer())
      .get('/api/v1/me/profile' + path)
      .auth(who.token, { type: 'bearer' });
  const post = (path: string, value: object, who = actor, key = randomUUID()) =>
    request(app.getHttpServer())
      .post('/api/v1/me/profile' + path)
      .auth(who.token, { type: 'bearer' })
      .set('Idempotency-Key', key)
      .send(value);
  async function avatar(who = actor) {
    const bytes = await sharp({
      create: { width: 300, height: 400, channels: 3, background: '#315c62' },
    })
      .png()
      .toBuffer();
    const created = await post(
      '/avatar-uploads',
      {
        mimeType: 'image/png',
        byteSize: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
      who,
    ).expect(200);
    return { id: created.body.entityId as string, bytes };
  }
  const upload = (id: string, bytes: Buffer, who = actor, key = randomUUID()) =>
    request(app.getHttpServer())
      .put(`/api/v1/me/profile/avatar-uploads/${id}/content`)
      .auth(who.token, { type: 'bearer' })
      .set('Idempotency-Key', key)
      .set('Content-Type', 'image/png')
      .send(bytes);
  async function emailChange(
    email = `profile-target-${randomUUID()}@example.test`,
    who = actor,
  ) {
    const current = (await get('', who).expect(200)).body;
    const result = await post(
      '/email-changes',
      { expectedVersion: current.version, email, password },
      who,
    ).expect(200);
    const job = await db.c.auth_mail_jobs.findOne({
      userId: who.id,
      tokenId: result.body.entityId,
    });
    return {
      id: result.body.entityId as string,
      code: job ? mail.decrypt(job.encryptedPayload).code! : null,
      email,
    };
  }
  beforeAll(async () => {
    passwordHash = await hash(password);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MediaStorage)
      .useValue(storage)
      .compile();
    app = module.createNestApplication();
    configureApp(app, { logRequests: false });
    await app.init();
    db = await MongoFixtures.connect();
    mail = app.get(AuthMailService);
  });
  beforeEach(async () => {
    await db.c.login_attempts.deleteMany({});
    storage.afterPut = null;
    storage.failRemove = false;
    actor = await reader();
    other = await reader();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await db?.close();
    await app?.close();
  });

  it('rejects anonymous, overposting and invalid contact fields; owner has legacy defaults', async () => {
    await request(app.getHttpServer()).get('/api/v1/me/profile').expect(401);
    const view = (await get().expect(200)).body;
    expect(view).toMatchObject({
      id: actor.id,
      version: 1,
      avatarId: null,
      contactPhone: null,
      pendingEmailChange: null,
    });
    for (const extra of [
      { roles: ['ADMIN'] },
      { status: 'ACTIVE' },
      { id: other.id },
      { reputation: 5 },
    ])
      await post('', { ...body, ...extra }).expect(422);
    await post('', { ...body, displayName: ' ' }).expect(422);
    await post('', { ...body, contactPhone: 'not-a-phone' }).expect(422);
    await post('', { ...body, contactPhone: '--------' }).expect(422);
  });
  it('updates only owner, rejects stale/body-conflict, and recovers lost ACK exactly once without contact data in audit/receipt', async () => {
    const key = randomUUID(),
      beforeOther = await db.c.users.findOne({ _id: other.id });
    const accepted = await post('', body, actor, key).expect(200);
    const replay = await post('', body, actor, key).expect(200);
    expect(replay.body).toEqual(accepted.body);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    await post('', { ...body, displayName: 'Tên khác' }, actor, key).expect(
      409,
    );
    await post('', body).expect(409);
    expect((await get().expect(200)).body).toMatchObject({
      version: 2,
      displayName: body.displayName,
      contactPhone: body.contactPhone,
    });
    expect(await db.c.users.findOne({ _id: other.id })).toEqual(beforeOther);
    const audits = await db.c.audit_events
      .find({ accountId: actor.id, action: 'updateMemberProfile' })
      .toArray();
    expect(audits).toHaveLength(1);
    const evidence = JSON.stringify([audits, accepted.body]);
    expect(evidence).not.toContain(body.displayName);
    expect(evidence).not.toContain(body.contactPhone);
  });
  it('serializes genuinely contended profile updates and rechecks session before replay', async () => {
    const gate = await Gate.lockUser(db.client, actor.id);
    const a = post('', body).then((r) => r),
      b = post('', { ...body, displayName: 'Tên cạnh tranh' }).then((r) => r);
    try {
      await gate.contended(2);
    } finally {
      await gate.close();
    }
    expect((await Promise.all([a, b])).map((r) => r.status).sort()).toEqual([
      200, 409,
    ]);
    const key = randomUUID(),
      current = (await get().expect(200)).body;
    await post(
      '',
      { ...body, expectedVersion: current.version },
      actor,
      key,
    ).expect(200);
    await db.c.auth_sessions.updateOne(
      { _id: actor.sid },
      { $set: { revokedAt: new Date() } },
    );
    await post(
      '',
      { ...body, expectedVersion: current.version },
      actor,
      key,
    ).expect(401);
  });
  it.each(['RESTRICTED', 'LOCKED'] as const)(
    'permits own profile maintenance for %s without granting other users access',
    async (status) => {
      await db.setStatus(actor.id, status);
      await get().expect(200);
      await post('', body).expect(200);
      await db.removeRole(actor.id, 'MEMBER');
      await get().expect(403);
    },
  );
  it('uploads real decoded/EXIF-free avatar, owner-only reads, attaches once and retires safely with durable cleanup retries', async () => {
    const image = await avatar(),
      key = randomUUID();
    await upload(image.id, image.bytes, other).expect(404);
    await upload(image.id, Buffer.from('invalid')).expect(422);
    await upload(image.id, image.bytes, actor, key).expect(200);
    const replay = await upload(image.id, image.bytes, actor, key).expect(200);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    const asset = (await db.c.profile_avatars.findOne({ _id: image.id }))!;
    const metadata = await sharp(
      storage.objects.get(asset.storageKey)!,
    ).metadata();
    expect(metadata.width).toBe(256);
    expect(metadata.height).toBe(256);
    expect(metadata.exif).toBeUndefined();
    await get(`/avatar-uploads/${image.id}/read`, other).expect(404);
    await post('', { ...body, avatarId: image.id }, other).expect(404);
    await post('', { ...body, avatarId: image.id }).expect(200);
    await post(`/avatar-uploads/${image.id}/discard`, {
      expectedVersion: 2,
    }).expect(409);
    await post('', { ...body, expectedVersion: 2 }).expect(200);
    await db.c.profile_avatars.updateOne(
      { _id: image.id },
      { $set: { gcAt: new Date(Date.now() - 700_000) } },
    );
    storage.failRemove = true;
    await expect(app.get(ProfileAvatarWorker).cleanup()).rejects.toThrow();
    expect((await db.c.profile_avatars.findOne({ _id: image.id }))?.state).toBe(
      'Deleting',
    );
    storage.failRemove = false;
    await app.get(ProfileAvatarWorker).cleanup();
    expect(await db.c.profile_avatars.findOne({ _id: image.id })).toBeNull();
    expect(storage.objects.has(asset.storageKey)).toBe(false);
  });
  it('rejects attachment before upload and revoked authority after storage I/O', async () => {
    const image = await avatar();
    await post('', { ...body, avatarId: image.id }).expect(409);
    storage.afterPut = () =>
      db.c.auth_sessions
        .updateOne({ _id: actor.sid }, { $set: { revokedAt: new Date() } })
        .then(() => {});
    await upload(image.id, image.bytes).expect(401);
    expect(
      (await db.c.users.findOne({ _id: actor.id }))?.avatarId,
    ).toBeUndefined();
    expect((await db.c.profile_avatars.findOne({ _id: image.id }))?.state).toBe(
      'Pending',
    );
  });
  it('supports discarding failed uploads and never garbage collects an attached avatar', async () => {
    const image = await avatar();
    await post(`/avatar-uploads/${image.id}/discard`, {
      expectedVersion: 1,
    }).expect(200);
    await upload(image.id, image.bytes).expect(409);
    const good = await avatar();
    await upload(good.id, good.bytes).expect(200);
    await post('', { ...body, avatarId: good.id }).expect(200);
    await db.c.profile_avatars.updateOne(
      { _id: good.id },
      { $set: { gcAt: new Date(0) } },
    );
    await app.get(ProfileAvatarWorker).cleanup();
    expect(await db.c.profile_avatars.findOne({ _id: good.id })).not.toBeNull();
  });
  it('requires the current password, hides duplicate-email availability, sends OTP through the durable mail worker', async () => {
    await post('/email-changes', {
      expectedVersion: 1,
      email: 'new@example.test',
      password: 'wrong-password-42',
    }).expect(403);
    const change = await emailChange();
    expect(change.code).toMatch(/^\d{6}$/);
    const deliver = vi.spyOn(mail, 'deliver').mockResolvedValue();
    await mail.drain();
    expect(deliver).toHaveBeenCalled();
    const existingAccount = (await db.c.users.findOne({ _id: actor.id }))!;
    await db.c.login_attempts.deleteMany({});
    const unavailable = await emailChange(
      existingAccount.emailNormalized,
      other,
    );
    expect(unavailable.code).toBeNull();
    expect((await get().expect(200)).body.email).not.toBe(change.email);
  });
  it('preserves opaque password whitespace and requires fresh current credentials before request replay', async () => {
    const opaque = '  QA-password-with-space  ';
    await db.c.users.updateOne(
      { _id: actor.id },
      { $set: { passwordHash: await hash(opaque) } },
    );
    const key = randomUUID(),
      input = {
        expectedVersion: 1,
        email: `opaque-${randomUUID()}@example.test`,
        password: opaque,
      };
    const accepted = await post('/email-changes', input, actor, key).expect(
      200,
    );
    const replacement = 'Current-password-after-reset-42';
    await db.c.users.updateOne(
      { _id: actor.id },
      { $set: { passwordHash: await hash(replacement) } },
    );
    await post('/email-changes', input, actor, key).expect(403);
    expect(
      (
        await post(
          '/email-changes',
          { ...input, password: replacement },
          actor,
          key,
        ).expect(200)
      ).body,
    ).toEqual(accepted.body);
    expect((await get().expect(200)).body.pendingEmailChange).toBeNull();
  });
  it('rolls back email, session revocation and receipt on durable notification failure; same intent can then recover', async () => {
    const before = (await db.c.users.findOne({ _id: actor.id }))!,
      secondSession = await db.session(actor.id),
      change = await emailChange();
    const key = randomUUID(),
      input = { changeId: change.id, code: change.code };
    const enqueue = vi
      .spyOn(mail, 'enqueue')
      .mockRejectedValueOnce(new Error('QA notification failure'));
    await post('/email-changes/confirm', input, actor, key).expect(500);
    enqueue.mockRestore();
    expect((await db.c.users.findOne({ _id: actor.id }))?.emailNormalized).toBe(
      before.emailNormalized,
    );
    expect(
      (await db.c.auth_sessions.findOne({ _id: secondSession }))?.revokedAt,
    ).toBeNull();
    expect(
      (await db.c.member_email_changes.findOne({ _id: change.id }))?.state,
    ).toBe('Pending');
    expect(
      await db.c.mutation_receipts.countDocuments({
        principal: `user:${actor.id}`,
        operation: 'confirmMemberEmailChange',
        key,
      }),
    ).toBe(0);
    await post('/email-changes/confirm', input, actor, key).expect(200);
  });
  it('rejects a forged image with correct declared hash and enforces owner upload quota with explicit discard recovery', async () => {
    const bytes = Buffer.from('not-a-real-png'),
      input = {
        mimeType: 'image/png',
        byteSize: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    const first = (await post('/avatar-uploads', input).expect(200)).body
      .entityId;
    await upload(first, bytes).expect(422);
    await post('/avatar-uploads', input).expect(200);
    await post('/avatar-uploads', input).expect(200);
    const rejected = await post('/avatar-uploads', input).expect(429);
    expect(rejected.body.code).toBe('AvatarQuotaExceeded');
    await post(`/avatar-uploads/${first}/discard`, {
      expectedVersion: 1,
    }).expect(200);
    await post('/avatar-uploads', input).expect(200);
  });
  it('rechecks current session after signing a private avatar read', async () => {
    const image = await avatar();
    await upload(image.id, image.bytes).expect(200);
    vi.spyOn(storage, 'signedRead').mockImplementationOnce(
      async (storageKey) => {
        await db.c.auth_sessions.updateOne(
          { _id: actor.sid },
          { $set: { revokedAt: new Date() } },
        );
        return {
          url: `https://storage.test/${storageKey}`,
          expiresAt: new Date(Date.now() + 120_000).toISOString(),
        };
      },
    );
    await get(`/avatar-uploads/${image.id}/read`).expect(401);
  });
  it('binds OTP to owner, persists five failures, expires and enforces resend cooldown', async () => {
    const change = await emailChange();
    await post(
      '/email-changes/confirm',
      { changeId: change.id, code: change.code },
      other,
    ).expect(404);
    await post('/email-changes', {
      expectedVersion: 2,
      email: 'another@example.test',
      password,
    }).expect(429);
    const wrong = change.code === '000000' ? '000001' : '000000';
    for (let n = 0; n < 5; n++)
      await post('/email-changes/confirm', {
        changeId: change.id,
        code: wrong,
      }).expect(400);
    expect(
      (await db.c.member_email_changes.findOne({ _id: change.id }))?.attempts,
    ).toBe(5);
    await post('/email-changes/confirm', {
      changeId: change.id,
      code: change.code,
    }).expect(400);
    await db.c.member_email_changes.updateOne(
      { _id: change.id },
      { $set: { state: 'Pending', attempts: 0, expiresAt: new Date(0) } },
    );
    await post('/email-changes/confirm', {
      changeId: change.id,
      code: change.code,
    }).expect(400);
  });
  it('changes email only after OTP, preserves current identity/session, notifies old email and replays without new effects', async () => {
    const old = (await db.c.users.findOne({ _id: actor.id }))!,
      secondSession = await db.session(actor.id);
    const change = await emailChange();
    const key = randomUUID(),
      confirm = { changeId: change.id, code: change.code };
    const result = await post(
      '/email-changes/confirm',
      confirm,
      actor,
      key,
    ).expect(200);
    expect(
      (await post('/email-changes/confirm', confirm, actor, key).expect(200))
        .body,
    ).toEqual(result.body);
    expect((await db.c.users.findOne({ _id: actor.id }))?.emailNormalized).toBe(
      change.email,
    );
    expect(
      (await db.c.auth_sessions.findOne({ _id: actor.sid }))?.revokedAt,
    ).toBeNull();
    expect(
      (await db.c.auth_sessions.findOne({ _id: secondSession }))?.revokedAt,
    ).toBeInstanceOf(Date);
    expect(
      await db.c.auth_mail_jobs.countDocuments({
        userId: actor.id,
        tokenId: null,
        status: 'Pending',
      }),
    ).toBe(1);
    const raw = JSON.stringify(
      await db.c.audit_events.find({ accountId: actor.id }).toArray(),
    );
    expect(raw).not.toContain(old.emailNormalized);
    expect(raw).not.toContain(change.email);
    expect(raw).not.toContain(change.code);
  });
  it('rejects a pending email proof after password reset and resolves a genuine unique-email race without a 500', async () => {
    const target = `shared-target-${randomUUID()}@example.test`,
      first = await emailChange(target),
      second = await emailChange(target, other);
    const gate = await Gate.lock(db.client, 'users', [actor.id, other.id]);
    const pending = post('/email-changes/confirm', {
      changeId: first.id,
      code: first.code,
    }).then((r) => r);
    const competing = post(
      '/email-changes/confirm',
      { changeId: second.id, code: second.code },
      other,
    ).then((r) => r);
    try {
      await gate.contended(2);
    } finally {
      await gate.close();
    }
    const outcomes = await Promise.all([pending, competing]);
    expect(outcomes.map((r) => r.status).sort()).toEqual([200, 409]);
    const losingChange = outcomes[0].status === 409 ? first : second;
    const losingActor = outcomes[0].status === 409 ? actor : other;
    await db.c.member_email_changes.updateOne(
      { _id: losingChange.id },
      { $set: { emailNormalized: `another-${randomUUID()}@example.test` } },
    );
    await db.c.users.updateOne(
      { _id: losingActor.id },
      { $set: { passwordHash: await hash('New-QA-password-42') } },
    );
    await post(
      '/email-changes/confirm',
      { changeId: losingChange.id, code: losingChange.code },
      losingActor,
    ).expect(400);
  });
});
