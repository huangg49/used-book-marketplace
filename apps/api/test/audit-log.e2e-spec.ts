import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import type { RoleCode, UserStatus } from '../src/database/mongo/documents.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';
import { validates } from './helpers/contract.js';

type Reader = { id: string; sid: string; token: string };

describe('Admin activity log: real HTTP/Mongo, Admin only, read-only', () => {
  let app: INestApplication, db: MongoFixtures, admin: Reader, target: Reader;
  const reason = `QA nhật ký ${randomUUID()}`;

  async function reader(roles: RoleCode[] = ['MEMBER'], status: UserStatus = 'ACTIVE') {
    const u = await db.user({ roles, status }),
      sid = await db.session(u._id);
    return { id: u._id, sid, token: await app.get(JwtService).signAsync({ sub: u._id, sid }) };
  }
  const get = (query: string, who = admin) =>
    request(app.getHttpServer())
      .get('/api/v1/operations/audit-events' + query)
      .auth(who.token, { type: 'bearer' });
  const lock = (who = admin, id = target.id) =>
    request(app.getHttpServer())
      .post(`/api/v1/operations/users/${id}/lock`)
      .auth(who.token, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ expectedVersion: 1, reason, unlockCondition: 'Đã xác minh', relatedReference: 'QA-LOG-1' });

  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    configureApp(app, { logRequests: false });
    await app.init();
    db = await MongoFixtures.connect();
    admin = await reader(['ADMIN']);
    target = await reader();
    await lock().expect(200);
  });
  afterAll(async () => {
    await db?.close();
    await app?.close();
  });

  it('refuses anonymous, Member, Staff, Test Operator and inactive Admin', async () => {
    await request(app.getHttpServer()).get('/api/v1/operations/audit-events').expect(401);
    for (const who of [
      target,
      await reader(['STAFF']),
      await reader(['MEMBER', 'STAFF']),
      await reader(['TEST_OPERATOR']),
      await reader(['ADMIN'], 'RESTRICTED'),
      await reader(['ADMIN'], 'LOCKED'),
    ])
      await get('', who).expect(403);
  });

  it('exposes no write route on the log', async () => {
    for (const method of ['post', 'put', 'patch', 'delete'] as const)
      await request(app.getHttpServer())[method]('/api/v1/operations/audit-events')
        .auth(admin.token, { type: 'bearer' })
        .expect(404);
  });

  it('finds the Admin action by actor, entity, action and reason with redacted snapshots', async () => {
    const res = await get(`?actorId=${admin.id}&entityType=Account&entityId=${target.id}`).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    validates('AuditEventPage', res.body);
    const [event] = res.body.items;
    expect(event).toMatchObject({
      action: 'lockUserAccount',
      actor: { kind: 'User', id: admin.id, roles: ['ADMIN'], systemActor: null },
      entity: { type: 'Account', id: target.id },
      reason,
    });
    expect(JSON.stringify(event)).not.toMatch(/password|token/i);

    const byReason = await get(`?reason=${encodeURIComponent(reason.slice(-12))}`).expect(200);
    expect(byReason.body.items.map((e: { id: string }) => e.id)).toContain(event.id);
    const byEvent = await get(`?eventId=${event.id}&action=lockUserAccount`).expect(200);
    expect(byEvent.body.items).toHaveLength(1);
    const byRequest = await get(`?requestId=${event.requestId}`).expect(200);
    expect(byRequest.body.items.map((e: { id: string }) => e.id)).toContain(event.id);
  });

  it('scopes by current actor role and time window', async () => {
    const staffOnly = await get(`?actorRole=STAFF&actorId=${admin.id}`).expect(200);
    expect(staffOnly.body.items).toEqual([]);
    const adminOnly = await get(`?actorRole=ADMIN&actorId=${admin.id}`).expect(200);
    expect(adminOnly.body.items.length).toBeGreaterThan(0);
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const empty = await get(`?actorId=${admin.id}&from=${encodeURIComponent(future)}`).expect(200);
    expect(empty.body.items).toEqual([]);
    await get(`?from=${encodeURIComponent(future)}&to=${encodeURIComponent(new Date().toISOString())}`).expect(400);
  });

  it('rejects invalid filters and a cursor reused with other filters', async () => {
    await get('?limit=0').expect(400);
    await get('?limit=51').expect(400);
    await get('?actorId=not-a-uuid').expect(400);
    await get('?entityType=Order').expect(400);
    await get('?action=drop%20table').expect(400);
    await get('?unknown=1').expect(400);

    const other = await reader();
    await lock(admin, other.id).expect(200);
    const first = await get(`?actorId=${admin.id}&limit=1`).expect(200);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const next = await get(`?actorId=${admin.id}&limit=1&cursor=${encodeURIComponent(first.body.nextCursor)}`).expect(200);
    expect(next.body.items[0].id).not.toBe(first.body.items[0].id);
    await get(`?actorRole=All&limit=1&cursor=${encodeURIComponent(first.body.nextCursor)}`).expect(400);
  });
});
