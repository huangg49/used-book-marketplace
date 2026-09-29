import { createHmac, randomUUID } from 'node:crypto';
import { MongoClient, type Db } from 'mongodb';
import { bindCollections } from '../../src/database/mongo/collections.js';
import { Keyset } from '../../src/database/mongo/keyset.js';
import { DomainError } from '../../src/modules/commands/domain-error.js';
import { prepareDatabase, testUrl } from './harness.js';

// MIG-02 cursor/precision: stable keyset order with ties, scope binding and
// deliberate rejection of PostgreSQL-era cursors.

const rootUrl = testUrl('latlai_keyset_test');
const secret = 'test-only-signing-key-not-for-production-000000000';
let client: MongoClient, db: Db;

beforeAll(async () => {
  const { appUrl } = await prepareDatabase(rootUrl);
  client = await new MongoClient(appUrl).connect();
  db = client.db();
});
afterAll(async () => {
  const root = await new MongoClient(rootUrl).connect();
  await root.db().dropDatabase();
  await root.close();
  await client.close();
});

const code = (e: unknown) =>
  e instanceof DomainError ? (e.getResponse() as { code: string }).code : e;

it('pages through equal timestamps without skipping or repeating', async () => {
  const c = bindCollections(db).login_attempts;
  const tie = new Date('2026-09-29T00:00:00.123Z');
  const ids = Array.from({ length: 7 }, () => randomUUID());
  // login_attempts is a convenient deletable collection with a date field.
  await c.insertMany(
    ids.map((id, i) => ({
      _id: id,
      attempts: i,
      expiresAt: i < 5 ? tie : new Date(tie.getTime() + i),
    })),
  );
  const keyset = new Keyset(secret);
  const pipeline = [
    { $match: { _id: { $in: ids } } },
    { $project: { key: '$expiresAt' } },
  ];
  const seen: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await keyset.page(c, pipeline, {
      kind: 'time',
      ascending: false,
      scope: { operation: 'test' },
      limit: 2,
      cursor,
    });
    seen.push(...page.ids);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  expect(seen).toHaveLength(7);
  expect(new Set(seen).size).toBe(7);
  const tied = ids.slice(0, 5).sort().reverse();
  expect(seen.slice(2)).toEqual(tied);
  await c.deleteMany({ _id: { $in: ids } });
});

it('rejects tampered, re-scoped and PostgreSQL v1 cursors with 400', async () => {
  const c = bindCollections(db).login_attempts;
  const ids = [randomUUID(), randomUUID()];
  await c.insertMany(
    ids.map((id) => ({ _id: id, attempts: 1, expiresAt: new Date() })),
  );
  const keyset = new Keyset(secret);
  const pipeline = [
    { $match: { _id: { $in: ids } } },
    { $project: { key: '$attempts' } },
  ];
  const first = await keyset.page(c, pipeline, {
    kind: 'number',
    ascending: true,
    scope: { q: 'a' },
    limit: 1,
  });
  expect(first.nextCursor).toBeTruthy();
  const attempt = (cursor: string, scope: unknown = { q: 'a' }) =>
    keyset
      .page(c, pipeline, {
        kind: 'number',
        ascending: true,
        scope,
        limit: 1,
        cursor,
      })
      .then(
        () => 'ok',
        (e) => code(e),
      );
  expect(await attempt(first.nextCursor!)).toBe('ok');
  expect(await attempt(first.nextCursor!, { q: 'b' })).toBe('VALIDATION_ERROR');
  expect(await attempt(first.nextCursor! + 'x')).toBe('VALIDATION_ERROR');
  // A validly signed PostgreSQL-era cursor (domain v1, microsecond text).
  const payload = Buffer.from(
    JSON.stringify({
      id: ids[0],
      scope: 'x',
      value: '2026-09-29 00:00:00.123456+00',
    }),
  ).toString('base64url');
  const v1 =
    payload +
    '.' +
    createHmac('sha256', secret)
      .update('listing-cursor-v1\0' + payload)
      .digest('base64url');
  expect(await attempt(v1)).toBe('VALIDATION_ERROR');
  await c.deleteMany({ _id: { $in: ids } });
});
