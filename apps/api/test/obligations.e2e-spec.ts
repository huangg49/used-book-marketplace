import { hash } from 'argon2';
import { CommandService } from '../src/modules/commands/command.service.js';
import { WalletService } from '../src/modules/wallet/wallet.service.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  type RoleCode,
  type UserStatus,
} from '../src/generated/prisma/client.js';
import { DatabaseService } from '../src/database/database.service.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

import request from 'supertest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';
import type { components } from '@used-books/api-contract';

const contract = parse(
  readFileSync(
    createRequire(import.meta.url).resolve(
      '@used-books/api-contract/openapi.yaml',
    ),
    'utf8',
  ),
);
const ajv = new Ajv2020({ strict: false });
addFormats.default(ajv);
ajv.addSchema({ $id: 'api-wire', components: contract.components });
function validates(name: string, body: unknown) {
  const fn = ajv.compile({ $ref: `api-wire#/components/schemas/${name}` });
  expect(fn(body), JSON.stringify(fn.errors)).toBe(true);
}
type Adapter = Awaited<ReturnType<PrismaPg['connect']>>;
type Pool = ReturnType<Adapter['underlyingDriver']>;
type Reader = { id: string; token: string; sessionId: string };
type Event = components['schemas']['SimulatedTopupEvent'];

