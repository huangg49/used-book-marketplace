import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AuctionDoc,
  AuctionIntakeContextDoc,
  AuctionIntakeDoc,
  Json,
  ReclaimReason,
} from '../../database/mongo/documents.js';
import {
  AUCTION_DROPOFF_MS,
  AUCTION_DURATION_MS,
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
  type CommandContext,
  type CurrentActor,
} from '../commands/mongo-command.service.js';
import { ListingCommitmentPolicy } from '../listings/listing-commitment-policy.service.js';
import { publicEligibleStages } from '../listings/public-listing.service.js';
import { ReservationsService } from '../reservations/reservations.service.js';
import { AuctionClock } from './auction-clock.js';
import {
  AUCTION_MAX_PRICE,
  AUCTION_MIN_PRICE,
  onGrid,
} from './auction-engine.js';
import { checkAuction, checkIntake } from './auction-invariants.js';
import { HandoverPointsService } from './handover-points.service.js';
import { requireUnrestricted } from './member-violations.js';

// POL-41 counts intakes whose auction has not ended: before opening, or
// opened and still Active/OnHold. A closed auction (sold, unsold, expired)
// no longer counts even while its Order or reclaim is open.
const PRE_AUCTION_STATES = ['AwaitingDropoff', 'Received', 'Passed'] as const;
// FR-H08: these outcomes send the listing back to revision on reclaim.
const REVISION_REQUIRED: readonly ReclaimReason[] = [
  'InspectionFailed',
  'OrderReturned',
  'BookMisdescribed',
];
const WITHDRAWN_REASON = 'Người bán rút phiên trước lượt trả giá đầu tiên.';
const forbidden = (message: string) =>
  new DomainError(403, 'FORBIDDEN', message);

// Seller intake and point Staff steps before an auction opens (FR-AU01/02,
// FR-H07, FR-T01) plus reclaim afterwards. Lock order: users -> session ->
// point -> catalog -> listing -> context -> intake -> auction -> slot/commitment.
@Injectable()
export class AuctionIntakesService {
  constructor(
    private readonly mongo: MongoService,
    private readonly commands: MongoCommandService,
    private readonly listings: ListingCommitmentPolicy,
    private readonly reservations: ReservationsService,
    private readonly points: HandoverPointsService,
    private readonly clock: AuctionClock,
  ) {}

