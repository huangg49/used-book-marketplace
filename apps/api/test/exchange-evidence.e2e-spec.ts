import { DomainError } from '../src/modules/commands/domain-error.js';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import sharp from 'sharp';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { EvidenceStorage, digest } from '../src/modules/media/media-storage.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';
import type { RoleCode } from '../src/database/mongo/documents.js';
import { validates } from './helpers/contract.js';
const objects = new Map<string, Buffer>();
let failStorage = false;
let duringPut: (() => Promise<void>) | undefined;
const storage = {
  async check() {
    if (failStorage)
      throw new DomainError(503, 'UNAVAILABLE', 'QA storage offline');
  },
  async put(key: string, bytes: Buffer) {
    const old = objects.get(key);
    if (old && digest(old) !== digest(bytes)) throw Error('immutable');
    objects.set(key, bytes);
    await duringPut?.();
  },
  async attachment(key: string) {
    if (!objects.has(key)) throw Error('missing');
    return {
      url: 'https://storage.test/private/' + key,
      expiresAt: new Date(Date.now() + 120000).toISOString(),
    };
  },
};
type Reader = { id: string; token: string; sid: string };
describe('private exchange dispute evidence (real HTTP/Mongo; fake storage)', () => {
  let app: INestApplication,
    db: MongoFixtures,
    a: Reader,
    b: Reader,
    other: Reader,
    reviewer: Reader,
    admin: Reader,
    png: Buffer,
    id: string;
  const post = (path: string, body: object, r: Reader, key = randomUUID()) =>
    request(app.getHttpServer())
      .post('/api/v1' + path)
      .set('Authorization', 'Bearer ' + r.token)
      .set('Idempotency-Key', key)
      .send(body);
  const get = (path: string, r: Reader) =>
    request(app.getHttpServer())
      .get('/api/v1' + path)
      .set('Authorization', 'Bearer ' + r.token);
  const put = (eid: string, bytes: Buffer, r = a, key = randomUUID()) =>
    request(app.getHttpServer())
      .put(`/api/v1/exchanges/${id}/evidence/${eid}/content`)
      .set('Authorization', 'Bearer ' + r.token)
      .set('Idempotency-Key', key)
      .set('Content-Type', 'application/octet-stream')
      .send(bytes);
  const create = (bytes = png, r = a, key = randomUUID(), changes = {}) =>
    post(
      `/exchanges/${id}/evidence`,
      {
        expectedVersion: 3,
        fileName: 'book.png',
        mimeType: 'image/png',
        byteSize: bytes.length,
        sha256: digest(bytes),
        ...changes,
      },
      r,
      key,
    );
  async function reader(roles: RoleCode[] = ['MEMBER']) {
    const u = await db.user({ roles });
    const sid = await db.session(u._id);
    return {
      id: u._id,
      sid,
      token: await app.get(JwtService).signAsync({ sub: u._id, sid }),
    };
  }
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EvidenceStorage)
      .useValue(storage)
      .compile();
    app = mod.createNestApplication();
    configureApp(app, { docs: false, logRequests: false });
    await app.init();
    db = await MongoFixtures.connect();
    a = await reader();
    b = await reader();
    other = await reader();
    reviewer = await reader(['STAFF']);
    admin = await reader(['ADMIN']);
    png = await sharp({
      create: { width: 12, height: 12, channels: 3, background: 'blue' },
    })
      .png()
      .toBuffer();
  });
  beforeEach(async () => {
    failStorage = false;
    duringPut = undefined;
    id = randomUUID();
    const now = new Date();
    await db.c.exchanges.insertOne({
      _id: id,
      initiatorId: a.id,
      recipientId: b.id,
      initiatorListingId: randomUUID(),
      recipientListingId: randomUUID(),
      status: 'ResolutionPending',
      revision: 3,
      initiatorDeposit: 150000,
      recipientDeposit: 100000,
      diffAmount: 50000,
      diffPayerId: a.id,
      createdAt: now,
      updatedAt: now,
      lockSeq: 0,
      initiatorOrderId: randomUUID(),
      recipientOrderId: randomUUID(),
      fundingDeadline: null,
      initiatorFundedAt: now,
      recipientFundedAt: now,
      rejectionReason: null,
      cancelReason: null,
      cancelledBy: null,
      cancelledAt: null,
      initiatorShippedAt: now,
      recipientShippedAt: now,
      initiatorReceivedAt: null,
      recipientReceivedAt: null,
      inspectionDeadline: null,
      completedAt: null,
      proposalExpiresAt: null,
    });
  });
  afterAll(async () => {
    await app?.close();
    await db?.close();
  });
  it('keeps a real private original, exact create/upload replay, no money or exchange transition; assigned reviewer audited', async () => {
    const before = await db.c.exchanges.findOne({ _id: id });
    const journals = await db.c.ledger_journals.countDocuments();
    const k = randomUUID();
    const c = await create(png, a, k).expect(200);
    validates('ExchangeEvidenceReceipt', c.body);
    const eid = c.body.entityId;
    const replay = await create(png, a, k).expect(200);
    expect(replay.body).toEqual(c.body);
    await create(png, a, k, { fileName: 'changed.png' }).expect(409);
    const uk = randomUUID();
    const uploaded = await put(eid, png, a, uk).expect(200);
    expect(uploaded.body.state).toBe('Ready');
    expect((await put(eid, png, a, uk).expect(200)).body).toEqual(
      uploaded.body,
    );
    const list = await get(`/exchanges/${id}/evidence`, b).expect(200);
    validates('ExchangeEvidenceList', list.body);
    expect(list.body.items).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain('original');
    await get(`/operations/exchanges/${id}/evidence`, reviewer).expect(403);
    const assigned = await post(
      `/operations/exchanges/${id}/evidence-access`,
      { expectedVersion: 0, reason: 'Tiếp nhận kiểm tra hồ sơ.' },
      reviewer,
    ).expect(200);
    expect(assigned.body.state).toBe('Assigned');
    await post(
      `/operations/exchanges/${id}/evidence/${eid}/read`,
      { reason: 'Xem ảnh gốc kiểm tra vết rách.' },
      reviewer,
    ).expect(200);
    expect(
      await db.c.audit_events.countDocuments({
        actorId: reviewer.id,
        action: 'readExchangeEvidence',
      }),
    ).toBe(1);
    expect(await db.c.ledger_journals.countDocuments()).toBe(journals);
    expect((await db.c.exchanges.findOne({ _id: id }))?.revision).toBe(
      before?.revision,
    );
    expect((await db.c.exchanges.findOne({ _id: id }))?.status).toBe(
      'ResolutionPending',
    );
  });
  it('denies outsiders, participant reviewers, wrong uploader, pending reads and revoked replay', async () => {
    await create(png, other).expect(404);
    const c = await create().expect(200),
      eid = c.body.entityId;
    await put(eid, png, b).expect(404);
    await post(`/exchanges/${id}/evidence/${eid}/read`, {}, a).expect(409);
    await db.addRole(a.id, 'STAFF');
    await get(`/operations/exchanges/${id}/evidence-access`, a).expect(403);
    const k = randomUUID();
    await put(eid, png, a, k).expect(200);
    await db.c.auth_sessions.updateOne(
      { _id: a.sid },
      { $set: { revokedAt: new Date() } },
    );
    await put(eid, png, a, k).expect(401);
    a = await reader();
  });
  it('rechecks current session after storage I/O and leaves failed upload Pending for exact retry', async () => {
    const c = await create().expect(200),
      eid = c.body.entityId,
      k = randomUUID();
    duringPut = async () => {
      await db.c.auth_sessions.updateOne(
        { _id: a.sid },
        { $set: { revokedAt: new Date() } },
      );
    };
    await put(eid, png, a, k).expect(401);
    expect((await db.c.exchange_evidence.findOne({ _id: eid }))?.status).toBe(
      'Pending',
    );
    a = await reader();
  });
  it('rejects mismatched hashes, forged formats, stale versions, closed cases and per-participant quotas', async () => {
    await create(png, a, randomUUID(), { expectedVersion: 2 }).expect(409);
    await create(png, a, randomUUID(), {
      mimeType: 'application/pdf',
      byteSize: 20000001,
    }).expect(422);
    const c = await create(Buffer.from('not an image')).expect(200);
    await put(c.body.entityId, Buffer.from('not an image')).expect(422);
    const c2 = await create().expect(200);
    await put(c2.body.entityId, Buffer.alloc(png.length)).expect(422);
    const pending = await db.c.exchange_evidence.findOne({
      _id: c2.body.entityId,
    });
    for (let n = 0; n < 8; n++)
      await db.c.exchange_evidence.insertOne({
        ...pending!,
        _id: randomUUID(),
        sha256: digest(Buffer.from(String(n))),
      });
    await create(Buffer.from('another')).expect(429);
    await db.c.exchanges.updateOne(
      { _id: id },
      { $set: { status: 'Completed' } },
    );
    await create(Buffer.from('closed')).expect(409);
  });
  it('recovers storage outage with the exact upload key; concurrent replay commits once and Pending stays private', async () => {
    const created = await create().expect(200),
      eid = created.body.entityId,
      k = randomUUID();
    expect(
      (await get(`/exchanges/${id}/evidence`, b).expect(200)).body.items,
    ).toEqual([]);
    failStorage = true;
    await put(eid, png, a, k).expect(503);
    expect((await db.c.exchange_evidence.findOne({ _id: eid }))?.status).toBe(
      'Pending',
    );
    failStorage = false;
    const results = await Promise.all([
      put(eid, png, a, k),
      put(eid, png, a, k),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(results[0].body).toEqual(results[1].body);
    expect(
      await db.c.exchange_evidence.countDocuments({
        exchangeId: id,
        status: 'Ready',
      }),
    ).toBe(1);
    expect(
      await db.c.mutation_receipts.countDocuments({
        operation: 'uploadExchangeEvidence',
        key: k,
        actorId: a.id,
      }),
    ).toBe(1);
  });
  it('serializes competing assignment and allows independent Admin reassignment with fresh version', async () => {
    const calls = await Promise.all([
      post(
        `/operations/exchanges/${id}/evidence-access`,
        { expectedVersion: 0, reason: 'Nhận hồ sơ xử lý bằng chứng.' },
        reviewer,
      ),
      post(
        `/operations/exchanges/${id}/evidence-access`,
        { expectedVersion: 0, reason: 'Nhận hồ sơ xử lý bằng chứng.' },
        admin,
      ),
    ]);
    expect(calls.map((r) => r.status).sort()).toEqual([200, 409]);
    const arow = await db.c.exchange_evidence_assignments.findOne({ _id: id });
    expect(arow?.version).toBe(1);
    await post(
      `/operations/exchanges/${id}/evidence-access`,
      { expectedVersion: 1, reason: 'Admin tiếp nhận lại hồ sơ.' },
      admin,
    ).expect(200);
    await get(`/operations/exchanges/${id}/evidence`, reviewer).expect(403);
  });
});
