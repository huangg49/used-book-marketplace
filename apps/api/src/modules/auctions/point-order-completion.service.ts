import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PointOrderDoc } from '../../database/mongo/documents.js';
import { CLAIM_MIN_LENGTH } from '../../database/mongo/migrations/auction-constants.js';
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
  type CommandContext,
  type CurrentActor,
} from '../commands/mongo-command.service.js';
import { ListingCommitmentPolicy } from '../listings/listing-commitment-policy.service.js';
import { ReservationsService } from '../reservations/reservations.service.js';
import { LedgerService } from '../wallet/ledger.service.js';
import { AuctionClock } from './auction-clock.js';
import { checkAuction } from './auction-invariants.js';
import { AuctionIntakesService } from './auction-intakes.service.js';
import { HandoverPointsService } from './handover-points.service.js';
import { isPointOpen } from './point-hours.js';
import { checkPointOrder } from './point-order-invariants.js';
import { PointOrdersService } from './point-orders.service.js';

const late = (message: string) => new DomainError(409, 'InvalidState', message);

// End of a collected ViaPoint Order (FR-T03, FR-D01/02, SRS §9.1; migration
// 0012). Within the inspection window the buyer may file one claim, which
// stops settlement until an Admin decides. A required return is received by
// assigned Staff and refunds the whole hold; otherwise the settlement worker
// pays P − C to the seller and C to the platform once the window has passed.
// Lock order: users -> listing -> point -> auction -> Order -> intake ->
// commitment -> ledger accounts.
@Injectable()
export class PointOrderCompletionService {
  constructor(
    private readonly commands: MongoCommandService,
    private readonly reservations: ReservationsService,
    private readonly ledger: LedgerService,
    private readonly intakes: AuctionIntakesService,
    private readonly points: HandoverPointsService,
    private readonly listings: ListingCommitmentPolicy,
    private readonly clock: AuctionClock,
  ) {}

  private async order(tx: Tx, id: string) {
    const o = await tx.c.point_orders.findOne({ _id: id });
    if (!o) throw notFound();
    return o;
  }
  private async transition(
    tx: Tx,
    o: PointOrderDoc,
    set: Partial<PointOrderDoc>,
    now: Date,
  ) {
    const next = await tx.c.point_orders.findOneAndUpdate(
      { _id: o._id, version: o.version, state: o.state },
      { $set: { ...set, updatedAt: now }, $inc: { version: 1 } },
      { returnDocument: 'after' },
    );
    if (!next) throw conflict();
    tx.check(`point-order:${o._id}`, () => checkPointOrder(tx, o._id));
    return next;
  }
  private async closeOrderContext(tx: Tx, contextId: string) {
    const closed = await tx.c.workflow_contexts.updateOne(
      { _id: contextId, ownershipPhase: 'Holding', version: 1 },
      { $set: { ownershipPhase: 'Closed' }, $inc: { version: 1 } },
    );
    if (closed.modifiedCount !== 1) throw conflict();
  }

  // --------------------------------------------------------------- claim
  // FR-D01/02: one claim per Order, filed by the buyer before the inspection
  // deadline. It is recorded with the Order change in one commit, so a
  // concurrent settlement either sees it or has already completed first.
  claim(context: CommandContext, id: string, body: Wire['ClaimPointOrder']) {
    return this.commands.runAuction(context, 'claimPointOrder', id, body, {
      authorize: async (tx, actor) => {
        member(actor);
        const o = await this.order(tx, id);
        if (o.buyerId !== actor._id) throw notFound();
        return o;
      },
      mutate: async (tx, actor, before, receiptId) => {
        const description = body.description.trim();
        if (description.length < CLAIM_MIN_LENGTH)
          invalidField(
            'description',
            `Hãy mô tả vấn đề ít nhất ${CLAIM_MIN_LENGTH} ký tự.`,
          );
        await tx.lock('auctions', [before.auctionId]);
        await tx.lock('point_orders', [id]);
        const o = await this.order(tx, id);
        if (o.version !== body.expectedVersion) throw conflict();
        if (await tx.c.point_order_claims.findOne({ orderId: o._id }))
          throw new DomainError(
            409,
            'InvalidState',
            'Đơn này đã có khiếu nại; mỗi đơn chỉ được khiếu nại một lần.',
          );
        if (o.state !== 'Inspection') throw invalidState();
        const now = await this.clock.decision(tx, context.auth);
        if (now >= o.inspectionDeadline!)
          throw late('Đã hết thời hạn kiểm tra sách nên không thể khiếu nại.');
        await tx.c.point_order_claims.insertOne({
          _id: randomUUID(),
          orderId: o._id,
          claimantId: actor._id,
          description,
          claimedAt: now,
          receiptId,
        });
        const next = await this.transition(
          tx,
          o,
          {
            state: 'ResolutionPending',
            resolutionReason: 'InspectionClaim',
            resolutionNote: description.slice(0, 1000),
            resolutionOpenedAt: now,
          },
          now,
        );
        return PointOrdersService.change(next, now, 'PointOrderClaimed');
      },
    });
  }

