import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { DatabaseService } from '../src/database/database.service.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import {
  MediaStorage,
  digest,
  inputKey,
  outputKey,
} from '../src/modules/media/media-storage.js';
import { MediaWorker } from '../src/modules/media/media-worker.service.js';
import request from 'supertest';
import sharp from 'sharp';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';
import { createRequire } from 'node:module';

// Explicit storage fake. These are real HTTP/Postgres/Sharp tests, not Supabase live tests.
class TestStorage {
  objects = new Map<string, Buffer>();
  fail = false;
  removeFails = false;
  async check() {
    if (this.fail) throw new Error('Injected storage outage');
  }
  async put(key: string, bytes: Buffer) {
    await this.check();
    if (!this.objects.has(key)) this.objects.set(key, Buffer.from(bytes));
  }
  async read(key: string) {
    await this.check();
    const b = this.objects.get(key);
    if (!b) throw new Error('Missing');
    return b;
  }
  async signedRead(key: string) {
    await this.check();
    return {
      url: `https://storage.test/${key}`,
      expiresAt: new Date(Date.now() + 120000).toISOString(),
    };
  }
  async remove(keys: string[]) {
    if (this.removeFails) throw new Error('Delete outage');
    keys.forEach((k) => this.objects.delete(k));
  }
}
type Adapter = Awaited<ReturnType<PrismaPg['connect']>>;
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
  mediaIds: [] as string[],
};
const ajv = new Ajv2020({ strict: false });
addFormats.default(ajv);
ajv.addSchema({
  $id: 'media-wire',
  components: parse(
    readFileSync(
      createRequire(import.meta.url).resolve(
        '@used-books/api-contract/openapi.yaml',
      ),
      'utf8',
    ),
  ).components,
});
function valid(name: string, data: unknown) {
  const v = ajv.compile({ $ref: `media-wire#/components/schemas/${name}` });
  expect(v(data), JSON.stringify(v.errors)).toBe(true);
}

