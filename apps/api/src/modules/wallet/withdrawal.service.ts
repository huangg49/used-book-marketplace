import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { WithdrawalDoc } from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import {
  admin,
  canonicalJson,
  member,
  requireActive,
  MongoCommandService,
  type Actor,
  type CommandContext,
  type CurrentActor,
  type WithdrawalChange,
} from '../commands/mongo-command.service.js';
import {
  conflict,
  DomainError,
  invalidField,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import { checkWithdrawal, LedgerService } from './ledger.service.js';
import { PaymentSimulator } from './payment-simulator.js';

const labels: Record<WithdrawalDoc['state'], string> = {
  Requested: 'Chờ duyệt',
  Approved: 'Đã duyệt',
  Processing: 'Đang xử lý / đối soát',
  Completed: 'Rút tiền thành công',
  Rejected: 'Đã từ chối',
  FailedVerified: 'Chi thất bại đã xác minh',
  Refunded: 'Đã hoàn tiền',
};
@Injectable()
export class WithdrawalService {
  constructor(
    private readonly commands: MongoCommandService,
    private readonly ledger: LedgerService,
    private readonly simulator: PaymentSimulator,
  ) {}
  private enabled() {
    if (!this.simulator.enabled())
      throw new DomainError(
        503,
        'UNAVAILABLE',
        'Bộ rút tiền mô phỏng chưa được bật.',
      );
  }
  private operator(actor: CurrentActor) {
    requireActive(actor);
    if (!actor.roles.some((r) => r.role === 'TEST_OPERATOR'))
      throw new DomainError(403, 'FORBIDDEN', 'Cần quyền vận hành mô phỏng.');
  }
  private independent(actor: CurrentActor, row: WithdrawalDoc) {
    if (actor._id === row.ownerId)
      throw new DomainError(
        403,
        'FORBIDDEN',
        'Không được xử lý yêu cầu rút tiền của chính mình.',
      );
  }
  private async session(tx: Tx, auth: Actor, recent = false) {
    const now = await tx.now(),
      session = await tx.c.auth_sessions.findOne({
        _id: auth.sessionId,
        userId: auth.user.id,
      });
    if (!session || session.revokedAt || session.expiresAt <= now)
      throw new DomainError(
        401,
        'SESSION_EXPIRED',
        'Phiên đăng nhập đã hết hạn.',
      );
    if (recent && now.getTime() - session.createdAt.getTime() > 15 * 60000)
      throw new DomainError(
        403,
        'FORBIDDEN',
        'Vui lòng đăng nhập lại để xác thực thao tác tiền trong 15 phút gần đây.',
      );
    return now;
  }
  private async owned(tx: Tx, id: string, ownerId?: string) {
    const row = await tx.c.withdrawals.findOne({
      _id: id,
      ...(ownerId ? { ownerId } : {}),
    });
    if (!row) throw notFound();
    return row;
  }
  private project(row: WithdrawalDoc, full = false): Wire['Withdrawal'] {
    return {
      id: row._id,
      ownerId: row.ownerId,
      ownerName: row.ownerName,
      amount: row.amount,
      fee: 0,
      reason: row.reason,
      reasonDetail: row.reasonDetail,
      recipient: {
        ...row.recipient,
        accountNumber: full
          ? row.recipient.accountNumber
          : '•••• ' + row.recipient.accountNumber.slice(-4),
      },
      state: row.state,
      version: row.version,
      approverId: row.approverId,
      payoutRef: row.payoutRef,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      history: row.history.map((h) => ({ ...h, at: h.at.toISOString() })),
      processingMode: row.processingMode ?? 'Simulator',
      demoOnly: true,
    };
  }
  private change(tx: Tx, row: WithdrawalDoc, now: Date): WithdrawalChange {
    tx.check(`withdrawal:${row._id}`, () => checkWithdrawal(tx, row._id));
    return {
      entityType: 'Withdrawal',
      entityId: row._id,
      version: row.version,
      state: row.state,
      decidedAt: now,
      event: 'wallet.withdrawalChanged',
    };
  }
  private async notify(tx: Tx, row: WithdrawalDoc, now: Date) {
    await tx.c.member_notifications.insertOne({
      _id: randomUUID(),
      userId: row.ownerId,
      kind: 'WithdrawalUpdated',
      title: 'Rút tiền · ' + labels[row.state],
      body: 'Yêu cầu rút tiền đã được cập nhật. Mở Ví để xem chi tiết.',
      targetType: 'Withdrawal',
      targetId: row._id,
      dedupeKey: `withdrawal:${row._id}:${row.version}`,
      createdAt: now,
      readAt: null,
    });
  }
  private async transition(
    tx: Tx,
    row: WithdrawalDoc,
    state: WithdrawalDoc['state'],
    note: string,
    now: Date,
    fields: Partial<WithdrawalDoc> = {},
  ) {
    if (
      row.history.length >= 200 ||
      (state === 'Processing' && row.history.length >= 198)
    )
      throw invalidState(
        'Đã đạt giới hạn nhật ký; cần vận hành đối soát hồ sơ này.',
      );
    const updated = await tx.c.withdrawals.findOneAndUpdate(
      { _id: row._id, version: row.version },
      {
        $set: { ...fields, state, updatedAt: now },
        $inc: { version: 1 },
        $push: { history: { state, at: now, note } },
      },
      { returnDocument: 'after' },
    );
    if (!updated) throw conflict();
    await this.notify(tx, updated, now);
    return this.change(tx, updated, now);
  }
  create(context: CommandContext, body: Wire['CreateWithdrawal']) {
    return this.commands.runWithdrawal(
      context,
      'createWithdrawal',
      null,
      body,
      {
        authorize: async (tx, actor) => {
          member(actor);
          await this.session(tx, context.auth);
          tx.check('withdrawal-session', async () => {
            await this.session(tx, context.auth);
          });
        },
        mutate: async (tx, actor, _before, receiptId) => {
          if (body.reason === 'Other' && !body.reasonDetail.trim())
            invalidField('/reasonDetail', 'Hãy mô tả lý do rút tiền.');
          const now = await this.session(tx, context.auth);
          const row: WithdrawalDoc = {
            _id: randomUUID(),
            processingMode: 'Manual',
            ownerId: actor._id,
            ownerName: actor.displayName,
            amount: body.amount,
            reason: body.reason,
            reasonDetail: body.reasonDetail,
            recipient: body.recipient,
            holdId: randomUUID(),
            state: 'Requested',
            version: 1,
            approverId: null,
            payoutRef: null,
            createdAt: now,
            updatedAt: now,
            lockSeq: 0,
            history: [
              {
                state: 'Requested',
                at: now,
                note: 'Đã tiếp nhận và giữ tiền chờ duyệt.',
              },
            ],
          };
          await tx.c.withdrawals.insertOne(row);
          await this.ledger.postWithdrawal(
            tx,
            row,
            'WithdrawalHold',
            receiptId,
            now,
          );
          await this.notify(tx, row, now);
          return this.change(tx, row, now);
        },
      },
    );
  }
  list(
    auth: Actor,
    q: Record<string, string | number>,
    audience: 'member' | 'admin' | 'operator',
  ) {
    return this.commands.readObligation(
      auth,
      async (tx, actor): Promise<Wire['WithdrawalPage']> => {
        if (audience === 'member') member(actor);
        else if (audience === 'admin') admin(actor);
        else this.operator(actor);
        const scope = audience === 'member' ? { ownerId: actor._id } : {};
        const cursor = q.cursor
          ? await this.owned(
              tx,
              String(q.cursor),
              audience === 'member' ? actor._id : undefined,
            )
          : null;
        const limit = Number(q.limit ?? 20);
        const direction = audience === 'member' ? -1 : 1;
        const rows = await tx.c.withdrawals
          .find(
            {
              ...scope,
              ...(q.state
                ? { state: String(q.state) as WithdrawalDoc['state'] }
                : {}),
              ...(cursor
                ? {
                    $or: [
                      {
                        createdAt: {
                          [direction === 1 ? '$gt' : '$lt']: cursor.createdAt,
                        },
                      },
                      {
                        createdAt: cursor.createdAt,
                        _id: { [direction === 1 ? '$gt' : '$lt']: cursor._id },
                      },
                    ],
                  }
                : {}),
            },
            {
              sort: { createdAt: direction, _id: direction },
              limit: limit + 1,
            },
          )
          .toArray();
        const more = rows.length > limit;
        if (more) rows.pop();
        return {
          items: rows.map((row) => this.project(row)),
          nextCursor: more ? rows.at(-1)!._id : null,
        };
      },
    );
  }
  read(auth: Actor, id: string, operations = false) {
    return this.commands.readObligation(auth, async (tx, actor) => {
      if (operations) admin(actor);
      else member(actor);
      return this.project(
        await this.owned(tx, id, operations ? undefined : actor._id),
        operations,
      );
    });
  }
  action(
    context: CommandContext,
    id: string,
    body: Wire['DecideWithdrawal'] | Wire['WithdrawalVersion'],
    action: 'decision' | 'process' | 'refund',
  ) {
    return this.commands.runWithdrawal(
      context,
      {
        decision: 'decideWithdrawal',
        process: 'processWithdrawal',
        refund: 'refundWithdrawal',
      }[action],
      id,
      body,
      {
        discover: async (tx) => [(await this.owned(tx, id)).ownerId],
        authorize: async (tx, actor) => {
          admin(actor);
          const row = await this.owned(tx, id);
          this.independent(actor, row);
          await this.session(tx, context.auth, true);
          tx.check('withdrawal-admin-session', async () => {
            await this.session(tx, context.auth, true);
          });
          return row;
        },
        mutate: async (tx, actor, _snapshot, receiptId) => {
          await tx.lock('withdrawals', [id]);
          const row = await this.owned(tx, id);
          if (row.version !== body.expectedVersion) throw conflict();
          const now = await this.session(tx, context.auth, true);
          if (action === 'decision') {
            const decision = body as Wire['DecideWithdrawal'];
            if (
              !['Requested', 'Approved'].includes(row.state) ||
              (decision.decision === 'Approve' && row.state !== 'Requested')
            )
              throw invalidState();
            if (
              decision.decision === 'Approve' &&
              row.processingMode === 'Manual'
            ) {
              const payoutRef = randomUUID();
              await this.ledger.postWithdrawal(
                tx,
                row,
                'WithdrawalPayout',
                receiptId,
                now,
              );
              return this.transition(
                tx,
                row,
                'Completed',
                decision.reason,
                now,
                { approverId: actor._id, payoutRef },
              );
            }
            if (decision.decision === 'Reject')
              await this.ledger.postWithdrawal(
                tx,
                row,
                'WithdrawalRefund',
                receiptId,
                now,
              );
            return this.transition(
              tx,
              row,
              decision.decision === 'Approve' ? 'Approved' : 'Rejected',
              decision.reason,
              now,
              { approverId: actor._id },
            );
          }
          if (row.processingMode === 'Manual')
            throw invalidState(
              'Yêu cầu này được hoàn tất ngay khi Admin duyệt.',
            );
          if (action === 'process') {
            if (row.state !== 'Approved' || row.payoutRef) throw invalidState();
            return this.transition(
              tx,
              row,
              'Processing',
              'Đã gửi lệnh chi mô phỏng. Chờ kết quả xác minh.',
              now,
              { payoutRef: randomUUID() },
            );
          }
          if (row.state !== 'FailedVerified')
            throw invalidState(
              'Chỉ hoàn tiền khi đã xác minh lệnh chi thất bại.',
            );
          await this.ledger.postWithdrawal(
            tx,
            row,
            'WithdrawalRefund',
            receiptId,
            now,
          );
          return this.transition(
            tx,
            row,
            'Refunded',
            'Đã hoàn khoản giữ về số dư khả dụng.',
            now,
          );
        },
      },
    );
  }
  emit(context: CommandContext, body: Wire['SimulatedWithdrawalEvent']) {
    return this.commands.runWithdrawal(
      context,
      'emitSimulatedWithdrawalEvent',
      body.withdrawalId,
      body,
      {
        discover: async (tx) => [
          (await this.owned(tx, body.withdrawalId)).ownerId,
        ],
        authorize: async (tx, actor) => {
          this.operator(actor);
          this.enabled();
          const row = await this.owned(tx, body.withdrawalId);
          this.independent(actor, row);
          this.simulator.verifyWithdrawal(
            body,
            this.simulator.signWithdrawal(body),
          );
          tx.check('withdrawal-operator-session', async () => {
            await this.session(tx, context.auth);
          });
          await this.session(tx, context.auth);
          return row;
        },
        mutate: async (tx, _actor, _snapshot, receiptId) => {
          await tx.lock('withdrawals', [body.withdrawalId]);
          const row = await this.owned(tx, body.withdrawalId);
          // Global event identity serializes even when two operators target different requests.
          await tx.c.command_locks.updateOne(
            {
              _id: createHash('sha256')
                .update('withdrawal-event:' + body.eventId)
                .digest('hex'),
            },
            {
              $inc: { lockSeq: 1 },
              $set: { expiresAt: new Date(Date.now() + 7 * 86400000) },
            },
            { upsert: true },
          );
          const hash = createHash('sha256')
            .update(canonicalJson(body))
            .digest('hex');
          const old = await tx.c.withdrawal_events.findOne({
            _id: body.eventId,
          });
          const now = await this.session(tx, context.auth);
          if (old) {
            if (old.payloadHash !== hash)
              throw new DomainError(
                409,
                'IdempotencyConflict',
                'Mã sự kiện đã được dùng cho nội dung khác.',
              );
            return this.change(tx, row, now);
          }
          if (row.version !== body.expectedVersion) throw conflict();
          if (row.state !== 'Processing') throw invalidState();
          if (
            row.payoutRef !== body.payoutRef ||
            row.ownerId !== body.recipientId ||
            row.amount !== body.amount ||
            body.currency !== 'VND'
          )
            throw invalidState(
              'Kết quả chi không khớp yêu cầu. Tiền tiếp tục được giữ để đối soát.',
            );
          await tx.c.withdrawal_events.insertOne({
            _id: body.eventId,
            withdrawalId: row._id,
            payoutRef: body.payoutRef,
            payloadHash: hash,
            outcome: body.outcome,
            receiptId,
            receivedAt: now,
          });
          if (body.outcome === 'Succeeded')
            await this.ledger.postWithdrawal(
              tx,
              row,
              'WithdrawalPayout',
              receiptId,
              now,
            );
          const state =
            body.outcome === 'Succeeded'
              ? 'Completed'
              : body.outcome === 'FailedVerified'
                ? 'FailedVerified'
                : 'Processing';
          return this.transition(
            tx,
            row,
            state,
            body.outcome === 'Unknown'
              ? 'Chưa rõ kết quả chi; giữ tiền và đối soát cùng mã chi.'
              : labels[state],
            now,
          );
        },
      },
    );
  }
}
