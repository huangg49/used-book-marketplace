import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import type { RoleCode, UserDoc } from '../src/database/mongo/documents.js';
import { validates } from './helpers/contract.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';

// MIG-03: administrator user directory on MongoDB (search, filters, keyset).

let app: INestApplication;
let db: MongoFixtures;
let passwordHash: string;
const password = 'Operations-users-password-42';
const created: string[] = [];
const tag = randomUUID().slice(0, 8);

beforeAll(async () => {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication();
  configureApp(app, { logRequests: false });
  await app.init();
  db = await MongoFixtures.connect();
  passwordHash = await hash(password);
});
afterAll(async () => {
  await db.removeUsers(created);
  await db.c.login_attempts.deleteMany({});
  await db.close();
  await app.close();
});

async function person(
  roles: RoleCode[],
  status: UserDoc['status'] = 'ACTIVE',
  displayName = 'Người đọc',
) {
  const user = await db.user({
    email: `ops-${tag}-${randomUUID()}@example.com`,
    passwordHash,
    roles,
    status,
    displayName,
  });
  created.push(user._id);
  return user;
}
async function token(user: UserDoc) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: user.emailNormalized, password })
    .expect(200);
  return response.body.accessToken as string;
}
const get = (path: string, bearer: string) =>
  request(app.getHttpServer())
    .get(`/api/v1${path}`)
    .auth(bearer, { type: 'bearer' });

it('finds users by Vietnamese name case-insensitively and by filters', async () => {
  const admin = await token(await person(['ADMIN']));
  const target = await person(
    ['MEMBER', 'STAFF'],
    'RESTRICTED',
    `Đọc Sách ${tag}`,
  );
  await person(['MEMBER'], 'ACTIVE', `Đọc Sách ${tag}`);
  const response = await get(
    `/operations/users?q=${encodeURIComponent(`đọc sách ${tag}`)}&status=RESTRICTED&role=STAFF`,
    admin,
  ).expect(200);
  validates('OperationsUserPage', response.body);
  expect(response.body.items).toEqual([
    expect.objectContaining({
      id: target._id,
      status: 'RESTRICTED',
      roles: ['MEMBER', 'STAFF'],
    }),
  ]);
  expect(response.body.items[0]).not.toHaveProperty('passwordHash');
  const upper = await get(
    `/operations/users?q=${encodeURIComponent(`ĐỌC SÁCH ${tag}`.toUpperCase())}`,
    admin,
  ).expect(200);
  expect(upper.body.items).toHaveLength(2);
  // Regex metacharacters are literal text, not patterns.
  const literal = await get(
    `/operations/users?q=${encodeURIComponent('.*')}`,
    admin,
  ).expect(200);
  expect(literal.body.items).toEqual([]);
});

it('pages newest first through identical creation times without gaps', async () => {
  const admin = await token(await person(['ADMIN']));
  const at = new Date('2026-01-01T00:00:00.000Z');
  const ids: string[] = [];
  for (let i = 0; i < 5; i++) {
    const user = await person(['MEMBER'], 'ACTIVE', `Trang ${tag}`);
    await db.c.users.updateOne({ _id: user._id }, { $set: { createdAt: at } });
    ids.push(user._id);
  }
  const seen: string[] = [];
  let cursor: string | null = null;
  do {
    const response: request.Response = await get(
      `/operations/users?q=${encodeURIComponent(`trang ${tag}`)}&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      admin,
    ).expect(200);
    seen.push(...response.body.items.map((u: { id: string }) => u.id));
    cursor = response.body.nextCursor;
    if (cursor)
      await get(
        `/operations/users?q=other&limit=2&cursor=${encodeURIComponent(cursor)}`,
        admin,
      ).expect(400);
  } while (cursor);
  expect(seen).toEqual([...ids].sort().reverse());
});

it('denies staff, restricted administrators and members', async () => {
  for (const [roles, status] of [
    [['STAFF'], 'ACTIVE'],
    [['ADMIN'], 'RESTRICTED'],
    [['MEMBER'], 'ACTIVE'],
  ] as const)
    await get(
      '/operations/users',
      await token(await person([...roles], status)),
    ).expect(403);
});
