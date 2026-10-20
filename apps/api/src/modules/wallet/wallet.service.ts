import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { Document } from 'mongodb';
import type { TopupIntentDoc } from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import {
  MongoCommandService,
  canonicalJson,
  member,
  requireActive,
  type Actor,
  type CommandContext,
  type WalletChange,
} from '../commands/mongo-command.service.js';
import { DomainError, notFound, type Wire } from '../commands/domain-error.js';
import { checkTopupRecord, LedgerService } from './ledger.service.js';
import { PaymentSimulator } from './payment-simulator.js';
import {
  VNPaySandbox,
  VNPayCallbackError,
  parseVNDate,
} from './vnpay-sandbox.js';
import { TransactionPolicy } from './transaction-policy.js';
import { WalletClock } from './wallet-clock.js';
import { expiredVNPayCandidates } from './wallet-expiry-candidates.js';

const DEMO = {
  demoOnly: true,
  label: 'Mô phỏng đồ án',
  currency: 'VND',
} as const;
type Query = Record<string, string | number>;
@Injectable()
export class WalletService {
  constructor(
    private readonly commands: MongoCommandService,
    private readonly ledger: LedgerService,
    private readonly simulator: PaymentSimulator,
    private readonly vnpay: VNPaySandbox,
    private readonly policy: TransactionPolicy,
    private readonly clock: WalletClock,
  ) {}
  private async session(tx: Tx, auth: Actor, now: Date) {
    const session = await tx.c.auth_sessions.findOne({ _id: auth.sessionId });
    if (!session || session.revokedAt || session.expiresAt <= now)
      throw new DomainError(
        401,
        'SESSION_EXPIRED',
        'Phiên đăng nhập đã hết hạn.',
      );
  }
  private async owned(tx: Tx, id: string, ownerId?: string) {
    const intent = await tx.c.topup_intents.findOne({
      _id: id.toLowerCase(),
      ...(ownerId ? { ownerId } : {}),
    });
    if (!intent) throw notFound();
    return intent;
  }
  private async project(
    tx: Tx,
    intent: TopupIntentDoc,
  ): Promise<Wire['TopupIntent']> {
    const journal = await tx.c.ledger_journals.findOne({ topupId: intent._id });
    const payment = await tx.c.vnpay_payments.findOne({ _id: intent._id });
    return {
      ...DEMO,
      id: intent._id,
      version: intent.version,
      amount: intent.amount,
      state: intent.state as Wire['TopupIntent']['state'],
      credited: !!journal,
      journalId: journal?._id ?? null,
      createdAt: intent.createdAt.toISOString(),
      updatedAt: intent.updatedAt.toISOString(),
      expiresAt: payment?.expiresAt.toISOString() ?? null,
      serverTime: (await this.clock.now(tx)).toISOString(),
    };
  }
  private async change(
    tx: Tx,
    intent: TopupIntentDoc,
    now: Date,
  ): Promise<WalletChange> {
    const value = await this.project(tx, intent);
    tx.check(`topup:${intent._id}`, () => checkTopupRecord(tx, intent._id));
    return {
      entityType: 'TopupIntent',
      entityId: intent._id,
      version: value.version,
      state: value.state,
      journalId: value.journalId,
      credited: value.credited,
      decidedAt: now,
      event: 'wallet.topupChanged',
    };
  }
  summary(auth: Actor): Promise<Wire['WalletSummary']> {
    return this.commands.readObligation(auth, async (tx, actor) => {
      member(actor);
      const available = await this.ledger.available(tx, actor._id);
      const transactionHeld = await this.ledger.held(tx, actor._id);
      const now = await tx.now();
      await this.session(tx, auth, now);
      return {
        ...DEMO,
        available,
        total: available + transactionHeld,
        transactionHeld,
        withdrawalHeld: 0,
        serverTime: now.toISOString(),
        topupEnabled:
          actor.status !== 'LOCKED' &&
          (this.simulator.enabled() || this.vnpay.enabled()),
        paymentsEnabled: actor.status !== 'LOCKED',
        withdrawalsEnabled: false,
        listingSubmissionFee: this.policy.listingFee,
        atomicCheckout: this.policy.atomicCheckout,
        vnpayEnabled: actor.status !== 'LOCKED' && this.vnpay.enabled(),
      };
    });
  }
  async create(
    context: CommandContext,
    body: Wire['CreateTopupIntent'],
    provider: 'Simulator' | 'VNPay' = 'Simulator',
    ip = '127.0.0.1',
  ) {
    await this.expireOwned(context.auth);
    const operation =
      provider === 'VNPay' ? 'createVNPayTopup' : 'createTopupIntent';
    return this.commands.runWallet(context, operation, null, body, {
      authorize: async (tx, actor) => {
        member(actor);
        if (
          !(provider === 'VNPay'
            ? this.vnpay.enabled()
            : this.simulator.enabled())
        )
          throw new DomainError(
            503,
            'UNAVAILABLE',
            'Bộ nạp mô phỏng chưa được bật.',
          );
        await this.session(tx, context.auth, await tx.now());
      },
      mutate: async (tx, actor, _before, receiptId) => {
        const open = await tx.c.topup_intents.countDocuments({
          ownerId: actor._id,
          state: { $in: ['Pending', 'Processing', 'ReviewRequired'] },
        });
        if (open >= 10)
          throw new DomainError(
            409,
            'InvalidState',
            'Bạn đã có 10 yêu cầu nạp chưa hoàn tất.',
          );
        const now = await tx.now();
        await this.session(tx, context.auth, now);
        const intent: TopupIntentDoc = {
          _id: randomUUID(),
          ownerId: actor._id,
          amount: body.amount,
          currency: 'VND',
          state: 'Pending',
          version: 1,
          createdAt: now,
          updatedAt: now,
          lockSeq: 0,
        };
        await tx.c.topup_intents.insertOne(intent);
        if (provider === 'VNPay') {
          if (body.amount < 5000)
            throw new DomainError(
              400,
              'VALIDATION_ERROR',
              'VNPay yêu cầu nạp ít nhất 5.000đ.',
            );
          const expiresAt = new Date(now.getTime() + 5 * 60000);
          const checkout = this.vnpay.checkout(
            intent._id,
            intent.amount,
            now,
            expiresAt,
            ip,
          );
          await tx.c.vnpay_payments.insertOne({
            _id: intent._id,
            ...checkout,
            createdAt: now,
            expiresAt,
            receiptId,
          });
          return {
            ...(await this.change(tx, intent, now)),
            paymentUrl: checkout.paymentUrl,
            expiresAt,
          };
        }
        return this.change(tx, intent, now);
      },
    });
  }
  async receiveVNPay(
    raw: unknown,
  ): Promise<{ RspCode: string; Message: string }> {
    try {
      return await this.applyVerifiedVNPay(this.vnpay.verify(raw));
    } catch (error) {
      if (error instanceof VNPayCallbackError)
        return { RspCode: error.code, Message: error.message };
      if (error instanceof DomainError && error.getStatus() === 404)
        return { RspCode: '01', Message: 'Order not found' };
      return { RspCode: '99', Message: 'Processing error; retry callback' };
    }
  }