  // ------------------------------------------------------------- helpers
  static change(
    i: AuctionIntakeDoc,
    decidedAt: Date,
    event: string,
    extra: Partial<AuctionChange> = {},
  ): AuctionChange {
    return {
      entityType: 'AuctionIntake',
      entityId: i._id,
      intakeId: i._id,
      auctionId: i.auctionId,
      orderId: null,
      contextId: i.contextId,
      version: i.version,
      state: i.state,
      decidedAt,
      currentPrice: null,
      minimumBid: null,
      leading: null,
      event,
      ...extra,
    };
  }
  private async intake(tx: Tx, id: string) {
    const i = await tx.c.auction_intakes.findOne({ _id: id });
    if (!i) throw notFound();
    return i;
  }
  // Locks the intake aggregate (context first) and rereads it.
  private async lockIntake(tx: Tx, before: AuctionIntakeDoc) {
    await tx.lock('workflow_contexts', [before.contextId]);
    await tx.lock('auction_intakes', [before._id]);
    return this.intake(tx, before._id);
  }
  async transition(
    tx: Tx,
    i: AuctionIntakeDoc,
    set: Partial<AuctionIntakeDoc>,
    now: Date,
  ) {
    const next = await tx.c.auction_intakes.findOneAndUpdate(
      { _id: i._id, version: i.version, state: i.state },
      { $set: { ...set, updatedAt: now }, $inc: { version: 1 } },
      { returnDocument: 'after' },
    );
    if (!next) throw conflict();
    tx.check(`auction-intake:${i._id}`, () => checkIntake(tx, i._id));
    return next;
  }
  // Ends the intake's ownership: slot, commitment, listing projection and
  // context all close in the caller's transaction (no gap for checkout).
  private async closeOwnership(
    tx: Tx,
    i: AuctionIntakeDoc,
    reason: 'Cancelled' | 'Reclaimed',
    now: Date,
    receiptId: string,
  ) {
    const listing = (await tx.c.listings.findOne({ _id: i.listingId }))!;
    await this.reservations.closeIntake(
      tx,
      i.contextId,
      reason,
      now,
      receiptId,
    );
    await this.points.releaseSlot(tx, i.slotId, i.contextId, reason, now);
    await this.listings.project(
      tx,
      i.listingId,
      listing.version,
      'Reserved',
      'Available',
    );
    if (
      reason === 'Reclaimed' &&
      i.reclaimReason &&
      REVISION_REQUIRED.includes(i.reclaimReason)
    )
      await this.listings.requireRevision(tx, i.listingId);
    const closed = await tx.c.workflow_contexts.updateOne(
      { _id: i.contextId, ownershipPhase: 'Holding', version: 1 },
      { $set: { ownershipPhase: 'Closed' }, $inc: { version: 1 } },
    );
    if (closed.modifiedCount !== 1) throw conflict();
  }
  // Called by the auction service when an opened auction ends without sale.
  async requireReclaim(
    tx: Tx,
    intakeId: string,
    reason: ReclaimReason,
    now: Date,
  ) {
    await tx.lock('auction_intakes', [intakeId]);
    const i = await this.intake(tx, intakeId);
    if (i.state !== 'Auctioning') throw invalidState();
    return this.transition(
      tx,
      i,
      { state: 'ReclaimRequired', reclaimReason: reason },
      now,
    );
  }
  // Settlement of the Order this intake's auction formed (migration 0012).
  // Caller holds the listing and point locks and has already released the
  // commitment as Completed: the slot ends Sold and the listing becomes Sold.
  async completeSale(tx: Tx, intakeId: string, now: Date) {
    const i = await this.lockIntake(tx, await this.intake(tx, intakeId));
    if (i.state !== 'Auctioning') throw invalidState();
    const listing = (await tx.c.listings.findOne({ _id: i.listingId }))!;
    await this.points.releaseSlot(tx, i.slotId, i.contextId, 'Sold', now);
    await this.listings.project(
      tx,
      i.listingId,
      listing.version,
      'Reserved',
      'Sold',
    );
    const closed = await tx.c.workflow_contexts.updateOne(
      { _id: i.contextId, ownershipPhase: 'Holding', version: 1 },
      { $set: { ownershipPhase: 'Closed' }, $inc: { version: 1 } },
    );
    if (closed.modifiedCount !== 1) throw conflict();
    return this.transition(tx, i, { state: 'Sold', closedAt: now }, now);
  }
  // STAFF role with a current assignment at the intake point, independent of
  // the seller. ADMIN alone cannot receive, inspect, open or reclaim.
  private async staff(
    tx: Tx,
    actor: CurrentActor,
    i: AuctionIntakeDoc,
    now: Date,
  ) {
    requireActive(actor);
    if (!actor.roles.some((r) => r.role === 'STAFF'))
      throw forbidden('Chỉ nhân viên điểm được thực hiện thao tác này.');
    if (actor._id === i.sellerId)
      throw new DomainError(
        403,
        'SelfReviewForbidden',
        'Nhân viên không được xử lý sách của chính mình.',
      );
    await this.points.requireAssigned(tx, actor._id, i.pointId, now);
  }

