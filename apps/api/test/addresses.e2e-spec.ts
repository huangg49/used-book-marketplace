import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
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

const contract = parse(
  readFileSync('../../packages/api-contract/openapi.yaml', 'utf8'),
);
const ajv = new Ajv2020({ strict: false });
addFormats.default(ajv);
ajv.addSchema({ $id: 'address-wire', components: contract.components });
function validates(name: string, body: unknown) {
  const f = ajv.compile({ $ref: `address-wire#/components/schemas/${name}` });
  expect(f(body), JSON.stringify(f.errors)).toBe(true);
}
type Adapter = Awaited<ReturnType<PrismaPg['connect']>>;
type Pool = ReturnType<Adapter['underlyingDriver']>;
type Reader = { id: string; sessionId: string; token: string };
const address = {
  recipientName: 'Bạn đọc kiểm thử',
  phone: '0900000000',
  serviceAreaCode: 'HCM-DEMO-v1',
  localityCode: 'DEMO-A',
  detail: 'Bàn demo riêng tư — không giao thật',
};
describe('private member address book HTTP/PostgreSQL', () => {
  const schema = `address_test_${randomUUID().replaceAll('-', '')}`;
  let app: INestApplication, db: PrismaClient, adapter: Adapter, pool: Pool;
  const get = (path: string, actor?: Reader) => {
    const c = request(app.getHttpServer()).get('/api/v1' + path);
    return actor ? c.set('Authorization', `Bearer ${actor.token}`) : c;
  };
  const command = (
    actor: Reader,
    body: object,
    path = '/me/addresses',
    method: 'post' | 'put' = 'post',
    key = randomUUID(),
  ) =>
    request(app.getHttpServer())
      [method]('/api/v1' + path)
      .set('Authorization', `Bearer ${actor.token}`)
      .set('Idempotency-Key', key)
      .send(body);
  async function reader(
    roles: RoleCode[] = ['MEMBER'],
    status: UserStatus = 'ACTIVE',
  ) {
    const id = randomUUID(),
      sessionId = randomUUID();
    await db.user.create({
      data: {
        id,
        emailNormalized: `${id}@address.test`,
        passwordHash: 'unused-no-login',
        displayName: 'Test reader',
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
  async function create(actor: Reader, version = 0, makeDefault = false) {
    const r = await command(actor, {
      expectedBookVersion: version,
      address,
      makeDefault,
    }).expect(200);
    validates('AddressBookReceipt', r.body);
    return r.body;
  }
  async function book(actor: Reader) {
    const r = await get('/me/addresses', actor).expect(200);
    validates('AddressBook', r.body);
    return r.body;
  }
  async function block(actor: Reader) {
    const c = await pool.connect();
    await c.query('BEGIN');
    await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [actor.id]);
    return {
      c,
      pid: (await c.query('SELECT pg_backend_pid() pid')).rows[0].pid,
    };
  }
  async function waiting(pid: number, n = 1) {
    const until = Date.now() + 4000;
    while (Date.now() < until) {
      const r = await pool.query(
        'SELECT count(*)::int n FROM pg_stat_activity a WHERE $1 = ANY(pg_blocking_pids(a.pid)) OR EXISTS (SELECT 1 FROM pg_stat_activity b WHERE $1 = ANY(pg_blocking_pids(b.pid)) AND b.pid = ANY(pg_blocking_pids(a.pid)))',
        [pid],
      );
      if (r.rows[0].n >= n) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Commands did not reach real lock barrier');
  }
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL!;
    if (!new URL(url).pathname.endsWith('_test'))
      throw new Error('Test DB only');
    adapter = await new PrismaPg({
      connectionString: url,
      max: 12,
      options: `-c search_path=${schema},public -c timezone=UTC`,
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
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue(db)
      .compile();
    app = module.createNestApplication();
    configureApp(app, { docs: false, logRequests: false });
    await app.init();
  }, 60000);
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    if (pool) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await adapter?.dispose();
  });
  it('exposes only labeled demo area codes to authenticated members', async () => {
    await get('/service-areas').expect(401);
    const a = await reader();
    const r = await get('/service-areas', a).expect(200);
    validates('ServiceAreaDirectory', r.body);
    expect(r.body.demoOnly).toBe(true);
    expect(r.body.localities.map((x: { code: string }) => x.code)).toEqual([
      'DEMO-A',
      'DEMO-B',
    ]);
    expect(r.headers['cache-control']).toBe('no-store');
  });
  it('creates, edits, switches default, deletes/promotes deterministically and empties book', async () => {
    const a = await reader();
    expect(await book(a)).toEqual({ version: 0, items: [] });
    const first = await create(a);
    const second = await create(a, 1);
    expect(
      (await book(a)).items.map((i: { isDefault: boolean }) => i.isDefault),
    ).toEqual([true, false]);
    await command(
      a,
      { expectedBookVersion: 2 },
      `/me/addresses/${second.addressId}/default`,
    ).expect(200);
    await command(
      a,
      {
        expectedBookVersion: 3,
        address: { ...address, detail: 'Địa chỉ đã sửa' },
        makeDefault: false,
      },
      `/me/addresses/${second.addressId}`,
      'put',
    ).expect(200);
    let b = await book(a);
    expect(b.items[1]).toMatchObject({
      isDefault: true,
      detail: 'Địa chỉ đã sửa',
    });
    await command(
      a,
      { expectedBookVersion: 4 },
      `/me/addresses/${second.addressId}/archive`,
    ).expect(200);
    b = await book(a);
    expect(b.items).toHaveLength(1);
    expect(b.items[0].isDefault).toBe(true);
    await command(
      a,
      { expectedBookVersion: 5 },
      `/me/addresses/${first.addressId}/archive`,
    ).expect(200);
    expect(await book(a)).toEqual({ version: 6, items: [] });
    await create(a, 6);
    expect((await book(a)).items[0].isDefault).toBe(true);
  });
  it('keeps recipient data out of receipts/audits and isolates owners, staff and guests', async () => {
    const a = await reader(),
      b = await reader(),
      staff = await reader(['STAFF']);
    const saved = await create(a);
    await get('/me/addresses').expect(401);
    await get('/me/addresses', staff).expect(403);
    expect((await book(b)).items).toEqual([]);
    for (const suffix of ['default', 'archive'])
      await command(
        b,
        { expectedBookVersion: 0 },
        `/me/addresses/${saved.addressId}/${suffix}`,
      ).expect(404);
    await command(
      b,
      { expectedBookVersion: 0, address, makeDefault: false },
      `/me/addresses/${saved.addressId}`,
      'put',
    ).expect(404);
    const records = JSON.stringify([
      saved,
      await db.mutationReceipt.findMany({ where: { addressBookId: a.id } }),
      await db.auditEvent.findMany({ where: { addressBookId: a.id } }),
    ]);
    for (const pii of [address.phone, address.recipientName, address.detail])
      expect(records).not.toContain(pii);
  });
  it('validates region, unknown fields, Unicode limits and phone; restricted may maintain addresses', async () => {
    const a = await reader(['MEMBER'], 'RESTRICTED');
    await create(a);
    for (const patch of [
      { phone: '+84900000000' },
      { serviceAreaCode: 'OUTSIDE' },
      { localityCode: 'OTHER' },
      { recipientName: '📚'.repeat(101) },
      { detail: '\u0000bad detail' },
    ])
      await command(a, {
        expectedBookVersion: 1,
        address: { ...address, ...patch },
        makeDefault: false,
      }).expect(422);
    await command(a, {
      expectedBookVersion: 1,
      address,
      makeDefault: false,
      ownerId: randomUUID(),
    }).expect(422);
    await command(a, {
      expectedBookVersion: 1,
      address: { ...address, recipientName: '  ' + '📚'.repeat(100) + '  ' },
      makeDefault: false,
    }).expect(200);
    expect((await book(a)).items[1].recipientName).toBe('📚'.repeat(100));
  });
  it('replays after delete without recreating private data; different key payload conflicts', async () => {
    const a = await reader(),
      key = randomUUID(),
      body = { expectedBookVersion: 0, address, makeDefault: false };
    const first = await command(a, body, undefined, undefined, key).expect(200);
    await command(
      a,
      { expectedBookVersion: 1 },
      `/me/addresses/${first.body.addressId}/archive`,
    ).expect(200);
    const replay = await command(a, body, undefined, undefined, key).expect(
      200,
    );
    expect(replay.body).toEqual(first.body);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect((await book(a)).items).toEqual([]);
    await command(
      a,
      { ...body, makeDefault: true },
      undefined,
      undefined,
      key,
    ).expect(409);
    await db.authSession.update({
      where: { id: a.sessionId },
      data: { revokedAt: new Date() },
    });
    await command(a, body, undefined, undefined, key).expect(401);
  });
  it('serializes two defaults at a real owner lock and rejects stale book version', async () => {
    const a = await reader();
    const x = await create(a),
      y = await create(a, 1);
    const gate = await block(a);
    let pending: Promise<request.Response>[] = [];
    try {
      pending = [x, y].map((v) =>
        command(
          a,
          { expectedBookVersion: 2 },
          `/me/addresses/${v.addressId}/default`,
        ).then((r) => r),
      );
      await waiting(gate.pid, 2);
      await gate.c.query('COMMIT');
      expect((await Promise.all(pending)).map((r) => r.status).sort()).toEqual([
        200, 409,
      ]);
      const b = await book(a);
      expect(b.version).toBe(3);
      expect(
        b.items.filter((i: { isDefault: boolean }) => i.isDefault),
      ).toHaveLength(1);
    } finally {
      await gate.c.query('ROLLBACK');
      gate.c.release();
      await Promise.allSettled(pending);
    }
  });
  it('allows one of two competing creates at slot ten, then enforces quota', async () => {
    const a = await reader();
    for (let i = 0; i < 9; i++) await create(a, i);
    const gate = await block(a);
    let pending: Promise<request.Response>[] = [];
    try {
      pending = [0, 1].map(() =>
        command(a, {
          expectedBookVersion: 9,
          address,
          makeDefault: false,
        }).then((r) => r),
      );
      await waiting(gate.pid, 2);
      await gate.c.query('COMMIT');
      expect((await Promise.all(pending)).map((r) => r.status).sort()).toEqual([
        200, 409,
      ]);
      expect((await book(a)).items).toHaveLength(10);
      await command(a, {
        expectedBookVersion: 10,
        address,
        makeDefault: false,
      }).expect(429);
    } finally {
      await gate.c.query('ROLLBACK');
      gate.c.release();
      await Promise.allSettled(pending);
    }
  });
  it('deduplicates concurrent same-key create at a lock barrier', async () => {
    const a = await reader(),
      key = randomUUID(),
      body = { expectedBookVersion: 0, address, makeDefault: false },
      gate = await block(a);
    let pending: Promise<request.Response>[] = [];
    try {
      pending = [0, 1].map(() =>
        command(a, body, undefined, undefined, key).then((r) => r),
      );
      await waiting(gate.pid, 2);
      await gate.c.query('COMMIT');
      const [x, y] = await Promise.all(pending);
      expect(x.status).toBe(200);
      expect(y.body).toEqual(x.body);
      expect((await book(a)).items).toHaveLength(1);
      expect(
        await db.auditEvent.count({ where: { addressBookId: a.id } }),
      ).toBe(1);
    } finally {
      await gate.c.query('ROLLBACK');
      gate.c.release();
      await Promise.allSettled(pending);
    }
  });
  it('serializes default deletion against selection without losing the sole default', async () => {
    const a = await reader(),
      first = await create(a),
      second = await create(a, 1),
      gate = await block(a);
    let pending: Promise<request.Response>[] = [];
    try {
      pending = [
        command(
          a,
          { expectedBookVersion: 2 },
          `/me/addresses/${first.addressId}/archive`,
        ).then((r) => r),
        command(
          a,
          { expectedBookVersion: 2 },
          `/me/addresses/${second.addressId}/default`,
        ).then((r) => r),
      ];
      await waiting(gate.pid, 2);
      await gate.c.query('COMMIT');
      expect((await Promise.all(pending)).map((r) => r.status).sort()).toEqual([
        200, 409,
      ]);
      const b = await book(a);
      expect(b.version).toBe(3);
      expect(
        b.items.filter((i: { isDefault: boolean }) => i.isDefault),
      ).toHaveLength(1);
      expect(b.items.find((i: { isDefault: boolean }) => i.isDefault).id).toBe(
        second.addressId,
      );
      expect(
        await db.mutationReceipt.count({ where: { addressBookId: a.id } }),
      ).toBe(3);
    } finally {
      await gate.c.query('ROLLBACK');
      gate.c.release();
      await Promise.allSettled(pending);
    }
  });
  it.each(['role', 'session', 'locked'] as const)(
    'rechecks %s after waiting for an owner lock',
    async (kind) => {
      const a = await reader(),
        gate = await block(a);
      const pending = command(a, {
        expectedBookVersion: 0,
        address,
        makeDefault: false,
      }).then((r) => r);
      try {
        await waiting(gate.pid);
        if (kind === 'role')
          await gate.c.query(
            "DELETE FROM user_roles WHERE user_id=$1 AND role='MEMBER'",
            [a.id],
          );
        else if (kind === 'session')
          await gate.c.query(
            'UPDATE auth_sessions SET revoked_at=now() WHERE id=$1',
            [a.sessionId],
          );
        else
          await gate.c.query("UPDATE users SET status='LOCKED' WHERE id=$1", [
            a.id,
          ]);
        await gate.c.query('COMMIT');
        expect((await pending).status).toBe(kind === 'session' ? 401 : 403);
        expect(await db.memberAddress.count({ where: { ownerId: a.id } })).toBe(
          0,
        );
      } finally {
        await gate.c.query('ROLLBACK');
        gate.c.release();
        await pending;
      }
    },
  );
  it('rolls back default switches and records when audit fails; same key can retry', async () => {
    const a = await reader();
    await create(a);
    const next = await create(a, 1);
    const key = randomUUID();
    await pool.query(
      "CREATE FUNCTION fail_address_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.address_book_id IS NOT NULL THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_address_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_address_audit()",
    );
    try {
      await command(
        a,
        { expectedBookVersion: 2 },
        `/me/addresses/${next.addressId}/default`,
        'post',
        key,
      ).expect(500);
      expect((await book(a)).version).toBe(2);
      expect((await book(a)).items[0].isDefault).toBe(true);
    } finally {
      await pool.query(
        'DROP TRIGGER fail_address_audit ON audit_events; DROP FUNCTION fail_address_audit()',
      );
    }
    await command(
      a,
      { expectedBookVersion: 2 },
      `/me/addresses/${next.addressId}/default`,
      'post',
      key,
    ).expect(200);
  });
  it('database rejects no default, duplicate default, foreign locality and raw quota overflow', async () => {
    const a = await reader();
    const saved = await create(a);
    await create(a, 1);
    await expect(
      db.memberAddress.updateMany({
        where: { ownerId: a.id },
        data: { isDefault: false },
      }),
    ).rejects.toThrow();
    await expect(
      db.memberAddress.updateMany({
        where: { ownerId: a.id },
        data: { isDefault: true },
      }),
    ).rejects.toThrow();
    await expect(
      db.memberAddress.update({
        where: { id: saved.addressId },
        data: { localityCode: 'OUTSIDE' },
      }),
    ).rejects.toThrow();
    for (let i = 2; i < 10; i++) await create(a, i);
    await expect(
      db.memberAddress.create({
        data: { ...address, ownerId: a.id, isDefault: false },
      }),
    ).rejects.toThrow();
    expect((await book(a)).items).toHaveLength(10);
  });
});