  async queryVNPay(auth: Actor, id: string) {
    await this.expireOwned(auth, id);
    const snapshot = await this.commands.readObligation(
      auth,
      async (tx, actor) => {
        member(actor);
        const intent = await this.owned(tx, id, actor._id);
        const payment = await tx.c.vnpay_payments.findOne({ _id: intent._id });
        if (!payment) throw notFound();
        return { intent, payment };
      },
    );
    if (
      ['Pending', 'Processing', 'Cancelled'].includes(snapshot.intent.state)
    ) {
      let evidence: Record<string, string> | null;
      try {
        evidence = await this.vnpay.queryPayment({
          id: snapshot.intent._id,
          tmnCode: snapshot.payment.tmnCode,
          amount: snapshot.intent.amount,
          createdAt: snapshot.payment.createdAt,
        });
      } catch (error) {
        // Cancellation is already durable. A reconciliation outage must not
        // obscure it; later QueryDR/IPN can still apply timely verified payment.
        if (snapshot.intent.state !== 'Cancelled') throw error;
        return this.read(auth, id);
      }
      if (evidence) await this.applyVerifiedVNPay(evidence, auth);
    }
    return this.read(auth, id);
  }

  private async applyVerifiedVNPay(
    p: Record<string, string>,
    queryingActor?: Actor,
  ) {
    const operation = queryingActor ? 'applyVNPayQuery' : 'applyVNPayIpn';
    const id = p.vnp_TxnRef;
    const amount = Number(p.vnp_Amount) / 100;
    const outcome =
      p.vnp_ResponseCode === '00' && p.vnp_TransactionStatus === '00'
        ? 'Succeeded'
        : 'Failed';
    let paidAt: Date | null = null;
    if (p.vnp_PayDate) paidAt = parseVNDate(p.vnp_PayDate);
    if (outcome === 'Succeeded' && (!paidAt || p.vnp_TransactionNo === '0'))
      throw new VNPayCallbackError('97', 'Missing transaction evidence');
    const body = {
      id,
      amount,
      outcome,
      transactionNo: p.vnp_TransactionNo,
      payDate: p.vnp_PayDate ?? '',
      responseCode: p.vnp_ResponseCode,
      transactionStatus: p.vnp_TransactionStatus,
    };
    const hash = createHash('sha256')
      .update(
        canonicalJson(
          queryingActor ? { ...body, evidenceSource: 'QueryDR' } : body,
        ),
      )
      .digest('hex');
    const eventId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
    const result = await this.commands.runVNPay(
      eventId,
      id,
      body,
      {
        discover: async (tx) => [(await this.owned(tx, id)).ownerId],
        authorize: async (tx) => {
          // The provider call occurs outside a transaction. Recheck the current
          // owner, role and session under locks before mutation or replay.
          if (queryingActor) {
            const actor = await this.commands.actor(
              tx,
              queryingActor,
              [],
              'ExistingObligation',
            );
            member(actor);
            await this.owned(tx, id, actor._id);
            await this.session(tx, queryingActor, await tx.now());
          }
          const intent = await this.owned(tx, id);
          const payment = await tx.c.vnpay_payments.findOne({ _id: id });
          if (!payment || payment.tmnCode !== p.vnp_TmnCode) throw notFound();
          if (intent.amount !== amount)
            throw new VNPayCallbackError('04', 'Amount mismatch');
          await tx.lock('topup_intents', [id]);
          return { intent: await this.owned(tx, id), payment };
        },
        mutate: async (tx, { intent, payment }, receiptId) => {
          // Provider transaction identity spans topups; a paid transaction cannot
          // credit another wallet. Global lock serializes competing callbacks.
          await tx.c.command_locks.updateOne(
            {
              _id: createHash('sha256')
                .update(`vnpay-transaction:${p.vnp_TransactionNo}`)
                .digest('hex'),
            },
            {
              $inc: { lockSeq: 1 },
              $set: { expiresAt: new Date(Date.now() + 7 * 86400000) },
            },
            { upsert: true },
          );
          const transaction = await tx.c.vnpay_transactions.findOne({
            _id: p.vnp_TransactionNo,
          });
          if (transaction && transaction.intentId !== id)
            throw new VNPayCallbackError(
              '97',
              'Transaction reference mismatch',
            );
          const priorTransaction = await tx.c.vnpay_transactions.findOne({
            intentId: id,
          });
          if (
            (await tx.c.simulated_payment_events.countDocuments({
              intentId: id,
            })) >= 128
          )
            throw new DomainError(
              503,
              'UNAVAILABLE',
              'Cần đối soát yêu cầu nạp ví.',
            );
          const accountId =
            outcome === 'Succeeded' &&
            ['Pending', 'Processing', 'Cancelled'].includes(intent.state)
              ? await this.ledger.lockFunding(tx, intent.ownerId)
              : null;
          const now = await this.clock.now(tx);
          // A delayed IPN can fund its wallet, but success outside the pinned
          // checkout interval is held for review. Whole-second provider dates.
          const occurredAt = paidAt ?? payment.createdAt;
          const mismatch =
            occurredAt.getTime() <
              Math.floor(payment.createdAt.getTime() / 1000) * 1000 ||
            occurredAt.getTime() >=
              Math.floor(payment.expiresAt.getTime() / 1000) * 1000 ||
            occurredAt.getTime() > now.getTime() + 300000 ||
            (transaction &&
              transaction.payDate.getTime() !== occurredAt.getTime());
          const contradiction =
            (intent.state === 'Succeeded' &&
              (outcome === 'Failed' ||
                priorTransaction?._id !== p.vnp_TransactionNo)) ||
            (intent.state === 'Failed' && outcome === 'Succeeded');
          let next = intent.state;
          let disposition: 'Applied' | 'Ignored' | 'ReviewRequired' = 'Ignored';
          if (mismatch || contradiction || intent.state === 'ReviewRequired') {
            next = 'ReviewRequired';
            disposition = 'ReviewRequired';
          } else if (
            ['Pending', 'Processing'].includes(intent.state) ||
            (intent.state === 'Cancelled' && outcome === 'Succeeded')
          ) {
            next = outcome;
            disposition = 'Applied';
          }
          await tx.c.simulated_payment_events.insertOne({
            _id: eventId,
            intentId: id,
            provider: 'VNPaySandbox-v1',
            payloadHash: hash,
            recipientId: intent.ownerId,
            amount,
            currency: 'VND',
            outcome,
            disposition,
            occurredAt,
            receivedAt: now,
            receiptId,
          });
          const updated = await tx.c.topup_intents.findOneAndUpdate(
            { _id: id, version: intent.version },
            { $set: { state: next, updatedAt: now }, $inc: { version: 1 } },
            { returnDocument: 'after' },
          );
          if (disposition === 'Applied' && next === 'Succeeded') {
            await tx.c.vnpay_transactions.insertOne({
              _id: p.vnp_TransactionNo,
              intentId: id,
              eventId,
              payDate: occurredAt,
            });
            await this.ledger.postTopup(tx, intent, accountId!, eventId, now);
          }
          if (queryingActor)
            await this.session(tx, queryingActor, await tx.now());
          return this.change(tx, updated!, now);
        },
      },
      operation,
    );
    return {
      RspCode: result.replayed ? '02' : '00',
      Message: result.replayed ? 'Already confirmed' : 'Confirm Success',
    };
  }
  async read(auth: Actor, id: string) {
    await this.expireOwned(auth, id);
    return this.commands.readObligation(auth, async (tx, actor) => {
      member(actor);
      return this.project(tx, await this.owned(tx, id, actor._id));
    });
  }
  private range(q: Query) {
    if (q.from && q.to && new Date(String(q.from)) > new Date(String(q.to)))
      throw new DomainError(
        400,
        'VALIDATION_ERROR',
        'Khoảng thời gian không hợp lệ.',
      );
    return {
      ...(q.from ? { $gte: new Date(String(q.from)) } : {}),
      ...(q.to ? { $lte: new Date(String(q.to)) } : {}),
    };
  }
  async list(auth: Actor, q: Query): Promise<Wire['TopupPage']> {
    await this.expireOwned(auth);
    return this.commands.readObligation(auth, async (tx, actor) => {
      member(actor);
      const range = this.range(q);
      const cursor = q.cursor
        ? await this.owned(tx, String(q.cursor), actor._id)
        : null;
      const rows = await tx.c.topup_intents
        .find(
          {
            ownerId: actor._id,
            ...(Object.keys(range).length ? { createdAt: range } : {}),
            ...(q.state
              ? { state: String(q.state) as TopupIntentDoc['state'] }
              : {}),
            ...(cursor
              ? {
                  $or: [
                    { createdAt: { $lt: cursor.createdAt } },
                    { createdAt: cursor.createdAt, _id: { $lt: cursor._id } },
                  ],
                }
              : {}),
          },
          { sort: { createdAt: -1, _id: -1 }, limit: Number(q.limit) + 1 },
        )
        .toArray();
      const more = rows.length > Number(q.limit);
      if (more) rows.pop();
      const items = [];
      for (const row of rows) items.push(await this.project(tx, row));
      return { items, nextCursor: more ? rows.at(-1)!._id : null };
    });
  }
  private async expireOwned(auth: Actor, id?: string) {
    const candidates = await this.commands.readObligation(
      auth,
      async (tx, actor) => {
        member(actor);
        if (id) await this.owned(tx, id, actor._id);
        return expiredVNPayCandidates(
          tx,
          await this.clock.now(tx),
          actor._id,
          id,
        );
      },
    );
    for (const candidate of candidates) {
      try {
        await this.expireVNPay(candidate._id);
      } catch (error) {
        // A verified payment may win after discovery and before the deadline command.
        if (!(error instanceof DomainError && error.getStatus() === 409))
          throw error;
      }
    }
  }