  // -------------------------------------------------------------- seller
  create(context: CommandContext, body: Wire['CreateAuctionIntake']) {
    return this.commands.runAuction(
      context,
      'createAuctionIntake',
      body.listingId,
      body,
      {
        authorize: async (tx, actor) => {
          member(actor);
          const l = await tx.c.listings.findOne({ _id: body.listingId });
          if (!l || l.ownerId !== actor._id || l.deletedAt) throw notFound();
          return l;
        },
        mutate: async (tx, actor, _l, receiptId) => {
          requireActive(actor);
          this.validatePrices(body);
          const point = await this.points.lockPoint(tx, body.pointId);
          const l = await this.listings.lock(tx, body.listingId);
          await tx.lock('listing_revisions', [l.currentRevisionId!]);
          if (l.version !== body.expectedListingVersion) throw conflict();
          const [eligible] = await tx.c.listings
            .aggregate([
              { $match: { _id: l._id } },
              ...publicEligibleStages(),
              { $match: { 'r.mode': 'Sale' } },
              { $project: { _id: 1 } },
            ])
            .toArray();
          if (!eligible)
            throw new DomainError(
              409,
              'InvalidState',
              'Chỉ sách đăng Bán đã duyệt, đang hiển thị và còn trống mới được gửi đấu giá.',
            );
          const r = (await tx.c.listing_revisions.findOne({
            _id: l.currentRevisionId!,
          }))!;
          const book = (await tx.c.catalog_books.findOne({ _id: r.bookId! }))!;
          const b = (await tx.c.catalog_revisions.findOne({
            _id: book.currentRevisionId!,
          }))!;
          const auctioning = await tx.c.auction_intakes
            .find(
              { sellerId: actor._id, state: 'Auctioning' },
              { projection: { auctionId: 1 } },
            )
            .toArray();
          const open =
            (await tx.c.auction_intakes.countDocuments({
              sellerId: actor._id,
              state: { $in: [...PRE_AUCTION_STATES] },
            })) +
            (await tx.c.auctions.countDocuments({
              _id: { $in: auctioning.map((i) => i.auctionId!) },
              state: { $in: ['Active', 'OnHold'] },
            }));
          if (open >= 2)
            throw new DomainError(
              429,
              'RATE_LIMITED',
              'Bạn đang có hai phiên đấu giá chưa kết thúc.',
            );
          const now = await this.clock.decision(tx, context.auth);
          await requireUnrestricted(tx, actor._id, now);
          const intakeId = randomUUID(),
            contextId = randomUUID();
          const slot = await this.points.reserveSlot(
            tx,
            point,
            l._id,
            contextId,
            now,
          );
          const ctx: AuctionIntakeContextDoc = {
            _id: contextId,
            kind: 'AuctionIntake',
            orderId: null,
            auctionIntakeId: intakeId,
            version: 1,
            ownershipPhase: 'Holding',
            lockSeq: 0,
          };
          await tx.c.workflow_contexts.insertOne(ctx);
          const i: AuctionIntakeDoc = {
            _id: intakeId,
            contextId,
            listingId: l._id,
            listingRevisionId: r._id,
            sellerId: actor._id,
            pointId: point._id,
            slotId: slot._id,
            startPrice: body.startPrice,
            step: body.step,
            buyNowPrice: body.buyNowPrice,
            protectiveValue: r.salePrice!,
            policyCode: 'HCM-AUCTION-v1',
            state: 'AwaitingDropoff',
            version: 1,
            createdAt: now,
            dropoffDeadline: new Date(now.getTime() + AUCTION_DROPOFF_MS),
            receivedAt: null,
            receivedBy: null,
            shelfCode: null,
            inspectedAt: null,
            inspectorId: null,
            inspectionOutcome: null,
            inspectionNote: null,
            auctionId: null,
            reclaimReason: null,
            closedAt: null,
            updatedAt: now,
            lockSeq: 0,
          };
          await tx.c.auction_intakes.insertOne(i);
          await tx.c.workflow_items.insertOne({
            _id: `${contextId}:${l._id}`,
            contextId,
            listingId: l._id,
            listingRevisionId: r._id,
            catalogRevisionId: b._id,
            snapshot: {
              listingId: l._id,
              listingRevisionId: r._id,
              catalogRevisionId: b._id,
              title: b.title,
              authors: b.authors,
              condition: r.condition,
              salePrice: r.salePrice,
            } as unknown as Json,
          });
          await this.reservations.acquireForIntake(
            tx,
            contextId,
            l._id,
            now,
            receiptId,
          );
          await this.listings.project(
            tx,
            l._id,
            l.version,
            'Available',
            'Reserved',
          );
          tx.check(`auction-intake:${i._id}`, () => checkIntake(tx, i._id));
          return AuctionIntakesService.change(i, now, 'AuctionIntakeCreated');
        },
      },
    );
  }