describe('owner media HTTP + PostgreSQL + Sharp (injected storage)', () => {
  const schema = `media_test_${randomUUID().replaceAll('-', '')}`;
  let app: INestApplication,
    db: PrismaClient,
    adapter: Adapter,
    pool: ReturnType<Adapter['underlyingDriver']>,
    worker: MediaWorker;
  const storage = new TestStorage();
  let actor: { id: string; token: string; sid: string }, other: typeof actor;
  let image: Buffer;
  async function user() {
    const id = randomUUID(),
      sid = randomUUID();
    await db.user.create({
      data: {
        id,
        emailNormalized: `${id}@media.test`,
        displayName: 'Bạn đọc',
        passwordHash: 'unused-fixture',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        roles: { create: { role: 'MEMBER' } },
        sessions: {
          create: {
            id: sid,
            refreshTokenHash: randomBytes(32).toString('hex'),
            expiresAt: new Date(Date.now() + 86400000),
          },
        },
      },
    });
    return {
      id,
      sid,
      token: await app.get(JwtService).signAsync({ sub: id, sid }),
    };
  }
  const post = (p: string, b: object, key = randomUUID(), who = actor) =>
    request(app.getHttpServer())
      .post('/api/v1' + p)
      .auth(who.token, { type: 'bearer' })
      .set('Idempotency-Key', key)
      .send(b);
  const get = (p: string, who = actor) =>
    request(app.getHttpServer())
      .get('/api/v1' + p)
      .auth(who.token, { type: 'bearer' });
  async function draft() {
    return (await post('/listings', { content: empty }).expect(200)).body
      .entityId as string;
  }
  async function intent(l: string, bytes = image, key = randomUUID()) {
    const r = await post(
      `/listings/${l}/media`,
      {
        expectedVersion: 1,
        mimeType: 'image/png',
        byteSize: bytes.length,
        sha256: digest(bytes),
      },
      key,
    ).expect(200);
    valid('MutationReceipt', r.body);
    return r.body.entityId as string;
  }
  async function upload(
    l: string,
    m: string,
    bytes = image,
    key = randomUUID(),
  ) {
    const t = await get(`/listings/${l}/media/${m}/upload-ticket`).expect(200);
    valid('UploadTicket', t.body);
    return request(app.getHttpServer())
      .put('/api/v1' + t.body.path)
      .auth(actor.token, { type: 'bearer' })
      .set(t.body.headers)
      .set('Idempotency-Key', key)
      .send(bytes);
  }
  const detail = (l: string, m: string) => get(`/me/listings/${l}/media/${m}`);
  async function finalize(l: string, m: string, key = randomUUID()) {
    const r = await detail(l, m).expect(200);
    return post(
      `/listings/${l}/media/${m}/finalize`,
      { expectedVersion: r.body.version },
      key,
    );
  }
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL!;
    if (!new URL(url).pathname.endsWith('_test'))
      throw new Error('Dedicated test DB required');
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
    await db.$connect();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue(db)
      .overrideProvider(MediaStorage)
      .useValue(storage)
      .compile();
    app = module.createNestApplication();
    configureApp(app, { docs: false, logRequests: false });
    await app.init();
    worker = app.get(MediaWorker);
    actor = await user();
    other = await user();
    image = await sharp({
      create: { width: 200, height: 300, channels: 3, background: '#92724c' },
    })
      .png()
      .toBuffer();
  }, 60000);
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    if (pool && /^media_test_[a-f0-9]{32}$/.test(schema))
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await adapter?.dispose();
  });
  beforeEach(async () => {
    storage.fail = false;
    storage.removeFails = false;
    app.get(ConfigService).set('MEDIA_STORAGE_BUDGET_BYTES', 800000000);
    await db.listingMedia.updateMany({
      where: { status: 'Pending', expiresAt: { lt: new Date() } },
      data: {
        status: 'Failed',
        failureCode: 'UploadExpired',
        version: { increment: 1 },
      },
    });
  });

  it('uploads immutable bytes, processes, privately reads and persists attachment in a draft', async () => {
    const l = await draft(),
      m = await intent(l);
    expect((await upload(l, m)).status).toBe(200);
    const f = await finalize(l, m);
    expect(f.status).toBe(200);
    expect(f.body.state).toBe('Processing');
    await get(`/me/listings/${l}/media/${m}/read`).expect(422);
    await worker.tick();
    const d = await detail(l, m).expect(200);
    valid('ListingMedia', d.body);
    expect(d.body.status).toBe('Ready');
    expect(d.body).not.toHaveProperty('pinnedKey');
    const read = await get(`/me/listings/${l}/media/${m}/read`).expect(200);
    valid('MediaRead', read.body);
    expect(read.body.url).toContain('render-1.webp');
    const output = await sharp(
      storage.objects.get(outputKey(m, 1))!,
    ).metadata();
    expect(output.format).toBe('webp');
    expect(output.exif).toBeUndefined();
    await request(app.getHttpServer())
      .put(`/api/v1/listings/${l}/draft`)
      .auth(actor.token, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ expectedVersion: 1, content: { ...empty, mediaIds: [m] } })
      .expect(200);
    expect(
      (await get(`/me/listings/${l}`).expect(200)).body.currentRevision.content
        .mediaIds,
    ).toEqual([m]);
    valid(
      'ListingMediaPage',
      (await get(`/me/listings/${l}/media`).expect(200)).body,
    );
  });
  it('checks roles, ownership, active account, session and ticket binding', async () => {
    const l = await draft(),
      m = await intent(l);
    await get(`/me/listings/${l}/media/${m}`, other).expect(404);
    await get(`/listings/${l}/media/${m}/upload-ticket`, other).expect(404);
    const t = (await get(`/listings/${l}/media/${m}/upload-ticket`).expect(200))
      .body;
    await request(app.getHttpServer())
      .put('/api/v1' + t.path)
      .auth(other.token, { type: 'bearer' })
      .set(t.headers)
      .set('Idempotency-Key', randomUUID())
      .send(image)
      .expect(403);
    await db.user.update({
      where: { id: actor.id },
      data: { status: 'RESTRICTED' },
    });
    await detail(l, m).expect(200);
    await get(`/listings/${l}/media/${m}/upload-ticket`).expect(403);
    await db.user.update({
      where: { id: actor.id },
      data: { status: 'ACTIVE' },
    });
    const stranger = await user();
    await db.authSession.update({
      where: { id: stranger.sid },
      data: { revokedAt: new Date() },
    });
    await get(`/me/listings/${l}/media`, stranger).expect(401);
  });
  it('replays concurrent intents, rejects conflicting keys and finalizes exactly once', async () => {
    const l = await draft(),
      key = randomUUID();
    const body = {
      expectedVersion: 1,
      mimeType: 'image/png',
      byteSize: image.length,
      sha256: digest(image),
    };
    const created = await Promise.all(
      Array.from({ length: 4 }, () => post(`/listings/${l}/media`, body, key)),
    );
    expect(created.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(new Set(created.map((r) => r.body.entityId)).size).toBe(1);
    const m = created[0].body.entityId;
    await post(
      `/listings/${l}/media`,
      { ...body, byteSize: image.length + 1 },
      key,
    ).expect(409);
    const uploadKey = randomUUID();
    expect((await upload(l, m, image, uploadKey)).status).toBe(200);
    const replay = await upload(l, m, image, uploadKey);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    const version = (await detail(l, m)).body.version,
      finalKey = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        post(
          `/listings/${l}/media/${m}/finalize`,
          { expectedVersion: version },
          finalKey,
        ),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(await db.mediaProcessingJob.count({ where: { mediaId: m } })).toBe(
      1,
    );
    let release!: () => void, entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const originalRead = storage.read.bind(storage);
    const spy = vi
      .spyOn(storage, 'read')
      .mockImplementationOnce(async (key) => {
        entered();
        await waiting;
        return originalRead(key);
      });
    const firstWorker = worker.tick();
    await started;
    const leases = await db.$queryRaw<
      { seconds: number }[]
    >`SELECT extract(epoch FROM (lease_until-now()))::float8 AS seconds FROM media_processing_jobs WHERE id=${(await db.mediaProcessingJob.findUniqueOrThrow({ where: { mediaId: m } })).id}::uuid`;
    try {
      expect(leases[0].seconds).toBeGreaterThan(50);
      expect(leases[0].seconds).toBeLessThanOrEqual(60);
      expect(await worker.tick()).toBe(false);
    } finally {
      release();
      await firstWorker;
      spy.mockRestore();
    }
    expect((await detail(l, m)).body.status).toBe('Ready');
    const job = await db.mediaProcessingJob.findUniqueOrThrow({
      where: { mediaId: m },
    });
    expect(job.attempts).toBe(1);
  });
  it('rejects incomplete, altered, oversized and expired uploads without storage writes', async () => {
    const l = await draft(),
      m = await intent(l);
    expect((await finalize(l, m)).status).toBe(409);
    expect((await upload(l, m, Buffer.alloc(image.length))).status).toBe(422);
    expect((await upload(l, m, Buffer.alloc(image.length + 1))).status).toBe(
      413,
    );
    expect(storage.objects.has(inputKey(m))).toBe(false);
    await db.listingMedia.update({
      where: { id: m },
      data: {
        expiresAt: new Date(Date.now() - 1000),
        version: { increment: 1 },
      },
    });
    await get(`/listings/${l}/media/${m}/upload-ticket`).expect(409);
  });
  it('marks invalid images Failed and does not expose original bytes', async () => {
    const l = await draft(),
      bytes = Buffer.from('not-an-image'),
      m = await intent(l, bytes);
    expect((await upload(l, m, bytes)).status).toBe(200);
    expect((await finalize(l, m)).status).toBe(200);
    await worker.tick();
    const d = (await detail(l, m)).body;
    expect(d.status).toBe('Failed');
    expect(d.failureCode).toBe('InvalidImage');
    await get(`/me/listings/${l}/media/${m}/read`).expect(422);
  });
  it('retries storage failure durably and recovers an expired worker lease', async () => {
    const l = await draft(),
      m = await intent(l);
    await upload(l, m);
    await finalize(l, m);
    storage.fail = true;
    await worker.tick();
    expect((await detail(l, m)).body.status).toBe('Processing');
    storage.fail = false;
    await db.mediaProcessingJob.update({
      where: { mediaId: m },
      data: { availableAt: new Date(0), leaseUntil: new Date(0) },
    });
    await worker.tick();
    expect((await detail(l, m)).body.status).toBe('Ready');
  });
  it('rolls back media, reservation and receipt if audit fails', async () => {
    const l = await draft();
    const before = await db.listingMedia.count();
    await pool.query(
      `CREATE FUNCTION fail_media_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='createListingUpload' THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_media_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_media_audit()`,
    );
    try {
      await post(`/listings/${l}/media`, {
        expectedVersion: 1,
        mimeType: 'image/png',
        byteSize: image.length,
        sha256: digest(image),
      }).expect(500);
      expect(await db.listingMedia.count()).toBe(before);
    } finally {
      await pool.query(
        'DROP TRIGGER fail_media_audit ON audit_events; DROP FUNCTION fail_media_audit()',
      );
    }
  });
  it('serializes global reservation limits across different owners', async () => {
    const l = await draft();
    const l2 = (
      await post('/listings', { content: empty }, randomUUID(), other)
    ).body.entityId;
    const sum = (
      await db.listingMedia.aggregate({ _sum: { reservedBytes: true } })
    )._sum.reservedBytes!;
    app
      .get(ConfigService)
      .set('MEDIA_STORAGE_BUDGET_BYTES', sum + image.length + 6000000);
    const body = {
      expectedVersion: 1,
      mimeType: 'image/png',
      byteSize: image.length,
      sha256: digest(image),
    };
    const results = await Promise.all([
      post(`/listings/${l}/media`, body),
      post(`/listings/${l2}/media`, body, randomUUID(), other),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 429]);
  });
  it('tombstones orphan media, retries deletion and releases budget only after deletion', async () => {
    const l = await draft(),
      m = await intent(l);
    await upload(l, m);
    await finalize(l, m);
    await worker.tick();
    // Age fixtures without weakening production immutable guards.
    await pool.query('ALTER TABLE listing_media DISABLE TRIGGER guard_media');
    try {
      await pool.query(
        "UPDATE listing_media SET created_at=now()-interval '2 days', updated_at=now()-interval '1 day' WHERE id=$1",
        [m],
      );
    } finally {
      await pool.query('ALTER TABLE listing_media ENABLE TRIGGER guard_media');
    }
    storage.removeFails = true;
    await expect(worker.cleanup()).rejects.toThrow();
    const tombstone = await db.listingMedia.findUniqueOrThrow({
      where: { id: m },
    });
    expect(tombstone.purgedAt).not.toBeNull();
    expect(tombstone.reservedBytes).toBeGreaterThan(0);
    await detail(l, m).expect(404);
    storage.removeFails = false;
    await pool.query('ALTER TABLE listing_media DISABLE TRIGGER guard_media');
    try {
      await pool.query(
        "UPDATE listing_media SET updated_at=now()-interval '1 day' WHERE id=$1",
        [m],
      );
    } finally {
      await pool.query('ALTER TABLE listing_media ENABLE TRIGGER guard_media');
    }
    await worker.cleanup();
    expect(
      (await db.listingMedia.findUniqueOrThrow({ where: { id: m } }))
        .reservedBytes,
    ).toBe(0);
    expect(storage.objects.has(inputKey(m))).toBe(false);
  });
  it('rechecks eligibility after storage write and leaves an accounted orphan on rejection', async () => {
    const previous = actor;
    actor = await user();
    let release!: () => void, entered!: () => void;
    const held = new Promise<void>((r) => {
        release = r;
      }),
      started = new Promise<void>((r) => {
        entered = r;
      });
    const put = storage.put.bind(storage);
    const spy = vi
      .spyOn(storage, 'put')
      .mockImplementationOnce(async (key, bytes) => {
        await put(key, bytes);
        entered();
        await held;
      });
    try {
      const l = await draft(),
        m = await intent(l),
        key = randomUUID();
      const pending = upload(l, m, image, key);
      await started;
      await db.user.update({
        where: { id: actor.id },
        data: { status: 'RESTRICTED' },
      });
      release();
      expect((await pending).status).toBe(403);
      expect(
        await db.mutationReceipt.count({ where: { actorId: actor.id, key } }),
      ).toBe(0);
      const row = await db.listingMedia.findUniqueOrThrow({ where: { id: m } });
      expect(row.pinnedKey).toBeNull();
      expect(row.reservedBytes).toBeGreaterThan(image.length);
      expect(storage.objects.has(inputKey(m))).toBe(true);
    } finally {
      release();
      spy.mockRestore();
      actor = previous;
    }
  });
  it('fences a stale worker after another worker takes the expired lease', async () => {
    const l = await draft(),
      m = await intent(l);
    await upload(l, m);
    await finalize(l, m);
    let release!: () => void, entered!: () => void;
    const held = new Promise<void>((r) => {
        release = r;
      }),
      started = new Promise<void>((r) => {
        entered = r;
      });
    const read = storage.read.bind(storage);
    const spy = vi
      .spyOn(storage, 'read')
      .mockImplementationOnce(async (key) => {
        entered();
        await held;
        return read(key);
      });
    const stale = worker.tick();
    await started;
    try {
      await db.mediaProcessingJob.update({
        where: { mediaId: m },
        data: { leaseUntil: new Date(0) },
      });
      await worker.tick();
      expect(
        (await db.listingMedia.findUniqueOrThrow({ where: { id: m } }))
          .derivativeKey,
      ).toBe(outputKey(m, 2));
    } finally {
      release();
      await stale;
      spy.mockRestore();
    }
    expect(
      (await db.listingMedia.findUniqueOrThrow({ where: { id: m } }))
        .derivativeKey,
    ).toBe(outputKey(m, 2));
  });
  it('stops after three storage failures and rejects concurrent per-listing quota overflow', async () => {
    const previous = actor;
    actor = await user();
    try {
      const l = await draft(),
        m = await intent(l);
      await upload(l, m);
      await finalize(l, m);
      storage.fail = true;
      for (let i = 0; i < 3; i++) {
        await db.mediaProcessingJob.update({
          where: { mediaId: m },
          data: { availableAt: new Date(0) },
        });
        await worker.tick();
      }
      storage.fail = false;
      expect((await detail(l, m)).body).toMatchObject({
        status: 'Failed',
        failureCode: 'ProcessingFailed',
      });
      const body = {
        expectedVersion: 1,
        mimeType: 'image/png',
        byteSize: image.length,
        sha256: digest(image),
      };
      const calls = await Promise.all(
        Array.from({ length: 9 }, () => post(`/listings/${l}/media`, body)),
      );
      expect(calls.filter((r) => r.status === 200)).toHaveLength(8);
      expect(calls.filter((r) => r.status === 429)).toHaveLength(1);
    } finally {
      storage.fail = false;
      actor = previous;
    }
  });
  it('never purges media referenced by a saved revision', async () => {
    const reference = await db.revisionMedia.findFirstOrThrow();
    await pool.query('ALTER TABLE listing_media DISABLE TRIGGER guard_media');
    try {
      await pool.query(
        "UPDATE listing_media SET created_at=now()-interval '2 days', updated_at=now()-interval '1 day' WHERE id=$1",
        [reference.mediaId],
      );
    } finally {
      await pool.query('ALTER TABLE listing_media ENABLE TRIGGER guard_media');
    }
    await worker.cleanup();
    const m = await db.listingMedia.findUniqueOrThrow({
      where: { id: reference.mediaId },
    });
    expect(m.purgedAt).toBeNull();
    expect(storage.objects.has(m.derivativeKey!)).toBe(true);
  });
});
