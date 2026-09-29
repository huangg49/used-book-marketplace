import { MongoCommandService } from '../src/modules/commands/mongo-command.service.js';
import { WalletService } from '../src/modules/wallet/wallet.service.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import { hash } from 'argon2';
import request from 'supertest';
import type { components } from '@used-books/api-contract';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import type { RoleCode, UserStatus } from '../src/database/mongo/documents.js';
import { contract, validates } from './helpers/contract.js';
import { Gate } from './helpers/mongo-gate.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';

type Reader = { id: string; token: string; sessionId: string };
type Event = components['schemas']['SimulatedTopupEvent'];

describe('Existing obligations access: real MongoDB and HTTP', () => {
  let app: INestApplication,
    db: MongoFixtures,
    passwordHash: string,
    operator: Reader,
    otherOperator: Reader;
  const users: string[] = [];
  const originalSecret = process.env.PAYMENT_SIMULATOR_SECRET;
  const get = (path: string, actor?: Reader) => {
    const call = request(app.getHttpServer()).get('/api/v1' + path);
    return actor ? call.set('Authorization', `Bearer ${actor.token}`) : call;
  };
  const post = (
    path: string,
    body: object,
    actor: Reader,
    key = randomUUID(),
  ) =>
    request(app.getHttpServer())
      .post('/api/v1' + path)
      .set('Authorization', `Bearer ${actor.token}`)
      .set('Idempotency-Key', key)
      .send(body);
  const emit = (body: Event, actor = operator, key = randomUUID()) =>
    post('/operations/simulator/topup-events', body, actor, key);
  async function reader(
    roles: RoleCode[] = ['MEMBER'],
    status: UserStatus = 'ACTIVE',
    verified = true,
  ): Promise<Reader> {
    const email = `${randomUUID()}@wallet.test`;
    const user = await db.user({
      email,
      passwordHash,
      displayName: 'Bạn đọc mô phỏng',
      roles,
      status,
      verified,
    });
    // The login helper derives the email from the id, as the original did.
    await db.c.users.updateOne(
      { _id: user._id },
      { $set: { emailNormalized: `${user._id}@wallet.test` } },
    );
    users.push(user._id);
    const sessionId = await db.session(user._id);
    return {
      id: user._id,
      sessionId,
      token: await app
        .get(JwtService)
        .signAsync({ sub: user._id, sid: sessionId }),
    };
  }
  // Direct user writes bump lockSeq like every application writer of users.
  const setUser = (id: string, set: Record<string, unknown>) =>
    db.c.users.updateOne(
      { _id: id },
      { $set: { ...set, updatedAt: new Date() }, $inc: { lockSeq: 1 } },
    );
  async function makeApp() {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const a = module.createNestApplication();
    a.get(ConfigService).set(
      'PAYMENT_SIMULATOR_SECRET',
      process.env.PAYMENT_SIMULATOR_SECRET,
    );
    configureApp(a, { docs: false, logRequests: false });
    await a.init();
    return a;
  }
  async function intent(actor: Reader, amount = 200000) {
    const result = await post('/me/topups', { amount }, actor).expect(200);
    validates('WalletCommandReceipt', result.body);
    return result.body as components['schemas']['WalletCommandReceipt'];
  }
  async function event(actor: Reader, amount = 200000) {
    const created = await intent(actor, amount);
    return {
      eventId: randomUUID(),
      intentId: created.entityId,
      recipientId: actor.id,
      amount,
      currency: 'VND',
      outcome: 'Succeeded' as const,
      occurredAt: new Date().toISOString(),
    };
  }
  const available = async (actor: Reader) =>
    (await get('/me/wallet', actor).expect(200)).body.available;
  // Holds a write lock on the user document in a transaction, like
  // `SELECT ... FOR UPDATE` on the users row. Writes inside the gate use the
  // lock holder's session, like the former barrier connection's UPDATEs.
  const block = (id: string) => Gate.lockUser(db.client, id);
  const inGate = (
    gate: Gate,
    collection: 'users' | 'auth_sessions',
    id: string,
    update: Record<string, unknown>,
  ) =>
    gate.db
      .collection<{ _id: string }>(collection)
      .updateOne({ _id: id }, update, { session: gate.session });
  async function counts(id: string) {
    return {
      events: await db.c.simulated_payment_events.countDocuments({
        intentId: id,
      }),
      journals: await db.c.ledger_journals.countDocuments({ topupId: id }),
      receipts: await db.c.mutation_receipts.countDocuments({ topupId: id }),
      audits: await db.c.audit_events.countDocuments({ topupId: id }),
    };
  }
  beforeAll(async () => {
    process.env.PAYMENT_SIMULATOR_SECRET = randomBytes(32).toString('hex');
    passwordHash = await hash('Obligation-test-password-2026');
    db = await MongoFixtures.connect();
    app = await makeApp();
    operator = await reader(['TEST_OPERATOR']);
    otherOperator = await reader(['TEST_OPERATOR']);
  }, 60000);
  afterAll(async () => {
    // Removes only this suite's records. Deleting its journals and entries
    // returns the drained simulator funds to the shared source; the opening
    // capital journal is never touched.
    if (db) {
      const c = db.c;
      const topups = (
        await c.topup_intents.find({ ownerId: { $in: users } }).toArray()
      ).map((t) => t._id);
      const journals = (
        await c.ledger_journals.find({ topupId: { $in: topups } }).toArray()
      ).map((j) => j._id);
      const accounts = (
        await c.wallet_accounts.find({ ownerId: { $in: users } }).toArray()
      ).map((a) => a._id);
      const audits = (
        await c.audit_events.find({ topupId: { $in: topups } }).toArray()
      ).map((a) => a._id);
      await c.ledger_entries.deleteMany({ journalId: { $in: journals } });
      await c.ledger_journals.deleteMany({ _id: { $in: journals } });
      await c.simulated_payment_events.deleteMany({
        intentId: { $in: topups },
      });
      await c.outbox_events.deleteMany({ auditId: { $in: audits } });
      await c.audit_events.deleteMany({ _id: { $in: audits } });
      await c.mutation_receipts.deleteMany({ topupId: { $in: topups } });
      await c.topup_intents.deleteMany({ _id: { $in: topups } });
      await c.account_locks.deleteMany({ _id: { $in: accounts } });
      await c.wallet_accounts.deleteMany({ _id: { $in: accounts } });
      await c.login_attempts.deleteMany({});
      await db.removeUsers(users);
      await db.close();
    }
    await app?.close();
    if (originalSecret === undefined)
      delete process.env.PAYMENT_SIMULATOR_SECRET;
    else process.env.PAYMENT_SIMULATOR_SECRET = originalSecret;
  });

  const login = (actor: Reader) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: `${actor.id}@wallet.test`,
        password: 'Obligation-test-password-2026',
      });
  const refresh = (token: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: token });
  beforeEach(async () => {
    // The test-env guard permits only databases whose names end in _test.
    await db.c.login_attempts.deleteMany({});
  });
  it('login/restore reports LOCKED honestly, protects old data, rotates once and revokes on logout', async () => {
    const actor = await reader(['MEMBER'], 'LOCKED'),
      result = await login(actor).expect(200);
    validates('AuthTokens', result.body);
    expect(result.body.user.status).toBe('LOCKED');
    const signed = { ...actor, token: result.body.accessToken };
    expect((await get('/auth/me', signed).expect(200)).body.status).toBe(
      'LOCKED',
    );
    expect(
      (await get('/me/wallet', signed).expect(200)).body.topupEnabled,
    ).toBe(false);
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => refresh(result.body.refreshToken)),
    );
    expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 401)).toHaveLength(7);
    const winner = responses.find((r) => r.status === 200)!.body;
    expect(winner.user.status).toBe('LOCKED');
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: winner.refreshToken })
      .expect(204);
    await get('/me/wallet', { ...actor, token: winner.accessToken }).expect(
      401,
    );
    await refresh(winner.refreshToken).expect(401);
  });
  it('LOCKED wallet/topup reads are private while new intents and receipt replays are blocked', async () => {
    const actor = await reader(),
      key = randomUUID(),
      created = (
        await post('/me/topups', { amount: 1000 }, actor, key).expect(200)
      ).body;
    await emit({
      eventId: randomUUID(),
      intentId: created.entityId,
      recipientId: actor.id,
      amount: 1000,
      currency: 'VND',
      outcome: 'Succeeded',
      occurredAt: new Date().toISOString(),
    }).expect(200);
    await db.setStatus(actor.id, 'LOCKED');
    expect(await available(actor)).toBe(1000);
    validates(
      'TopupIntent',
      (await get('/me/topups/' + created.entityId, actor).expect(200)).body,
    );
    validates('TopupPage', (await get('/me/topups', actor).expect(200)).body);
    const history = (await get('/me/wallet/history', actor).expect(200)).body;
    validates('WalletHistoryPage', history);
    await post('/me/topups', { amount: 1000 }, actor, key).expect(403);
    await post('/me/topups', { amount: 1000 }, actor).expect(403);
    const foreign = await reader(['MEMBER'], 'LOCKED');
    await get('/me/topups/' + created.entityId, foreign).expect(404);
    await get(
      '/me/wallet/history?cursor=' + history.items[0].journalId,
      foreign,
    ).expect(404);
    expect(
      (await get('/me/topups', foreign).expect(200)).body.items,
    ).toHaveLength(0);
    expect((await counts(created.entityId)).journals).toBe(1);
  });
  it('LOCKED with all roles cannot access any non-allowlisted authenticated contract operation', async () => {
    const actor = await reader(
      ['MEMBER', 'ADMIN', 'STAFF', 'TEST_OPERATOR'],
      'LOCKED',
    );
    for (const [path, item] of Object.entries(contract.paths) as [
      string,
      Record<string, any>,
    ][])
      for (const [method, op] of Object.entries(item)) {
        if (
          !['get', 'post', 'put', 'patch', 'delete'].includes(method) ||
          !op.security?.length ||
          op['x-locked-access']
        )
          continue;
        const url = '/api/v1' + path.replace(/\{[^}]+\}/g, randomUUID());
        const call = request(app.getHttpServer())
          [method as 'get'](url)
          .set('Authorization', `Bearer ${actor.token}`)
          .set('Idempotency-Key', randomUUID());
        if (method !== 'get') call.send({});
        const result = await call;
        expect(result.status, `${method.toUpperCase()} ${path}`).toBe(403);
      }
  });
  it('role checks remain required for obligations; unverified/DISABLED cannot authenticate', async () => {
    const actor = await reader(['ADMIN'], 'LOCKED');
    await get('/auth/me', actor).expect(200);
    await get('/me/wallet', actor).expect(403);
    await get('/me/orders', actor).expect(403);
    for (const status of ['DISABLED', 'PENDING_VERIFICATION'] as const) {
      const denied = await reader(['MEMBER'], status);
      await login(denied).expect(401);
      await get('/auth/me', denied).expect(401);
      await get('/me/wallet', denied).expect(401);
    }
    await setUser(actor.id, { emailVerifiedAt: null });
    await login(actor).expect(401);
    await get('/auth/me', actor).expect(401);
  });
  it('service entrypoints cannot bypass the locked guard and forged JWT status/roles cannot grant access', async () => {
    const actor = await reader(['MEMBER'], 'LOCKED');
    const auth = {
      sessionId: actor.sessionId,
      user: (await get('/auth/me', actor).expect(200)).body,
    };
    await expect(
      app.get(MongoCommandService).read(auth, async () => true),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      app
        .get(WalletService)
        .create(
          { auth, key: randomUUID(), requestId: randomUUID() },
          { amount: 1000 },
        ),
    ).rejects.toMatchObject({ status: 403 });
    const token = await app.get(JwtService).signAsync({
      sub: actor.id,
      sid: actor.sessionId,
      status: 'ACTIVE',
      roles: ['ADMIN'],
      obligations: true,
    });
    await post('/me/topups', { amount: 1000 }, { ...actor, token }).expect(403);
    expect(
      (await get('/auth/me', { ...actor, token }).expect(200)).body.roles,
    ).toEqual(['MEMBER']);
    const bad = await app
      .get(JwtService)
      .signAsync({ sub: 'not-uuid', sid: actor.sessionId });
    await get('/auth/me', { ...actor, token: bad }).expect(401);
  });
  it.each(['LOCKED', 'DISABLED', 'unverified', 'password'] as const)(
    'login rechecks %s after password verification while waiting for user lock',
    async (change) => {
      const actor = await reader(),
        gate = await block(actor.id),
        call = login(actor).then((r) => r);
      try {
        await gate.contended();
        if (change === 'unverified')
          await inGate(gate, 'users', actor.id, {
            $set: { emailVerifiedAt: null },
          });
        else if (change === 'password')
          await inGate(gate, 'users', actor.id, {
            $set: { passwordHash: 'changed-test-password-hash' },
          });
        else
          await inGate(gate, 'users', actor.id, {
            $set: { status: change, updatedAt: new Date() },
          });
        await gate.commit();
      } finally {
        await gate.close();
      }
      const result = await call;
      expect(result.status).toBe(change === 'LOCKED' ? 200 : 401);
      if (change === 'LOCKED') expect(result.body.user.status).toBe('LOCKED');
      expect(
        await db.c.auth_sessions.countDocuments({ userId: actor.id }),
      ).toBe(change === 'LOCKED' ? 2 : 1);
    },
  );
  it.each(['LOCKED', 'DISABLED', 'role', 'revoke', 'expired'] as const)(
    'refresh rechecks %s after lock wait before issuing tokens',
    async (change) => {
      const actor = await reader(),
        signed = (await login(actor).expect(200)).body;
      const session = (await db.c.auth_sessions.findOne({
        userId: actor.id,
        _id: { $ne: actor.sessionId },
      }))!;
      const gate = await block(actor.id),
        call = refresh(signed.refreshToken).then((r) => r);
      try {
        await gate.contended();
        if (change === 'role')
          await inGate(gate, 'users', actor.id, { $set: { roles: [] } });
        else if (change === 'revoke')
          await inGate(gate, 'auth_sessions', session._id, {
            $set: { revokedAt: new Date() },
            $inc: { lockSeq: 1 },
          });
        else if (change === 'expired')
          await inGate(gate, 'auth_sessions', session._id, {
            $set: { expiresAt: new Date() },
            $inc: { lockSeq: 1 },
          });
        else
          await inGate(gate, 'users', actor.id, {
            $set: { status: change, updatedAt: new Date() },
          });
        await gate.commit();
      } finally {
        await gate.close();
      }
      const result = await call;
      expect(result.status).toBe(
        ['LOCKED', 'role'].includes(change) ? 200 : 401,
      );
      if (change === 'LOCKED') expect(result.body.user.status).toBe('LOCKED');
      if (change === 'role') expect(result.body.user.roles).toEqual([]);
    },
  );
  it.each(['LOCKED', 'DISABLED', 'revoke', 'role'] as const)(
    'wallet read rechecks %s when account changes after guard but before service',
    async (change) => {
      const actor = await reader(),
        gate = await block(actor.id),
        call = get('/me/wallet', actor).then((r) => r);
      try {
        await gate.contended();
        if (change === 'revoke')
          await inGate(gate, 'auth_sessions', actor.sessionId, {
            $set: { revokedAt: new Date() },
            $inc: { lockSeq: 1 },
          });
        else if (change === 'role')
          await inGate(gate, 'users', actor.id, { $set: { roles: [] } });
        else
          await inGate(gate, 'users', actor.id, {
            $set: { status: change, updatedAt: new Date() },
          });
        await gate.commit();
      } finally {
        await gate.close();
      }
      const result = await call;
      expect(result.status).toBe(
        change === 'LOCKED' ? 200 : change === 'role' ? 403 : 401,
      );
      if (change === 'LOCKED') expect(result.body.topupEnabled).toBe(false);
    },
  );
  it('a create that passed the guard still cannot mutate after account locking wins', async () => {
    const actor = await reader(),
      gate = await block(actor.id),
      call = post('/me/topups', { amount: 1000 }, actor).then((r) => r.status);
    try {
      await gate.contended();
      await inGate(gate, 'users', actor.id, {
        $set: { status: 'LOCKED', updatedAt: new Date() },
      });
      await gate.commit();
    } finally {
      await gate.close();
    }
    expect(await call).toBe(403);
    expect(await db.c.topup_intents.countDocuments({ ownerId: actor.id })).toBe(
      0,
    );
  });
  it('valid prior simulator results survive recipient lock but a LOCKED operator cannot emit or replay', async () => {
    const actor = await reader(),
      body = await event(actor),
      key = randomUUID();
    await emit(body, otherOperator, key).expect(200);
    await db.setStatus(otherOperator.id, 'LOCKED');
    await emit(body, otherOperator, key).expect(403);
    const late = await event(actor);
    await db.setStatus(actor.id, 'LOCKED');
    await emit(late).expect(200);
    expect(await available(actor)).toBe(400000);
  });
  it('unlock restores ordinary access without replacing the session; disabling removes all protected access', async () => {
    const actor = await reader(['MEMBER'], 'LOCKED');
    await post('/me/topups', { amount: 1000 }, actor).expect(403);
    await db.setStatus(actor.id, 'ACTIVE');
    await intent(actor, 1000);
    await get('/auth/me', actor).expect(200);
    await db.setStatus(actor.id, 'DISABLED');
    await get('/me/wallet', actor).expect(401);
    await get('/me/orders', actor).expect(401);
  });
});