  private validatePrices(body: Wire['CreateAuctionIntake']) {
    const grid = { startPrice: body.startPrice, step: body.step };
    if (
      body.startPrice < AUCTION_MIN_PRICE ||
      body.startPrice > AUCTION_MAX_PRICE
    )
      invalidField('startPrice', 'Giá khởi điểm từ 10.000đ đến 1.000.000đ.');
    if (body.buyNowPrice !== null) {
      if (
        body.buyNowPrice <= body.startPrice ||
        body.buyNowPrice > AUCTION_MAX_PRICE
      )
        invalidField(
          'buyNowPrice',
          'Giá mua ngay phải lớn hơn giá khởi điểm và không quá 1.000.000đ.',
        );
      if (!onGrid(grid, body.buyNowPrice))
        invalidField(
          'buyNowPrice',
          'Giá mua ngay phải bằng giá khởi điểm cộng một số bước giá.',
        );
    }
  }

  cancel(
    context: CommandContext,
    id: string,
    body: Wire['AuctionVersionCommand'],
  ) {
    return this.commands.runAuction(context, 'cancelAuctionIntake', id, body, {
      authorize: async (tx, actor) => {
        member(actor);
        const i = await this.intake(tx, id);
        if (i.sellerId !== actor._id) throw notFound();
        return i;
      },
      mutate: async (tx, _actor, before, receiptId) => {
        if (before.state === 'AwaitingDropoff')
          await this.listings.lock(tx, before.listingId);
        // FR-AU02 withdrawal locks the auction before the intake, the same
        // order as bids, Buy Now and close.
        if (before.state === 'Auctioning')
          await tx.lock('auctions', [before.auctionId!]);
        const i = await this.lockIntake(tx, before);
        if (i.version !== body.expectedVersion) throw conflict();
        const now = await this.clock.decision(tx, context.auth);
        if (i.state === 'Auctioning') {
          const a = (await tx.c.auctions.findOne({ _id: i.auctionId! }))!;
          if (a.state !== 'Active' || a.bidderCount > 0 || now >= a.endAt)
            throw new DomainError(
              409,
              'InvalidState',
              'Chỉ rút được phiên đang mở và chưa có lượt trả giá nào.',
            );
          const withdrawn = await tx.c.auctions.findOneAndUpdate(
            { _id: a._id, version: a.version, state: 'Active', bidderCount: 0 },
            {
              $set: {
                state: 'Cancelled',
                closedAt: now,
                cancelReason: WITHDRAWN_REASON,
                updatedAt: now,
              },
              $inc: { version: 1 },
            },
          );
          if (!withdrawn) throw conflict();
          tx.check(`auction:${a._id}`, () => checkAuction(tx, a._id));
          const next = await this.transition(
            tx,
            i,
            { state: 'ReclaimRequired', reclaimReason: 'SellerCancelled' },
            now,
          );
          return AuctionIntakesService.change(next, now, 'AuctionWithdrawn');
        }
        if (i.state === 'AwaitingDropoff') {
          await this.closeOwnership(tx, i, 'Cancelled', now, receiptId);
          const next = await this.transition(
            tx,
            i,
            { state: 'Cancelled', closedAt: now },
            now,
          );
          return AuctionIntakesService.change(
            next,
            now,
            'AuctionIntakeCancelled',
          );
        }
        if (i.state !== 'Received' && i.state !== 'Passed')
          throw invalidState();
        const next = await this.transition(
          tx,
          i,
          { state: 'ReclaimRequired', reclaimReason: 'SellerCancelled' },
          now,
        );
        return AuctionIntakesService.change(
          next,
          now,
          'AuctionReclaimRequired',
        );
      },
    });
  }

  // ---------------------------------------------------------- point Staff
  receive(
    context: CommandContext,
    id: string,
    body: Wire['ReceiveAuctionIntake'],
  ) {
    return this.staffCommand(context, 'receiveAuctionIntake', id, body, {
      from: 'AwaitingDropoff',
      apply: async (tx, i, actor, now) => {
        if (now >= i.dropoffDeadline)
          throw new DomainError(
            409,
            'InvalidState',
            'Đã quá hạn gửi sách cho phiên đấu giá này.',
          );
        return this.transition(
          tx,
          i,
          {
            state: 'Received',
            receivedAt: now,
            receivedBy: actor._id,
            shelfCode: body.shelfCode,
          },
          now,
        );
      },
      event: 'AuctionBookReceived',
    });
  }

