import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { MongoClient } = require('mongodb');
const { StorageClient } = require('@supabase/storage-js');
const { Test } = require('@nestjs/testing');
const { JwtService } = require('@nestjs/jwt');
const request = require('supertest');
const sharp = require('sharp');

// Explicit opt-in; never uses the application's database or storage bucket.
// Requires a built API and QA admin URL. No credentials or signed URLs are logged.
assert.equal(
  process.env.RUN_MONGO_LIVE_MEDIA,
  '1',
  'Set RUN_MONGO_LIVE_MEDIA=1 explicitly',
);
const rootUrl = process.env.MONGO_TEST_URL;
try {
  const parsed = new URL(rootUrl);
  assert(['mongodb:', 'mongodb+srv:'].includes(parsed.protocol));
  assert(parsed.pathname.endsWith('_test'));
} catch {
  throw new Error(
    'MONGO_TEST_URL must name a QA _test database; value suppressed',
  );
}
const base = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_STORAGE_KEY;
assert(base && key, 'Private server Supabase configuration is required');
assert(
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base),
  'Invalid Supabase project URL; value suppressed',
);
const nonce = randomUUID().replaceAll('-', '');
const database = `latlai_live_media_${nonce}_test`;
const bucket = `latlai-qa-${nonce}`;
const headers = {
  apikey: key,
  ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
};
const storageAdmin = new StorageClient(
  `${base}/storage/v1`,
  headers,
  (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(30_000) }),
);
let root,
  app,
  bucketCreated = false,
  databaseCreated = false,
  stage = 'setup';