describe('Existing obligations access: real PostgreSQL and HTTP', () => {
  const schema = `obligation_http_test_${randomUUID().replaceAll('-', '')}`;
  let app: INestApplication,
    db: PrismaClient,
    adapter: Adapter,
    pool: Pool,
    operator: Reader,
    otherOperator: Reader;
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
  ): Promise<Reader> {
    const id = randomUUID(),
      sessionId = randomUUID();
    await db.user.create({
      data: {
        id,
        emailNormalized: `${id}@wallet.test`,
        passwordHash: await hash('Obligation-test-password-2026'),
        displayName: 'Bạn đọc mô phỏng',
        status,
        emailVerifiedAt: new Date(),
        roles: { create: roles.map((role) => ({ role })) },
        sessions: {
          create: {
            id: sessionId,
            refreshTokenHash: randomBytes(32).toString('hex'),
            expiresAt: new Date(Date.now() + 86400000),
          },
        },
      },
    });
    return {
      id,
      sessionId,
      token: await app.get(JwtService).signAsync({ sub: id, sid: sessionId }),
    };
  }
  async function makeApp() {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue(db)
      .compile();
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
  async function block(table: string, id: string) {
    const connection = await pool.connect();
    await connection.query('BEGIN');
    await connection.query(`SELECT id FROM ${table} WHERE id=$1 FOR UPDATE`, [
      id,
    ]);
    const pid = (await connection.query('SELECT pg_backend_pid() pid')).rows[0]
      .pid as number;
    return { connection, pid };
  }
  async function reached(gate: Awaited<ReturnType<typeof block>>) {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      await gate.connection.query('SELECT pg_stat_clear_snapshot()');
      const n = (
        await gate.connection.query(
          'SELECT count(*)::int n FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',
          [gate.pid],
        )
      ).rows[0].n;
      if (n) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('Request never reached DB barrier');
  }
  async function counts(id: string) {
    return {
      events: await db.simulatedPaymentEvent.count({ where: { intentId: id } }),
      journals: await db.ledgerJournal.count({ where: { topupId: id } }),
      receipts: await db.mutationReceipt.count({ where: { topupId: id } }),
      audits: await db.auditEvent.count({ where: { topupId: id } }),
    };
  }
  beforeAll(async () => {
    process.env.PAYMENT_SIMULATOR_SECRET = randomBytes(32).toString('hex');
    const url = process.env.TEST_DATABASE_URL!;
    if (!decodeURIComponent(new URL(url).pathname).endsWith('_test'))
      throw new Error('Only _test databases');
    adapter = await new PrismaPg({
      connectionString: url,
      max: 16,
      options: `-c search_path=${schema},public -c timezone=UTC`,
      statement_timeout: 15000,
    }).connect();
    pool = adapter.underlyingDriver();
    await pool.query(`CREATE SCHEMA "${schema}"`);
    for (const name of readdirSync('prisma/migrations')
      .filter((n) => /^\d/.test(n))
      .sort())
      await pool.query(
        readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8'),
      );
    db = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
    await db.$connect();
    app = await makeApp();
    operator = await reader(['TEST_OPERATOR']);
    otherOperator = await reader(['TEST_OPERATOR']);
  }, 60000);
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    if (pool && /^obligation_http_test_[a-f0-9]{32}$/.test(schema))
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await adapter?.dispose();
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
    await db.loginAttempt.deleteMany();
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
    await db.user.update({
      where: { id: actor.id },
      data: { status: 'LOCKED' },
    });
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
    await db.user.update({
      where: { id: actor.id },
      data: { emailVerifiedAt: null },
    });
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
      app.get(CommandService).read(auth, async () => true),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      app
        .get(WalletService)
        .create(
          { auth, key: randomUUID(), requestId: randomUUID() },
          { amount: 1000 },
        ),
    ).rejects.toMatchObject({ status: 403 });
    const token = await app
      .get(JwtService)
      .signAsync({
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
        gate = await block('users', actor.id),
        call = login(actor).then((r) => r);
      try {
        await reached(gate);
        if (change === 'unverified')
          await gate.connection.query(
            'UPDATE users SET email_verified_at=NULL WHERE id=$1',
            [actor.id],
          );
        else if (change === 'password')
          await gate.connection.query(
            'UPDATE users SET password_hash=$1 WHERE id=$2',
            ['changed-test-password-hash', actor.id],
          );
        else
          await gate.connection.query(
            'UPDATE users SET status=$1 WHERE id=$2',
            [change, actor.id],
          );
      } finally {
        await gate.connection.query('COMMIT');
        gate.connection.release();
      }
      const result = await call;
      expect(result.status).toBe(change === 'LOCKED' ? 200 : 401);
      if (change === 'LOCKED') expect(result.body.user.status).toBe('LOCKED');
      expect(await db.authSession.count({ where: { userId: actor.id } })).toBe(
        change === 'LOCKED' ? 2 : 1,
      );
    },
  );
  it.each(['LOCKED', 'DISABLED', 'role', 'revoke', 'expired'] as const)(
    'refresh rechecks %s after lock wait before issuing tokens',
    async (change) => {
      const actor = await reader(),
        signed = (await login(actor).expect(200)).body;
      const session = await db.authSession.findFirstOrThrow({
        where: { userId: actor.id, id: { not: actor.sessionId } },
      });
      const gate = await block('users', actor.id),
        call = refresh(signed.refreshToken).then((r) => r);
      try {
        await reached(gate);
        if (change === 'role')
          await gate.connection.query(
            'DELETE FROM user_roles WHERE user_id=$1',
            [actor.id],
          );
        else if (change === 'revoke')
          await gate.connection.query(
            'UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1',
            [session.id],
          );
        else if (change === 'expired')
          await gate.connection.query(
            'UPDATE auth_sessions SET expires_at=clock_timestamp() WHERE id=$1',
            [session.id],
          );
        else
          await gate.connection.query(
            'UPDATE users SET status=$1 WHERE id=$2',
            [change, actor.id],
          );
      } finally {
        await gate.connection.query('COMMIT');
        gate.connection.release();
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
        gate = await block('users', actor.id),
        call = get('/me/wallet', actor).then((r) => r);
      try {
        await reached(gate);
        if (change === 'revoke')
          await gate.connection.query(
            'UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1',
            [actor.sessionId],
          );
        else if (change === 'role')
          await gate.connection.query(
            'DELETE FROM user_roles WHERE user_id=$1',
            [actor.id],
          );
        else
          await gate.connection.query(
            'UPDATE users SET status=$1 WHERE id=$2',
            [change, actor.id],
          );
      } finally {
        await gate.connection.query('COMMIT');
        gate.connection.release();
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
      gate = await block('users', actor.id),
      call = post('/me/topups', { amount: 1000 }, actor).then((r) => r.status);
    try {
      await reached(gate);
      await gate.connection.query(
        "UPDATE users SET status='LOCKED' WHERE id=$1",
        [actor.id],
      );
    } finally {
      await gate.connection.query('COMMIT');
      gate.connection.release();
    }
    expect(await call).toBe(403);
    expect(await db.topupIntent.count({ where: { ownerId: actor.id } })).toBe(
      0,
    );
  });
  it('valid prior simulator results survive recipient lock but a LOCKED operator cannot emit or replay', async () => {
    const actor = await reader(),
      body = await event(actor),
      key = randomUUID();
    await emit(body, otherOperator, key).expect(200);
    await db.user.update({
      where: { id: otherOperator.id },
      data: { status: 'LOCKED' },
    });
    await emit(body, otherOperator, key).expect(403);
    const late = await event(actor);
    await db.user.update({
      where: { id: actor.id },
      data: { status: 'LOCKED' },
    });
    await emit(late).expect(200);
    expect(await available(actor)).toBe(400000);
  });
  it('unlock restores ordinary access without replacing the session; disabling removes all protected access', async () => {
    const actor = await reader(['MEMBER'], 'LOCKED');
    await post('/me/topups', { amount: 1000 }, actor).expect(403);
    await db.user.update({
      where: { id: actor.id },
      data: { status: 'ACTIVE' },
    });
    await intent(actor, 1000);
    await get('/auth/me', actor).expect(200);
    await db.user.update({
      where: { id: actor.id },
      data: { status: 'DISABLED' },
    });
    await get('/me/wallet', actor).expect(401);
    await get('/me/orders', actor).expect(401);
  });
});