  inspect(
    context: CommandContext,
    id: string,
    body: Wire['InspectAuctionIntake'],
  ) {
    return this.staffCommand(context, 'inspectAuctionIntake', id, body, {
      from: 'Received',
      apply: (tx, i, actor, now) =>
        this.transition(
          tx,
          i,
          {
            inspectedAt: now,
            inspectorId: actor._id,
            inspectionOutcome: body.outcome,
            inspectionNote: body.note?.trim() || null,
            ...(body.outcome === 'Pass'
              ? { state: 'Passed' as const }
              : {
                  state: 'ReclaimRequired' as const,
                  reclaimReason: 'InspectionFailed' as const,
                }),
          },
          now,
        ),
      event: 'AuctionBookInspected',
    });
  }

  open(
    context: CommandContext,
    id: string,
    body: Wire['AuctionVersionCommand'],
  ) {
    return this.staffCommand(context, 'openAuction', id, body, {
      from: 'Passed',
      sellerMustBeActive: true,
      apply: async (tx, i, _actor, now) => {
        const listing = await tx.c.listings.findOne({ _id: i.listingId });
        if (listing?.currentRevisionId !== i.listingRevisionId)
          throw invalidState();
        const a: AuctionDoc = {
          _id: randomUUID(),
          intakeId: i._id,
          contextId: i.contextId,
          listingId: i.listingId,
          sellerId: i.sellerId,
          pointId: i.pointId,
          startPrice: i.startPrice,
          step: i.step,
          buyNowPrice: i.buyNowPrice,
          startAt: now,
          endAt: new Date(now.getTime() + AUCTION_DURATION_MS),
          state: 'Active',
          currentPrice: null,
          leaderId: null,
          bidderCount: 0,
          bidCount: 0,
          nextSequence: 1,
          winnerId: null,
          finalPrice: null,
          closedAt: null,
          paymentDeadline: null,
          cancelReason: null,
          orderId: null,
          version: 1,
          updatedAt: now,
          lockSeq: 0,
        };
        await tx.c.auctions.insertOne(a);
        tx.check(`auction:${a._id}`, () => checkAuction(tx, a._id));
        return this.transition(
          tx,
          i,
          { state: 'Auctioning', auctionId: a._id },
          now,
        );
      },
      event: 'AuctionOpened',
    });
  }

  reclaim(
    context: CommandContext,
    id: string,
    body: Wire['AuctionVersionCommand'],
  ) {
    return this.staffCommand(context, 'reclaimAuctionIntake', id, body, {
      from: 'ReclaimRequired',
      lockListing: true,
      apply: async (tx, i, _actor, now, receiptId) => {
        await this.closeOwnership(tx, i, 'Reclaimed', now, receiptId);
        return this.transition(
          tx,
          i,
          { state: 'Reclaimed', closedAt: now },
          now,
        );
      },
      event: 'AuctionBookReclaimed',
    });
  }

  private staffCommand(
    context: CommandContext,
    operation:
      | 'receiveAuctionIntake'
      | 'inspectAuctionIntake'
      | 'openAuction'
      | 'reclaimAuctionIntake',
    id: string,
    body: { expectedVersion: number },
    step: {
      from: AuctionIntakeDoc['state'];
      sellerMustBeActive?: boolean;
      lockListing?: boolean;
      apply: (
        tx: Tx,
        i: AuctionIntakeDoc,
        actor: CurrentActor,
        now: Date,
        receiptId: string,
      ) => Promise<AuctionIntakeDoc>;
      event: string;
    },
  ) {
    return this.commands.runAuction(context, operation, id, body, {
      discover: async (tx) => [(await this.intake(tx, id)).sellerId],
      // Current role/assignment before any receipt replay.
      authorize: async (tx, actor) => {
        const i = await this.intake(tx, id);
        await this.staff(tx, actor, i, await this.clock.now(tx));
        return i;
      },
      mutate: async (tx, actor, before, receiptId) => {
        await this.points.lockPoint(tx, before.pointId);
        if (step.lockListing) await this.listings.lock(tx, before.listingId);
        const i = await this.lockIntake(tx, before);
        const now = await this.clock.decision(tx, context.auth);
        await this.staff(tx, actor, i, now);
        if (i.version !== body.expectedVersion) throw conflict();
        if (i.state !== step.from) throw invalidState();
        if (step.sellerMustBeActive) {
          const seller = await tx.c.users.findOne({ _id: i.sellerId });
          if (seller?.status !== 'ACTIVE')
            throw new DomainError(
              409,
              'InvalidState',
              'Người bán hiện không đủ điều kiện mở phiên đấu giá.',
            );
        }
        const next = await step.apply(tx, i, actor, now, receiptId);
        return AuctionIntakesService.change(next, now, step.event);
      },
    });
  }