  // -------------------------------------------------------------- return
  // An Admin required the book back. Assigned Staff, independent of both
  // parties, confirm it is at the point again; only then is the whole hold
  // refunded and the book sent to the seller's reclaim.
  receiveReturn(
    context: CommandContext,
    id: string,
    body: Wire['ReceivePointOrderReturn'],
  ) {
    return this.commands.runAuction(
      context,
      'receivePointOrderReturn',
      id,
      body,
      {
        discover: async (tx) => {
          const o = await this.order(tx, id);
          return [o.buyerId, o.sellerId];
        },
        authorize: async (tx, actor) => {
          const o = await this.order(tx, id);
          await this.staffFor(tx, actor, o, await this.clock.now(tx));
          return o;
        },
        mutate: async (tx, actor, before, receiptId) => {
          await this.listings.lock(tx, before.listingId);
          await this.points.lockPoint(tx, before.pointId);
          await tx.lock('auctions', [before.auctionId]);
          await tx.lock('point_orders', [id]);
          const o = await this.order(tx, id);
          const now = await this.clock.decision(tx, context.auth);
          await this.points.requireAssigned(tx, actor._id, o.pointId, now);
          if (o.version !== body.expectedVersion) throw conflict();
          if (o.state !== 'ReturnPending') throw invalidState();
          if (now >= o.returnDeadline!)
            throw late(
              'Đã quá hạn trả sách; yêu cầu đang được chuyển quản trị viên.',
            );
          if (!isPointOpen(now))
            throw late(
              'Điểm giao nhận đang đóng cửa (09:00–18:00). Hãy nhận sách trong giờ mở cửa.',
            );
          const accounts = await this.ledger.lockOrder(
            tx,
            o.buyerId,
            o._id,
            false,
          );
          const journal = await this.ledger.postOrder(
            tx,
            o._id,
            receiptId,
            accounts,
            o.buyerTotal,
            now,
            true,
          );
          await tx.c.point_returns.insertOne({
            _id: randomUUID(),
            orderId: o._id,
            pointId: o.pointId,
            staffId: actor._id,
            returnedBy: o.buyerId,
            note: body.note?.trim() || null,
            journalId: journal._id,
            receivedAt: now,
            receiptId,
          });
          const a = (await tx.c.auctions.findOne({ _id: o.auctionId }))!;
          await this.reservations.transfer(
            tx,
            o.contextId,
            a.contextId,
            o.listingId,
            now,
            receiptId,
          );
          await this.closeOrderContext(tx, o.contextId);
          const next = await this.transition(
            tx,
            o,
            { state: 'Cancelled', returnedAt: now, closedAt: now },
            now,
          );
          await this.intakes.requireReclaim(
            tx,
            o.intakeId,
            'OrderReturned',
            now,
          );
          tx.check(`auction:${a._id}`, () => checkAuction(tx, a._id));
          return PointOrdersService.change(next, now, 'PointOrderReturned');
        },
      },
    );
  }
  private async staffFor(
    tx: Tx,
    actor: CurrentActor,
    o: PointOrderDoc,
    now: Date,
  ) {
    requireActive(actor);
    if (!actor.roles.some((r) => r.role === 'STAFF'))
      throw new DomainError(
        403,
        'FORBIDDEN',
        'Chỉ nhân viên điểm được nhận sách trả về.',
      );
    if (actor._id === o.buyerId || actor._id === o.sellerId)
      throw new DomainError(
        403,
        'SelfReviewForbidden',
        'Nhân viên không được xử lý giao dịch của chính mình.',
      );
    await this.points.requireAssigned(tx, actor._id, o.pointId, now);
  }

  // ---------------------------------------------------------- settlement
  // Worker: an Inspection Order whose window has passed without a claim is
  // settled once. The book stays with the buyer, so the listing ends Sold and
  // the slot, commitment and both contexts close in the same commit.
  settle(id: string) {
    return this.commands.systemAuction('PointOrderSettlement', id, {
      discover: async (tx) => {
        const o = await this.order(tx, id);
        return [o.buyerId, o.sellerId];
      },
      authorize: (tx) => this.order(tx, id),
      mutate: async (tx, before, receiptId) => {
        await this.listings.lock(tx, before.listingId);
        await this.points.lockPoint(tx, before.pointId);
        await tx.lock('auctions', [before.auctionId]);
        await tx.lock('point_orders', [id]);
        const o = await this.order(tx, id);
        const now = await this.clock.now(tx);
        if (o.state !== 'Inspection' || now < o.inspectionDeadline!)
          throw invalidState();
        await this.ledger.settlePointOrder(tx, o, receiptId, now);
        await this.reservations.closeCompleted(tx, o.contextId, now, receiptId);
        await this.closeOrderContext(tx, o.contextId);
        await this.intakes.completeSale(tx, o.intakeId, now);
        const next = await this.transition(
          tx,
          o,
          { state: 'Completed', closedAt: now },
          now,
        );
        tx.check(`auction:${o.auctionId}`, () => checkAuction(tx, o.auctionId));
        return PointOrdersService.change(next, now, 'PointOrderSettled');
      },
    });
  }
}
