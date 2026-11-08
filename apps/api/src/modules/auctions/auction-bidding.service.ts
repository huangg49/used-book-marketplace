import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type {
  AuctionBidderDoc,
  AuctionDoc,
  ReclaimReason,
} from '../../database/mongo/documents.js';
import {
  AUCTION_PAYMENT_MS,
} from '../../database/mongo/migrations/auction-constants.js';
import type { AuctionStep } from '../../database/mongo/migrations/auction-constants.js';
import { MongoService } from '../../database/mongo/mongo.service.js';
import { LedgerService } from '../wallet/ledger.service.js';
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
  MONEY_MAX,
  nextMinimumBid,
  type EngineAction,
} from './auction-engine.js';
import { checkAuction } from './auction-invariants.js';
import {
  SealedError,
  applySealed,
  dutchNextDropAt,
  dutchPrice,
  isSealed,
} from './auction-types.js';
import {
  notifyAuction,
  notifyAuctionFunds,
  type FundsReason,
} from './auction-notifications.js';
import { AuctionIntakesService } from './auction-intakes.service.js';
import { HandoverPointsService } from './handover-points.service.js';
import { recordViolation, requireUnrestricted } from './member-violations.js';
import { PointOrdersService } from './point-orders.service.js';
import { AuctionBookService } from './auction-book.service.js';
import { MongoPageService } from '../commands/mongo-page.service.js';
import {
  buyNowEndAt,
  buyNowOffered,
  commitmentCap,
  reachesBuyNow,
  notStarted,
  phaseOf,
  reschedule,
} from './auction-schedule.js';

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
  InvalidState: 'Thao tác không còn phù hợp với trạng thái phiên.',
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
    private readonly books: AuctionBookService,
    private readonly pages: MongoPageService,
    private readonly ledger: LedgerService,
    config: ConfigService,
  ) {
    // Only the test harness may switch the ADR 0071 check off, for historical
    // suites whose bidders were never funded; a dedicated suite keeps it on.
    this.fundsCheck = !(
      config.get<string>('NODE_ENV') === 'test' &&
      config.get<string>('AUCTION_BID_FUNDS_CHECK') === 'Off'
    );
  }
  private readonly fundsCheck: boolean;

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
    const open = phaseOf(a, decidedAt) !== 'Ended';
    // ADR 0076: a running sealed auction shows no price or standing.
    const hidden = open && isSealed(a.auctionType);
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
      currentPrice: hidden ? null : a.currentPrice,
      minimumBid: hidden
        ? a.startPrice
        : open && a.auctionType !== 'Dutch'
          ? nextMinimumBid(a)
          : null,
      leading:
        actorId && a.state === 'Active' && !hidden
          ? a.leaderId === actorId
          : null,
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
  // deadline, the seller and the per-account limits (POL-41). `mayLead` is
  // true for a command that can make a non-leader the leader or the winner;
  // it then counts the caller's live commitments and POL-17 restrictions.
  private async lockForBid(
    tx: Tx,
    auth: Actor,
    actorId: string,
    id: string,
    mayLead: boolean,
  ) {
    await tx.lock('auctions', [id]);
    await tx.lock('auction_bidders', [`${id}:${actorId}`]);
    const a = await this.auction(tx, id);
    const now = await this.clock.decision(tx, auth);
    if (a.state !== 'Active' || now >= a.endAt) throw closed();
    if (now < a.startAt) throw notStarted();
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
    if (mayLead && a.leaderId !== actorId) {
      await requireUnrestricted(tx, actorId, now);
      await this.checkParticipationQuota(tx, actorId, id);
    }
    return { a, now, own };
  }
  // ADR 0071: the wallet must cover this commitment plus the caller's open
  // ones (live auctions they lead elsewhere, unpaid auction orders). A check
  // at command time, not a hold: no ledger entry, PaymentExpired stays the net.
  private async requireFunds(
    tx: Tx,
    userId: string,
    auctionId: string,
    amount: number,
  ) {
    // ADR 0075: held amounts already left `available`; only commitments with
    // no hold (made before holds existed) still count as open here, and the
    // amount already held for this auction is reused.
    const heldHere = await this.ledger.auctionHeld(tx, userId, auctionId);
    const unheld = async (otherAuctionId: string) =>
      (await this.ledger.auctionHeld(tx, userId, otherAuctionId)) === 0;
    const leadingAll = await tx.c.auctions
      .find(
        {
          leaderId: userId,
          state: { $in: ['Active', 'OnHold'] },
          _id: { $ne: auctionId },
        },
        { projection: { currentPrice: 1 } },
      )
      .toArray();
    const unpaidAll = await tx.c.point_orders
      .find(
        { buyerId: userId, state: 'AwaitingPayment' },
        { projection: { buyerTotal: 1, auctionId: 1 } },
      )
      .toArray();
    const leading = [];
    for (const x of leadingAll) if (await unheld(x._id)) leading.push(x);
    const unpaid = [];
    for (const o of unpaidAll) if (await unheld(o.auctionId)) unpaid.push(o);
    const heldElsewhere =
      (await this.ledger.auctionHeld(tx, userId)) - heldHere;
    const open =
      leading.reduce((sum, x) => sum + (x.currentPrice ?? 0), 0) +
      unpaid.reduce((sum, o) => sum + o.buyerTotal, 0);
    const available = await this.ledger.available(tx, userId);
    if (available + heldHere >= amount + open) return;
    const vnd = (n: number) => `${n.toLocaleString('vi-VN')}đ`;
    throw new DomainError(
      409,
      'InvalidState',
      `Số dư khả dụng ${vnd(available)} chưa đủ cho mức ${vnd(amount)}` +
        (open
          ? ` cộng ${vnd(open)} đang cam kết ở phiên khác hoặc đơn chờ thanh toán`
          : '') +
        (heldElsewhere > 0
          ? ` (ví đang được giữ ${vnd(heldElsewhere)} cho phiên bạn dẫn giá hoặc đã thắng)`
          : '') +
        '. Hãy nạp thêm ví rồi thử lại.',
    );
  }
  // POL-41 counts commitments not yet released: auctions the user currently
  // leads (an outbid level no longer binds) and wins awaiting payment.
  private async checkParticipationQuota(
    tx: Tx,
    userId: string,
    auctionId: string,
  ) {
    const open = await tx.c.auctions.countDocuments({
      _id: { $ne: auctionId },
      $or: [
        { leaderId: userId, state: { $in: ['Active', 'OnHold'] } },
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
        'Bạn đang dẫn giá hoặc chờ thanh toán ở tối đa 5 phiên đấu giá.',
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

  // Bids, Auto and Buy Now share one path under the auction lock (ADR 0043:
  // Buy Now is a committed manual bid at buyNowPrice that opens a 60-second
  // window), so a racing first bid and Buy Now have exactly one winner.
  private engineCommand(
    context: CommandContext,
    operation: Extract<
      AuctionOperation,
      | 'placeAuctionBid'
      | 'setAuctionAutoBid'
      | 'disableAuctionAutoBid'
      | 'buyAuctionNow'
    >,
    id: string,
    body: object,
    action: (actorId: string, a: AuctionDoc) => EngineAction,
    buyNow = false,
  ) {
    return this.commands.runAuction(context, operation, id, body, {
      discover: async (tx) => [(await this.auction(tx, id)).sellerId],
      authorize: async (tx, actor) => {
        const a = await this.auction(tx, id);
        await this.eligibleBidder(tx, actor, a);
        return a;
      },
      mutate: async (tx, actor, _before, receiptId) => {
        const { a, now, own } = await this.lockForBid(
          tx,
          context.auth,
          actor._id,
          id,
          operation !== 'disableAuctionAutoBid',
        );
        if ((a.auctionType ?? 'English') !== 'English')
          throw new DomainError(
            409,
            'InvalidState',
            a.auctionType === 'Dutch'
              ? 'Phiên kiểu Hà Lan chỉ nhận lệnh chấp nhận giá hiện tại.'
              : 'Phiên đấu giá kín chỉ nhận một giá kín cho mỗi người.',
          );
        if (buyNow && !buyNowOffered(a, now))
          throw new DomainError(
            409,
            'InvalidState',
            'Mua ngay không còn khả dụng: giá hiện tại đã chạm giá mua ngay hoặc đã có người mua ngay.',
          );
        const act = action(actor._id, a);
        const cap = commitmentCap(a);
        if (
          cap !== null &&
          (act.kind === 'Manual' || act.kind === 'AutoSet') &&
          (act.kind === 'Manual' ? act.amount : act.max) > cap
        )
          throw new DomainError(
            409,
            'InvalidState',
            `Phiên này kết thúc ngay khi chạm giá mua ngay; mức tối đa là ${cap.toLocaleString('vi-VN')}đ.`,
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
              e.minimumBid > MONEY_MAX
                ? 'Giá đã đạt mức tối đa hệ thống; phiên không nhận thêm giá.'
                : `Giá đã thay đổi. Mức tối thiểu hiện tại là ${e.minimumBid.toLocaleString('vi-VN')}đ.`,
            );
          if (e.reason === 'OffGrid')
            invalidField(
              field,
              'Giá phải bằng giá khởi điểm cộng một số bước giá.',
            );
          if (e.reason === 'OutOfRange')
            invalidField(field, 'Giá phải từ 10.000đ trở lên.');
          throw new DomainError(
            409,
            'InvalidState',
            rejectionMessages[e.reason],
          );
        }
        if (this.fundsCheck && act.kind !== 'AutoDisable')
          await this.requireFunds(
            tx,
            actor._id,
            a._id,
            act.kind === 'AutoSet' ? act.max : act.amount,
          );
        const endsByBuyNow =
          buyNow || reachesBuyNow(a, result.currentPrice);
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
        // ADR 0075: only the leader's level is held. The lead only ever moves
        // to the actor, so a rival's bid never depends on the leader's wallet:
        // the displaced leader is released, the actor holds their new level
        // (Auto off lowers a leader's hold to the current price).
        const holdMoves: {
          holderId: string;
          delta: number;
          reason: FundsReason;
        }[] = [];
        if (this.fundsCheck) {
          if (a.leaderId && a.leaderId !== result.leaderId)
            holdMoves.push({
              holderId: a.leaderId,
              reason: 'Outbid',
              delta: await this.ledger.setAuctionHold(
                tx,
                a._id,
                a.leaderId,
                0,
                receiptId,
                now,
              ),
            });
          if (result.leaderId === actor._id)
            holdMoves.push({
              holderId: actor._id,
              reason: 'Leading',
              delta: await this.ledger.setAuctionHold(
                tx,
                a._id,
                actor._id,
                result.bidder.level,
                receiptId,
                now,
              ),
            });
        }
        await tx.c.auction_bids.insertOne({
          _id: randomUUID(),
          auctionId: a._id,
          bidderId: actor._id,
          kind: buyNow || act.kind === 'LeaderBuyNow' ? 'BuyNow' : act.kind,
          amount:
            act.kind === 'Manual' || act.kind === 'LeaderBuyNow'
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
            // ADR 0074: Buy Now, or any decided price that reaches it, ends by
            // the seller's mode (Instant: now; Challenge: ADR 0070 window).
            ...(endsByBuyNow
              ? {
                  buyNowAt: now,
                  endAt: buyNowEndAt(a, a.leaderId === actor._id, now),
                }
              : {}),
          },
          now,
        );
        if (a.leaderId && next.leaderId !== a.leaderId)
          await notifyAuction(tx, next, 'AuctionOutbid', [a.leaderId], now);
        for (const m of holdMoves)
          await notifyAuctionFunds(tx, next, m.holderId, m.delta, m.reason, now);
        if (endsByBuyNow) {
          await notifyAuction(tx, next, 'AuctionBoughtNow', [a.sellerId], now);
          return this.change(next, now, 'AuctionBoughtNow', actor._id);
        }
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

  // FR-AU06/ADR 0043, widened by ADR 0047: while live, unused and above the
  // current price, also after bids. The buyer commits to buyNowPrice (an
  // earlier equal Auto ceiling keeps the lead by sequence); others may outbid
  // until min(endAt, now + 60 s) for the leader's Buy Now or now + 5 min for a
  // non-leader's (ADR 0070), then the normal close decides the winner.
  buyNow(context: CommandContext, id: string, body: Wire['BuyAuctionNow']) {
    return this.engineCommand(
      context,
      'buyAuctionNow',
      id,
      body,
      (actorId, a) => ({
        kind: a.leaderId === actorId ? 'LeaderBuyNow' : 'Manual',
        bidderId: actorId,
        amount: a.buyNowPrice!,
      }),
      true,
    );
  }

  // ADR 0047: the seller moves the start/length before the first bid. Locks
  // only the auction, like bids, Buy Now and close, so an edit and a racing
  // first bid or close have exactly one order.
  reschedule(
    context: CommandContext,
    id: string,
    body: Wire['RescheduleAuction'],
  ) {
    return this.commands.runAuction(context, 'rescheduleAuction', id, body, {
      authorize: async (tx, actor) => {
        member(actor);
        const a = await this.auction(tx, id);
        if (a.sellerId !== actor._id) throw notFound();
        return a;
      },
      mutate: async (tx, actor) => {
        requireActive(actor);
        await tx.lock('auctions', [id]);
        const a = await this.auction(tx, id);
        if (a.version !== body.expectedVersion) throw conflict();
        const now = await this.clock.decision(tx, context.auth);
        await requireUnrestricted(tx, actor._id, now);
        const { startAt, plannedEndAt } = reschedule(a, body, now);
        const next = await this.update(
          tx,
          a,
          {
            startAt,
            plannedEndAt,
            endAt: plannedEndAt,
            scheduleRevision: a.scheduleRevision + 1,
          },
          now,
        );
        return this.change(next, now, 'AuctionRescheduled', actor._id);
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
      mutate: async (tx, actor, _before, receiptId) => {
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
        const bidders = await tx.c.auction_bidders
          .find({ auctionId: a._id }, { projection: { bidderId: 1 } })
          .toArray();
        await notifyAuction(
          tx,
          next,
          'AuctionCancelled',
          [a.sellerId, ...bidders.map((b) => b.bidderId)],
          now,
        );
        await this.releaseHolds(tx, next, null, 'Cancelled', receiptId, now);
        return this.change(next, now, 'AuctionCancelled', actor._id, reason);
      },
    });
  }

  // ---------------------------------------------------------- workers
  // FR-AU09: the seller and the current leader must be ACTIVE verified members.
  private async partiesEligible(tx: Tx, a: AuctionDoc) {
    const ids = [...new Set([a.sellerId, ...(a.leaderId ? [a.leaderId] : [])])];
    const users = await tx.c.users.find({ _id: { $in: ids } }).toArray();
    return (
      users.length === ids.length &&
      users.every((u) => u.status === 'ACTIVE' && !!u.emailVerifiedAt)
    );
  }

  // FR-AU09: an Active auction whose seller or leader lost eligibility is held
  // at once, not only at the close. Bids are kept and no runner-up is promoted;
  // an independent Admin decides (cancel). Keyed by the auction: held once.
  hold(id: string) {
    return this.commands.systemAuction('AuctionHold', id, {
      discover: async (tx) => {
        const a = await this.auction(tx, id);
        return [a.sellerId, ...(a.leaderId ? [a.leaderId] : [])];
      },
      authorize: (tx) => this.auction(tx, id),
      mutate: async (tx, before) => {
        await tx.lock('auctions', [id]);
        const a = await this.auction(tx, id);
        if (a.leaderId !== before.leaderId) throw conflict();
        const now = await this.clock.now(tx);
        if (a.state !== 'Active' || now >= a.endAt) throw invalidState();
        if (await this.partiesEligible(tx, a)) throw invalidState();
        const next = await this.update(tx, a, { state: 'OnHold' }, now);
        await notifyAuction(
          tx,
          next,
          'AuctionOnHold',
          [a.sellerId, a.leaderId],
          now,
        );
        return this.change(next, now, 'AuctionOnHold', null);
      },
    });
  }

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
          await notifyAuction(tx, next, 'AuctionUnsold', [a.sellerId], now);
          return this.change(next, now, 'AuctionUnsold', null);
        }
        if (!(await this.partiesEligible(tx, a))) {
          // Never silently drop bids or promote the runner-up.
          const next = await this.update(tx, a, { state: 'OnHold' }, now);
          await notifyAuction(
            tx,
            next,
            'AuctionOnHold',
            [a.sellerId, a.leaderId],
            now,
          );
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
        await this.releaseHolds(
          tx,
          next,
          expired ? null : { holderId: a.leaderId, amount: a.currentPrice! },
          expired ? 'Expired' : 'Closed',
          receiptId,
          now,
        );
        if (expired) {
          await this.reclaim(tx, a, 'PaymentExpired', now);
          await notifyAuction(
            tx,
            next,
            'AuctionPaymentExpired',
            [a.leaderId, a.sellerId],
            now,
          );
        } else {
          await notifyAuction(tx, next, 'AuctionWon', [a.leaderId], now);
          await notifyAuction(tx, next, 'AuctionSold', [a.sellerId], now);
        }
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
        // FR-AU08: the winner had the whole payment window on server time.
        await recordViolation(tx, {
          userId: a.winnerId!,
          kind: 'AuctionNonPayment',
          sourceId: a._id,
          recordedAt: now,
          receiptId,
        });
        const next = await this.update(tx, a, { state: 'PaymentExpired' }, now);
        await this.releaseHolds(tx, next, null, 'Expired', receiptId, now);
        await this.reclaim(tx, a, 'PaymentExpired', now);
        await notifyAuction(
          tx,
          next,
          'AuctionPaymentExpired',
          [a.winnerId, a.sellerId],
          now,
        );
        return this.change(next, now, 'AuctionPaymentExpired', null);
      },
    });
  }
  // ADR 0075: release every hold on the auction except `keep` (the winner's
  // final price until payment). Each holder hears about their own release.
  private async releaseHolds(
    tx: Tx,
    a: AuctionDoc,
    keep: { holderId: string; amount: number } | null,
    reason: FundsReason,
    receiptId: string,
    now: Date,
  ) {
    const holds = await tx.c.wallet_accounts
      .find({ purpose: 'AuctionBidHold', auctionId: a._id })
      .toArray();
    for (const h of holds) {
      const target = keep && h.holderId === keep.holderId ? keep.amount : 0;
      const delta = await this.ledger.setAuctionHold(
        tx,
        a._id,
        h.holderId!,
        target,
        receiptId,
        now,
      );
      // A winner whose hold covered more than the final price gets the rest.
      if (delta < 0)
        await notifyAuctionFunds(tx, a, h.holderId!, delta, reason, now);
    }
  }
  private reclaim(tx: Tx, a: AuctionDoc, reason: ReclaimReason, now: Date) {
    return this.intakes.requireReclaim(tx, a.intakeId, reason, now);
  }

  // ------------------------------------------------------------- reads
  // ADR 0076: Dutch acceptance. The first member to accept the descending
  // price wins at the server price of that moment and the auction ends now.
  acceptDutch(
    context: CommandContext,
    id: string,
    body: Wire['AcceptDutchAuction'],
  ) {
    return this.commands.runAuction(context, 'acceptDutchAuction', id, body, {
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
        if (a.auctionType !== 'Dutch' || a.leaderId) throw invalidState();
        const price = dutchPrice(a, now);
        if (price > body.price)
          throw new DomainError(
            409,
            'InvalidState',
            `Giá hiện tại là ${price.toLocaleString('vi-VN')}đ, cao hơn mức bạn chấp nhận.`,
          );
        if (this.fundsCheck) {
          await this.requireFunds(tx, actor._id, a._id, price);
          await this.ledger.setAuctionHold(
            tx,
            a._id,
            actor._id,
            price,
            receiptId,
            now,
          );
        }
        await tx.c.auction_bidders.insertOne({
          _id: `${a._id}:${actor._id}`,
          auctionId: a._id,
          bidderId: actor._id,
          alias: a.bidderCount + 1,
          mode: 'Manual',
          level: price,
          levelSequence: a.nextSequence,
          fulfillmentMethod: 'SelfCollect',
          firstBidAt: now,
          updatedAt: now,
          version: 1,
          lockSeq: 0,
        });
        await tx.c.auction_bids.insertOne({
          _id: randomUUID(),
          auctionId: a._id,
          bidderId: actor._id,
          kind: 'Manual',
          amount: price,
          levelSequence: a.nextSequence,
          priceBefore: null,
          priceAfter: price,
          leaderAfter: actor._id,
          receiptId,
          decidedAt: now,
        });
        // Stored as an Instant Buy Now end (ADR 0074): buyNowAt = endAt = now.
        const next = await this.update(
          tx,
          a,
          {
            currentPrice: price,
            leaderId: actor._id,
            nextSequence: a.nextSequence + 1,
            bidderCount: a.bidderCount + 1,
            bidCount: a.bidCount + 1,
            buyNowAt: now,
            endAt: buyNowEndAt(a, false, now),
          },
          now,
        );
        await notifyAuction(tx, next, 'AuctionBoughtNow', [a.sellerId], now);
        if (this.fundsCheck)
          await notifyAuctionFunds(tx, next, actor._id, price, 'Leading', now);
        return this.change(next, now, 'AuctionBoughtNow', actor._id);
      },
    });
  }

  // ADR 0076: one hidden bid per member, raise only. Every sealed bidder's
  // whole bid is held (holding only the leader would reveal who leads); the
  // close keeps the winner's price and refunds everyone else.
  sealedBid(
    context: CommandContext,
    id: string,
    body: Wire['PlaceSealedBid'],
  ) {
    return this.commands.runAuction(context, 'placeSealedBid', id, body, {
      discover: async (tx) => [(await this.auction(tx, id)).sellerId],
      authorize: async (tx, actor) => {
        const a = await this.auction(tx, id);
        await this.eligibleBidder(tx, actor, a);
        return a;
      },
      mutate: async (tx, actor, _before, receiptId) => {
        const { a, now, own } = await this.lockForBid(
          tx,
          context.auth,
          actor._id,
          id,
          true,
        );
        if (!isSealed(a.auctionType)) throw invalidState();
        const bidders = await tx.c.auction_bidders
          .find({ auctionId: a._id })
          .toArray();
        let result;
        try {
          result = applySealed(a, bidders, actor._id, body.amount);
        } catch (e) {
          if (!(e instanceof SealedError)) throw e;
          if (e.reason === 'NotIncreasing')
            throw new DomainError(
              409,
              'InvalidState',
              'Giá kín mới phải cao hơn giá kín bạn đã gửi.',
            );
          invalidField(
            'amount',
            e.reason === 'OffGrid'
              ? 'Giá phải bằng giá khởi điểm cộng một số bước giá.'
              : `Giá kín tối thiểu ${a.startPrice.toLocaleString('vi-VN')}đ.`,
          );
        }
        let held = 0;
        if (this.fundsCheck) {
          await this.requireFunds(tx, actor._id, a._id, body.amount);
          held = await this.ledger.setAuctionHold(
            tx,
            a._id,
            actor._id,
            body.amount,
            receiptId,
            now,
          );
        }
        if (own) {
          const updated = await tx.c.auction_bidders.updateOne(
            { _id: own._id, version: own.version },
            {
              $set: {
                level: result.bidder.level,
                levelSequence: result.bidder.levelSequence,
                updatedAt: now,
              },
              $inc: { version: 1 },
            },
          );
          if (updated.modifiedCount !== 1) throw conflict();
        } else
          await tx.c.auction_bidders.insertOne({
            _id: `${a._id}:${actor._id}`,
            auctionId: a._id,
            bidderId: actor._id,
            alias: a.bidderCount + 1,
            mode: 'Manual',
            level: result.bidder.level,
            levelSequence: result.bidder.levelSequence,
            fulfillmentMethod: 'SelfCollect',
            firstBidAt: now,
            updatedAt: now,
            version: 1,
            lockSeq: 0,
          });
        await tx.c.auction_bids.insertOne({
          _id: randomUUID(),
          auctionId: a._id,
          bidderId: actor._id,
          kind: 'Manual',
          amount: body.amount,
          levelSequence: result.bidder.levelSequence,
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
        await notifyAuctionFunds(tx, next, actor._id, held, 'Leading', now);
        return this.change(next, now, 'AuctionCommitmentChanged', actor._id);
      },
    });
  }

  private async summary(
    a: AuctionDoc,
    now: Date,
  ): Promise<Wire['PublicAuctionSummary']> {
    const c = this.mongo.c;
    const item = await c.workflow_items.findOne({
      _id: `${a.contextId}:${a.listingId}`,
    });
    const point = await c.handover_points.findOne({ _id: a.pointId });
    const phase = phaseOf(a, now);
    const sealedLive = phase !== 'Ended' && isSealed(a.auctionType);
    return {
      id: a._id,
      phase,
      version: a.version,
      scheduleRevision: a.scheduleRevision,
      listingId: a.listingId,
      title: String((item?.snapshot as { title?: string })?.title ?? ''),
      state: a.state,
      startPrice: a.startPrice,
      step: a.step as AuctionStep,
      buyNowPrice:
        phase === 'Scheduled' || buyNowOffered(a, now) ? a.buyNowPrice : null,
      buyNowAt: a.buyNowAt?.toISOString() ?? null,
      buyNowMode: a.buyNowMode,
      auctionType: a.auctionType,
      dutchTopPrice: a.dutchTopPrice,
      dutchIntervalSeconds: a.dutchIntervalSeconds,
      dutchPrice:
        a.auctionType === 'Dutch' && phase === 'Live' ? dutchPrice(a, now) : null,
      dutchNextDropAt:
        a.auctionType === 'Dutch' && phase === 'Live'
          ? (dutchNextDropAt(a, now)?.toISOString() ?? null)
          : null,
      // ADR 0076: a running sealed auction shows only the start and count.
      currentPrice: sealedLive ? null : a.currentPrice,
      minimumBid:
        phase === 'Ended' || a.auctionType === 'Dutch'
          ? null
          : sealedLive
            ? a.startPrice
            : nextMinimumBid(a),
      bidderCount: a.bidderCount,
      startAt: a.startAt.toISOString(),
      endAt: a.endAt.toISOString(),
      pointName: point?.name ?? '',
      book: await this.books.book(a),
      demoOnly: true,
    };
  }
  // ADR 0047: live (started, ending soonest) or upcoming (starting soonest).
  async listPublic(
    query: Record<string, string | number> = {},
  ): Promise<Wire['PublicAuctionList']> {
    const now = await this.mongo.now();
    const upcoming = query.phase === 'upcoming';
    const rows = await this.mongo.c.auctions
      .find(
        upcoming
          ? { state: 'Active', startAt: { $gt: now } }
          : { state: 'Active', startAt: { $lte: now }, endAt: { $gt: now } },
        {
          sort: upcoming ? { startAt: 1 } : { endAt: 1 },
          limit: 50,
        },
      )
      .toArray();
    const items: Wire['PublicAuctionSummary'][] = [];
    // Bound concurrent snapshot reads instead of serially opening up to 50 sessions.
    for (let offset = 0; offset < rows.length; offset += 4) {
      items.push(
        ...(await Promise.all(
          rows.slice(offset, offset + 4).map((a) => this.summary(a, now)),
        )),
      );
    }
    return { items, serverTime: now.toISOString() };
  }
  // ADMIN cancel queue: open or held auctions with the version `cancel` needs.
  // Auctions the Admin sells or bids in are left out, as `cancel` refuses them.
  listForAdmin(auth: Actor): Promise<Wire['OperationsAuctionList']> {
    return this.commands.read(auth, async (tx, actor) => {
      requireActive(actor);
      if (!actor.roles.some((r) => r.role === 'ADMIN'))
        throw new DomainError(
          403,
          'FORBIDDEN',
          'Chỉ quản trị viên được xem danh sách này.',
        );
      const now = await tx.now();
      const rows = await tx.c.auctions
        .find(
          {
            $or: [
              { state: 'Active', endAt: { $gt: now } },
              { state: 'OnHold' },
            ],
            sellerId: { $ne: actor._id },
          },
          { sort: { endAt: 1, _id: 1 }, limit: 100 },
        )
        .toArray();
      const items: Wire['OperationsAuctionItem'][] = [];
      for (const a of rows) {
        if (items.length === 50) break;
        if (await tx.c.auction_bidders.findOne({ _id: `${a._id}:${actor._id}` }))
          continue;
        const item = await tx.c.workflow_items.findOne({
          _id: `${a.contextId}:${a.listingId}`,
        });
        const point = await tx.c.handover_points.findOne({ _id: a.pointId });
        items.push({
          id: a._id,
          version: a.version,
          phase: phaseOf(a, now),
          title: String((item?.snapshot as { title?: string })?.title ?? ''),
          state: a.state as 'Active' | 'OnHold',
          startPrice: a.startPrice,
          step: a.step as AuctionStep,
          currentPrice: a.currentPrice,
          bidderCount: a.bidderCount,
          startAt: a.startAt.toISOString(),
          endAt: a.endAt.toISOString(),
          pointName: point?.name ?? '',
        });
      }
      return { items, serverTime: now.toISOString() };
    });
  }
  listMine(
    auth: Actor,
    query: Record<string, string | number>,
  ): Promise<Wire['MyAuctionPage']> {
    return this.commands.read(auth, async (tx, actor) => {
      member(actor);
      const now = await tx.now();
      const view = String(query.view ?? 'all');
      const page = await this.pages.page(
        tx.c.auctions,
        [
          {
            $lookup: {
              from: 'auction_bidders',
              localField: '_id',
              foreignField: 'auctionId',
              pipeline: [{ $match: { bidderId: actor._id } }, { $limit: 1 }],
              as: 'own',
            },
          },
          {
            $match: {
              $or: [
                { sellerId: actor._id },
                { winnerId: actor._id },
                { 'own.0': { $exists: true } },
              ],
            },
          },
          {
            $lookup: {
              from: 'point_orders',
              localField: 'orderId',
              foreignField: '_id',
              pipeline: [
                {
                  $match: {
                    buyerId: actor._id,
                    state: 'AwaitingPayment',
                    paymentDeadline: { $gt: now },
                  },
                },
              ],
              as: 'payable',
            },
          },
          ...(view === 'active'
            ? [
                {
                  $match: {
                    state: 'Active',
                    startAt: { $lte: now },
                    endAt: { $gt: now },
                  },
                },
              ]
            : []),
          ...(view === 'upcoming'
            ? [{ $match: { state: 'Active', startAt: { $gt: now } } }]
            : []),
          ...(view === 'payment'
            ? [
                {
                  $match: {
                    winnerId: actor._id,
                    'payable.0': { $exists: true },
                  },
                },
              ]
            : []),
          ...(view === 'selling' ? [{ $match: { sellerId: actor._id } }] : []),
          { $project: { key: '$startAt' } },
        ],
        {
          kind: 'time',
          ascending: false,
          scope: { operation: 'listMyAuctions', actor: actor._id, view },
          limit: Number(query.limit ?? 12),
          cursor: query.cursor as string | undefined,
        },
      );
      const items: Wire['MyAuctionPage']['items'] = [];
      for (const id of page.ids) {
        const a = await tx.c.auctions.findOne({ _id: id });
        if (!a) continue;
        const own = await tx.c.auction_bidders.findOne({
          auctionId: a._id,
          bidderId: actor._id,
        });
        const seller = a.sellerId === actor._id;
        const won = a.winnerId === actor._id;
        if (!seller && !own && !won) continue;
        const order =
          won && a.orderId
            ? await tx.c.point_orders.findOne({
                _id: a.orderId,
                buyerId: actor._id,
              })
            : null;
        items.push({
          auction: await this.summary(a, now),
          role: seller ? 'Seller' : 'Bidder',
          leading: !seller && a.leaderId === actor._id,
          won: !seller && won,
          needsPayment:
            !!order &&
            order.state === 'AwaitingPayment' &&
            !!order.paymentDeadline &&
            order.paymentDeadline > now,
          paymentDeadline: order?.paymentDeadline?.toISOString() ?? null,
        });
      }
      return {
        items,
        nextCursor: page.nextCursor,
        serverTime: page.serverTime,
      };
    });
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
    const sealedLive =
      phaseOf(a, now) !== 'Ended' && isSealed(a.auctionType);
    return {
      auction: await this.summary(a, now),
      leaderAlias:
        a.leaderId && !sealedLive ? (alias.get(a.leaderId) ?? null) : null,
      history: sealedLive ? [] : history,
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
      // Legacy BuyNowPending buyers have no bidder row; since ADR 0043 the
      // Buy Now buyer is a bidder whose first commitment was the BuyNow row.
      const boughtNow =
        a?.state !== undefined &&
        ((!own && a.winnerId === actor._id) ||
          (!!own &&
            !!a.buyNowAt &&
            !!(await tx.c.auction_bids.findOne({
              auctionId: id,
              bidderId: actor._id,
              kind: 'BuyNow',
            }))));
      if (!a || (!own && !boughtNow)) throw notFound();
      const now = await tx.now();
      const open = phaseOf(a, now) === 'Live';
      const won = a.winnerId === actor._id;
      const sealedLive = phaseOf(a, now) !== 'Ended' && isSealed(a.auctionType);
      return {
        auctionId: a._id,
        alias: own?.alias ?? null,
        mode: own?.mode ?? null,
        ownLevel: own?.level ?? null,
        heldAmount: await this.ledger.auctionHeld(tx, actor._id, a._id),
        boughtNow,
        leading: !sealedLive && a.leaderId === actor._id,
        state: a.state,
        currentPrice: sealedLive ? null : a.currentPrice,
        minimumBid: !open
          ? null
          : sealedLive
            ? a.startPrice
            : a.auctionType === 'Dutch'
              ? null
              : nextMinimumBid(a),
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