  // ----------------------------------------------------------- worker
  // AwaitingDropoff past the 72-hour deadline: the book never arrived, so
  // the slot and commitment are released (FR-AU02). Retried until it commits.
  expireDropoff(intakeId: string) {
    return this.commands.systemAuction('AuctionIntakeExpiry', intakeId, {
      discover: async () => [],
      authorize: (tx) => this.intake(tx, intakeId),
      mutate: async (tx, before, receiptId) => {
        await this.listings.lock(tx, before.listingId);
        const i = await this.lockIntake(tx, before);
        const now = await this.clock.now(tx);
        if (i.state !== 'AwaitingDropoff' || now < i.dropoffDeadline)
          throw invalidState();
        await this.closeOwnership(tx, i, 'Cancelled', now, receiptId);
        const next = await this.transition(
          tx,
          i,
          { state: 'Cancelled', closedAt: now },
          now,
        );
        return AuctionIntakesService.change(next, now, 'AuctionIntakeExpired');
      },
    });
  }

  // -------------------------------------------------------------- reads
  private async project(
    tx: Tx,
    i: AuctionIntakeDoc,
    staffView: boolean,
  ): Promise<Wire['AuctionIntake']> {
    const item = await tx.c.workflow_items.findOne({
      _id: `${i.contextId}:${i.listingId}`,
    });
    return {
      id: i._id,
      contextId: i.contextId,
      listingId: i.listingId,
      listingRevisionId: i.listingRevisionId,
      title: String((item?.snapshot as { title?: string })?.title ?? ''),
      pointId: i.pointId,
      startPrice: i.startPrice,
      step: i.step as 10000 | 50000,
      buyNowPrice: i.buyNowPrice,
      protectiveValue: i.protectiveValue,
      state: i.state,
      version: i.version,
      createdAt: i.createdAt.toISOString(),
      dropoffDeadline: i.dropoffDeadline.toISOString(),
      receivedAt: i.receivedAt?.toISOString() ?? null,
      shelfCode: staffView ? i.shelfCode : null,
      inspectedAt: i.inspectedAt?.toISOString() ?? null,
      inspectionOutcome: i.inspectionOutcome,
      inspectionNote: i.inspectionNote,
      auctionId: i.auctionId,
      reclaimReason: i.reclaimReason,
      closedAt: i.closedAt?.toISOString() ?? null,
    };
  }
  listMine(auth: Actor): Promise<Wire['AuctionIntakeList']> {
    return this.commands.read(auth, async (tx, actor) => {
      member(actor);
      const rows = await tx.c.auction_intakes
        .find({ sellerId: actor._id }, { sort: { createdAt: -1 }, limit: 50 })
        .toArray();
      const items = [];
      for (const i of rows) items.push(await this.project(tx, i, false));
      return { items };
    });
  }
  readMine(auth: Actor, id: string): Promise<Wire['AuctionIntake']> {
    return this.commands.read(auth, async (tx, actor) => {
      member(actor);
      const i = await tx.c.auction_intakes.findOne({ _id: id });
      if (!i || i.sellerId !== actor._id) throw notFound();
      return this.project(tx, i, false);
    });
  }
  listForStaff(auth: Actor): Promise<Wire['AuctionIntakeList']> {
    return this.commands.read(auth, async (tx, actor) => {
      requireActive(actor);
      if (!actor.roles.some((r) => r.role === 'STAFF'))
        throw forbidden('Chỉ nhân viên điểm được xem danh sách này.');
      const pointIds = await this.points.assignedPointIds(
        tx,
        actor._id,
        await this.mongo.now(),
      );
      const rows = await tx.c.auction_intakes
        .find(
          {
            pointId: { $in: pointIds },
            sellerId: { $ne: actor._id },
            state: { $nin: ['Cancelled', 'Reclaimed'] },
          },
          { sort: { createdAt: 1 }, limit: 50 },
        )
        .toArray();
      const items = [];
      for (const i of rows) items.push(await this.project(tx, i, true));
      return { items };
    });
  }
}
