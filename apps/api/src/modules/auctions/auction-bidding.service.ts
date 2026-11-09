import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type {
  AuctionBidderDoc,
  AuctionDoc,
  AuctionRegistrationDoc,
  ReclaimReason,
} from '../../database/mongo/documents.js';
import {
  AUCTION_PAYMENT_MS,
} from '../../database/mongo/migrations/auction-constants.js';
import { SECOND_CHANCE_MS } from '../../database/mongo/migrations/0074-auction-second-chance.js';
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
  rank,
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
  notifyDepositShare,
  notifyBelowMinimum,
  type FundsReason,
} from './auction-notifications.js';
import { AuctionIntakesService } from './auction-intakes.service.js';
import { HandoverPointsService } from './handover-points.service.js';
import {
  recordViolation,
  requireUnrestricted,
  restrictedUntil,
} from './member-violations.js';
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
  latestStartAt,
  fullWithdrawUntil,
  lifecycleReschedule,
  reachedFields,
  unreachedFields,
  registrationExpired,
  requireWaiting,
  holdFields,
  pauseBudgetLeft,
  resumeFields,
} from './auction-schedule.js';
import { stepKey } from './system-key.js';

const RATE_LIMIT_PER_MINUTE = 30;
// ADR 0079/0084: when an OnHold auction auto-cancels.
const holdExpiry = (a: AuctionDoc) =>
  a.state === 'OnHold' && a.holdUntil ? a.holdUntil.toISOString() : null;
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
    if (mayLead) await this.requireRegistered(tx, a, actorId);
    if (mayLead && a.leaderId !== actorId) {
      await requireUnrestricted(tx, actorId, now);
      await this.checkParticipationQuota(tx, actorId, id);
    }
    return { a, now, own };
  }
  // ADR 0077: an auction with registration takes commitments only from
  // registered members, and only once enough members have registered.
  private registrationOf(tx: Tx, a: AuctionDoc, userId: string) {
    if (a.minBidders === null) return Promise.resolve(null);
    return tx.c.auction_registrations.findOne({ _id: `${a._id}:${userId}` });
  }
  private async requireRegistered(tx: Tx, a: AuctionDoc, userId: string) {
    if (a.minBidders === null) return;
    const r = await this.registrationOf(tx, a, userId);
    if (r?.state !== 'Registered')
      throw new DomainError(
        409,
        'InvalidState',
        'Bạn cần đăng ký tham gia và đặt cọc trước khi trả giá ở phiên này.',
      );
    if (a.registeredCount < a.minBidders)
      throw new DomainError(
        409,
        'InvalidState',
        `Phiên mở trả giá khi đủ ${a.minBidders} người đăng ký (hiện có ${a.registeredCount}).`,
      );
  }
  // ADR 0077: a registered member's hold never falls below their deposit
  // while the registration stands (one hold per member and auction).
  private async holdTo(
    tx: Tx,
    a: AuctionDoc,
    holderId: string,
    level: number,
    receiptId: string,
    now: Date,
  ) {
    const r = await this.registrationOf(tx, a, holderId);
    const floor = r?.state === 'Registered' ? r.deposit : 0;
    return this.ledger.setAuctionHold(
      tx,
      a._id,
      holderId,
      Math.max(level, floor),
      receiptId,
      now,
    );
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
  // ADR 0083: registration takes the POL-41 limits bids already have. A
  // standing registration (its deposit is held) counts as an open
  // participation, with auctions led or won awaiting payment; registering and
  // withdrawing share the per-minute limit; re-registering on the same
  // auction waits a minute after a withdrawal.
  private async checkRegistrationLimits(
    tx: Tx,
    userId: string,
    auctionId: string,
    own: AuctionRegistrationDoc | null,
    now: Date,
  ) {
    const minuteAgo = new Date(now.getTime() - 60_000);
    const tooFast = () =>
      new DomainError(
        429,
        'RATE_LIMITED',
        'Bạn thao tác đăng ký đấu giá quá nhanh. Hãy thử lại sau ít phút.',
      );
    if (own?.state === 'Withdrawn' && own.updatedAt > minuteAgo)
      throw tooFast();
    if (
      (await tx.c.auction_registrations.countDocuments({
        userId,
        updatedAt: { $gt: minuteAgo },
      })) >= RATE_LIMIT_PER_MINUTE
    )
      throw tooFast();
    const registered = await tx.c.auction_registrations
      .find(
        { userId, state: 'Registered', auctionId: { $ne: auctionId } },
        { projection: { auctionId: 1 } },
      )
      .toArray();
    const engaged = await tx.c.auctions
      .find(
        {
          _id: { $ne: auctionId },
          $or: [
            { leaderId: userId, state: { $in: ['Active', 'OnHold'] } },
            {
              winnerId: userId,
              state: { $in: ['BuyNowPending', 'AwaitingWinnerPayment'] },
            },
          ],
        },
        { projection: { _id: 1 } },
      )
      .toArray();
    const open = new Set([
      ...registered.map((r) => r.auctionId),
      ...engaged.map((a) => a._id),
    ]);
    if (open.size >= MAX_OPEN_PARTICIPATIONS)
      throw new DomainError(
        429,
        'RATE_LIMITED',
        'Bạn đang đăng ký, dẫn giá hoặc chờ thanh toán ở tối đa 5 phiên đấu giá.',
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
        // ADR 0077: an Instant end never sells to a lone bidder; it needs
        // another member's bid first (Challenge still leaves a window).
        if (
          endsByBuyNow &&
          a.minBidders !== null &&
          a.buyNowMode === 'Instant' &&
          a.bidderCount + (own ? 0 : 1) < 2
        )
          throw new DomainError(
            409,
            'InvalidState',
            buyNow
              ? 'Mua ngay ở phiên này kết thúc phiên ngay, nên chỉ dùng được khi đã có người khác trả giá.'
              : 'Mức này chạm giá mua ngay và sẽ kết thúc phiên ngay; cần có người khác trả giá trước.',
          );
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
              delta: await this.holdTo(
                tx,
                a,
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
              delta: await this.holdTo(
                tx,
                a,
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
        // ADR 0079/0081: a waiting registration auction moves its open time
        // within the fixed publish + 72 h ceiling; registrants hear about
        // every change. Already enough registrants: it opens at that time.
        if (a.openMode) {
          const s = lifecycleReschedule(a, body, now);
          const reached =
            a.minBidders !== null && a.registeredCount >= a.minBidders;
          const startAt = reached ? s.opensAt : s.startAt;
          const end = new Date(
            startAt.getTime() + (s.plannedEndAt.getTime() - s.startAt.getTime()),
          );
          const next = await this.update(
            tx,
            a,
            {
              openMode: s.openMode,
              opensAt: s.opensAt,
              startAt,
              plannedEndAt: end,
              endAt: end,
              scheduleRevision: a.scheduleRevision + 1,
              ...(reached ? { biddingOpenedAt: startAt } : {}),
            },
            now,
          );
          await notifyAuction(
            tx,
            next,
            'AuctionRescheduled',
            await this.registrantIds(tx, next),
            now,
          );
          return this.change(next, now, 'AuctionRescheduled', actor._id);
        }
        // ADR 0077: members registered and paid a deposit for this timing.
        if ((a.registeredCount ?? 0) > 0)
          throw new DomainError(
            409,
            'InvalidState',
            'Đã có người đăng ký và đặt cọc nên không đổi được thời gian phiên.',
          );
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

  // An ACTIVE ADMIN who is not the seller, a bidder or a registrant.
  private async independentAdmin(
    tx: Tx,
    actor: CurrentActor,
    id: string,
    verb: string,
  ) {
    requireActive(actor);
    if (!actor.roles.some((r) => r.role === 'ADMIN'))
      throw new DomainError(
        403,
        'FORBIDDEN',
        `Chỉ quản trị viên được ${verb} phiên.`,
      );
    const a = await this.auction(tx, id);
    if (
      actor._id === a.sellerId ||
      (await tx.c.auction_bidders.findOne({ _id: `${id}:${actor._id}` })) ||
      // ADR 0077: a registrant (deposit held) is involved too.
      (await tx.c.auction_registrations.findOne({
        _id: `${id}:${actor._id}`,
        state: { $ne: 'Withdrawn' },
      }))
    )
      throw new DomainError(
        403,
        'SelfReviewForbidden',
        `Bạn đang liên quan đến phiên này nên không được ${verb}.`,
      );
    return a;
  }

  // ADMIN independent of the seller and every bidder; never picks a winner.
  cancel(context: CommandContext, id: string, body: Wire['CancelAuction']) {
    return this.commands.runAuction(context, 'cancelAuction', id, body, {
      discover: async (tx) => [(await this.auction(tx, id)).sellerId],
      authorize: (tx, actor) => this.independentAdmin(tx, actor, id, 'hủy'),
      mutate: async (tx, actor, _before, receiptId) => {
        await tx.lock('auctions', [id]);
        const a = await this.auction(tx, id);
        if (a.version !== body.expectedVersion) throw conflict();
        if (a.state !== 'Active' && a.state !== 'OnHold') throw invalidState();
        const now = await this.clock.decision(tx, context.auth);
        const reason = body.reason.trim();
        if (reason.length < 10)
          invalidField('reason', 'Hãy ghi lý do hủy ít nhất 10 ký tự.');
        const next = await this.cancelNow(tx, a, reason, null, receiptId, now);
        return this.change(next, now, 'AuctionCancelled', actor._id, reason);
      },
    });
  }

  /**
   * ADR 0080/0084: an independent Admin returns an OnHold auction to Active
   * before its hold auto-cancels, and only when the seller and the leader are
   * eligible. Any number of resumes fit in the pause budget. The paused time
   * comes back (at least 10 minutes of bidding): every stored time moves by
   * the same amount. An auction held at or after its end is closed next.
   */
  resume(context: CommandContext, id: string, body: Wire['ResumeAuction']) {
    return this.commands.runAuction(context, 'resumeAuction', id, body, {
      // The eligibility read below needs the seller and leader locked.
      discover: async (tx) => {
        const a = await this.auction(tx, id);
        return [a.sellerId, ...(a.leaderId ? [a.leaderId] : [])];
      },
      authorize: (tx, actor) =>
        this.independentAdmin(tx, actor, id, 'tiếp tục'),
      mutate: async (tx, actor, before) => {
        await tx.lock('auctions', [id]);
        const a = await this.auction(tx, id);
        if (a.version !== body.expectedVersion) throw conflict();
        if (a.leaderId !== before.leaderId) throw conflict();
        if (a.state !== 'OnHold')
          throw invalidState('Chỉ tiếp tục được phiên đang tạm dừng.');
        const now = await this.clock.decision(tx, context.auth);
        const reason = body.reason.trim();
        if (reason.length < 10)
          invalidField('reason', 'Hãy ghi lý do tiếp tục ít nhất 10 ký tự.');
        if (!a.heldAt || !a.holdUntil || now >= a.holdUntil)
          throw invalidState(
            'Phiên đã hết thời gian tạm dừng nên sẽ bị hủy, không tiếp tục được.',
          );
        if (!(await this.partiesEligible(tx, a)))
          throw invalidState(
            'Người bán hoặc người dẫn giá vẫn chưa đủ điều kiện nên chưa tiếp tục được.',
          );
        const next = await this.update(
          tx,
          a,
          resumeFields(a, now),
          now,
        );
        const bidders = await tx.c.auction_bidders
          .find({ auctionId: a._id }, { projection: { bidderId: 1 } })
          .toArray();
        await notifyAuction(
          tx,
          next,
          'AuctionResumed',
          [
            a.sellerId,
            ...bidders.map((b) => b.bidderId),
            ...(await this.registrantIds(tx, a)),
          ],
          now,
          // ADR 0083: members learn why the Admin resumed the auction.
          reason,
        );
        return this.change(next, now, 'AuctionResumed', actor._id, reason);
      },
    });
  }

  // Every cancellation (Admin, seller, report, ADR 0079 ceilings) ends here:
  // one transaction cancels, reclaims the book, notifies everyone involved
  // and releases every hold and deposit (registrations become Refunded).
  private async cancelNow(
    tx: Tx,
    a: AuctionDoc,
    reason: string,
    closeReason: AuctionDoc['closeReason'],
    receiptId: string,
    now: Date,
    extra: Partial<AuctionDoc> = {},
  ) {
    const next = await this.update(
      tx,
      a,
      {
        ...extra,
        state: 'Cancelled',
        // ADR 0086: a winner's auction keeps the time it was decided.
        closedAt: a.closedAt ?? now,
        cancelReason: reason,
        closeReason,
        // ADR 0084: hold details exist only while OnHold.
        holdReason: null,
        holdUntil: null,
      },
      now,
    );
    await this.intakes.requireReclaim(tx, a.intakeId, 'AuctionCancelled', now);
    const bidders = await tx.c.auction_bidders
      .find({ auctionId: a._id }, { projection: { bidderId: 1 } })
      .toArray();
    await notifyAuction(
      tx,
      next,
      'AuctionCancelled',
      [
        a.sellerId,
        ...bidders.map((b) => b.bidderId),
        ...(await this.registrantIds(tx, a)),
      ],
      now,
    );
    await this.releaseHolds(tx, next, null, 'Cancelled', receiptId, now);
    return next;
  }

  // ADR 0077/0079/0081: what changes when registeredCount reaches minBidders.
  // ScheduledGrace opens at the seller's time, or now once it passed (same
  // length); older WhenReady opens now; older Scheduled bids from its start;
  // an ADR 0077 auction starts its Dutch clock here, never before startAt.
  private gateFields(a: AuctionDoc, now: Date): Partial<AuctionDoc> {
    if (a.openMode === 'ScheduledGrace' || a.openMode === 'WhenReady')
      return reachedFields(a, now);
    if (a.openMode === 'Scheduled') return { biddingOpenedAt: a.startAt };
    return { biddingOpenedAt: now > a.startAt ? now : a.startAt };
  }

  private sellerOf = async (
    tx: Tx,
    actor: Parameters<typeof member>[0],
    id: string,
  ) => {
    member(actor);
    const a = await this.auction(tx, id);
    if (a.sellerId !== actor._id) throw notFound();
    return a;
  };

  // ADR 0079: the seller lowers the minimum (never below 4), while waiting
  // and before it was reached; reaching it applies the gate at once.
  // ADR 0085 (L5): raising it is allowed only while nobody is registered, so
  // no registrant's terms change after they joined.
  setMinBidders(
    context: CommandContext,
    id: string,
    body: Wire['SetAuctionMinBidders'],
  ) {
    return this.commands.runAuction(context, 'setAuctionMinBidders', id, body, {
      authorize: (tx, actor) => this.sellerOf(tx, actor, id),
      mutate: async (tx, actor) => {
        requireActive(actor);
        await tx.lock('auctions', [id]);
        const a = await this.auction(tx, id);
        if (a.version !== body.expectedVersion) throw conflict();
        const now = await this.clock.decision(tx, context.auth);
        if (!a.openMode || a.minBidders === null)
          throw invalidState('Phiên này không đổi được số người tối thiểu.');
        requireWaiting(a, now);
        if (a.registeredCount >= a.minBidders)
          throw invalidState(
            'Phiên đã đủ người đăng ký nên số người tối thiểu được giữ nguyên.',
          );
        if (body.minBidders === a.minBidders)
          invalidField(
            'minBidders',
            `Số người tối thiểu đang là ${a.minBidders}.`,
          );
        if (body.minBidders > a.minBidders && a.registeredCount > 0)
          invalidField(
            'minBidders',
            `Đã có người đăng ký nên chỉ giảm được số người tối thiểu (hiện là ${a.minBidders}).`,
          );
        const reached = a.registeredCount >= body.minBidders;
        const lowered = { ...a, minBidders: body.minBidders };
        const gate = reached ? this.gateFields(lowered, now) : {};
        const next = await this.update(
          tx,
          a,
          {
            minBidders: body.minBidders,
            ...gate,
          },
          now,
        );
        if (reached)
          await notifyAuction(
            tx,
            next,
            'AuctionBiddingStarted',
            await this.registrantIds(tx, next),
            now,
          );
        return this.change(
          next,
          now,
          reached && next.startAt <= now
            ? 'AuctionOpened'
            : 'AuctionMinBiddersChanged',
          actor._id,
        );
      },
    });
  }

  // ADR 0079: the seller may close their auction at any time before it
  // starts; afterwards only an Admin can (refused with 409).
  closeBeforeStart(
    context: CommandContext,
    id: string,
    body: Wire['AuctionVersionCommand'],
  ) {
    return this.commands.runAuction(
      context,
      'closeAuctionBeforeStart',
      id,
      body,
      {
        discover: async (tx) => [(await this.auction(tx, id)).sellerId],
        authorize: (tx, actor) => this.sellerOf(tx, actor, id),
        mutate: async (tx, actor, _before, receiptId) => {
          requireActive(actor);
          await tx.lock('auctions', [id]);
          const a = await this.auction(tx, id);
          if (a.version !== body.expectedVersion) throw conflict();
          const now = await this.clock.decision(tx, context.auth);
          requireWaiting(a, now);
          const reason = 'Người bán đã đóng phiên trước giờ mở.';
          const next = await this.cancelNow(
            tx,
            a,
            reason,
            'SellerClosed',
            receiptId,
            now,
          );
          return this.change(next, now, 'AuctionCancelled', actor._id, reason);
        },
      },
    );
  }

  /**
   * ADR 0079: an assigned, independent Admin closes a reported auction from
   * the support case, inside the support command's transaction.
   */
  async cancelReported(
    tx: Tx,
    id: string,
    version: number,
    actorId: string,
    message: string,
    receiptId: string,
    now: Date,
  ) {
    await tx.lock('users', [(await this.auction(tx, id)).sellerId]);
    await tx.lock('auctions', [id]);
    const a = await this.auction(tx, id);
    await this.requireUninvolved(tx, a, actorId, 'đóng');
    if (a.version !== version) throw conflict();
    // ADR 0083: until the worker closes it (no winner or Order exists yet), an
    // Active auction past its end can still be closed from the report, as
    // the plain Admin cancel already allows; the auction lock decides a race
    // with the close. ADR 0086: also after the close while the winner has not
    // paid (their Order closes Cancelled without a payment and their deposit
    // is refunded, not forfeited) and while a runner-up offer runs.
    if (
      a.state === 'AwaitingWinnerPayment' ||
      a.state === 'SecondChanceOffered'
    ) {
      if (a.state === 'AwaitingWinnerPayment')
        await this.orders.cancelUnpaid(tx, a.orderId!, now, receiptId);
      await tx.c.auction_registrations.updateMany(
        { auctionId: a._id, state: 'Applied' },
        [
          {
            $set: {
              state: 'Refunded',
              updatedAt: now,
              version: { $add: ['$version', 1] },
            },
          },
        ],
      );
      return this.cancelNow(
        tx,
        a,
        message,
        'Reported',
        receiptId,
        now,
        a.state === 'SecondChanceOffered' ? { runnerUpOutcome: 'Cancelled' } : {},
      );
    }
    if (a.state !== 'OnHold' && a.state !== 'Active')
      throw invalidState(
        'Phiên đã được thanh toán hoặc đã kết thúc nên không còn đóng được từ báo cáo.',
      );
    return this.cancelNow(tx, a, message, 'Reported', receiptId, now);
  }

  // The Admin on a report is none of the seller, bidders or registrants.
  private async requireUninvolved(
    tx: Tx,
    a: AuctionDoc,
    actorId: string,
    verb: string,
  ) {
    if (
      actorId === a.sellerId ||
      (await tx.c.auction_bidders.findOne({ _id: `${a._id}:${actorId}` })) ||
      (await tx.c.auction_registrations.findOne({ _id: `${a._id}:${actorId}` }))
    )
      throw new DomainError(
        403,
        'SelfReviewForbidden',
        `Bạn đang liên quan đến phiên này nên không được ${verb}.`,
      );
  }

  /**
   * ADR 0084 (H2): the assigned, independent Admin on a report freezes the
   * auction for review, inside the support command's transaction. It is
   * Active (waiting, live, or past its end until the worker closes it) and
   * has pause budget left. The hold then follows the one pause model: an
   * Admin resumes it (time given back) or closes it, or it auto-cancels.
   */
  async freezeReported(
    tx: Tx,
    id: string,
    version: number,
    actorId: string,
    message: string,
    now: Date,
  ) {
    await tx.lock('auctions', [id]);
    const a = await this.auction(tx, id);
    await this.requireUninvolved(tx, a, actorId, 'tạm dừng');
    if (a.version !== version) throw conflict();
    if (a.state !== 'Active')
      throw invalidState(
        'Chỉ tạm dừng được phiên đang chờ người đăng ký hoặc đang diễn ra.',
      );
    if (pauseBudgetLeft(a) <= 0)
      throw invalidState(
        'Phiên đã dùng hết 72 giờ tạm dừng; chỉ có thể đóng hoặc để phiên tiếp tục.',
      );
    const next = await this.update(tx, a, holdFields(a, now, 'Review'), now);
    const bidders = await tx.c.auction_bidders
      .find({ auctionId: a._id }, { projection: { bidderId: 1 } })
      .toArray();
    await notifyAuction(
      tx,
      next,
      'AuctionOnHold',
      [
        a.sellerId,
        ...bidders.map((b) => b.bidderId),
        ...(await this.registrantIds(tx, a)),
      ],
      now,
      message,
    );
    return next;
  }

  // ADR 0079 worker safety net: the start passed with too few registrants.
  // Keyed by the auction version, so a second run on the same row replays.
  expireRegistration(id: string, version: number) {
    return this.commands.systemAuction('AuctionClose', stepKey(id, version, 'expireRegistration'), {
      discover: async (tx) => [(await this.auction(tx, id)).sellerId],
      authorize: (tx) => this.auction(tx, id),
      mutate: async (tx, _before, receiptId) => {
        await tx.lock('auctions', [id]);
        const a = await this.auction(tx, id);
        const now = await this.clock.now(tx);
        if (a.version !== version || !registrationExpired(a, now))
          throw invalidState();
        const next = await this.cancelNow(
          tx,
          a,
          'Không đủ người đăng ký trước giờ mở.',
          'RegistrationExpired',
          receiptId,
          now,
        );
        return this.change(next, now, 'AuctionCancelled', null);
      },
    });
  }

  // ADR 0079/0084: a hold ends at holdUntil (48 h, or less once the pause
  // budget is nearly spent); an Admin can cancel earlier.
  expireHold(id: string, version: number) {
    return this.commands.systemAuction('AuctionClose', stepKey(id, version, 'expireHold'), {
      discover: async (tx) => [(await this.auction(tx, id)).sellerId],
      authorize: (tx) => this.auction(tx, id),
      mutate: async (tx, _before, receiptId) => {
        await tx.lock('auctions', [id]);
        const a = await this.auction(tx, id);
        const now = await this.clock.now(tx);
        if (
          a.version !== version ||
          a.state !== 'OnHold' ||
          !a.holdUntil ||
          now < a.holdUntil
        )
          throw invalidState();
        const next = await this.cancelNow(
          tx,
          a,
          'Phiên hết thời gian tạm dừng mà chưa được xử lý.',
          'HoldExpired',
          receiptId,
          now,
        );
        return this.change(next, now, 'AuctionCancelled', null);
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
  // an independent Admin decides (cancel, or resume once: ADR 0080). Keyed by
  // the version the sweep read: a retry replays, a resumed auction (a later
  // version) can be held again.
  hold(id: string, version: number) {
    return this.commands.systemAuction('AuctionHold', stepKey(id, version), {
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
        const next = await this.update(
          tx,
          a,
          holdFields(a, now, 'Eligibility'),
          now,
        );
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

  // FR-AU07/09: idempotent close keyed by the version the sweep read (ADR
  // 0080: a close that held the auction is not replayed after a resume).
  // Payment deadline is endAt + 24h whenever the worker runs; a late worker
  // records the expiry.
  close(id: string, version: number) {
    return this.commands.systemAuction('AuctionClose', stepKey(id, version, 'close'), {
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
        // ADR 0079: too few registrants at the start is a cancellation even
        // when the expiry sweep did not run before the end.
        if (registrationExpired(a, now)) {
          const next = await this.cancelNow(
            tx,
            a,
            'Không đủ người đăng ký trước giờ mở.',
            'RegistrationExpired',
            receiptId,
            now,
          );
          return this.change(next, now, 'AuctionCancelled', null);
        }
        // ADR 0077: an auction with registration never sells to a lone
        // bidder: it needs minBidders registered and, unless a price was
        // accepted outright (Buy Now, Dutch), at least two members who bid.
        const tooFew =
          a.minBidders !== null &&
          (a.registeredCount < a.minBidders ||
            (!a.buyNowAt && a.bidderCount > 0 && a.bidderCount < 2));
        if (!a.leaderId || tooFew) {
          const next = await this.update(
            tx,
            a,
            {
              state: 'Unsold',
              closedAt: now,
              closeReason: tooFew ? 'NotEnoughBidders' : null,
            },
            now,
          );
          await this.reclaim(tx, a, 'Unsold', now);
          await this.releaseHolds(
            tx,
            next,
            null,
            tooFew ? 'NotEnoughBidders' : 'Closed',
            receiptId,
            now,
          );
          if (tooFew)
            await notifyAuction(
              tx,
              next,
              'AuctionNotEnoughBidders',
              [a.sellerId, ...(await this.registrantIds(tx, a))],
              now,
            );
          else
            await notifyAuction(tx, next, 'AuctionUnsold', [a.sellerId], now);
          return this.change(next, now, 'AuctionUnsold', null);
        }
        if (!(await this.partiesEligible(tx, a))) {
          // Never silently drop bids or promote the runner-up.
          const next = await this.update(
            tx,
            a,
            holdFields(a, now, 'Eligibility'),
            now,
          );
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

  // FR-AU08: no automatic charge or relist. ADR 0086: the first non-payment
  // offers the book once to the runner-up (SecondChanceOffered) instead of
  // reclaiming it; otherwise the book is reclaimed. Keyed by the Order, so the
  // runner-up's own expiry later is a separate step (legacy: the auction id).
  expirePayment(id: string, orderId?: string | null) {
    const key = orderId ? stepKey(orderId, 0, 'expirePayment') : id;
    return this.commands.systemAuction('AuctionPaymentExpiry', key, {
      // ADR 0087: the seller's wallet may receive their deposit share.
      discover: async (tx) => [(await this.auction(tx, id)).sellerId],
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
          // ADR 0086: one violation per (kind, source); a runner-up who
          // accepted and did not pay is recorded against their own Order.
          sourceId: a.runnerUpOutcome === 'Accepted' ? a.orderId! : a._id,
          recordedAt: now,
          receiptId,
        });
        const next = await this.update(tx, a, { state: 'PaymentExpired' }, now);
        // ADR 0077/0087: the winner's deposit goes to the platform; the
        // seller gets half of it only if the book ends unsold (below and in
        // endOffer), so a seller's own account that wins and defaults still
        // costs them half. The rest of the winner's hold is released below.
        const forfeited = await this.forfeitDeposit(tx, next, receiptId, now);
        await this.releaseHolds(tx, next, null, 'Expired', receiptId, now);
        if (forfeited)
          await notifyAuction(
            tx,
            next,
            'AuctionDepositForfeited',
            [a.winnerId],
            now,
          );
        const runnerUp =
          a.state === 'AwaitingWinnerPayment' && a.runnerUpOutcome === null
            ? await this.runnerUp(tx, next, now)
            : null;
        if (runnerUp) {
          const offered = await this.update(
            tx,
            next,
            {
              state: 'SecondChanceOffered',
              runnerUpId: runnerUp.bidderId,
              runnerUpPrice: runnerUp.level,
              runnerUpOfferedAt: now,
              runnerUpDeadline: new Date(now.getTime() + SECOND_CHANCE_MS),
              runnerUpOutcome: 'Offered',
              defaultedOrderId: a.orderId,
            },
            now,
          );
          await notifyAuction(
            tx,
            offered,
            'AuctionPaymentExpired',
            [a.winnerId, a.sellerId],
            now,
          );
          await notifyAuction(
            tx,
            offered,
            'AuctionSecondChanceOffered',
            [runnerUp.bidderId],
            now,
          );
          return this.change(offered, now, 'AuctionSecondChanceOffered', null);
        }
        await this.reclaim(tx, a, 'PaymentExpired', now);
        await notifyAuction(
          tx,
          next,
          'AuctionPaymentExpired',
          [a.winnerId, a.sellerId],
          now,
        );
        await this.payDepositShare(tx, next, now);
        return this.change(next, now, 'AuctionPaymentExpired', null);
      },
    });
  }
  /**
   * ADR 0086: the runner-up is the other bidder with the highest level (the
   * English level or the sealed bid), offered at that level. None for Dutch
   * (one acceptance), or when that member can no longer trade.
   */
  private async runnerUp(tx: Tx, a: AuctionDoc, now: Date) {
    if (a.auctionType === 'Dutch' || !a.winnerId) return null;
    const bidders = await tx.c.auction_bidders
      .find({ auctionId: a._id })
      .toArray();
    const r = rank(bidders).find((b) => b.bidderId !== a.winnerId);
    if (!r || r.level < a.startPrice || r.bidderId === a.sellerId) return null;
    const user = await tx.c.users.findOne({ _id: r.bidderId });
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      !user.emailVerifiedAt ||
      (await restrictedUntil(tx, r.bidderId, now))
    )
      return null;
    return r;
  }

  private async offerOf(tx: Tx, id: string, actorId: string) {
    const a = await this.auction(tx, id);
    if (a.runnerUpId !== actorId) throw notFound();
    return a;
  }

  private async openOffer(
    tx: Tx,
    id: string,
    version: number,
    now: Date,
  ) {
    const a = await this.auction(tx, id);
    if (a.version !== version) throw conflict();
    if (a.state !== 'SecondChanceOffered' || a.runnerUpOutcome !== 'Offered')
      throw invalidState('Lời mời mua này không còn hiệu lực.');
    if (now >= a.runnerUpDeadline!)
      throw invalidState('Lời mời mua đã hết hạn.');
    return a;
  }

  /**
   * ADR 0086: the runner-up accepts before the deadline. The auction returns
   * to AwaitingWinnerPayment with them as winner at their own level, a second
   * ViaPoint Order forms (24 h to pay) and the price is held, as for a winner.
   */
  acceptSecondChance(
    context: CommandContext,
    id: string,
    body: Wire['AuctionVersionCommand'],
  ) {
    return this.commands.runAuction(
      context,
      'acceptAuctionSecondChance',
      id,
      body,
      {
        discover: async (tx) => [(await this.auction(tx, id)).sellerId],
        authorize: (tx, actor) => {
          member(actor);
          return this.offerOf(tx, id, actor._id);
        },
        mutate: async (tx, actor, _before, receiptId) => {
          requireActive(actor);
          await tx.lock('auctions', [id]);
          const now = await this.clock.decision(tx, context.auth);
          const a = await this.openOffer(tx, id, body.expectedVersion, now);
          await requireUnrestricted(tx, actor._id, now);
          if (!(await this.partiesEligible(tx, { ...a, leaderId: null })))
            throw invalidState(
              'Người bán hiện không đủ điều kiện bán nên chưa nhận được lời mời này.',
            );
          await this.checkParticipationQuota(tx, actor._id, id);
          const price = a.runnerUpPrice!;
          if (this.fundsCheck) await this.requireFunds(tx, actor._id, id, price);
          const deadline = new Date(now.getTime() + AUCTION_PAYMENT_MS);
          const order = await this.orders.form(
            tx,
            a,
            actor._id,
            price,
            deadline,
            now,
            receiptId,
          );
          const next = await this.update(
            tx,
            a,
            {
              state: 'AwaitingWinnerPayment',
              winnerId: actor._id,
              finalPrice: price,
              paymentDeadline: deadline,
              orderId: order._id,
              runnerUpOutcome: 'Accepted',
            },
            now,
          );
          const delta = this.fundsCheck
            ? await this.ledger.setAuctionHold(
                tx,
                a._id,
                actor._id,
                price,
                receiptId,
                now,
              )
            : 0;
          await notifyAuctionFunds(tx, next, actor._id, delta, 'SecondChance', now);
          await notifyAuction(tx, next, 'AuctionWon', [actor._id], now);
          await notifyAuction(tx, next, 'AuctionSold', [a.sellerId], now);
          return this.change(next, now, 'AuctionSecondChanceAccepted', actor._id);
        },
      },
    );
  }

  /** ADR 0086: the runner-up declines; the auction ends, the book goes back. */
  declineSecondChance(
    context: CommandContext,
    id: string,
    body: Wire['AuctionVersionCommand'],
  ) {
    return this.commands.runAuction(
      context,
      'declineAuctionSecondChance',
      id,
      body,
      {
        discover: async (tx) => [(await this.auction(tx, id)).sellerId],
        authorize: (tx, actor) => {
          member(actor);
          return this.offerOf(tx, id, actor._id);
        },
        mutate: async (tx, actor) => {
          await tx.lock('auctions', [id]);
          const now = await this.clock.decision(tx, context.auth);
          const a = await this.openOffer(tx, id, body.expectedVersion, now);
          const next = await this.endOffer(tx, a, 'Declined', now);
          return this.change(next, now, 'AuctionSecondChanceDeclined', actor._id);
        },
      },
    );
  }

  /** ADR 0086: the worker ends an unanswered offer at its deadline. */
  expireSecondChance(id: string, version: number) {
    return this.commands.systemAuction(
      'AuctionPaymentExpiry',
      stepKey(id, version, 'expireSecondChance'),
      {
        discover: async (tx) => [(await this.auction(tx, id)).sellerId],
        authorize: (tx) => this.auction(tx, id),
        mutate: async (tx) => {
          await tx.lock('auctions', [id]);
          const a = await this.auction(tx, id);
          const now = await this.clock.now(tx);
          if (
            a.state !== 'SecondChanceOffered' ||
            a.runnerUpOutcome !== 'Offered' ||
            now < a.runnerUpDeadline!
          )
            throw invalidState();
          const next = await this.endOffer(tx, a, 'Expired', now);
          return this.change(next, now, 'AuctionSecondChanceExpired', null);
        },
      },
    );
  }

  private async endOffer(
    tx: Tx,
    a: AuctionDoc,
    outcome: 'Declined' | 'Expired',
    now: Date,
  ) {
    const next = await this.update(
      tx,
      a,
      { state: 'PaymentExpired', runnerUpOutcome: outcome },
      now,
    );
    await this.reclaim(tx, a, 'PaymentExpired', now);
    await notifyAuction(
      tx,
      next,
      'AuctionPaymentExpired',
      [a.sellerId, a.runnerUpId],
      now,
    );
    await this.payDepositShare(tx, next, now);
    return next;
  }

  /**
   * ADR 0087: the book ended unsold after a non-paying winner, so the seller
   * gets their share of the forfeited deposit (none if nothing was forfeited,
   * e.g. a legacy auction without registration). Never on a sale or a
   * report close.
   */
  private async payDepositShare(tx: Tx, a: AuctionDoc, now: Date) {
    const paid = await this.ledger.payAuctionDepositShare(
      tx,
      a._id,
      a.sellerId,
      now,
    );
    if (paid > 0) await notifyDepositShare(tx, a, paid, now);
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
    // ADR 0077: open registrations end with the auction; the winner's deposit
    // is part of the price kept for payment.
    await tx.c.auction_registrations.updateMany(
      { auctionId: a._id, state: 'Registered' },
      [
        {
          $set: {
            state: {
              $cond: [
                { $eq: ['$userId', keep?.holderId ?? null] },
                'Applied',
                'Refunded',
              ],
            },
            updatedAt: now,
            version: { $add: ['$version', 1] },
          },
        },
      ],
    );
    for (const h of holds) {
      // A release never raises a hold (the winner keeps at most what is held).
      const target =
        keep && h.holderId === keep.holderId
          ? Math.min(
              keep.amount,
              await this.ledger.auctionHeld(tx, h.holderId, a._id),
            )
          : 0;
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
        await notifyAuctionFunds(
          tx,
          a,
          h.holderId!,
          delta,
          reason === 'Closed' && h.holderId !== keep?.holderId
            ? 'NotWon'
            : reason,
          now,
        );
    }
  }
  private async registrantIds(tx: Tx, a: AuctionDoc) {
    const rows = await tx.c.auction_registrations
      .find(
        { auctionId: a._id, state: { $ne: 'Withdrawn' } },
        { projection: { userId: 1 } },
      )
      .toArray();
    return rows.map((r) => r.userId);
  }
  // ADR 0077: moves the non-paying winner's deposit to the platform account.
  private async forfeitDeposit(
    tx: Tx,
    a: AuctionDoc,
    receiptId: string,
    now: Date,
  ) {
    if (a.minBidders === null || !a.winnerId) return false;
    const r = await this.registrationOf(tx, a, a.winnerId);
    if (r?.state !== 'Applied') return false;
    const held = await this.ledger.auctionHeld(tx, a.winnerId, a._id);
    const amount = Math.min(r.deposit, held);
    const updated = await tx.c.auction_registrations.updateOne(
      { _id: r._id, version: r.version },
      { $set: { state: 'Forfeited', updatedAt: now }, $inc: { version: 1 } },
    );
    if (updated.modifiedCount !== 1) throw conflict();
    if (amount > 0)
      await this.ledger.forfeitAuctionDeposit(
        tx,
        a._id,
        a.winnerId,
        amount,
        receiptId,
        now,
      );
    return true;
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
          await this.holdTo(tx, a, actor._id, price, receiptId, now);
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

  // ADR 0077: registration holds the auction's deposit. Locks the auction
  // like bids, so the count that opens bidding is serialized with them.
  register(
    context: CommandContext,
    id: string,
    body: Wire['RegisterForAuction'],
  ) {
    return this.commands.runAuction(context, 'registerForAuction', id, body, {
      discover: async (tx) => [(await this.auction(tx, id)).sellerId],
      authorize: async (tx, actor) => {
        const a = await this.auction(tx, id);
        await this.eligibleBidder(tx, actor, a);
        return a;
      },
      mutate: async (tx, actor, _before, receiptId) => {
        await tx.lock('auctions', [id]);
        await tx.lock('auction_registrations', [`${id}:${actor._id}`]);
        const a = await this.auction(tx, id);
        const now = await this.clock.decision(tx, context.auth);
        // ADR 0079: phaseOf is Ended once the start passed with too few.
        if (phaseOf(a, now) === 'Ended') throw closed();
        if (a.minBidders === null || a.depositAmount === null)
          throw new DomainError(
            409,
            'InvalidState',
            'Phiên này không cần đăng ký trước khi trả giá.',
          );
        if (body.deposit !== a.depositAmount)
          throw new DomainError(
            409,
            'InvalidState',
            `Tiền cọc của phiên là ${a.depositAmount.toLocaleString('vi-VN')}đ. Hãy tải lại rồi thử lại.`,
          );
        await requireUnrestricted(tx, actor._id, now);
        const own = await tx.c.auction_registrations.findOne({
          _id: `${id}:${actor._id}`,
        });
        if (own && own.state !== 'Withdrawn')
          throw new DomainError(
            409,
            'InvalidState',
            'Bạn đã đăng ký phiên này.',
          );
        await this.checkRegistrationLimits(tx, actor._id, id, own, now);
        const delta = await this.ledger.setAuctionHold(
          tx,
          a._id,
          actor._id,
          a.depositAmount,
          receiptId,
          now,
        );
        if (own) {
          const updated = await tx.c.auction_registrations.updateOne(
            { _id: own._id, version: own.version, state: 'Withdrawn' },
            {
              $set: {
                state: 'Registered',
                deposit: a.depositAmount,
                updatedAt: now,
              },
              $inc: { version: 1 },
            },
          );
          if (updated.modifiedCount !== 1) throw conflict();
        } else
          await tx.c.auction_registrations.insertOne({
            _id: `${id}:${actor._id}`,
            auctionId: a._id,
            userId: actor._id,
            deposit: a.depositAmount,
            state: 'Registered',
            createdAt: now,
            updatedAt: now,
            version: 1,
            lockSeq: 0,
          });
        const opens = a.registeredCount + 1 === a.minBidders;
        const next = await this.update(
          tx,
          a,
          {
            registeredCount: a.registeredCount + 1,
            ...(opens ? this.gateFields(a, now) : {}),
          },
          now,
        );
        await notifyAuctionFunds(tx, next, actor._id, delta, 'Registered', now);
        if (next.registeredCount === a.minBidders)
          await notifyAuction(
            tx,
            next,
            'AuctionBiddingStarted',
            [a.sellerId, ...(await this.registrantIds(tx, next))],
            now,
          );
        return this.change(next, now, 'AuctionRegistered', actor._id);
      },
    });
  }
  // ADR 0077: refund before bidding opens; afterwards the deposit stays
  // until the close, so the count that opened bidding cannot fall.
  // ADR 0085 (N1): a full ScheduledGrace auction still refunds until 72 h
  // before its open time; below the minimum it then waits for registrants
  // again (deadline opensAt + 24 h) and everyone involved is told.
  withdrawRegistration(
    context: CommandContext,
    id: string,
    body: Wire['WithdrawAuctionRegistration'],
  ) {
    return this.commands.runAuction(
      context,
      'withdrawAuctionRegistration',
      id,
      body,
      {
        discover: async (tx) => [(await this.auction(tx, id)).sellerId],
        authorize: async (tx, actor) => {
          member(actor);
          const a = await this.auction(tx, id);
          if (
            !(await tx.c.auction_registrations.findOne({
              _id: `${id}:${actor._id}`,
            }))
          )
            throw notFound();
          return a;
        },
        mutate: async (tx, actor, _before, receiptId) => {
          await tx.lock('auctions', [id]);
          await tx.lock('auction_registrations', [`${id}:${actor._id}`]);
          const a = await this.auction(tx, id);
          const now = await this.clock.decision(tx, context.auth);
          if (phaseOf(a, now) === 'Ended') throw closed();
          const own = await this.registrationOf(tx, a, actor._id);
          if (own?.state !== 'Registered')
            throw new DomainError(
              409,
              'InvalidState',
              'Bạn không còn đăng ký ở phiên này.',
            );
          const full = a.registeredCount >= a.minBidders!;
          const until = fullWithdrawUntil(a);
          const bidder = await tx.c.auction_bidders.findOne({
            _id: `${id}:${actor._id}`,
          });
          if (bidder || (full && !(until && now < until)))
            throw new DomainError(
              409,
              'InvalidState',
              !bidder && until && phaseOf(a, now) === 'Scheduled'
                ? 'Phiên đã đủ người đăng ký và còn dưới 72 giờ tới giờ mở; tiền cọc được giữ đến khi phiên kết thúc.'
                : 'Phiên đã mở trả giá; tiền cọc được giữ đến khi phiên kết thúc.',
            );
          const drops = full && a.registeredCount - 1 < a.minBidders!;
          const delta = await this.ledger.setAuctionHold(
            tx,
            a._id,
            actor._id,
            0,
            receiptId,
            now,
          );
          const updated = await tx.c.auction_registrations.updateOne(
            { _id: own._id, version: own.version, state: 'Registered' },
            {
              $set: { state: 'Withdrawn', updatedAt: now },
              $inc: { version: 1 },
            },
          );
          if (updated.modifiedCount !== 1) throw conflict();
          const next = await this.update(
            tx,
            a,
            {
              registeredCount: a.registeredCount - 1,
              ...(drops ? unreachedFields(a) : {}),
            },
            now,
          );
          await notifyAuctionFunds(
            tx,
            next,
            actor._id,
            delta,
            'Withdrawn',
            now,
          );
          if (drops)
            await notifyBelowMinimum(
              tx,
              next,
              [a.sellerId, ...(await this.registrantIds(tx, next))],
              now,
            );
          return this.change(
            next,
            now,
            'AuctionRegistrationWithdrawn',
            actor._id,
          );
        },
      },
    );
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
          held = await this.holdTo(
            tx,
            a,
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
      // ADR 0077: registration gate (null only on legacy pre-0077 auctions).
      minBidders: a.minBidders ?? null,
      depositAmount: a.depositAmount ?? null,
      registeredCount: a.registeredCount ?? 0,
      closeReason: a.closeReason ?? null,
      // ADR 0079: open mode and the fixed ceilings.
      openMode: a.openMode ?? null,
      // ADR 0081: the seller's open time (startAt is the registration
      // deadline until the minimum is reached).
      opensAt: a.opensAt?.toISOString() ?? null,
      latestStartAt: a.openMode ? latestStartAt(a).toISOString() : null,
      // ADR 0086: while the runner-up offer runs.
      secondChanceDeadline:
        a.state === 'SecondChanceOffered'
          ? (a.runnerUpDeadline?.toISOString() ?? null)
          : null,
      // ADR 0085 (N1): a full auction still refunds a withdrawal until then.
      fullWithdrawUntil: fullWithdrawUntil(a)?.toISOString() ?? null,
      holdExpiresAt: holdExpiry(a),
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
      .toArray()
      // ADR 0079: an auction that reached its start with too few registrants
      // is over at once, before the worker records the cancellation.
      .then((found) =>
        found.filter(
          (a) => phaseOf(a, now) === (upcoming ? 'Scheduled' : 'Live'),
        ),
      );
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
        if (
          await tx.c.auction_registrations.findOne({
            _id: `${a._id}:${actor._id}`,
            state: { $ne: 'Withdrawn' },
          })
        )
          continue;
        const item = await tx.c.workflow_items.findOne({
          _id: `${a.contextId}:${a.listingId}`,
        });
        const point = await tx.c.handover_points.findOne({ _id: a.pointId });
        items.push({
          id: a._id,
          version: a.version,
          phase: phaseOf(a, now),
          holdExpiresAt: holdExpiry(a),
          resumedAt: a.resumedAt?.toISOString() ?? null,
          // ADR 0084: why it is held and the pause time it may still use.
          holdReason: a.state === 'OnHold' ? (a.holdReason ?? null) : null,
          pauseBudgetLeftSeconds: Math.floor(pauseBudgetLeft(a) / 1000),
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
            $lookup: {
              from: 'auction_registrations',
              localField: '_id',
              foreignField: 'auctionId',
              pipeline: [
                { $match: { userId: actor._id, state: { $ne: 'Withdrawn' } } },
                { $limit: 1 },
              ],
              as: 'reg',
            },
          },
          {
            $match: {
              $or: [
                { sellerId: actor._id },
                { winnerId: actor._id },
                { 'own.0': { $exists: true } },
                { 'reg.0': { $exists: true } },
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
        const registered = await tx.c.auction_registrations.findOne({
          _id: `${a._id}:${actor._id}`,
          state: { $ne: 'Withdrawn' },
        });
        if (!seller && !own && !won && !registered) continue;
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
      const reg = await tx.c.auction_registrations.findOne({
        _id: `${id}:${actor._id}`,
      });
      if (!a || (!own && !boughtNow && !reg)) throw notFound();
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
        registrationState: reg?.state ?? null,
        deposit: reg?.deposit ?? null,
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
        // ADR 0086: the caller's runner-up offer, if any.
        secondChance:
          a.runnerUpId === actor._id
            ? {
                price: a.runnerUpPrice!,
                offeredAt: a.runnerUpOfferedAt!.toISOString(),
                deadline: a.runnerUpDeadline!.toISOString(),
                outcome: a.runnerUpOutcome!,
              }
            : null,
        serverTime: now.toISOString(),
      };
    });
  }
}