  // Internal deadline command, shared by the durable worker and owner read catch-up.
  // No browser flag, financial journal, provider call or balance change is involved.
  expireVNPay(id: string) {
    return this.commands.runVNPay(
      id,
      id,
      {},
      {
        discover: async (tx) => [(await this.owned(tx, id)).ownerId],
        authorize: async (tx) => {
          await tx.lock('topup_intents', [id]);
          const intent = await this.owned(tx, id);
          const payment = await tx.c.vnpay_payments.findOne({ _id: id });
          if (!payment) throw notFound();
          return { intent, payment };
        },
        mutate: async (tx, { intent, payment }, receiptId) => {
          const now = await this.clock.now(tx);
          if (
            !['Pending', 'Processing'].includes(intent.state) ||
            now < payment.expiresAt
          )
            throw new DomainError(
              409,
              'InvalidState',
              'Yêu cầu nạp chưa đến hạn hủy hoặc đã hoàn tất.',
            );
          await tx.c.simulated_payment_events.insertOne({
            _id: randomUUID(),
            intentId: id,
            provider: 'VNPayExpiry-v1',
            payloadHash: createHash('sha256')
              .update(
                canonicalJson({
                  id,
                  expiresAt: payment.expiresAt.toISOString(),
                }),
              )
              .digest('hex'),
            recipientId: intent.ownerId,
            amount: intent.amount,
            currency: intent.currency,
            outcome: 'Failed',
            disposition: 'Applied',
            occurredAt: payment.expiresAt,
            receivedAt: now,
            receiptId,
          });
          const updated = await tx.c.topup_intents.findOneAndUpdate(
            { _id: id, version: intent.version, state: intent.state },
            {
              $set: { state: 'Cancelled', updatedAt: now },
              $inc: { version: 1 },
            },
            { returnDocument: 'after' },
          );
          return this.change(tx, updated!, now);
        },
      },
      'expireVNPayTopup',
    );
  }
  history(auth: Actor, q: Query): Promise<Wire['WalletHistoryPage']> {
    return this.commands.readObligation(auth, async (tx, actor) => {
      member(actor);
      this.range(q);
      const account = await tx.c.wallet_accounts.findOne({
        ownerId: actor._id,
      });
      const cursor = q.cursor
        ? await tx.c.ledger_journals.findOne({
            _id: String(q.cursor).toLowerCase(),
          })
        : null;
      if (
        q.cursor &&
        (!cursor ||
          !account ||
          !(await tx.c.ledger_entries.findOne({
            journalId: cursor._id,
            accountId: account._id,
          })))
      )
        throw notFound();
      if (!account) return { items: [], nextCursor: null };
      // Running balance over the posting sequence, then filters (as the SQL CTE).
      const filters: Document = {};
      if (q.from || q.to)
        filters.postedAt = {
          ...(q.from ? { $gte: new Date(String(q.from)) } : {}),
          ...(q.to ? { $lte: new Date(String(q.to)) } : {}),
        };
      if (q.topupId) filters.topupId = String(q.topupId).toLowerCase();
      if (q.orderId) filters.orderId = String(q.orderId).toLowerCase();
      if (q.type) filters.type = String(q.type);
      if (cursor) filters.sequence = { $lt: cursor.sequence };
      const rows = await tx.c.ledger_entries
        .aggregate<{
          _id: string;
          topupId: string | null;
          orderId: string | null;
          type: Wire['WalletHistoryItem']['type'];
          postedAt: Date;
          amount: number;
          balance: number;
        }>([
          { $match: { accountId: account._id } },
          {
            $lookup: {
              from: 'ledger_journals',
              localField: 'journalId',
              foreignField: '_id',
              as: 'j',
            },
          },
          { $unwind: '$j' },
          {
            $project: {
              _id: '$j._id',
              topupId: '$j.topupId',
              orderId: '$j.orderId',
              type: '$j.type',
              sequence: '$j.sequence',
              postedAt: '$j.postedAt',
              amount: { $subtract: ['$debit', '$credit'] },
            },
          },
          {
            $setWindowFields: {
              sortBy: { sequence: 1 },
              output: {
                balance: {
                  $sum: '$amount',
                  window: { documents: ['unbounded', 'current'] },
                },
              },
            },
          },
          { $match: filters },
          { $sort: { sequence: -1 } },
          { $limit: Number(q.limit) + 1 },
        ])
        .toArray();
      const more = rows.length > Number(q.limit);
      if (more) rows.pop();
      return {
        items: rows.map((row) => ({
          ...DEMO,
          journalId: row._id,
          topupId: row.topupId,
          orderId: row.orderId,
          type: row.type,
          amount: row.amount,
          balanceAfter: row.balance,
          postedAt: row.postedAt.toISOString(),
        })),
        nextCursor: more ? rows.at(-1)!._id : null,
      };
    });
  }
  emit(context: CommandContext, body: Wire['SimulatedTopupEvent']) {
    const eventId = body.eventId.toLowerCase();
    return this.commands.runWallet(
      context,
      'emitSimulatedTopupEvent',
      body.intentId,
      body,
      {
        discover: async (tx) => [(await this.owned(tx, body.intentId)).ownerId],
        authorize: async (tx, actor) => {
          requireActive(actor);
          if (!actor.roles.some((role) => role.role === 'TEST_OPERATOR'))
            throw new DomainError(
              403,
              'FORBIDDEN',
              'Cần tài khoản vận hành mô phỏng.',
            );
          const intent = await this.owned(tx, body.intentId);
          if (await tx.c.vnpay_payments.findOne({ _id: intent._id }))
            throw new DomainError(
              403,
              'FORBIDDEN',
              'Yêu cầu VNPay chỉ nhận kết quả đã xác minh từ VNPay.',
            );
          if (intent.ownerId === actor._id)
            throw new DomainError(
              403,
              'FORBIDDEN',
              'Người vận hành không được nạp cho chính mình.',
            );
          // A verified event may complete an existing intent even if its recipient was later locked.
          this.simulator.verify(body, this.simulator.sign(body));
          await tx.lock('topup_intents', [intent._id]);
          await this.session(tx, context.auth, await tx.now());
          return this.owned(tx, intent._id);
        },
        mutate: async (tx, actor, intent, receiptId) => {
          // Global provider event identity spans HTTP keys and test operators
          // (the former advisory lock on 'payment-event:<id>').
          await tx.c.command_locks.updateOne(
            {
              _id: createHash('sha256')
                .update(canonicalJson(['payment-event', eventId]))
                .digest('hex'),
            },
            {
              $inc: { lockSeq: 1 },
              $set: { expiresAt: new Date(Date.now() + 7 * 86_400_000) },
            },
            { upsert: true },
          );
          const payloadHash = createHash('sha256')
            .update(canonicalJson(body))
            .digest('hex');
          const old = await tx.c.simulated_payment_events.findOne({
            _id: eventId,
          });
          if (old) {
            if (old.payloadHash !== payloadHash)
              throw new DomainError(
                409,
                'IdempotencyConflict',
                'Mã sự kiện đã được dùng cho nội dung khác.',
              );
            const now = await tx.now();
            await this.session(tx, context.auth, now);
            return this.change(tx, intent, now);
          }
          let accountId: string | null = null;
          if (
            body.outcome === 'Succeeded' &&
            ['Pending', 'Processing'].includes(intent.state)
          )
            accountId = await this.ledger.lockFunding(tx, intent.ownerId);
          const now = await tx.now();
          await this.session(tx, context.auth, now);
          const occurredAt = new Date(body.occurredAt);
          const mismatch =
            body.recipientId !== intent.ownerId ||
            body.amount !== intent.amount ||
            body.currency !== intent.currency ||
            occurredAt < intent.createdAt ||
            occurredAt.getTime() > now.getTime() + 300000;
          const contradiction =
            (intent.state === 'Succeeded' && body.outcome === 'Failed') ||
            (intent.state === 'Failed' && body.outcome === 'Succeeded');
          let next: TopupIntentDoc['state'] = intent.state,
            disposition: 'Applied' | 'Ignored' | 'ReviewRequired' = 'Ignored';
          if (mismatch || contradiction || intent.state === 'ReviewRequired') {
            next = 'ReviewRequired';
            disposition = 'ReviewRequired';
          } else if (['Pending', 'Processing'].includes(intent.state)) {
            next = body.outcome;
            disposition = 'Applied';
          }
          await tx.c.simulated_payment_events.insertOne({
            _id: eventId,
            intentId: intent._id,
            provider: 'LatLaiSimulator-v1',
            payloadHash,
            recipientId: body.recipientId.toLowerCase(),
            amount: body.amount,
            currency: body.currency,
            outcome: body.outcome,
            disposition,
            occurredAt,
            receivedAt: now,
            receiptId,
          });
          // Transition guard (latlai_topup_transition): terminal states only
          // move to ReviewRequired; the version advances once.
          const updated = await tx.c.topup_intents.findOneAndUpdate(
            { _id: intent._id, version: intent.version },
            { $set: { state: next, updatedAt: now }, $inc: { version: 1 } },
            { returnDocument: 'after' },
          );
          if (disposition === 'Applied' && next === 'Succeeded')
            await this.ledger.postTopup(tx, intent, accountId!, eventId, now);
          return this.change(tx, updated!, now);
        },
      },
    );
  }
}