const checks = [];
const pass = (name) => {
  checks.push(name);
  console.log(`PASS ${name}`);
};
const credentialUrl = (user, password) => {
  const url = new URL(rootUrl);
  url.pathname = `/${database}`;
  url.username = user;
  url.password = password;
  url.searchParams.set('authSource', database);
  return url.toString();
};
try {
  root = new MongoClient(rootUrl);
  stage = 'create isolated private QA bucket';
  const created = await storageAdmin.createBucket(bucket, {
    public: false,
    fileSizeLimit: 10_000_000,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  });
  assert(!created.error, 'QA bucket creation failed');
  bucketCreated = true;
  const { bootstrapRoles } = await import('../dist/database/mongo/roles.js');
  const { migrate } = await import('../dist/database/mongo/migrate.js');
  await root.connect();
  const appPassword = randomBytes(32).toString('hex'),
    migratorPassword = randomBytes(32).toString('hex');
  assert.equal((await root.db(database).listCollections().toArray()).length, 0);
  databaseCreated = true;
  await bootstrapRoles(root.db(database), {
    app: appPassword,
    migrator: migratorPassword,
  });
  const migrator = await new MongoClient(
    credentialUrl('latlai_migrator', migratorPassword),
  ).connect();
  try {
    await migrate(migrator, migrator.db());
  } finally {
    await migrator.close();
  }
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URL: credentialUrl('latlai_app', appPassword),
    SUPABASE_MEDIA_BUCKET: bucket,
    JWT_ACCESS_SECRET: randomBytes(40).toString('hex'),
  });
  const { AppModule } = await import('../dist/app.module.js');
  const { configureApp } = await import('../dist/configure-app.js');
  const { MongoService } =
    await import('../dist/database/mongo/mongo.service.js');
  const { MediaWorker } =
    await import('../dist/modules/media/media-worker.service.js');
  const { MediaStorage, digest } =
    await import('../dist/modules/media/media-storage.js');
  const { checkIntegrity } = await import('../dist/integrity/integrity.js');
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication({ logger: false });
  configureApp(app, { docs: false, logRequests: false });
  await app.init();
  const db = app.get(MongoService),
    worker = app.get(MediaWorker),
    storage = app.get(MediaStorage);
  await storage.check();
  pass('isolated private bucket, migrated MongoDB and real storage adapter');
  async function actor() {
    const id = randomUUID(),
      sid = randomUUID(),
      now = new Date();
    await db.c.users.insertOne({
      _id: id,
      emailNormalized: `${id}@live-media.test`,
      passwordHash: 'fixture-not-login',
      displayName: 'QA media',
      status: 'ACTIVE',
      emailVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
      roles: [{ role: 'MEMBER', grantedAt: now }],
      lockSeq: 0,
    });
    await db.c.auth_sessions.insertOne({
      _id: sid,
      userId: id,
      refreshTokenHash: randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 3600000),
      revokedAt: null,
      createdAt: now,
      lockSeq: 0,
    });
    return await app.get(JwtService).signAsync({ sub: id, sid });
  }
  const token = await actor(),
    other = await actor();
  const http = request(app.getHttpServer());
  const get = (path, who = token) =>
    http.get('/api/v1' + path).auth(who, { type: 'bearer' });
  const post = (path, body, idempotency = randomUUID()) =>
    http
      .post('/api/v1' + path)
      .auth(token, { type: 'bearer' })
      .set('Idempotency-Key', idempotency)
      .send(body);
  const empty = {
    bookId: null,
    mode: null,
    condition: null,
    pages: '',
    coverNote: '',
    notes: '',
    accessories: '',
    readable: null,
    hasMissingPages: null,
    missingEssentialContent: null,
    description: '',
    salePrice: null,
    exchangeValue: null,
    mediaIds: [],
  };
  const listing = (await post('/listings', { content: empty }).expect(200)).body
    .entityId;
  const mediaIds = [];
  for (const format of ['jpeg', 'png', 'webp']) {
    stage = `${format} upload and worker`;
    const bytes = await sharp({
      create: { width: 200, height: 300, channels: 3, background: '#92724c' },
    })
      .toFormat(format)
      .toBuffer();
    const media = (
      await post(`/listings/${listing}/media`, {
        expectedVersion: 1,
        mimeType: `image/${format}`,
        byteSize: bytes.length,
        sha256: digest(bytes),
      }).expect(200)
    ).body.entityId;
    mediaIds.push(media);
    await get(
      `/listings/${listing}/media/${media}/upload-ticket`,
      other,
    ).expect(404);
    const ticket = (
      await get(`/listings/${listing}/media/${media}/upload-ticket`).expect(200)
    ).body;
    const uploadKey = randomUUID();
    const upload = () =>
      http
        .put('/api/v1' + ticket.path)
        .auth(token, { type: 'bearer' })
        .set(ticket.headers)
        .set('Idempotency-Key', uploadKey)
        .send(bytes);
    await upload().expect(200);
    await upload().expect(200);
    const detail = (
      await get(`/me/listings/${listing}/media/${media}`).expect(200)
    ).body;
    const finalizeKey = randomUUID();
    const finalized = await post(
      `/listings/${listing}/media/${media}/finalize`,
      { expectedVersion: detail.version },
      finalizeKey,
    ).expect(200);
    assert.equal(finalized.body.state, 'Processing');
    await post(
      `/listings/${listing}/media/${media}/finalize`,
      { expectedVersion: detail.version },
      finalizeKey,
    ).expect(200);
    assert.equal(
      await db.c.media_processing_jobs.countDocuments({ mediaId: media }),
      1,
    );
    await get(`/me/listings/${listing}/media/${media}/read`).expect(422);
    assert.equal(await worker.tick(), true);
    assert.equal(await worker.tick(), false);
    assert.equal(
      (await get(`/me/listings/${listing}/media/${media}`).expect(200)).body
        .status,
      'Ready',
    );
    await get(`/me/listings/${listing}/media/${media}/read`, other).expect(404);
    const read = (
      await get(`/me/listings/${listing}/media/${media}/read`).expect(200)
    ).body;
    const fetched = await fetch(read.url, {
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(fetched.status, 200);
    const preview = Buffer.from(await fetched.arrayBuffer()),
      metadata = await sharp(preview).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, 200);
    assert.equal(metadata.height, 300);
    assert.equal(metadata.exif, undefined);
    const stored = await db.c.listing_media.findOne({ _id: media });
    assert.equal(
      digest(await storage.read(stored.pinnedKey, bytes.length)),
      digest(bytes),
    );
    const anonymous = await fetch(
      `${base}/storage/v1/object/public/${bucket}/${stored.derivativeKey}`,
      { signal: AbortSignal.timeout(15000) },
    );
    assert(!anonymous.ok, 'Anonymous access must fail');
    pass(
      `${format}: real upload/replay/finalize, one job, Sharp Ready, signed WebP, exact original, private access`,
    );
  }
  stage = 'draft persistence and isolated cleanup';
  const save = (version, ids) =>
    http
      .put(`/api/v1/listings/${listing}/draft`)
      .auth(token, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ expectedVersion: version, content: { ...empty, mediaIds: ids } });
  const saved = await save(1, mediaIds).expect(200);
  assert.deepEqual(
    (await get(`/me/listings/${listing}`).expect(200)).body.currentRevision
      .content.mediaIds,
    mediaIds,
  );
  // Fixture clock aging only, on the new QA DB. Never age data in the copied dev DB.
  await db.c.listing_media.updateMany(
    { _id: { $in: mediaIds } },
    {
      $set: {
        createdAt: new Date(Date.now() - 2 * 86400000),
        updatedAt: new Date(Date.now() - 600000),
      },
    },
  );
  await worker.cleanup();
  assert.equal(
    await db.c.listing_media.countDocuments({ purgedAt: { $ne: null } }),
    0,
  );
  await save(saved.body.version, []).expect(200);
  await worker.cleanup();
  for (const id of mediaIds) {
    const row = await db.c.listing_media.findOne({ _id: id });
    assert(row.purgedAt);
    assert.equal(row.reservedBytes, 0);
    await assert.rejects(storage.read(row.pinnedKey, 10000000));
    await assert.rejects(storage.read(row.derivativeKey, 2000000));
  }
  pass(
    'draft save/reopen, linked retention, unlinked purge and budget release with real Supabase',
  );
  assert.deepEqual((await db.tx((tx) => checkIntegrity(tx))).failures, []);
  pass('final integrity sweep');
} catch {
  console.error(`FAIL at ${stage}; remote bodies, tokens and URLs suppressed`);
  process.exitCode = 1;
} finally {
  // Attempt every cleanup even when an earlier resource fails to close.
  const cleanup = async (label, action) => {
    try {
      await action();
    } catch {
      console.error(`Cleanup needed: ${label}`);
      process.exitCode = 1;
    }
  };
  await cleanup('Nest application', async () => app?.close());
  if (bucketCreated)
    await cleanup(`owned QA bucket ${bucket}`, async () => {
      const emptied = await storageAdmin.emptyBucket(bucket);
      assert(!emptied.error);
      const removed = await storageAdmin.deleteBucket(bucket);
      assert(!removed.error);
      pass('owned QA bucket removed');
    });
  if (databaseCreated)
    await cleanup(`owned QA database ${database}`, async () =>
      root.db(database).dropDatabase(),
    );
  await cleanup('QA Mongo connection', async () => root?.close());
  console.log(
    JSON.stringify({
      checks: checks.length,
      ok: !process.exitCode,
      database,
      bucket,
    }),
  );
}
