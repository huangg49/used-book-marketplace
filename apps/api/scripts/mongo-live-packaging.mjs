import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const request = require('supertest');
const sharp = require('sharp');
const { JwtService } = require('@nestjs/jwt');

// Invoked only by the opt-in live-media runner: it owns the isolated DB/bucket
// and always attempts cleanup. No storage fake or direct ledger writes.
export async function runPackaging({
  app,
  db,
  storage,
  worker,
  actor,
  base,
  bucket,
  pass,
  setStage,
}) {
  const http = request(app.getHttpServer());
  const seller = await actor(),
    buyer = await actor(),
    outsider = await actor();
  const admin = await actor(['ADMIN']),
    staff = await actor(['STAFF']);
  const operator = await actor(['TEST_OPERATOR']);
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const get = (path, token) =>
    http.get('/api/v1' + path).auth(token, { type: 'bearer' });
  const send = (method, path, token, body, key = randomUUID()) =>
    http[method]('/api/v1' + path)
      .auth(token, { type: 'bearer' })
      .set('Idempotency-Key', key)
      .send(body);
  const post = (path, token, body, key) => send('post', path, token, body, key);
  const image = (format) =>
    sharp({
      create: { width: 80, height: 120, channels: 3, background: '#92724c' },
    })
      .toFormat(format)
      .withMetadata()
      .toBuffer();
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
  setStage('packaging: real HTTP accepted paid Order fixture');
  const book = (
    await post('/catalog/requests', seller, {
      metadata: {
        title: 'QA live packaging',
        authors: ['QA'],
        publisher: null,
        publicationYear: null,
        language: 'vi',
        edition: null,
        category: 'Văn học',
        isbn: null,
      },
    }).expect(200)
  ).body;
  await post(`/operations/catalog-requests/${book.entityId}/decision`, admin, {
    expectedVersion: book.version,
    revisionId: book.revisionId,
    decision: 'Confirm',
  }).expect(200);
  const listing = (
    await post('/listings', seller, { content: empty }).expect(200)
  ).body.entityId;
  const cover = await image('jpeg');
  const media = (
    await post(`/listings/${listing}/media`, seller, {
      expectedVersion: 1,
      mimeType: 'image/jpeg',
      byteSize: cover.length,
      sha256: hash(cover),
    }).expect(200)
  ).body.entityId;
  const ticket = (
    await get(
      `/listings/${listing}/media/${media}/upload-ticket`,
      seller,
    ).expect(200)
  ).body;
  await http
    .put('/api/v1' + ticket.path)
    .auth(seller, { type: 'bearer' })
    .set(ticket.headers)
    .set('Idempotency-Key', randomUUID())
    .send(cover)
    .expect(200);
  const pending = (
    await get(`/me/listings/${listing}/media/${media}`, seller).expect(200)
  ).body;
  await post(`/listings/${listing}/media/${media}/finalize`, seller, {
    expectedVersion: pending.version,
  }).expect(200);
  assert.equal(await worker.tick(), true);
  const address = async (token) => {
    const current = (await get('/me/addresses', token).expect(200)).body;
    return (
      await post('/me/addresses', token, {
        expectedBookVersion: current.version,
        makeDefault: false,
        address: {
          recipientName: 'QA',
          phone: '0900123456',
          detail: 'QA simulator only',
          serviceAreaCode: 'HCM-DEMO-v1',
          localityCode: 'DEMO-A',
        },
      }).expect(200)
    ).body.addressId;
  };
  const origin = await address(seller),
    destination = await address(buyer);
  const saved = (
    await send('put', `/listings/${listing}/draft`, seller, {
      expectedVersion: 1,
      content: {
        ...empty,
        bookId: book.entityId,
        mode: 'Sale',
        condition: 'Good',
        pages: 'Đủ trang',
        coverNote: 'Bìa còn tốt',
        notes: 'Không ghi chú',
        accessories: 'Không có',
        readable: true,
        hasMissingPages: false,
        missingEssentialContent: false,
        description: 'Bản sách QA để kiểm ảnh đóng gói, không giao dịch thật.',
        salePrice: 200000,
        mediaIds: [media],
        fulfillment: {
          originAddressId: origin,
          originAddressVersion: 1,
          method: 'DirectDelivery',
        },
      },
    }).expect(200)
  ).body;
  const submitted = (
    await post(`/listings/${listing}/submit`, seller, {
      expectedVersion: saved.version,
      ownershipDeclared: true,
    }).expect(200)
  ).body;
  const approved = (
    await post(`/operations/listings/${listing}/decision`, staff, {
      expectedVersion: submitted.version,
      revisionId: submitted.revisionId,
      decision: 'Approve',
      checklist: {
        catalogMatches: true,
        photosClear: true,
        conditionDisclosed: true,
        readable: true,
        pricingValid: true,
        contentAppropriate: true,
      },
    }).expect(200)
  ).body;
  const quote = (
    await post(`/listings/${listing}/quotes`, buyer, {
      expectedListingVersion: approved.version,
      expectedListingRevisionId: approved.revisionId,
      destinationAddressId: destination,
      expectedDestinationAddressVersion: 1,
      method: 'DirectDelivery',
    }).expect(200)
  ).body;
  const order = (
    await post('/orders', buyer, {
      quoteId: quote.entityId,
      expectedQuoteVersion: 1,
      expectedListingVersion: approved.version,
      expectedListingRevisionId: approved.revisionId,
    }).expect(200)
  ).body;
  const topup = (
    await post('/me/topups', buyer, { amount: 500000 }).expect(200)
  ).body;
  await post('/operations/simulator/topup-events', operator, {
    eventId: randomUUID(),
    intentId: topup.entityId,
    recipientId: app.get(JwtService).decode(buyer).sub,
    amount: 500000,
    currency: 'VND',
    outcome: 'Succeeded',
    occurredAt: new Date().toISOString(),
  }).expect(200);
  await post(`/orders/${order.entityId}/pay`, buyer, {
    expectedVersion: 1,
  }).expect(200);
  await post(`/orders/${order.entityId}/accept`, seller, {
    expectedVersion: 2,
  }).expect(200);
  const path = `/orders/${order.entityId}/packaging-evidence`,
    privatePath = `/me${path}`;
  const before = (await get(`/me/orders/${order.entityId}`, buyer).expect(200))
    .body;
  const money = (await get('/me/wallet', buyer).expect(200)).body;
  assert.equal(before.state, 'Preparing');
  assert.equal(money.transactionHeld, 230000);
  pass(
    'paid Preparing fixture through HTTP, real listing media and simulated journalled funding',
  );

  for (const format of ['jpeg', 'png', 'webp']) {
    setStage(`packaging ${format}: create, fault/retry and private reads`);
    const bytes = await image(format),
      mime = `image/${format}`,
      createKey = randomUUID();
    const body = {
      expectedVersion: 3,
      mimeType: mime,
      byteSize: bytes.length,
      sha256: hash(bytes),
    };
    await post(path, buyer, body).expect(404);
    const created = (await post(path, seller, body, createKey).expect(200))
      .body;
    const replay = await post(path, seller, body, createKey).expect(200);
    assert.deepEqual(replay.body, created);
    assert.equal(replay.headers['idempotency-replayed'], 'true');
    const id = created.entityId,
      key = randomUUID();
    const upload = (who = seller, payload = bytes, idempotency = key) =>
      http
        .put(`/api/v1${path}/${id}/content`)
        .auth(who, { type: 'bearer' })
        .set('Idempotency-Key', idempotency)
        .set('Content-Type', mime)
        .send(payload);
    await upload(buyer).expect(404);
    await get(`${privatePath}/${id}/read`, buyer).expect(422);
    // Fault occurs AFTER a real remote original has persisted, BEFORE preview/DB
    // acknowledgement. Restores the real method even if an assertion fails.
    if (format === 'png') {
      const realPut = storage.put.bind(storage);
      storage.put = async (objectKey, ...args) => {
        await realPut(objectKey, ...args);
        if (objectKey === `order-evidence/${id}/original`)
          throw new Error('QA after original write');
      };
      try {
        await upload().expect(500);
      } finally {
        storage.put = realPut;
      }
      const interrupted = await db.c.order_packaging_evidence.findOne({
        _id: id,
      });
      assert.equal(interrupted.status, 'Pending');
      assert.equal(interrupted.reservedBytes, bytes.length + 2000000);
      assert.equal(
        hash(await storage.read(`order-evidence/${id}/original`, bytes.length)),
        hash(bytes),
      );
      assert.equal(
        await db.c.mutation_receipts.countDocuments({
          operation: 'uploadPackagingEvidence',
          'result.entityId': id,
        }),
        0,
      );
    }
    const ready = await upload().expect(200);
    assert.equal(ready.body.state, 'Ready');
    const repeated = await upload().expect(200);
    assert.deepEqual(repeated.body, ready.body);
    assert.equal(repeated.headers['idempotency-replayed'], 'true');
    await upload(seller, Buffer.alloc(bytes.length, 1)).expect(422);
    const stored = await db.c.order_packaging_evidence.findOne({ _id: id });
    assert.equal(stored.status, 'Ready');
    assert.equal(stored.version, 2);
    assert.equal(
      hash(await storage.read(`order-evidence/${id}/original`, bytes.length)),
      hash(bytes),
    );
    for (const token of [buyer, seller]) {
      const preview = await get(`${privatePath}/${id}/read`, token).expect(200);
      assert.match(preview.headers['cache-control'], /no-store/);
      const response = await fetch(preview.body.url, {
        signal: AbortSignal.timeout(15000),
      });
      assert.equal(response.status, 200);
      const meta = await sharp(
        Buffer.from(await response.arrayBuffer()),
      ).metadata();
      assert.equal(meta.format, 'webp');
      assert.equal(meta.width, 80);
      assert.equal(meta.height, 120);
      assert.equal(meta.exif, undefined);
    }
    await get(`${privatePath}/${id}/read`, outsider).expect(404);
    for (const role of [admin, staff, operator])
      await get(`${privatePath}/${id}/read`, role).expect(403);
    await http.get(`/api/v1${privatePath}/${id}/read`).expect(401);
    const anonymous = await fetch(
      `${base}/storage/v1/object/public/${bucket}/order-evidence/${id}/preview-v1.webp`,
      { signal: AbortSignal.timeout(15000) },
    );
    assert(!anonymous.ok);
    assert.equal(
      await db.c.mutation_receipts.countDocuments({
        operation: 'uploadPackagingEvidence',
        'result.entityId': id,
      }),
      1,
    );
    pass(
      `packaging ${format}: exact original, private stripped preview, current permissions, one upload receipt${format === 'png' ? ', repaired remote-success/DB-pending fault' : ''}`,
    );
  }
  setStage('packaging: listing cleanup retention and unchanged obligations');
  const listed = (await get(privatePath, buyer).expect(200)).body;
  assert.equal(listed.items.length, 3);
  assert(!/original|preview-v1|https:/.test(JSON.stringify(listed)));
  await worker.cleanup();
  for (const item of listed.items) {
    const original = await storage.read(
      `order-evidence/${item.id}/original`,
      item.byteSize,
    );
    assert.equal(hash(original), item.sha256);
  }
  const after = (await get(`/me/orders/${order.entityId}`, buyer).expect(200))
    .body;
  // Response observation time must advance; business state must not change.
  const { serverTime: beforeTime, ...beforeState } = before;
  const { serverTime: afterTime, ...afterState } = after;
  assert(Date.parse(afterTime) >= Date.parse(beforeTime));
  setStage('packaging: unchanged Order response except serverTime');
  assert.deepEqual(afterState, beforeState);
  setStage('packaging: unchanged wallet response');
  const { serverTime: moneyBeforeTime, ...moneyBefore } = money;
  const { serverTime: moneyAfterTime, ...moneyAfter } = (
    await get('/me/wallet', buyer).expect(200)
  ).body;
  assert(Date.parse(moneyAfterTime) >= Date.parse(moneyBeforeTime));
  assert.deepEqual(moneyAfter, moneyBefore);
  setStage('packaging: active commitment');
  assert.equal(
    await db.c.exclusive_commitments.countDocuments({
      currentContextId: order.contextId,
      status: 'Active',
    }),
    1,
  );
  const { checkIntegrity } = await import('../dist/integrity/integrity.js');
  setStage('packaging: final integrity sweep');
  assert.deepEqual((await db.tx((tx) => checkIntegrity(tx))).failures, []);
  pass(
    'listing cleanup retained packaging originals; Order/hold/commitment unchanged; integrity sweep clean',
  );
}
