import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import type { RoleCode, UserStatus } from '../src/database/mongo/documents.js';
import { MongoService } from '../src/database/mongo/mongo.service.js';
import { checkAddressBook } from '../src/modules/addresses/addresses.service.js';
import { validates } from './helpers/contract.js';
import { Gate } from './helpers/mongo-gate.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';

type Reader = { id: string; sessionId: string; token: string };
const address = {
  recipientName: 'Bạn đọc kiểm thử',
  phone: '0900000000',
  serviceAreaCode: 'HCM-DEMO-v1',
  localityCode: 'DEMO-A',
  detail: 'Bàn demo riêng tư — không giao thật',
};
describe('private member address book HTTP/MongoDB', () => {
  let app: INestApplication, db: MongoFixtures;
  const users: string[] = [];
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
  ): Promise<Reader> {
    const user = await db.user({ roles, status });
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
  // Holds the owner lock in a transaction, like `SELECT ... FOR UPDATE`.
  const block = (actor: Reader) => Gate.lockUser(db.client, actor.id);
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app, { docs: false, logRequests: false });
    await app.init();
    db = await MongoFixtures.connect();
  }, 60000);
  afterAll(async () => {
    await db.c.mutation_receipts.deleteMany({ addressBookId: { $in: users } });
    await db.c.audit_events.deleteMany({ addressBookId: { $in: users } });
    await db.c.member_addresses.deleteMany({ ownerId: { $in: users } });
    await db.c.address_identities.deleteMany({ ownerId: { $in: users } });
    await db.c.address_books.deleteMany({ _id: { $in: users } });
    await db.removeUsers(users);
    await db.close();
    await app?.close();
  });
  it('exposes only labeled demo area codes to authenticated members', async () => {
    await get('/service-areas').expect(401);
    const a = await reader();
    const r = await get('/service-areas', a).expect(200);
    validates('ServiceAreaDirectory', r.body);
    expect(r.body.demoOnly).toBe(true);
    expect(r.body.localities).toEqual([
      { code: 'DEMO-A', label: 'TP.HCM' },
      { code: 'DEMO-B', label: 'Bình Dương' },
      { code: 'DEMO-C', label: 'Vũng Tàu' },
    ]);
    expect(r.headers['cache-control']).toBe('no-store');
  });
  it.each(['DEMO-A', 'DEMO-B', 'DEMO-C'])(
    'saves and replays an address in circulation region %s',
    async (localityCode) => {
      const actor = await reader();
      const key = randomUUID();
      const body = {
        expectedBookVersion: 0,
        makeDefault: true,
        address: { ...address, localityCode },
      };
      const first = await command(
        actor,
        body,
        '/me/addresses',
        'post',
        key,
      ).expect(200);
      const replay = await command(
        actor,
        body,
        '/me/addresses',
        'post',
        key,
      ).expect(200);
      expect(replay.body).toEqual(first.body);
      expect(replay.headers['idempotency-replayed']).toBe('true');
      const saved = await book(actor);
      expect(saved.version).toBe(1);
      expect(saved.items).toHaveLength(1);
      expect(saved.items[0]).toMatchObject({
        id: first.body.addressId,
        localityCode,
        serviceAreaCode: 'HCM-DEMO-v1',
      });
    },
  );
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
      version: 2,
    });
    // Saving identical content does not advance the address content version.
    await command(
      a,
      {
        expectedBookVersion: 4,
        address: { ...address, detail: 'Địa chỉ đã sửa' },
        makeDefault: false,
      },
      `/me/addresses/${second.addressId}`,
      'put',
    ).expect(200);
    expect((await book(a)).items[1].version).toBe(2);
    await command(
      a,
      { expectedBookVersion: 5 },
      `/me/addresses/${second.addressId}/archive`,
    ).expect(200);
    b = await book(a);
    expect(b.items).toHaveLength(1);
    expect(b.items[0].isDefault).toBe(true);
    await command(
      a,
      { expectedBookVersion: 6 },
      `/me/addresses/${first.addressId}/archive`,
    ).expect(200);
    expect(await book(a)).toEqual({ version: 7, items: [] });
    // Deleted contacts keep only their identity (id/owner) for frozen history.
    expect(
      await db.c.address_identities.countDocuments({ ownerId: a.id }),
    ).toBe(2);
    await create(a, 7);
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
    // An upper-case path id is the same address (UUIDs are case-insensitive).
    await command(
      a,
      { expectedBookVersion: 1 },
      `/me/addresses/${saved.addressId.toUpperCase()}/default`,
    ).expect(200);
    const records = JSON.stringify([
      saved,
      await db.c.mutation_receipts.find({ addressBookId: a.id }).toArray(),
      await db.c.audit_events.find({ addressBookId: a.id }).toArray(),
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
    await db.c.auth_sessions.updateOne(
      { _id: a.sessionId },
      { $set: { revokedAt: new Date() }, $inc: { lockSeq: 1 } },
    );
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
      await gate.contended(2);
      await gate.commit();
      expect((await Promise.all(pending)).map((r) => r.status).sort()).toEqual([
        200, 409,
      ]);
      const b = await book(a);
      expect(b.version).toBe(3);
      expect(
        b.items.filter((i: { isDefault: boolean }) => i.isDefault),
      ).toHaveLength(1);
    } finally {
      await gate.close();
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
      await gate.contended(2);
      await gate.commit();
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
      await gate.close();
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
      await gate.contended(2);
      await gate.commit();
      const [x, y] = await Promise.all(pending);
      expect(x.status).toBe(200);
      expect(y.body).toEqual(x.body);
      expect((await book(a)).items).toHaveLength(1);
      expect(
        await db.c.audit_events.countDocuments({ addressBookId: a.id }),
      ).toBe(1);
    } finally {
      await gate.close();
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
      await gate.contended(2);
      await gate.commit();
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
        await db.c.mutation_receipts.countDocuments({ addressBookId: a.id }),
      ).toBe(3);
    } finally {
      await gate.close();
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
        await gate.contended();
        const inGate = { session: gate.session };
        const usersCollection = gate.db.collection<{ _id: string }>('users');
        if (kind === 'role')
          await usersCollection.updateOne(
            { _id: a.id },
            { $pull: { roles: { role: 'MEMBER' } } } as never,
            inGate,
          );
        else if (kind === 'session')
          await gate.db
            .collection<{ _id: string }>('auth_sessions')
            .updateOne(
              { _id: a.sessionId },
              { $set: { revokedAt: new Date() } },
              inGate,
            );
        else
          await usersCollection.updateOne(
            { _id: a.id },
            { $set: { status: 'LOCKED' } },
            inGate,
          );
        await gate.commit();
        expect((await pending).status).toBe(kind === 'session' ? 401 : 403);
        expect(
          await db.c.member_addresses.countDocuments({ ownerId: a.id }),
        ).toBe(0);
      } finally {
        await gate.close();
        await pending;
      }
    },
  );
  it('rolls back default switches and records when audit fails; same key can retry', async () => {
    const a = await reader();
    await create(a);
    const next = await create(a, 1);
    const key = randomUUID();
    // Temporary validator rule (like the former failing SQL trigger).
    await db.withRejectingValidator(
      'audit_events',
      { addressBookId: a.id },
      async () => {
        await command(
          a,
          { expectedBookVersion: 2 },
          `/me/addresses/${next.addressId}/default`,
          'post',
          key,
        ).expect(500);
        expect((await book(a)).version).toBe(2);
        expect((await book(a)).items[0].isDefault).toBe(true);
      },
    );
    await command(
      a,
      { expectedBookVersion: 2 },
      `/me/addresses/${next.addressId}/default`,
      'post',
      key,
    ).expect(200);
  });
  it('database rejects a duplicate default; other cross-document rules are commit-time checks', async () => {
    const a = await reader();
    const saved = await create(a);
    await create(a, 1);
    // DB backstops: partial unique index and validator, as in PostgreSQL.
    await expect(
      db.c.member_addresses.updateMany(
        { ownerId: a.id },
        { $set: { isDefault: true } },
      ),
    ).rejects.toMatchObject({ code: 11000 });
    await expect(
      db.c.member_addresses.updateOne(
        { _id: saved.addressId },
        { $set: { phone: '+84900000000' } },
      ),
    ).rejects.toMatchObject({ code: 121 });
    // PostgreSQL also rejected "no default", a foreign locality and quota
    // overflow inside the database. MongoDB cannot: a raw privileged write
    // succeeds, the commit-time check detects it, and the next command on the
    // book fails instead of compounding the damage (MIG02_MODEL_MAP).
    const mongo = app.get(MongoService);
    await db.c.member_addresses.updateMany(
      { ownerId: a.id },
      { $set: { isDefault: false } },
    );
    await expect(mongo.tx((tx) => checkAddressBook(tx, a.id))).rejects.toThrow(
      'Address quota or default invariant',
    );
    await command(a, {
      expectedBookVersion: 2,
      address,
      makeDefault: false,
    }).expect(500);
    await db.c.member_addresses.updateOne(
      { _id: saved.addressId },
      { $set: { isDefault: true, localityCode: 'OUTSIDE' } },
    );
    await expect(mongo.tx((tx) => checkAddressBook(tx, a.id))).rejects.toThrow(
      'Address locality or identity invariant',
    );
    await db.c.member_addresses.updateOne(
      { _id: saved.addressId },
      { $set: { localityCode: 'DEMO-A' } },
    );
    for (let i = 2; i < 10; i++) await create(a, i);
    expect((await book(a)).items).toHaveLength(10);
  });
});
