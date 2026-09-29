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
        topupEnabled: actor.status !== 'LOCKED' && this.simulator.enabled(),
        paymentsEnabled: actor.status !== 'LOCKED',
        withdrawalsEnabled: false,
      };
    });
  }
  create(context: CommandContext, body: Wire['CreateTopupIntent']) {
    return this.commands.runWallet(context, 'createTopupIntent', null, body, {
      authorize: async (tx, actor) => {
        member(actor);
        if (!this.simulator.enabled())
          throw new DomainError(
            503,
            'UNAVAILABLE',
            'Bộ nạp mô phỏng chưa được bật.',
          );
        await this.session(tx, context.auth, await tx.now());
      },
      mutate: async (tx, actor) => {
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
        return this.change(tx, intent, now);
      },
    });
  }
  read(auth: Actor, id: string) {
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
  list(auth: Actor, q: Query): Promise<Wire['TopupPage']> {
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
