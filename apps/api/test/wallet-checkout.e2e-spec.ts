import { prepareSellerOrder } from './helpers/seller-order.js';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { MediaStorage } from '../src/modules/media/media-storage.js';
import { TransactionPolicy } from '../src/modules/wallet/transaction-policy.js';
import {
  VNPaySandbox,
  vnDate,
  QUERY_RESPONSE_FIELDS,
} from '../src/modules/wallet/vnpay-sandbox.js';
import { MongoService } from '../src/database/mongo/mongo.service.js';
import { LedgerService } from '../src/modules/wallet/ledger.service.js';
import { OrdersService } from '../src/modules/orders/orders.service.js';
import { OrderClock } from '../src/modules/orders/order-clock.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';
import { Gate } from './helpers/mongo-gate.js';
import { validates } from './helpers/contract.js';
import type { RoleCode } from '../src/database/mongo/documents.js';

const provider = new VNPaySandbox(
  new ConfigService({
    NODE_ENV: 'test',
    VNPAY_SANDBOX_ENABLED: 'true',
    VNPAY_TMN_CODE: 'TESTDEMO',
    VNPAY_HASH_SECRET: 'qa-only-vnpay-key-not-production-0000000000',
    VNPAY_RETURN_URL: 'http://127.0.0.1:5174/wallet',
  }),
);
type Reader = { id: string; token: string; sessionId: string };
type Receipt = { entityId: string; version: number; revisionId: string };
const checklist = {
  catalogMatches: true,
  photosClear: true,
  conditionDisclosed: true,
  readable: true,
  pricingValid: true,
  contentAppropriate: true,
};
describe('VNPay sandbox / paid listing submissions / seller-selected wallet checkout (default policy)', () => {
  let app: INestApplication, db: MongoFixtures, reviewer: Reader;
  const post = (url: string, body: object, actor: Reader, key = randomUUID()) =>
    request(app.getHttpServer())
      .post('/api/v1' + url)
      .set('Authorization', `Bearer ${actor.token}`)
      .set('Idempotency-Key', key)
      .send(body);
  const get = (url: string, actor?: Reader) => {
    const r = request(app.getHttpServer()).get('/api/v1' + url);
    return actor ? r.set('Authorization', `Bearer ${actor.token}`) : r;
  };
  async function reader(roles: RoleCode[] = ['MEMBER']): Promise<Reader> {
    const user = await db.user({ roles });
    const sessionId = await db.session(user._id);
    return {
      id: user._id,
      sessionId,
      token: await app
        .get(JwtService)
        .signAsync({ sub: user._id, sid: sessionId }),
    };
  }
  async function topup(actor: Reader, amount = 100000, key = randomUUID()) {
    const r = await post('/me/topups/vnpay', { amount }, actor, key).expect(
      200,
    );
    validates('WalletCommandReceipt', r.body);
    return r.body as {
      entityId: string;
      paymentUrl: string;
      expiresAt: string;
    };
  }
  function callback(
    t: { entityId: string; paymentUrl: string },
    overrides: Record<string, string> = {},
  ) {
    const checkout = new URL(t.paymentUrl).searchParams;
    const p = {
      vnp_TxnRef: t.entityId,
      vnp_TmnCode: 'TESTDEMO',
      vnp_Amount: checkout.get('vnp_Amount')!,
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
      vnp_TransactionNo: String(Math.floor(Math.random() * 1e12) + 1),
      vnp_PayDate: vnDate(new Date()),
      ...overrides,
    };
    return { ...p, vnp_SecureHash: provider.sign(p) };
  }
  async function fund(actor: Reader, amount: number) {
    const t = await topup(actor, amount);
    const response = await get('/payments/vnpay/ipn')
      .query(callback(t))
      .expect(200);
    expect(response.body.RspCode).toBe('00');
    return t;
  }
  async function wallet(actor: Reader) {
    const r = await get('/me/wallet', actor).expect(200);
    validates('WalletSummary', r.body);
    return r.body;
  }
  async function address(actor: Reader) {
    const r = await post(
      '/me/addresses',
      {
        expectedBookVersion: 0,
        address: {
          recipientName: 'QA reader',
          phone: '0900123456',
          serviceAreaCode: 'HCM-DEMO-v1',
          localityCode: 'DEMO-A',
          detail: 'QA simulated address',
        },
        makeDefault: true,
      },
      actor,
    ).expect(200);
    return { id: r.body.addressId, version: 1 };
  }
  async function listing(actor: Reader, price = 50000): Promise<Receipt> {
    const book = await post(
      '/catalog/requests',
      {
        metadata: {
          title: `QA book ${randomUUID()}`,
          authors: ['QA author'],
          publisher: null,
          publicationYear: null,
          language: 'vi',
          edition: null,
          category: 'Văn học',
          isbn: null,
        },
      },
      actor,
    ).expect(200);
    await post(
      `/operations/catalog-requests/${book.body.entityId}/decision`,
      {
        expectedVersion: book.body.version,
        revisionId: book.body.revisionId,
        decision: 'Confirm',
      },
      reviewer,
    ).expect(200);
    const origin = await address(actor);
    const content = {
      bookId: book.body.entityId,
      mode: 'Sale',
      condition: 'Good',
      pages: 'Đủ trang',
      coverNote: 'Góc bìa hơi sờn',
      notes: 'Không ghi chú',
      accessories: 'Không có',
      readable: true,
      hasMissingPages: false,
      missingEssentialContent: false,
      description:
        'Sách đã đọc một lần, còn nguyên nội dung và đọc rõ từng trang.',
      salePrice: price,
      exchangeValue: null,
      mediaIds: [] as string[],
      fulfillment: {
        originAddressId: origin.id,
        originAddressVersion: 1,
        method: 'DirectDelivery',
      },
    };
    const created = await post('/listings', { content }, actor).expect(200);
    const now = new Date(),
      mediaId = randomUUID();
    // Ready derivative fixture: this suite does not claim live storage evidence.
    await db.c.listing_media.insertOne({
      _id: mediaId,
      listingId: created.body.entityId,
      version: 1,
      status: 'Ready',
      stagingKey: mediaId,
      pinnedKey: mediaId + '/input',
      derivativeKey: mediaId + '/display.webp',
      mimeType: 'image/jpeg',
      byteSize: 100,
      sha256: 'a'.repeat(64),
      width: 20,
      height: 20,
      failureCode: null,
      expiresAt: new Date(Date.now() + 3600000),
      purgedAt: null,
      reservedBytes: 1000,
      createdAt: now,
      updatedAt: now,
      lockSeq: 0,
    });
    const saved = await request(app.getHttpServer())
      .put(`/api/v1/listings/${created.body.entityId}/draft`)
      .set('Authorization', `Bearer ${actor.token}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        expectedVersion: created.body.version,
        content: { ...content, mediaIds: [mediaId] },
      })
      .expect(200);
    return saved.body;
  }
  const submit = (l: Receipt, actor: Reader, key = randomUUID()) =>
    post(
      `/listings/${l.entityId}/submit`,
      { expectedVersion: l.version, ownershipDeclared: true },
      actor,
      key,
    );
  const decide = (l: Receipt, approved: boolean, key = randomUUID()) =>
    post(
      `/operations/listings/${l.entityId}/decision`,
      {
        expectedVersion: l.version,
        revisionId: l.revisionId,
        decision: approved ? 'Approve' : 'Reject',
        ...(approved
          ? { checklist }
          : { reason: 'Ảnh chưa mô tả rõ tình trạng sách.' }),
      },
      reviewer,
      key,
    );
  async function sale(buyer?: Reader) {
    const seller = await reader();
    buyer ??= await reader();
    await fund(seller, 20000);
    const l = await listing(seller),
      sent = (await submit(l, seller).expect(200)).body;
    const approved = (await decide(sent, true).expect(200)).body;
    const destination = await address(buyer);
    const q = await post(
      `/listings/${l.entityId}/quotes`,
      {
        expectedListingVersion: approved.version,
        expectedListingRevisionId: approved.revisionId,
        destinationAddressId: destination.id,
        expectedDestinationAddressVersion: 1,
        method: 'DirectDelivery',
      },
      buyer,
    ).expect(200);
    return {
      seller,
      buyer,
      l: approved,
      ...await prepareSellerOrder(app, buyer, {
        quoteId: q.body.entityId,
        expectedQuoteVersion: 1,
        expectedListingVersion: approved.version,
        expectedListingRevisionId: approved.revisionId,
      }),
    };
  }
  beforeAll(async () => {
    db = await MongoFixtures.connect();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TransactionPolicy)
      .useValue(
        new TransactionPolicy(
          new ConfigService({
            LISTING_SUBMISSION_FEE_VND: '20000',
            ORDER_CHECKOUT_MODE: 'Wallet',
          }),
        ),
      )
      .overrideProvider(VNPaySandbox)
      .useValue(provider)
      .overrideProvider(MediaStorage)
      .useValue({
        async check() {},
        async put() {},
        async signedRead(key: string) {
          return {
            url: 'https://storage.test/' + key,
            expiresAt: new Date(Date.now() + 120000).toISOString(),
          };
        },
      })
      .compile();
    app = module.createNestApplication();
    app
      .get(ConfigService)
      .set(
        'PAYMENT_SIMULATOR_SECRET',
        'qa-only-carrier-key-not-production-000000000000',
      );
    configureApp(app, { docs: false, logRequests: false });
    await app.init();
    await app.listen(0, '127.0.0.1');
    reviewer = await reader(['ADMIN']);
  }, 60000);
  // Each run uses a dedicated *_test database recreated by the QA harness.
  // Keep complete financial chains until final reconciliation; close all clients.
  afterAll(async () => {
    await app?.close();
    await db?.close();
  });
  afterEach(() => vi.restoreAllMocks());
  function queryReply(
    p: Record<string, string>,
    overrides: Record<string, string> = {},
  ) {
    const data = {
      ...p,
      vnp_ResponseId: randomUUID().replaceAll('-', ''),
      vnp_Command: 'querydr',
      vnp_ResponseCode: '00',
      vnp_Message: 'Success',
      vnp_TransactionType: '01',
      vnp_BankCode: 'NCB',
      vnp_OrderInfo: 'Nap vi',
      ...overrides,
    };
    return {
      ...data,
      vnp_SecureHash: createHmac(
        'sha512',
        'qa-only-vnpay-key-not-production-0000000000',
      )
        .update(
          QUERY_RESPONSE_FIELDS.map(
            (f) => (data as Record<string, string>)[f] ?? '',
          ).join('|'),
        )
        .digest('hex'),
    };
  }
  const query = (id: string, actor?: Reader) => {
    const r = request(app.getHttpServer())
      .post(`/api/v1/me/topups/${id}/vnpay-query`)
      .set('Idempotency-Key', id);
    return actor ? r.set('Authorization', 'Bearer ' + actor.token) : r;
  };
  it('requires the current owner before QueryDR and credits a LOCKED existing obligation once', async () => {
    const owner = await reader(),
      other = await reader(),
      t = await topup(owner, 50000);
    const transport = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(queryReply(callback(t)))));
    await query(t.entityId).expect(401);
    await request(app.getHttpServer())
      .post(`/api/v1/me/topups/${t.entityId}/vnpay-query`)
      .set('Authorization', 'Bearer ' + owner.token)
      .expect(400);
    await query(t.entityId, owner)
      .set('Idempotency-Key', randomUUID())
      .expect(400);
    await query(t.entityId, other).expect(404);
    expect(transport).not.toHaveBeenCalled();
    await db.setStatus(owner.id, 'LOCKED');
    const result = await query(t.entityId, owner).expect(200);
    validates('TopupIntent', result.body);
    expect(result.body).toMatchObject({ state: 'Succeeded', credited: true });
    await query(t.entityId, owner).expect(200);
    expect(transport).toHaveBeenCalledTimes(1);
    expect((await wallet(owner)).available).toBe(50000);
    expect(
      await db.c.ledger_journals.countDocuments({ topupId: t.entityId }),
    ).toBe(1);
    expect(
      await db.c.mutation_receipts.countDocuments({
        topupId: t.entityId,
        operation: 'applyVNPayQuery',
      }),
    ).toBe(1);
  });
  it('leaves the wallet unchanged on forged QueryDR evidence, amount mismatch, pending status and transport failure', async () => {
    const owner = await reader(),
      t = await topup(owner, 50000),
      p = callback(t);
    const transport = vi.spyOn(globalThis, 'fetch');
    transport.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ...queryReply(p), vnp_SecureHash: '0'.repeat(128) }),
      ),
    );
    await query(t.entityId, owner).expect(503);
    transport.mockResolvedValueOnce(
      new Response(JSON.stringify(queryReply(p, { vnp_Amount: '6000000' }))),
    );
    await query(t.entityId, owner).expect(503);
    transport.mockResolvedValueOnce(
      new Response(
        JSON.stringify(queryReply(p, { vnp_TransactionStatus: '01' })),
      ),
    );
    expect((await query(t.entityId, owner).expect(200)).body.state).toBe(
      'Pending',
    );
    transport.mockRejectedValueOnce(new Error('provider unavailable'));
    await query(t.entityId, owner).expect(503);
    expect((await wallet(owner)).available).toBe(0);
    expect(
      await db.c.simulated_payment_events.countDocuments({
        intentId: t.entityId,
      }),
    ).toBe(0);
  });
  it.each(['session', 'role'] as const)(
    'rechecks revoked %s access after the provider responds, before applying credit',
    async (access) => {
      const owner = await reader(),
        t = await topup(owner, 50000);
      let entered!: () => void, release!: () => void;
      const queried = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        entered();
        await gate;
        return new Response(JSON.stringify(queryReply(callback(t))));
      });
      const running = query(t.entityId, owner).then((r) => r);
      await queried;
      try {
        if (access === 'session')
          await db.c.auth_sessions.updateOne(
            { _id: owner.sessionId },
            { $set: { revokedAt: new Date() } },
          );
        else await db.removeRole(owner.id, 'MEMBER');
      } finally {
        release();
      }
      expect((await running).status).toBe(access === 'session' ? 401 : 403);
      expect(
        await db.c.ledger_journals.countDocuments({ topupId: t.entityId }),
      ).toBe(0);
      expect(
        (await db.c.topup_intents.findOne({ _id: t.entityId }))?.state,
      ).toBe('Pending');
    },
  );
  it('serializes competing QueryDR and IPN evidence without crediting twice', async () => {
    const owner = await reader(),
      t = await topup(owner, 50000),
      p = callback(t);
    let entered!: () => void, release!: () => void;
    const queried = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const providerGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      entered();
      await providerGate;
      return new Response(JSON.stringify(queryReply(p)));
    });
    const reconciled = query(t.entityId, owner).then((r) => r);
    await queried;
    const gate = await Gate.lockUser(db.client, owner.id);
    const ipn = get('/payments/vnpay/ipn')
      .query(p)
      .then((r) => r);
    release();
    try {
      await gate.contended(2);
    } finally {
      await gate.close();
    }
    const [q, callbackResult] = await Promise.all([reconciled, ipn]);
    expect(q.status).toBe(200);
    expect(callbackResult.body.RspCode).toBe('00');
    expect((await wallet(owner)).available).toBe(50000);
    expect(
      await db.c.ledger_journals.countDocuments({ topupId: t.entityId }),
    ).toBe(1);
    expect(
      await db.c.vnpay_transactions.countDocuments({ intentId: t.entityId }),
    ).toBe(1);
  });

  it('creates Pending without credit and pins the URL/deadline across lost-ACK retries', async () => {
    const a = await reader(),
      key = randomUUID(),
      t = await topup(a, 50000, key);
    const repeated = await post(
      '/me/topups/vnpay',
      { amount: 50000 },
      a,
      key,
    ).expect(200);
    expect(repeated.headers['idempotency-replayed']).toBe('true');
    expect(repeated.body.paymentUrl).toBe(t.paymentUrl);
    expect(repeated.body.expiresAt).toBe(t.expiresAt);
    expect((await wallet(a)).available).toBe(0);
    await post('/me/topups/vnpay', { amount: 60000 }, a, key).expect(409);
    const other = await reader();
    await get(`/me/topups/${t.entityId}`, other).expect(404);
  });
  it('rejects forged signatures, wrong merchant, wrong amounts and unknown references without credit', async () => {
    const a = await reader(),
      t = await topup(a, 50000),
      p = callback(t);
    expect(
      (
        await get('/payments/vnpay/ipn').query({
          ...p,
          vnp_SecureHash: '0'.repeat(128),
        })
      ).body.RspCode,
    ).toBe('97');
    expect(
      (
        await get('/payments/vnpay/ipn').query(
          callback(t, { vnp_TmnCode: 'OTHERDEM' }),
        )
      ).body.RspCode,
    ).toBe('97');
    expect(
      (
        await get('/payments/vnpay/ipn').query(
          callback(t, { vnp_Amount: '6000000' }),
        )
      ).body.RspCode,
    ).toBe('04');
    expect(
      (
        await get('/payments/vnpay/ipn').query(
          callback(t, { vnp_TxnRef: randomUUID() }),
        )
      ).body.RspCode,
    ).toBe('01');
    expect((await wallet(a)).available).toBe(0);
    expect(
      await db.c.simulated_payment_events.countDocuments({
        intentId: t.entityId,
      }),
    ).toBe(0);
  });
  it('credits a signed callback exactly once under actual concurrent deliveries', async () => {
    const a = await reader(),
      t = await topup(a, 50000),
      p = callback(t),
      gate = await Gate.lockUser(db.client, a.id);
    const first = get('/payments/vnpay/ipn')
        .query(p)
        .then((r) => r),
      second = get('/payments/vnpay/ipn')
        .query(p)
        .then((r) => r);
    try {
      await gate.contended(2);
    } finally {
      await gate.close();
    }
    const rs = await Promise.all([first, second]);
    expect(rs.map((r) => r.body.RspCode).sort()).toEqual(['00', '02']);
    expect((await wallet(a)).available).toBe(50000);
    expect(
      await db.c.ledger_journals.countDocuments({ topupId: t.entityId }),
    ).toBe(1);
  });
  it('denies new topups for LOCKED accounts but applies an already-paid obligation', async () => {
    const a = await reader(),
      t = await topup(a, 50000),
      p = callback(t);
    await db.setStatus(a.id, 'LOCKED');
    await post('/me/topups/vnpay', { amount: 50000 }, a).expect(403);
    expect((await get('/payments/vnpay/ipn').query(p)).body.RspCode).toBe('00');
    expect((await wallet(a)).available).toBe(50000);
  });
  it('keeps failure at zero credit and flags contradictory provider evidence for review', async () => {
    const a = await reader(),
      t = await topup(a, 50000);
    expect(
      (
        await get('/payments/vnpay/ipn').query(
          callback(t, {
            vnp_ResponseCode: '24',
            vnp_TransactionStatus: '02',
            vnp_TransactionNo: '0',
          }),
        )
      ).body.RspCode,
    ).toBe('00');
    expect(
      (await get('/payments/vnpay/ipn').query(callback(t))).body.RspCode,
    ).toBe('00');
    expect((await get(`/me/topups/${t.entityId}`, a)).body).toMatchObject({
      state: 'ReviewRequired',
      credited: false,
    });
    expect((await wallet(a)).available).toBe(0);
  });
  it('rolls back a failed ledger posting and safely retries the same IPN', async () => {
    const a = await reader(),
      t = await topup(a, 50000),
      p = callback(t);
    await db.withRejectingValidator(
      'ledger_entries',
      { debit: 50000 },
      async () => {
        expect((await get('/payments/vnpay/ipn').query(p)).body.RspCode).toBe(
          '99',
        );
      },
    );
    expect((await get(`/me/topups/${t.entityId}`, a)).body).toMatchObject({
      state: 'Pending',
      credited: false,
    });
    expect(
      await db.c.vnpay_transactions.countDocuments({ intentId: t.entityId }),
    ).toBe(0);
    expect((await get('/payments/vnpay/ipn').query(p)).body.RspCode).toBe('00');
    expect((await wallet(a)).available).toBe(50000);
  });
  it('rejects a paid callback outside its checkout window without minting money', async () => {
    const a = await reader(),
      t = await topup(a, 50000);
    expect(
      (
        await get('/payments/vnpay/ipn').query(
          callback(t, { vnp_PayDate: vnDate(new Date(Date.now() + 3600000)) }),
        )
      ).body.RspCode,
    ).toBe('00');
    expect((await get(`/me/topups/${t.entityId}`, a)).body).toMatchObject({
      state: 'ReviewRequired',
      credited: false,
    });
  });
  it('does not submit or freeze a draft when the seller cannot pay 20000 VND', async () => {
    const a = await reader(),
      l = await listing(a);
    await submit(l, a).expect(409);
    expect(await db.c.listings.findOne({ _id: l.entityId })).toMatchObject({
      moderation: 'Draft',
      version: l.version,
    });
    expect(
      await db.c.listing_revisions.findOne({ _id: l.revisionId }),
    ).toMatchObject({ submittedAt: null });
    expect(
      await db.c.listing_fees.countDocuments({ listingId: l.entityId }),
    ).toBe(0);
  });
  it('requires current auth before topup replay and rejects revoked sessions', async () => {
    const a = await reader(),
      key = randomUUID();
    await topup(a, 50000, key);
    await db.c.auth_sessions.updateOne(
      { _id: a.sessionId },
      { $set: { revokedAt: new Date() }, $inc: { lockSeq: 1 } },
    );
    await post('/me/topups/vnpay', { amount: 50000 }, a, key).expect(401);
  });
  it('records a second distinct successful charge as review evidence, without a second credit', async () => {
    const a = await reader(),
      t = await topup(a, 50000),
      p = callback(t);
    expect((await get('/payments/vnpay/ipn').query(p)).body.RspCode).toBe('00');
    expect(
      (await get('/payments/vnpay/ipn').query(callback(t))).body.RspCode,
    ).toBe('00');
    expect((await get(`/me/topups/${t.entityId}`, a)).body).toMatchObject({
      state: 'ReviewRequired',
      credited: true,
    });
    expect((await wallet(a)).available).toBe(50000);
  });
  it('charges once, refunds on rejection once, and charges a new rejected resubmission', async () => {
    const a = await reader();
    await fund(a, 20000);
    const l = await listing(a),
      key = randomUUID();
    const sent = (await submit(l, a, key).expect(200)).body;
    await submit(l, a, key).expect(200);
    expect(await wallet(a)).toMatchObject({
      available: 0,
      transactionHeld: 20000,
      total: 20000,
    });
    const rejectKey = randomUUID(),
      rejected = (await decide(sent, false, rejectKey).expect(200)).body;
    await decide(sent, false, rejectKey).expect(200);
    expect(await wallet(a)).toMatchObject({
      available: 20000,
      transactionHeld: 0,
    });
    const again = (await submit(rejected, a).expect(200)).body;
    expect(again.revisionId).not.toBe(sent.revisionId);
    expect(await wallet(a)).toMatchObject({
      available: 0,
      transactionHeld: 20000,
    });
    await decide(again, false).expect(200);
  });
  it('serializes competing approval and rejection with exactly one fee outcome', async () => {
    const a = await reader();
    await fund(a, 20000);
    const l = await listing(a),
      sent = (await submit(l, a).expect(200)).body;
    const gate = await Gate.lockUser(db.client, a.id),
      first = decide(sent, true).then((r) => r),
      second = decide(sent, false).then((r) => r);
    try {
      await gate.contended(2);
    } finally {
      await gate.close();
    }
    expect(
      (await Promise.all([first, second])).map((r) => r.status).sort(),
    ).toEqual([200, 409]);
    expect(
      await db.c.ledger_journals.countDocuments({
        listingFeeId: sent.revisionId,
      }),
    ).toBe(2);
    expect((await wallet(a)).transactionHeld).toBe(0);
  });
  it('creates an unpaid Seller order and refuses underfunded Buyer payment without a hold', async () => {
    const f = await sale();
    await fund(f.buyer, 50000);
    const created = (await post('/orders', f.body, f.seller).expect(200)).body;
    expect(created).toMatchObject({ state: 'AwaitingPayment', version: 1 });
    await post(`/orders/${created.entityId}/pay`, { expectedVersion: 1 }, f.buyer).expect(409);
    expect(await db.c.direct_orders.findOne({ _id: created.entityId })).toMatchObject({ state: 'AwaitingPayment' });
    expect((await wallet(f.buyer))).toMatchObject({ available: 50000, transactionHeld: 0 });
    expect(await db.c.ledger_journals.countDocuments({ orderId: created.entityId })).toBe(0);
    expect(await db.c.exclusive_commitments.countDocuments({ listingId: f.l.entityId, status: 'Active' })).toBe(1);
  });
  it('holds P+S only on Buyer payment, replays each command and refunds a legal cancellation', async () => {
    const f = await sale();
    await fund(f.buyer, 80000);
    const key = randomUUID(), r = await post('/orders', f.body, f.seller, key).expect(200);
    validates('TransactionCommandReceipt', r.body);
    expect(r.body).toMatchObject({ state: 'AwaitingPayment', version: 1 });
    expect((await post('/orders', f.body, f.seller, key).expect(200)).body).toEqual(r.body);
    expect(await wallet(f.buyer)).toMatchObject({ available: 80000, transactionHeld: 0 });
    const payKey = randomUUID();
    const paid = await post(`/orders/${r.body.entityId}/pay`, { expectedVersion: 1 }, f.buyer, payKey).expect(200);
    expect(paid.body).toMatchObject({ state: 'PendingSellerConfirmation', version: 2 });
    expect((await post(`/orders/${r.body.entityId}/pay`, { expectedVersion: 1 }, f.buyer, payKey).expect(200)).body).toEqual(paid.body);
    expect(await wallet(f.buyer)).toMatchObject({ available: 0, transactionHeld: 80000 });
    await post(`/orders/${r.body.entityId}/cancel-paid`, { expectedVersion: 2 }, f.buyer).expect(200);
    await app.get(OrdersService).refund(r.body.entityId);
    expect(await wallet(f.buyer)).toMatchObject({ available: 80000, transactionHeld: 0 });
    expect(await db.c.ledger_journals.countDocuments({ orderId: r.body.entityId, type: 'OrderPayment' })).toBe(1);
  });
  it.each([40000, 70000])('funds and refunds the agreed price %i rather than the listing price', async (agreedBookPrice) => {
    const f = await sale();
    f.body.agreedBookPrice = agreedBookPrice;
    await fund(f.buyer, 200000);
    const created = (await post('/orders', f.body, f.seller).expect(200)).body;
    const before = (await get(`/me/orders/${created.entityId}`, f.buyer).expect(200)).body;
    expect(before.amounts.bookPrice).toBe(agreedBookPrice);
    expect(before.amounts.buyerTotal).toBe(agreedBookPrice + 30000);
    await post(`/orders/${created.entityId}/pay`, { expectedVersion: 1 }, f.buyer).expect(200);
    expect(await wallet(f.buyer)).toMatchObject({ available: 200000 - agreedBookPrice - 30000, transactionHeld: agreedBookPrice + 30000 });
    await post(`/orders/${created.entityId}/cancel-paid`, { expectedVersion: 2 }, f.buyer).expect(200);
    await app.get(OrdersService).refund(created.entityId);
    expect(await wallet(f.buyer)).toMatchObject({ available: 200000, transactionHeld: 0 });
  });
  it('allows only one competing Buyer payment to spend a shared available balance', async () => {
    const buyer = await reader(), f1 = await sale(buyer);
    const seller = await reader();
    await fund(seller, 20000);
    const l = await listing(seller), sent = (await submit(l, seller).expect(200)).body;
    const approved = (await decide(sent, true).expect(200)).body;
    const destination = (await get('/me/addresses', buyer)).body.items[0];
    const q = await post(`/listings/${l.entityId}/quotes`, {
      expectedListingVersion: approved.version, expectedListingRevisionId: approved.revisionId,
      destinationAddressId: destination.id, expectedDestinationAddressVersion: destination.version, method: 'DirectDelivery',
    }, buyer).expect(200);
    const p2 = await prepareSellerOrder(app, buyer, { quoteId: q.body.entityId, expectedQuoteVersion: 1,
      expectedListingVersion: approved.version, expectedListingRevisionId: approved.revisionId });
    const first = (await post('/orders', f1.body, f1.seller).expect(200)).body;
    const second = (await post('/orders', p2.body, seller).expect(200)).body;
    await fund(buyer, 80000);
    const gate = await Gate.lockUser(db.client, buyer.id),
      a = post(`/orders/${first.entityId}/pay`, { expectedVersion: 1 }, buyer).then((r) => r),
      b = post(`/orders/${second.entityId}/pay`, { expectedVersion: 1 }, buyer).then((r) => r);
    try { await gate.contended(2); } finally { await gate.close(); }
    expect((await Promise.all([a, b])).map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await wallet(buyer)).toMatchObject({ available: 0, transactionHeld: 80000 });
  });
  it('keeps money held through delivery and settles to the seller once after 72h inspection', async () => {
    const f = await sale();
    f.body.agreedBookPrice = 40000;
    await fund(f.buyer, 70000);
    const created = (await post('/orders', f.body, f.seller).expect(200)).body,
      id = created.entityId;
    await post(`/orders/${id}/pay`, { expectedVersion: 1 }, f.buyer).expect(200);
    await post(`/orders/${id}/accept`, { expectedVersion: 2 }, f.seller).expect(
      200,
    );
    const bytes = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#58685E' },
    })
      .png()
      .toBuffer();
    const evidence = (
      await post(
        `/orders/${id}/packaging-evidence`,
        {
          expectedVersion: 3,
          mimeType: 'image/png',
          byteSize: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        },
        f.seller,
      ).expect(200)
    ).body;
    await request(app.getHttpServer())
      .put(
        `/api/v1/orders/${id}/packaging-evidence/${evidence.entityId}/content`,
      )
      .set('Authorization', `Bearer ${f.seller.token}`)
      .set('Idempotency-Key', randomUUID())
      .set('Content-Type', 'image/png')
      .send(bytes)
      .expect(200);
    const trackingCode = 'LL-' + randomUUID().replaceAll('-', '').toUpperCase();
    const shipment = (
      await post(
        `/orders/${id}/shipment`,
        {
          expectedOrderVersion: 3,
          carrier: 'LatLaiSimulator',
          trackingCode,
          packagingEvidenceIds: [evidence.entityId],
        },
        f.seller,
      ).expect(200)
    ).body;
    const operator = await reader(['TEST_OPERATOR']),
      eventId = randomUUID();
    await post(
      '/operations/simulator/pickup-events',
      {
        eventId,
        shipmentId: shipment.entityId,
        orderId: id,
        carrier: 'LatLaiSimulator',
        trackingCode,
        type: 'PickedUp',
        occurredAt: new Date().toISOString(),
      },
      operator,
      eventId,
    ).expect(200);
    await post(
      `/orders/${id}/confirm-receipt`,
      { expectedVersion: 4 },
      f.buyer,
    ).expect(200);
    expect(await wallet(f.buyer)).toMatchObject({
      available: 0,
      transactionHeld: 70000,
    });
    expect((await wallet(f.seller)).available).toBe(0);
    await expect(app.get(OrdersService).settle(id)).rejects.toMatchObject({
      status: 409,
    });
    const order = await db.c.direct_orders.findOne({ _id: id });
    const clock = vi
      .spyOn(app.get(OrderClock), 'now')
      .mockResolvedValue(new Date(order!.inspectionDeadline!.getTime() + 1));
    try {
      await app.get(OrdersService).settle(id);
      await app.get(OrdersService).settle(id);
    } finally {
      clock.mockRestore();
    }
    expect(await wallet(f.buyer)).toMatchObject({
      available: 0,
      transactionHeld: 0,
    });
    // 40000 - 5% commission + 30000 advanced shipping reimbursement.
    expect((await wallet(f.seller)).available).toBe(68000);
    expect(
      await db.c.ledger_journals.countDocuments({
        orderId: id,
        type: 'OrderSettlement',
      }),
    ).toBe(1);
    expect(await db.c.listings.findOne({ _id: f.l.entityId })).toMatchObject({
      trade: 'Sold',
    });
  });
  it('reconciles all immutable journals, fees, callbacks and finite simulator capital', async () => {
    const result = await app
      .get(MongoService)
      .tx((tx) => app.get(LedgerService).reconcile(tx));
    expect(result.balanced).toBe(true);
  });
});
