import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, type TopupIntent } from '../../generated/prisma/client.js';
import {
  CommandService,
  canonicalJson,
  member,
  requireActive,
  type Actor,
  type CommandContext,
  type Tx,
  type WalletChange,
} from '../commands/command.service.js';
import { DomainError, notFound, type Wire } from '../commands/domain-error.js';
import { LedgerService } from './ledger.service.js';
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
    private readonly commands: CommandService,
    private readonly ledger: LedgerService,
    private readonly simulator: PaymentSimulator,
  ) {}
  private async now(tx: Tx) {
    const [r] = await tx.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AS now`;
    return r.now;
  }
  private async session(tx: Tx, auth: Actor, now: Date) {
    const session = await tx.authSession.findUnique({
      where: { id: auth.sessionId },
    });
    if (!session || session.revokedAt || session.expiresAt <= now)
      throw new DomainError(
        401,
        'SESSION_EXPIRED',
        'Phiên đăng nhập đã hết hạn.',
      );
  }
  private async owned(tx: Tx, id: string, ownerId?: string) {
    const intent = await tx.topupIntent.findFirst({
      where: { id, ...(ownerId ? { ownerId } : {}) },
    });
    if (!intent) throw notFound();
    return intent;
  }
  private async project(
    tx: Tx,
    intent: TopupIntent,
  ): Promise<Wire['TopupIntent']> {
    const journal = await tx.ledgerJournal.findUnique({
      where: { topupId: intent.id },
    });
    return {
      ...DEMO,
      id: intent.id,
      version: intent.version,
      amount: intent.amount,
      state: intent.state as Wire['TopupIntent']['state'],
      credited: !!journal,
      journalId: journal?.id ?? null,
      createdAt: intent.createdAt.toISOString(),
      updatedAt: intent.updatedAt.toISOString(),
    };
  }
  private async change(
    tx: Tx,
    intent: TopupIntent,
    now: Date,
  ): Promise<WalletChange> {
    const value = await this.project(tx, intent);
    return {
      entityType: 'TopupIntent',
      entityId: intent.id,
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
      const available = await this.ledger.available(tx, actor.id);
      const transactionHeld = await this.ledger.held(tx, actor.id);
      const now = await this.now(tx);
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
        await this.session(tx, context.auth, await this.now(tx));
      },
      mutate: async (tx, actor) => {
        const open = await tx.topupIntent.count({
          where: {
            ownerId: actor.id,
            state: { in: ['Pending', 'Processing', 'ReviewRequired'] },
          },
        });
        if (open >= 10)
          throw new DomainError(
            409,
            'InvalidState',
            'Bạn đã có 10 yêu cầu nạp chưa hoàn tất.',
          );
        const now = await this.now(tx);
        await this.session(tx, context.auth, now);
        const intent = await tx.topupIntent.create({
          data: {
            ownerId: actor.id,
            amount: body.amount,
            createdAt: now,
            updatedAt: now,
          },
        });
        return this.change(tx, intent, now);
      },
    });
  }
  read(auth: Actor, id: string) {
    return this.commands.readObligation(auth, async (tx, actor) => {
      member(actor);
      return this.project(tx, await this.owned(tx, id, actor.id));
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
      ...(q.from ? { gte: new Date(String(q.from)) } : {}),
      ...(q.to ? { lte: new Date(String(q.to)) } : {}),
    };
  }
  list(auth: Actor, q: Query): Promise<Wire['TopupPage']> {
    return this.commands.readObligation(auth, async (tx, actor) => {
      member(actor);
      const range = this.range(q);
      const cursor = q.cursor
        ? await this.owned(tx, String(q.cursor), actor.id)
        : null;
      const rows = await tx.topupIntent.findMany({
        where: {
          ownerId: actor.id,
          createdAt: range,
          ...(q.state ? { state: String(q.state) } : {}),
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: Number(q.limit) + 1,
      });
      const more = rows.length > Number(q.limit);
      if (more) rows.pop();
      return {
        items: await Promise.all(rows.map((row) => this.project(tx, row))),
        nextCursor: more ? rows.at(-1)!.id : null,
      };
    });
  }
  history(auth: Actor, q: Query): Promise<Wire['WalletHistoryPage']> {
    return this.commands.readObligation(auth, async (tx, actor) => {
      member(actor);
      this.range(q);
      const cursor = q.cursor
        ? await tx.ledgerJournal.findFirst({
            where: {
              id: String(q.cursor),
              entries: { some: { account: { ownerId: actor.id } } },
            },
          })
        : null;
      if (q.cursor && !cursor) throw notFound();
      const rows = await tx.$queryRaw<
        {
          id: string;
          topup_id: string | null;
          order_id: string | null;
          type: Wire['WalletHistoryItem']['type'];
          posted_at: Date;
          amount: bigint;
          balance: bigint;
        }[]
      >(Prisma.sql`
        WITH history AS (SELECT j.id,j.topup_id,j.order_id,j.type,j.sequence,j.posted_at,e.debit-e.credit AS amount,
          sum(e.debit-e.credit) OVER (ORDER BY j.sequence)::bigint AS balance
          FROM ledger_journals j JOIN ledger_entries e ON e.journal_id=j.id JOIN wallet_accounts a ON a.id=e.account_id
          WHERE a.owner_id=${actor.id}::uuid)
        SELECT * FROM history WHERE true
          ${q.from ? Prisma.sql`AND posted_at>=${new Date(String(q.from))}` : Prisma.empty}
          ${q.to ? Prisma.sql`AND posted_at<=${new Date(String(q.to))}` : Prisma.empty}
          ${q.topupId ? Prisma.sql`AND topup_id=${String(q.topupId)}::uuid` : Prisma.empty}
          ${q.orderId ? Prisma.sql`AND order_id=${String(q.orderId)}::uuid` : Prisma.empty}
          ${q.type ? Prisma.sql`AND type=${String(q.type)}` : Prisma.empty}
          ${cursor ? Prisma.sql`AND sequence<${cursor.sequence}` : Prisma.empty}
        ORDER BY sequence DESC LIMIT ${Number(q.limit) + 1}`);
      const more = rows.length > Number(q.limit);
      if (more) rows.pop();
      return {
        items: rows.map((row) => ({
          ...DEMO,
          journalId: row.id,
          topupId: row.topup_id,
          orderId: row.order_id,
          type: row.type,
          amount: Number(row.amount),
          balanceAfter: Number(row.balance),
          postedAt: row.posted_at.toISOString(),
        })),
        nextCursor: more ? rows.at(-1)!.id : null,
      };
    });
  }
  emit(context: CommandContext, body: Wire['SimulatedTopupEvent']) {
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
          if (intent.ownerId === actor.id)
            throw new DomainError(
              403,
              'FORBIDDEN',
              'Người vận hành không được nạp cho chính mình.',
            );
          // A verified event may complete an existing intent even if its recipient was later locked.
          this.simulator.verify(body, this.simulator.sign(body));
          await tx.$queryRaw`SELECT id FROM topup_intents WHERE id=${intent.id}::uuid FOR UPDATE`;
          await this.session(tx, context.auth, await this.now(tx));
          return this.owned(tx, intent.id);
        },
        mutate: async (tx, actor, intent, receiptId) => {
          // Global provider event identity spans HTTP keys and test operators.
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'payment-event:' + body.eventId},0))::text`;
          const payloadHash = createHash('sha256')
            .update(canonicalJson(body))
            .digest('hex');
          const old = await tx.simulatedPaymentEvent.findUnique({
            where: { id: body.eventId },
          });
          if (old) {
            if (old.payloadHash !== payloadHash)
              throw new DomainError(
                409,
                'IdempotencyConflict',
                'Mã sự kiện đã được dùng cho nội dung khác.',
              );
            const now = await this.now(tx);
            await this.session(tx, context.auth, now);
            return this.change(tx, intent, now);
          }
          let accountId: string | null = null;
          if (
            body.outcome === 'Succeeded' &&
            ['Pending', 'Processing'].includes(intent.state)
          )
            accountId = await this.ledger.lockFunding(tx, intent.ownerId);
          const now = await this.now(tx);
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
          let next = intent.state,
            disposition = 'Ignored';
          if (mismatch || contradiction || intent.state === 'ReviewRequired') {
            next = 'ReviewRequired';
            disposition = 'ReviewRequired';
          } else if (['Pending', 'Processing'].includes(intent.state)) {
            next = body.outcome;
            disposition = 'Applied';
          }
          await tx.simulatedPaymentEvent.create({
            data: {
              id: body.eventId,
              intentId: intent.id,
              provider: 'LatLaiSimulator-v1',
              payloadHash,
              recipientId: body.recipientId,
              amount: body.amount,
              currency: body.currency,
              outcome: body.outcome,
              disposition,
              occurredAt,
              receivedAt: now,
              receiptId,
            },
          });
          const updated = await tx.topupIntent.update({
            where: { id: intent.id },
            data: { state: next, version: { increment: 1 }, updatedAt: now },
          });
          if (disposition === 'Applied' && next === 'Succeeded')
            await this.ledger.postTopup(
              tx,
              intent,
              accountId!,
              body.eventId,
              now,
            );
          return this.change(tx, updated, now);
        },
      },
    );
  }
}
