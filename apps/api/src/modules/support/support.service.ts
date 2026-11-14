import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Filter } from 'mongodb';
import type {
  SupportCaseDoc as Case,
  SupportMessageDoc,
  UserDoc,
} from '../../database/mongo/documents.js';
import {
  MongoCommandService,
  member,
  admin,
  type Actor,
  type CommandContext,
  type Tx,
} from '../commands/mongo-command.service.js';
import { MongoPageService } from '../commands/mongo-page.service.js';
import {
  conflict,
  DomainError,
  invalidField,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import { reviewPublicationPipeline } from '../reviews/review-queries.service.js';
import { AuctionBiddingService } from '../auctions/auction-bidding.service.js';
import { AuctionClock } from '../auctions/auction-clock.js';
import { reviewItem } from '../reviews/review-record.js';

const summary = (
  r: Case,
  // ADR 0083: operations reads only; never computed for members.
  otherOpenOnTarget?: number,
): Wire['SupportCaseSummary'] => ({
  id: r._id,
  kind: r.kind,
  title: r.title,
  reporterId: r.reporterId,
  reporterName: r.reporterName,
  target: r.target,
  assigneeId: r.assigneeId,
  state: r.state,
  version: r.version,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
  ...(otherOpenOnTarget === undefined ? {} : { otherOpenOnTarget }),
});
const targetKey = (t: NonNullable<Case['target']>) => `${t.type}:${t.id}`;
const text = (value: string, path: string, min = 3) => {
  const result = value.trim();
  if (result.length < min)
    invalidField(path, `Cần ít nhất ${min} ký tự có nội dung.`);
  return result;
};
function allowed(row: Case | null, actor: UserDoc, operations: boolean): Case {
  if (operations) {
    admin(actor);
    if (row?.involvedUserIds.includes(actor._id))
      throw new DomainError(
        403,
        'SelfReviewForbidden',
        'Bạn không được xử lý hồ sơ liên quan đến mình.',
      );
  } else member(actor);
  if (!row || (!operations && row.reporterId !== actor._id)) throw notFound();
  return row;
}

@Injectable()
export class SupportService {
  constructor(
    private readonly commands: MongoCommandService,
    private readonly pages: MongoPageService,
    private readonly auctions: AuctionBiddingService,
    private readonly clock: AuctionClock,
  ) {}
  list(
    auth: Actor,
    query: Record<string, string | number | boolean>,
    operations: boolean,
  ): Promise<Wire['SupportCasePage']> {
    const read = operations
      ? this.commands.read.bind(this.commands)
      : this.commands.readObligation.bind(this.commands);
    return read(auth, async (tx, actor) => {
      if (operations) admin(actor);
      else member(actor);
      const match: Filter<Case> = operations
        ? { involvedUserIds: { $ne: actor._id } }
        : { reporterId: actor._id };
      if (query.state) match.state = query.state as Case['state'];
      if (query.kind) match.kind = query.kind as Case['kind'];
      // ADR 0078: lets a client find the member's open flag on one auction.
      if (query.targetType)
        Object.assign(match, { 'target.type': query.targetType });
      if (query.targetId) Object.assign(match, { 'target.id': query.targetId });
      if (operations && query.assignedToMe === true)
        match.assigneeId = actor._id;
      const page = await this.pages.page(
        tx.c.support_cases,
        [{ $match: match }, { $set: { key: '$createdAt' } }],
        {
          kind: 'time',
          ascending: false,
          scope: { actor: actor._id, operations, match },
          limit: Number(query.limit ?? 20),
          cursor: query.cursor as string | undefined,
        },
      );
      const rows = await tx.c.support_cases
        .find({ _id: { $in: page.ids } })
        .toArray();
      const open = operations
        ? await this.openOnTargets(tx, rows, actor._id)
        : null;
      return {
        items: page.ids.map((id) => {
          const row = rows.find((r) => r._id === id)!;
          return summary(row, open ? this.others(open, row) : undefined);
        }),
        nextCursor: page.nextCursor,
        serverTime: page.serverTime,
      };
    });
  }
  read(
    auth: Actor,
    id: string,
    operations: boolean,
  ): Promise<Wire['SupportCaseDetail']> {
    const read = operations
      ? this.commands.read.bind(this.commands)
      : this.commands.readObligation.bind(this.commands);
    return read(auth, async (tx, actor) => {
      const row = await this.access(
          tx,
          await tx.c.support_cases.findOne({ _id: id }),
          actor,
          operations,
        ),
        now = await tx.now();
      const messages = await tx.c.support_messages
        .find(
          { caseId: id, ...(!operations ? { internal: false } : {}) },
          { sort: { createdAt: 1, _id: 1 } },
        )
        .toArray();
      const linked = await this.related(
        tx,
        row.target,
        now,
        operations,
        actor._id,
      );
      const open = operations
        ? await this.openOnTargets(tx, [row], actor._id)
        : null;
      return {
        case: summary(row, open ? this.others(open, row) : undefined),
        messages: messages.map((m) => ({
          id: m._id,
          authorId: m.authorId,
          authorName: m.authorName,
          role: m.role,
          internal: m.internal,
          text: m.text,
          createdAt: m.createdAt.toISOString(),
        })),
        canManage: operations && row.assigneeId === actor._id,
        canReply:
          row.state !== 'Closed' &&
          row.messageCount < 198 &&
          (!operations || row.assigneeId === actor._id),
        ...linked,
        serverTime: now.toISOString(),
      };
    });
  }
  create(context: CommandContext, body: Wire['CreateSupportCase']) {
    return this.commands.runSupport(
      context,
      'createSupportCase',
      context.auth.user.id,
      body,
      {
        authorize: async (_tx, actor) => {
          member(actor, true);
          return actor;
        },
        mutate: async (tx, actor) => {
          const title = text(body.title, 'title'),
            description = text(body.description, 'description', 10);
          if (
            body.kind === 'TransactionIssue' &&
            (!body.target ||
              !['DirectOrder', 'Exchange', 'PointOrder', 'Auction'].includes(
                body.target.type,
              ))
          )
            invalidField(
              'target',
              'Chọn giao dịch mua bán, trao đổi, đơn thắng đấu giá hoặc phiên đấu giá bạn tham gia.',
            );
          if (body.kind === 'Violation' && !body.target)
            invalidField(
              'target',
              'Báo cáo cần gắn với nội dung hoặc thành viên cụ thể.',
            );
          const involved = await this.validateTarget(
            tx,
            body.target,
            actor._id,
          );
          if (body.target?.type === 'Auction') {
            // ADR 0078: a money or hold issue is only for the seller and members who
            // registered or bid; anyone may still report a violation.
            if (
              body.kind === 'TransactionIssue' &&
              !involved.includes(actor._id)
            )
              invalidField(
                'target',
                'Chỉ người bán và thành viên đã đăng ký hoặc trả giá trong phiên mới phản ánh được tiền cọc, khoản giữ hay thanh toán của phiên.',
              );
            // One open flag per member and auction; the actor lock below serializes it.
            const open = await tx.c.support_cases.findOne({
              reporterId: actor._id,
              'target.type': 'Auction',
              'target.id': body.target.id,
              state: { $ne: 'Closed' },
            });
            if (open)
              throw invalidState(
                `Bạn đã có hồ sơ đang mở về phiên này (mã ${open._id.slice(0, 8).toUpperCase()}). Bổ sung trong hồ sơ đó để Admin xem cùng một chỗ.`,
              );
          }
          const now = await tx.now();
          // The actor lock also serializes concurrent case creation and this bound.
          if (
            (await tx.c.support_cases.countDocuments({
              reporterId: actor._id,
              state: { $ne: 'Closed' },
            })) >= 20
          )
            throw invalidState(
              'Bạn đang có 20 yêu cầu chưa đóng. Hãy bổ sung vào hồ sơ liên quan đã có.',
            );
          const row: Case = {
            _id: randomUUID(),
            reporterId: actor._id,
            reporterName: actor.displayName,
            kind: body.kind,
            title,
            target: body.target,
            involvedUserIds: [...new Set([actor._id, ...involved])],
            assigneeId: null,
            state: 'Open',
            version: 1,
            messageCount: 1,
            createdAt: now,
            updatedAt: now,
            lockSeq: 0,
          };
          await tx.c.support_cases.insertOne(row);
          await this.append(tx, row, actor, description, false, 'Member', now);
          return this.change(row, now);
        },
      },
    );
  }
  message(
    context: CommandContext,
    id: string,
    body: Wire['SupportMessageCommand'],
    operations: boolean,
  ) {
    return this.commands.runSupport(
      context,
      operations ? 'messageSupportCase' : 'replyToSupportCase',
      id,
      body,
      {
        authorize: async (tx, actor) => {
          const row = await this.access(
            tx,
            await tx.c.support_cases.findOne({ _id: id }),
            actor,
            operations,
          );
          if (!operations && body.internal)
            throw new DomainError(
              403,
              'FORBIDDEN',
              'Thành viên chỉ gửi phản hồi trong hồ sơ của mình.',
            );
          return row;
        },
        mutate: async (tx, actor) => {
          await tx.lock('support_cases', [id]);
          const row = await this.access(
            tx,
            await tx.c.support_cases.findOne({ _id: id }),
            actor,
            operations,
          );
          this.version(row, body.expectedVersion);
          if (row.state === 'Closed')
            throw invalidState(
              'Hồ sơ đã đóng. Bạn có thể gửi yêu cầu mới và nêu mã hồ sơ này.',
            );
          if (operations && row.assigneeId !== actor._id)
            throw invalidState('Nhận phụ trách hồ sơ trước khi trả lời.');
          const now = await tx.now();
          await this.append(
            tx,
            row,
            actor,
            text(body.text, 'text'),
            body.internal,
            operations ? 'Admin' : 'Member',
            now,
          );
          if (!operations && ['AwaitingMember', 'Answered'].includes(row.state))
            row.state = row.assigneeId ? 'InReview' : 'Open';
          await this.save(tx, row, now);
          if (operations && !body.internal) await this.notify(tx, row, now);
          return this.change(row, now);
        },
      },
    );
  }
  act(context: CommandContext, id: string, body: Wire['SupportActionCommand']) {
    return this.commands.runSupport(context, 'actOnSupportCase', id, body, {
      authorize: async (tx, actor) =>
        this.access(
          tx,
          await tx.c.support_cases.findOne({ _id: id }),
          actor,
          true,
        ),
      mutate: async (tx, actor) => {
        await tx.lock('support_cases', [id]);
        const row = await this.access(
          tx,
          await tx.c.support_cases.findOne({ _id: id }),
          actor,
          true,
        );
        this.version(row, body.expectedVersion);
        if (body.action === 'Assign') {
          if (row.assigneeId || row.state === 'Closed')
            throw invalidState('Hồ sơ đã có người phụ trách hoặc đã đóng.');
          row.assigneeId = actor._id;
          row.state = 'InReview';
        } else {
          if (row.assigneeId !== actor._id)
            throw invalidState('Chỉ Admin đang phụ trách được đổi trạng thái.');
          if (body.action === 'Reopen') {
            if (row.state !== 'Closed') throw invalidState();
            row.state = 'InReview';
          } else {
            if (row.state === 'Closed') throw invalidState();
            if (body.action === 'Close' && row.state !== 'Answered')
              throw invalidState('Gửi kết quả xử lý trước khi đóng hồ sơ.');
            if (
              body.action === 'Close' &&
              (
                await this.related(
                  tx,
                  row.target,
                  await tx.now(),
                  true,
                  actor._id,
                )
              ).relatedState === 'ResolutionPending'
            )
              throw invalidState(
                'Giao dịch vẫn đang chờ giải quyết tranh chấp; không thể đóng hồ sơ hỗ trợ.',
              );
            row.state =
              body.action === 'RequestEvidence'
                ? 'AwaitingMember'
                : body.action === 'Answer'
                  ? 'Answered'
                  : 'Closed';
          }
        }
        const now = await tx.now();
        await this.append(
          tx,
          row,
          actor,
          text(body.text, 'text'),
          false,
          'System',
          now,
          ['Answer', 'Close'].includes(body.action),
        );
        await this.save(tx, row, now);
        await this.notify(tx, row, now);
        return this.change(row, now);
      },
    });
  }
  // ADR 0084 (H2): the assigned, independent Admin freezes the reported
  // auction for review; the message reaches every participant and is added to
  // the case, which stays open for the decision (resume or close).
  freezeAuction(
    context: CommandContext,
    id: string,
    body: Wire['FreezeReportedAuction'],
  ) {
    return this.commands.runSupport(context, 'freezeReportedAuction', id, body, {
      authorize: async (tx, actor) =>
        this.access(
          tx,
          await tx.c.support_cases.findOne({ _id: id }),
          actor,
          true,
        ),
      mutate: async (tx, actor) => {
        await tx.lock('support_cases', [id]);
        const row = await this.access(
          tx,
          await tx.c.support_cases.findOne({ _id: id }),
          actor,
          true,
        );
        this.version(row, body.expectedVersion);
        if (row.state === 'Closed') throw invalidState('Hồ sơ đã đóng.');
        if (row.assigneeId !== actor._id)
          throw invalidState('Nhận phụ trách hồ sơ trước khi tạm dừng phiên.');
        if (row.target?.type !== 'Auction')
          throw invalidState('Hồ sơ này không gắn với phiên đấu giá.');
        const message = text(body.message, 'message', 10);
        const now = await this.clock.now(tx);
        await this.auctions.freezeReported(
          tx,
          row.target.id,
          body.auctionVersion,
          actor._id,
          message,
          now,
        );
        await this.append(
          tx,
          row,
          actor,
          `Admin đã tạm dừng phiên đấu giá để xem xét: ${message}`,
          false,
          'System',
          now,
        );
        await this.save(tx, row, now);
        await this.notify(tx, row, now);
        return this.change(row, now);
      },
    });
  }
  // ADR 0079: the assigned, independent Admin closes the reported auction and
  // answers the case in one transaction; the message reaches every participant.
  closeAuction(
    context: CommandContext,
    id: string,
    body: Wire['CloseReportedAuction'],
  ) {
    return this.commands.runSupport(context, 'closeReportedAuction', id, body, {
      authorize: async (tx, actor) =>
        this.access(
          tx,
          await tx.c.support_cases.findOne({ _id: id }),
          actor,
          true,
        ),
      mutate: async (tx, actor, _before, receiptId) => {
        await tx.lock('support_cases', [id]);
        const row = await this.access(
          tx,
          await tx.c.support_cases.findOne({ _id: id }),
          actor,
          true,
        );
        this.version(row, body.expectedVersion);
        if (row.state === 'Closed') throw invalidState('Hồ sơ đã đóng.');
        if (row.assigneeId !== actor._id)
          throw invalidState('Nhận phụ trách hồ sơ trước khi đóng phiên.');
        if (row.target?.type !== 'Auction')
          throw invalidState('Hồ sơ này không gắn với phiên đấu giá.');
        const message = text(body.message, 'message', 10);
        const now = await this.clock.now(tx);
        await this.auctions.cancelReported(
          tx,
          row.target.id,
          body.auctionVersion,
          actor._id,
          message,
          receiptId,
          now,
        );
        await this.append(
          tx,
          row,
          actor,
          `Admin đã đóng phiên đấu giá: ${message}`,
          false,
          'System',
          now,
          true,
        );
        row.state = 'Answered';
        await this.save(tx, row, now);
        await this.notify(tx, row, now);
        return this.change(row, now);
      },
    });
  }
  // ADR 0083: open (not Closed) cases per target among the given rows'
  // targets, with the queue's exclusion of cases involving the reading Admin.
  private async openOnTargets(tx: Tx, rows: Case[], actorId: string) {
    const targets = [
      ...new Map(
        rows.flatMap((r) => (r.target ? [[targetKey(r.target), r.target]] : [])),
      ).values(),
    ];
    const counts = new Map<string, number>();
    if (!targets.length) return counts;
    const groups = await tx.c.support_cases
      .aggregate<{ _id: { type: string; id: string }; n: number }>([
        {
          $match: {
            state: { $ne: 'Closed' },
            involvedUserIds: { $ne: actorId },
            $or: targets.map((t) => ({ 'target.type': t.type, 'target.id': t.id })),
          },
        },
        { $group: { _id: { type: '$target.type', id: '$target.id' }, n: { $sum: 1 } } },
      ])
      .toArray();
    for (const g of groups) counts.set(`${g._id.type}:${g._id.id}`, g.n);
    return counts;
  }
  private others(open: Map<string, number>, row: Case) {
    if (!row.target) return undefined;
    // The row itself is visible to this Admin, so it is counted when open.
    const all = open.get(targetKey(row.target)) ?? 0;
    return Math.max(0, all - (row.state !== 'Closed' ? 1 : 0));
  }
  private version(row: Case, version: number) {
    if (row.version !== version) throw conflict();
  }
  private change(row: Case, now: Date) {
    return {
      entityType: 'SupportCase' as const,
      entityId: row._id,
      version: row.version,
      state: row.state,
      decidedAt: now,
    };
  }
  private async append(
    tx: Tx,
    row: Case,
    actor: UserDoc,
    value: string,
    internal: boolean,
    role: SupportMessageDoc['role'],
    now: Date,
    terminal = false,
  ) {
    if (row.messageCount >= 198 && !terminal)
      throw invalidState(
        'Hồ sơ gần đầy lịch sử. Admin cần gửi kết quả và đóng hồ sơ; yêu cầu mới có thể dẫn mã hồ sơ này.',
      );
    if (row.messageCount > 200)
      throw invalidState(
        'Hồ sơ đã đủ 200 mục lịch sử. Gửi yêu cầu liên quan mới để tiếp tục.',
      );
    await tx.c.support_messages.insertOne({
      _id: randomUUID(),
      caseId: row._id,
      authorId: actor._id,
      authorName: actor.displayName,
      role,
      internal,
      text: value,
      createdAt: now,
    });
  }
  private async save(tx: Tx, row: Case, now: Date) {
    if (row.messageCount >= 200)
      throw invalidState(
        'Hồ sơ đã đủ 200 mục lịch sử. Gửi yêu cầu liên quan mới để tiếp tục.',
      );
    row.version++;
    row.messageCount++;
    row.updatedAt = now;
    await tx.c.support_cases.updateOne(
      { _id: row._id },
      {
        $set: {
          state: row.state,
          assigneeId: row.assigneeId,
          version: row.version,
          messageCount: row.messageCount,
          updatedAt: now,
        },
      },
    );
  }
  private async notify(tx: Tx, row: Case, now: Date) {
    await tx.c.member_notifications.insertOne({
      _id: randomUUID(),
      userId: row.reporterId,
      kind: 'SupportUpdated',
      title: 'Yêu cầu hỗ trợ có cập nhật',
      body: 'Admin đã cập nhật hồ sơ của bạn. Mở để xem nội dung và bước tiếp theo.',
      targetType: 'SupportCase',
      targetId: row._id,
      dedupeKey: `support:${row._id}:${row.version}:${row.reporterId}`,
      createdAt: now,
      readAt: null,
    });
  }
  /** Seller excluded: members who ever registered or bid in the auction. */
  private async auctionParticipants(tx: Tx, auctionId: string) {
    const bidders = await tx.c.auction_bidders
      .find({ auctionId }, { projection: { bidderId: 1 } })
      .toArray();
    const registrants = await tx.c.auction_registrations
      .find({ auctionId }, { projection: { userId: 1 } })
      .toArray();
    return [
      ...bidders.map((b) => b.bidderId),
      ...registrants.map((r) => r.userId),
    ];
  }
  /**
   * `allowed` plus ADR 0078: an Admin who registered or bid in a flagged auction
   * after the flag was filed is involved too, so they cannot read or handle it.
   */
  private async access(
    tx: Tx,
    row: Case | null,
    actor: UserDoc,
    operations: boolean,
  ): Promise<Case> {
    const result = allowed(row, actor, operations);
    if (operations && result.target?.type === 'Auction') {
      const key = `${result.target.id}:${actor._id}`;
      if (
        (await tx.c.auction_bidders.findOne({ _id: key })) ||
        (await tx.c.auction_registrations.findOne({ _id: key }))
      )
        throw new DomainError(
          403,
          'SelfReviewForbidden',
          'Bạn không được xử lý hồ sơ liên quan đến mình.',
        );
    }
    return result;
  }
  async validateTarget(
    tx: Tx,
    target: Case['target'],
    owner: string,
    lock = true,
  ): Promise<string[]> {
    if (!target) return [];
    const { type, id } = target;
    if (type === 'Review') {
      if (lock) await tx.lock('transaction_reviews', [id]);
      const rows = await tx.c.transaction_reviews
        .aggregate([
          { $match: { _id: id, hiddenAt: null, deletedAt: null } },
          ...reviewPublicationPipeline(await tx.now()),
        ])
        .toArray();
      if (!rows[0]) throw notFound();
      return [rows[0].authorId as string, rows[0].targetUserId as string];
    }
    if (type === 'Member') {
      const user = await tx.c.users.findOne({
        _id: id,
        emailVerifiedAt: { $ne: null },
        status: { $in: ['ACTIVE', 'RESTRICTED', 'LOCKED'] },
      });
      if (!user) throw notFound();
      return [id];
    }
    if (type === 'Listing') {
      if (lock) await tx.lock('listings', [id]);
      const row = await tx.c.listings.findOne({ _id: id });
      if (
        !row ||
        (row.ownerId !== owner &&
          (row.moderation !== 'Approved' || row.visibility !== 'Visible'))
      )
        throw notFound();
      return [row.ownerId];
    }
    if (type === 'Auction') {
      if (lock) await tx.lock('auctions', [id]);
      const row = await tx.c.auctions.findOne({ _id: id });
      if (
        !row ||
        (row.sellerId !== owner &&
          ![
            'Scheduled',
            'Active',
            'Ended',
            'Sold',
            'Unsold',
            'Cancelled',
            'OnHold',
            // ADR 0086: a report may still close it before the winner paid.
            'AwaitingWinnerPayment',
            'SecondChanceOffered',
          ].includes(row.state))
      )
        throw notFound();
      // ADR 0078: everyone with money or a stake in the auction is involved, so an
      // Admin who registered or bid cannot handle a flag about it.
      return [row.sellerId, ...(await this.auctionParticipants(tx, id))];
    }
    const collection =
      type === 'DirectOrder'
        ? 'direct_orders'
        : type === 'Exchange'
          ? 'exchanges'
          : 'point_orders';
    if (lock) await tx.lock(collection, [id]);
    const row = await tx.c[collection].findOne({ _id: id });
    if (!row || ('demoArchivedAt' in row && row.demoArchivedAt)) throw notFound();
    const ids =
      'initiatorId' in row
        ? [row.initiatorId, row.recipientId]
        : [row.buyerId, row.sellerId];
    if (!ids.includes(owner)) throw notFound();
    return ids;
  }
  private async related(
    tx: Tx,
    target: Case['target'],
    now: Date,
    operations: boolean,
    owner: string,
  ): Promise<
    Pick<
      Wire['SupportCaseDetail'],
      'relatedState' | 'relatedAuctionId' | 'review'
    >
  > {
    const empty = { relatedState: null, relatedAuctionId: null, review: null };
    if (!target) return empty;
    if (target.type === 'Review') {
      const rows = await tx.c.transaction_reviews
        .aggregate([
          { $match: { _id: target.id } },
          ...reviewPublicationPipeline(now),
        ])
        .toArray();
      const row = rows[0];
      if (!row || (!operations && (row.hiddenAt || row.deletedAt)))
        return empty;
      const r = await tx.c.transaction_reviews.findOne({ _id: target.id });
      return r
        ? {
            ...empty,
            review: reviewItem(
              r,
              row.publication as Date,
              now,
              false,
              operations || owner === r.targetUserId,
            ),
          }
        : empty;
    }
    if (target.type === 'Auction') {
      const auction = await tx.c.auctions.findOne({ _id: target.id });
      return auction
        ? { ...empty, relatedState: auction.state, relatedAuctionId: auction._id }
        : empty;
    }
    if (!['DirectOrder', 'Exchange', 'PointOrder'].includes(target.type))
      return empty;
    const collection =
      target.type === 'DirectOrder'
        ? 'direct_orders'
        : target.type === 'Exchange'
          ? 'exchanges'
          : 'point_orders';
    const row = await tx.c[collection].findOne({ _id: target.id });
    if (!row) return empty;
    return {
      ...empty,
      relatedState: 'status' in row ? row.status : row.state,
      relatedAuctionId: 'auctionId' in row ? row.auctionId : null,
    };
  }
}
