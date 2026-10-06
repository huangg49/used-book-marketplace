import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AuctionBidderDoc,
  AuctionDoc,
  ReclaimReason,
} from '../../database/mongo/documents.js';
import {
  AUCTION_PAYMENT_MS,
  BUY_NOW_PAYMENT_MS,
} from '../../database/mongo/migrations/auction-constants.js';
import { MongoService } from '../../database/mongo/mongo.service.js';
import type { Tx } from '../../database/mongo/transaction.js';
import {
  DomainError,
  conflict,
  invalidField,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import {
  MongoCommandService,
  member,
  requireActive,
  type Actor,
  type AuctionChange,
  type AuctionOperation,
  type CommandContext,
  type CurrentActor,
} from '../commands/mongo-command.service.js';
import { AuctionClock } from './auction-clock.js';
import {
  apply,
  EngineError,
  minimumBid,
  type EngineAction,
} from './auction-engine.js';
import { checkAuction } from './auction-invariants.js';
import { AuctionIntakesService } from './auction-intakes.service.js';
import { HandoverPointsService } from './handover-points.service.js';
import { PointOrdersService } from './point-orders.service.js';

const RATE_LIMIT_PER_MINUTE = 30;
const MAX_OPEN_PARTICIPATIONS = 5;
const closed = () =>
  new DomainError(
    409,
    'AuctionClosed',
    'Phiên đấu giá đã kết thúc hoặc không còn nhận giá.',
  );
const rejectionMessages: Record<string, string> = {
  LeaderMustRaiseAuto:
    'Bạn đang dẫn giá; chỉ có thể nâng mức trả tối đa của Đặt giá tự động.',
  NotIncreasing: 'Mức cam kết mới phải cao hơn mức hiện tại của bạn.',
  NoAutoBid: 'Bạn chưa bật Đặt giá tự động trong phiên này.',
};

// Bids, Auto ceilings, Buy Now, close and payment deadline (FR-AU03–10).
// Every command locks the auction document, so commands on one auction are
// serialized; the decision clock is read after the locks, and a bid at or
// after endAt is refused whether or not the close worker has run.
@Injectable()
export class AuctionBiddingService {
  constructor(
    private readonly mongo: MongoService,
    private readonly commands: MongoCommandService,
    private readonly intakes: AuctionIntakesService,
    private readonly points: HandoverPointsService,
    private readonly orders: PointOrdersService,
    private readonly clock: AuctionClock,
  ) {}

  private async auction(tx: Tx, id: string) {
    const a = await tx.c.auctions.findOne({ _id: id });
    if (!a) throw notFound();
    return a;
  }
  private change(
    a: AuctionDoc,
    decidedAt: Date,
    event: string,
    actorId: string | null,
    reason?: string,
  ): AuctionChange {
    const open = a.state === 'Active' && decidedAt < a.endAt;
    return {
      entityType: 'Auction',
      entityId: a._id,
      intakeId: a.intakeId,
      auctionId: a._id,
      orderId: a.orderId,
      contextId: a.contextId,
      version: a.version,
      state: a.state,
      decidedAt,
      currentPrice: a.currentPrice,
      minimumBid: open ? minimumBid(a) : null,
      leading: actorId && a.state === 'Active' ? a.leaderId === actorId : null,
      event,
      reason,
    };
  }
  private async update(
    tx: Tx,
    a: AuctionDoc,
    set: Partial<AuctionDoc>,
    now: Date,
  ) {
    const next = await tx.c.auctions.findOneAndUpdate(
      { _id: a._id, version: a.version, state: a.state },
      { $set: { ...set, updatedAt: now }, $inc: { version: 1 } },
      { returnDocument: 'after' },
    );
    if (!next) throw conflict();
    tx.check(`auction:${a._id}`, () => checkAuction(tx, a._id));
    return next;
  }
  // FR-AU09: ACTIVE verified MEMBER, not the seller and not Staff handling
  // this book (receipt/inspection or a current assignment at its point).
  // Runs in authorize, so current eligibility precedes any receipt replay.
  private async eligibleBidder(tx: Tx, actor: CurrentActor, a: AuctionDoc) {
    member(actor);
    requireActive(actor);
    if (actor._id === a.sellerId)
      throw new DomainError(
        403,
        'SelfReviewForbidden',
        'Bạn không thể đấu giá sách của chính mình.',
      );
    const intake = (await tx.c.auction_intakes.findOne({ _id: a.intakeId }))!;
    const handled =
      intake.receivedBy === actor._id ||
      intake.inspectorId === actor._id ||
      (
        await this.points.assignedPointIds(tx, actor._id, await tx.now())
      ).includes(a.pointId);
    if (handled)
      throw new DomainError(
        403,
        'FORBIDDEN',
        'Nhân viên đang xử lý cuốn sách này không được tham gia đấu giá.',
      );
  }
  // Locks the auction and this bidder's projection, then checks the server
  // deadline, the seller and the per-account limits (POL-41).
  private async lockForBid(
    tx: Tx,
    auth: Actor,
    actorId: string,
    id: string,
    newParticipation: boolean,
  ) {
    await tx.lock('auctions', [id]);
    await tx.lock('auction_bidders', [`${id}:${actorId}`]);
    const a = await this.auction(tx, id);
    const now = await this.clock.decision(tx, auth);
    if (a.state !== 'Active' || now >= a.endAt) throw closed();
    const seller = await tx.c.users.findOne({ _id: a.sellerId });
    if (seller?.status !== 'ACTIVE') throw invalidState();
    if (
      (await tx.c.auction_bids.countDocuments({
        bidderId: actorId,
        decidedAt: { $gt: new Date(now.getTime() - 60_000) },
      })) >= RATE_LIMIT_PER_MINUTE
    )
      throw new DomainError(
        429,
        'RATE_LIMITED',
        'Bạn thao tác đấu giá quá nhanh. Hãy thử lại sau ít phút.',
      );
    const own = await tx.c.auction_bidders.findOne({ _id: `${id}:${actorId}` });
    if (!own && newParticipation)
      await this.checkParticipationQuota(tx, actorId);
    return { a, now, own };
  }
  private async checkParticipationQuota(tx: Tx, userId: string) {
    const rows = await tx.c.auction_bidders
      .find({ bidderId: userId }, { sort: { firstBidAt: -1 }, limit: 200 })
      .toArray();
    const open = await tx.c.auctions.countDocuments({
      $or: [
        {
          _id: { $in: rows.map((r) => r.auctionId) },
          state: { $in: ['Active', 'OnHold'] },
        },
        {
          winnerId: userId,
          state: { $in: ['BuyNowPending', 'AwaitingWinnerPayment'] },
        },
      ],
    });
    if (open >= MAX_OPEN_PARTICIPATIONS)
      throw new DomainError(
        429,
        'RATE_LIMITED',
        'Bạn đang tham gia tối đa 5 phiên đấu giá chưa kết thúc.',
      );
  }

  // ------------------------------------------------- bidder commands
  bid(context: CommandContext, id: string, body: Wire['PlaceAuctionBid']) {
    return this.engineCommand(
      context,
      'placeAuctionBid',
      id,
      body,
      (actorId) => ({
        kind: 'Manual',
        bidderId: actorId,
        amount: body.amount,
      }),
    );
  }
  setAuto(
    context: CommandContext,
    id: string,
    body: Wire['SetAuctionAutoBid'],
  ) {
    return this.engineCommand(
      context,
      'setAuctionAutoBid',
      id,
      body,
      (actorId) => ({
        kind: 'AutoSet',
        bidderId: actorId,
        max: body.maxAmount,
      }),
    );
  }
  disableAuto(
    context: CommandContext,
    id: string,
    body: Wire['DisableAuctionAutoBid'],
  ) {
    return this.engineCommand(
      context,
      'disableAuctionAutoBid',
      id,
      body,
      (actorId) => ({ kind: 'AutoDisable', bidderId: actorId }),
    );
  }

  private engineCommand(
    context: CommandContext,
    operation: Extract<
      AuctionOperation,
      'placeAuctionBid' | 'setAuctionAutoBid' | 'disableAuctionAutoBid'
    >,
    id: string,
    body: object,
    action: (actorId: string) => EngineAction,
  ) {
    return this.commands.runAuction(context, operation, id, body, {
      discover: async (tx) => [(await this.auction(tx, id)).sellerId],
      authorize: async (tx, actor) => {
        const a = await this.auction(tx, id);
        await this.eligibleBidder(tx, actor, a);
        return a;
      },
      mutate: async (tx, actor, _before, receiptId) => {
        const act = action(actor._id);
        const { a, now, own } = await this.lockForBid(
          tx,
          context.auth,
          actor._id,
          id,
          act.kind !== 'AutoDisable',
        );
        const bidders = await tx.c.auction_bidders
          .find({ auctionId: a._id })
          .toArray();
        let result;
        try {
          result = apply(a, bidders, act);
        } catch (e) {
          if (!(e instanceof EngineError)) throw e;
          const field = act.kind === 'AutoSet' ? 'maxAmount' : 'amount';
          if (e.reason === 'BelowMinimum')
            throw new DomainError(
              409,
              'BidTooLow',
              `Giá đã thay đổi. Mức tối thiểu hiện tại là ${e.minimumBid.toLocaleString('vi-VN')}đ.`,
            );
          if (e.reason === 'OffGrid')
            invalidField(
              field,
              'Giá phải bằng giá khởi điểm cộng một số bước giá.',
            );
          if (e.reason === 'OutOfRange')
            invalidField(field, 'Giá phải từ 10.000đ đến 1.000.000đ.');
          throw new DomainError(
            409,
            'InvalidState',
            rejectionMessages[e.reason],
          );
        }
        const bidder: AuctionBidderDoc = own
          ? {
              ...own,
              mode: result.bidder.mode,
              level: result.bidder.level,
              levelSequence: result.bidder.levelSequence,
              updatedAt: now,
              version: own.version + 1,
            }
          : {
              _id: `${a._id}:${actor._id}`,
              auctionId: a._id,
              bidderId: actor._id,
              alias: a.bidderCount + 1,
              mode: result.bidder.mode,
              level: result.bidder.level,
              levelSequence: result.bidder.levelSequence,
              fulfillmentMethod: 'SelfCollect',
              firstBidAt: now,
              updatedAt: now,
              version: 1,
              lockSeq: 0,
            };
        if (own) {
          const updated = await tx.c.auction_bidders.updateOne(
            { _id: own._id, version: own.version },
            {
              $set: {
                mode: bidder.mode,
                level: bidder.level,
                levelSequence: bidder.levelSequence,
                updatedAt: now,
              },
              $inc: { version: 1 },
            },
          );
          if (updated.modifiedCount !== 1) throw conflict();
        } else await tx.c.auction_bidders.insertOne(bidder);
        await tx.c.auction_bids.insertOne({
          _id: randomUUID(),
          auctionId: a._id,
          bidderId: actor._id,
          kind: act.kind,
          amount:
            act.kind === 'Manual'
              ? act.amount
              : act.kind === 'AutoSet'
                ? act.max
                : null,
          levelSequence: result.levelSequence,
          priceBefore: a.currentPrice,
          priceAfter: result.currentPrice,
          leaderAfter: result.leaderId,
          receiptId,
          decidedAt: now,
        });
        const next = await this.update(
          tx,
          a,
          {
            currentPrice: result.currentPrice,
            leaderId: result.leaderId,
            nextSequence: result.nextSequence,
            bidderCount: a.bidderCount + (own ? 0 : 1),
            bidCount: a.bidCount + 1,
          },
          now,
        );
        return this.change(
          next,
          now,
          next.currentPrice !== a.currentPrice || next.leaderId !== a.leaderId
            ? 'AuctionPriceChanged'
            : 'AuctionCommitmentChanged',
          actor._id,
        );
      },
    });
  }

  // FR-AU06: only before the first valid bid, under the same auction lock as
  // bids, so a racing bid and Buy Now have exactly one winner.
  buyNow(context: CommandContext, id: string, body: Wire['BuyAuctionNow']) {
    return this.commands.runAuction(context, 'buyAuctionNow', id, body, {
      discover: async (tx) => [(await this.auction(tx, id)).sellerId],
      authorize: async (tx, actor) => {
        const a = await this.auction(tx, id);
        await this.eligibleBidder(tx, actor, a);
        return a;
      },
      mutate: async (tx, actor, _before, receiptId) => {
        const { a, now } = await this.lockForBid(
          tx,
          context.auth,
          actor._id,
          id,
          true,
        );
        if (a.bidderCount > 0 || a.buyNowPrice === null)
          throw new DomainError(
            409,
            'InvalidState',
            'Mua ngay chỉ khả dụng trước lượt trả giá đầu tiên.',
          );
        const paymentDeadline = new Date(now.getTime() + BUY_NOW_PAYMENT_MS);
        const order = await this.orders.form(
          tx,
          a,
          actor._id,
          a.buyNowPrice,
          paymentDeadline,
          now,
          receiptId,
        );
        await tx.c.auction_bids.insertOne({
          _id: randomUUID(),
          auctionId: a._id,
          bidderId: actor._id,
          kind: 'BuyNow',
          amount: a.buyNowPrice,
          levelSequence: null,
          priceBefore: null,
          priceAfter: null,
          leaderAfter: null,
          receiptId,
          decidedAt: now,
        });
        const next = await this.update(
          tx,
          a,
          {
            state: 'BuyNowPending',
            winnerId: actor._id,
            finalPrice: a.buyNowPrice,
            closedAt: now,
            paymentDeadline,
            orderId: order._id,
            bidCount: a.bidCount + 1,
          },
          now,
        );
        return this.change(next, now, 'AuctionBoughtNow', actor._id);
      },
    });
  }

  // ADMIN independent of the seller and every bidder; never picks a winner.
  cancel(context: CommandContext, id: string, body: Wire['CancelAuction']) {
    return this.commands.runAuction(context, 'cancelAuction', id, body, {
      discover: async (tx) => [(await this.auction(tx, id)).sellerId],
      authorize: async (tx, actor) => {
        requireActive(actor);
        if (!actor.roles.some((r) => r.role === 'ADMIN'))
          throw new DomainError(
            403,
            'FORBIDDEN',
            'Chỉ quản trị viên được hủy phiên.',
          );
        const a = await this.auction(tx, id);
        if (
          actor._id === a.sellerId ||
          (await tx.c.auction_bidders.findOne({ _id: `${id}:${actor._id}` }))
        )
          throw new DomainError(
            403,
            'SelfReviewForbidden',
            'Bạn đang liên quan đến phiên này nên không được hủy.',
          );
        return a;
      },
      mutate: async (tx, actor, _before, _receiptId) => {
        await tx.lock('auctions', [id]);
        const a = await this.auction(tx, id);
        if (a.version !== body.expectedVersion) throw conflict();
        if (a.state !== 'Active' && a.state !== 'OnHold') throw invalidState();
        const now = await this.clock.decision(tx, context.auth);
        const reason = body.reason.trim();
        if (reason.length < 10)
          invalidField('reason', 'Hãy ghi lý do hủy ít nhất 10 ký tự.');
        const next = await this.update(
          tx,
          a,
          { state: 'Cancelled', closedAt: now, cancelReason: reason },
          now,
        );
        await this.intakes.requireReclaim(
          tx,
          a.intakeId,
          'AuctionCancelled',
          now,
        );
        return this.change(next, now, 'AuctionCancelled', actor._id, reason);
      },
    });
  }

  // ---------------------------------------------------------- workers
  // FR-AU07/09: idempotent close keyed by the auction id. Payment deadline is
  // endAt + 24h whenever the worker runs; a late worker records the expiry.
  close(id: string) {
    return this.commands.systemAuction('AuctionClose', id, {
      discover: async (tx) => {
        const a = await this.auction(tx, id);
        return [a.sellerId, ...(a.leaderId ? [a.leaderId] : [])];
      },
      authorize: (tx) => this.auction(tx, id),
      mutate: async (tx, before, receiptId) => {
        await tx.lock('auctions', [id]);
        const a = await this.auction(tx, id);
        if (a.leaderId !== before.leaderId) throw conflict();
        const now = await this.clock.now(tx);
        if (a.state !== 'Active' || now < a.endAt) throw invalidState();
        if (!a.leaderId) {
          const next = await this.update(
            tx,
            a,
            { state: 'Unsold', closedAt: now },
            now,
          );
          await this.reclaim(tx, a, 'Unsold', now);
          return this.change(next, now, 'AuctionUnsold', null);
        }
        const users = await tx.c.users
          .find({ _id: { $in: [a.sellerId, a.leaderId] } })
          .toArray();
        if (
          users.length !== 2 ||
          users.some((u) => u.status !== 'ACTIVE' || !u.emailVerifiedAt)
        ) {
          // Never silently drop bids or promote the runner-up.
          const next = await this.update(tx, a, { state: 'OnHold' }, now);
          return this.change(next, now, 'AuctionOnHold', null);
        }
        const deadline = new Date(a.endAt.getTime() + AUCTION_PAYMENT_MS);
        // A worker later than the payment deadline records the expiry and
        // forms no Order that could never be paid.
        const expired = now >= deadline;
        const order = expired
          ? null
          : await this.orders.form(
              tx,
              a,
              a.leaderId,
              a.currentPrice!,
              deadline,
              now,
              receiptId,
            );
        const next = await this.update(
          tx,
          a,
          {
            state: expired ? 'PaymentExpired' : 'AwaitingWinnerPayment',
            winnerId: a.leaderId,
            finalPrice: a.currentPrice,
            closedAt: now,
            paymentDeadline: deadline,
            orderId: order?._id ?? null,
          },
          now,
        );
        if (expired) await this.reclaim(tx, a, 'PaymentExpired', now);
        return this.change(
          next,
          now,
          expired ? 'AuctionPaymentExpired' : 'AuctionWon',
          null,
        );
      },
    });
  }

  // FR-AU08: no automatic charge, runner-up or relist; the book is reclaimed.
  expirePayment(id: string) {
    return this.commands.systemAuction('AuctionPaymentExpiry', id, {
      discover: async () => [],
      authorize: (tx) => this.auction(tx, id),
      mutate: async (tx, _before, receiptId) => {
        await tx.lock('auctions', [id]);
        const a = await this.auction(tx, id);
        const now = await this.clock.now(tx);
        if (
          (a.state !== 'BuyNowPending' &&
            a.state !== 'AwaitingWinnerPayment') ||
          now < a.paymentDeadline!
        )
          throw invalidState();
        if (a.orderId) await this.orders.expire(tx, a.orderId, now, receiptId);
        const next = await this.update(tx, a, { state: 'PaymentExpired' }, now);
        await this.reclaim(tx, a, 'PaymentExpired', now);
        return this.change(next, now, 'AuctionPaymentExpired', null);
      },
    });
  }
  private reclaim(tx: Tx, a: AuctionDoc, reason: ReclaimReason, now: Date) {
    return this.intakes.requireReclaim(tx, a.intakeId, reason, now);
  }

  // ------------------------------------------------------------- reads
  private async summary(
    a: AuctionDoc,
    now: Date,
  ): Promise<Wire['PublicAuctionSummary']> {
    const c = this.mongo.c;
    const item = await c.workflow_items.findOne({
      _id: `${a.contextId}:${a.listingId}`,
    });
    const point = await c.handover_points.findOne({ _id: a.pointId });
    const open = a.state === 'Active' && now < a.endAt;
    return {
      id: a._id,
      listingId: a.listingId,
      title: String((item?.snapshot as { title?: string })?.title ?? ''),
      state: a.state,
      startPrice: a.startPrice,
      step: a.step as 10000 | 50000,
      buyNowPrice: open && a.bidderCount === 0 ? a.buyNowPrice : null,
      currentPrice: a.currentPrice,
      minimumBid: open ? minimumBid(a) : null,
      bidderCount: a.bidderCount,
      startAt: a.startAt.toISOString(),
      endAt: a.endAt.toISOString(),
      pointName: point?.name ?? '',
      demoOnly: true,
    };
  }
  async listPublic(): Promise<Wire['PublicAuctionList']> {
    const now = await this.mongo.now();
    const rows = await this.mongo.c.auctions
      .find(
        { state: 'Active', endAt: { $gt: now } },
        {
          sort: { endAt: 1 },
          limit: 50,
        },
      )
      .toArray();
    const items = [];
    for (const a of rows) items.push(await this.summary(a, now));
    return { items, serverTime: now.toISOString() };
  }
  async readPublic(id: string): Promise<Wire['PublicAuction']> {
    const now = await this.mongo.now();
    const c = this.mongo.c;
    const a = await c.auctions.findOne({ _id: id });
    if (!a) throw notFound();
    const bidders = await c.auction_bidders.find({ auctionId: id }).toArray();
    const alias = new Map(bidders.map((b) => [b.bidderId, b.alias]));
    // Price changes only, with anonymous aliases; amounts of Auto ceilings and
    // non-moving commands are never shown (FR-AU10).
    const bids = await c.auction_bids
      .find(
        { auctionId: id, priceAfter: { $ne: null } },
        {
          sort: { decidedAt: -1 },
          limit: 400,
        },
      )
      .toArray();
    const history = bids
      .filter((b) => b.priceAfter !== b.priceBefore || b.priceBefore === null)
      .slice(0, 200)
      .map((b) => ({
        price: b.priceAfter!,
        bidderAlias: alias.get(b.leaderAfter!)!,
        at: b.decidedAt.toISOString(),
      }));
    return {
      auction: await this.summary(a, now),
      leaderAlias: a.leaderId ? (alias.get(a.leaderId) ?? null) : null,
      history,
      serverTime: now.toISOString(),
    };
  }
  participation(
    auth: Actor,
    id: string,
  ): Promise<Wire['AuctionParticipation']> {
    return this.commands.read(auth, async (tx, actor) => {
      member(actor);
      const a = await tx.c.auctions.findOne({ _id: id });
      const own = await tx.c.auction_bidders.findOne({
        _id: `${id}:${actor._id}`,
      });
      const boughtNow =
        a?.state !== undefined && !own && a.winnerId === actor._id;
      if (!a || (!own && !boughtNow)) throw notFound();
      const now = await tx.now();
      const open = a.state === 'Active' && now < a.endAt;
      const won = a.winnerId === actor._id;
      return {
        auctionId: a._id,
        alias: own?.alias ?? null,
        mode: own?.mode ?? null,
        ownLevel: own?.level ?? null,
        boughtNow,
        leading: a.leaderId === actor._id,
        state: a.state,
        currentPrice: a.currentPrice,
        minimumBid: open ? minimumBid(a) : null,
        fulfillmentMethod: 'SelfCollect',
        won,
        orderId: won ? a.orderId : null,
        finalPrice: won ? a.finalPrice : null,
        paymentDeadline: won
          ? (a.paymentDeadline?.toISOString() ?? null)
          : null,
        serverTime: now.toISOString(),
      };
    });
  }
}
