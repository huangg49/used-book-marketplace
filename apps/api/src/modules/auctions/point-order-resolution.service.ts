import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  PointOrderDoc,
  PointOrderResolutionDoc,
} from '../../database/mongo/documents.js';
import {
  COLLECTION_WINDOW_MS,
  RETURN_WINDOW_MS,
} from '../../database/mongo/migrations/auction-constants.js';
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
  requireActive,
  type Actor,
  type CommandContext,
  type CurrentActor,
} from '../commands/mongo-command.service.js';
import { ReservationsService } from '../reservations/reservations.service.js';
import { LedgerService } from '../wallet/ledger.service.js';
import { AuctionClock } from './auction-clock.js';
import { checkAuction } from './auction-invariants.js';
import { AuctionIntakesService } from './auction-intakes.service.js';
import { HandoverPointsService } from './handover-points.service.js';
import { recordViolation } from './member-violations.js';
import { pointDeadline } from './point-hours.js';
import { checkPointOrder } from './point-order-invariants.js';
import { PointOrdersService } from './point-orders.service.js';

type OpenReason = PointOrderResolutionDoc['openReason'];
type Decision = PointOrderResolutionDoc['decision'];
type Fault = PointOrderResolutionDoc['fault'];
// FR-H09 / FR-D01 decision matrix (mirrored by the migration 0013 validator):
// an unanswered report is cancelled safely (never accepted for the buyer); an
// unfounded rejection or a missed collection may continue with a new window;
// a refund always states the fault; after the handover only dismiss/return.
const ALLOWED: Record<OpenReason, Partial<Record<Decision, Fault[]>>> = {
  RecipientDecisionOverdue: { RefundBuyer: ['BuyerDefault', 'NoFault'] },
  ReportRejected: {
    RefundBuyer: ['BookMisdescribed', 'NoFault'],
    ResumeCollection: [null],
  },
  CollectionOverdue: {
    RefundBuyer: ['BuyerDefault', 'NoFault'],
    ResumeCollection: [null],
  },
  InspectionClaim: { DismissClaim: [null], RequireReturn: [null] },
  ReturnOverdue: { DismissClaim: [null], RequireReturn: [null] },
  // ADR 0044: the carrier brings an undelivered book back to the point.
  DeliveryFailed: { RequireReturn: [null] },
};

// Independent Admin decision on a ViaPoint Order in ResolutionPending. While
// the book is still at the point the outcomes are a full refund of the Order
// hold with reclaim, or a new collection window. After the handover (a buyer
// claim or a missed return) the Admin dismisses the claim, so the Order goes
// back to Inspection and settles after the window, or requires the book back
// at the point; only the Staff-received return refunds the buyer.
// Lock order: users -> session -> auction -> Order -> intake -> commitment ->
// ledger accounts, the same as payment and expiry.
@Injectable()
export class PointOrderResolutionService {
  constructor(
    private readonly commands: MongoCommandService,
    private readonly reservations: ReservationsService,
    private readonly ledger: LedgerService,
    private readonly intakes: AuctionIntakesService,
    private readonly points: HandoverPointsService,
    private readonly clock: AuctionClock,
  ) {}

  private async order(tx: Tx, id: string) {
    const o = await tx.c.point_orders.findOne({ _id: id });
    if (!o) throw notFound();
    return o;
  }
  // ADMIN, not a participant and not Staff who handled the book or works at
  // its point. Runs in authorize, so it precedes any receipt replay.
  private async independentAdmin(
    tx: Tx,
    actor: CurrentActor,
    o: PointOrderDoc,
  ) {
    requireActive(actor);
    if (!actor.roles.some((r) => r.role === 'ADMIN'))
      throw new DomainError(
        403,
        'FORBIDDEN',
        'Chỉ quản trị viên được quyết định hồ sơ này.',
      );
    if (await this.involved(tx, actor._id, o, await tx.now()))
      throw new DomainError(
        403,
        'SelfReviewForbidden',
        'Bạn liên quan đến giao dịch hoặc điểm này nên không được quyết định.',
      );
    if (await this.decidedEarlierClaim(tx, actor._id, o))
      throw new DomainError(
        403,
        'SelfReviewForbidden',
        'Bạn đã quyết định khiếu nại trước của đơn này; khiếu nại mới cần quản trị viên khác.',
      );
  }
  // A repeated claim is the buyer's appeal: another Admin decides it.
  private async decidedEarlierClaim(tx: Tx, userId: string, o: PointOrderDoc) {
    return (
      o.resolutionReason === 'InspectionClaim' &&
      !!(await tx.c.point_order_resolutions.findOne({
        orderId: o._id,
        openReason: 'InspectionClaim',
        adminId: userId,
      }))
    );
  }
  // Staff who received, inspected, handed over or took back this book stay
  // excluded after their assignment ends: a claim may concern their own step.
  private async involved(tx: Tx, userId: string, o: PointOrderDoc, now: Date) {
    const intake = await tx.c.auction_intakes.findOne({ _id: o.intakeId });
    const handover = await tx.c.point_handovers.findOne({ orderId: o._id });
    const returned = await tx.c.point_returns.countDocuments({
      orderId: o._id,
      staffId: userId,
    });
    return (
      userId === o.buyerId ||
      userId === o.sellerId ||
      userId === intake?.receivedBy ||
      userId === intake?.inspectorId ||
      userId === handover?.staffId ||
      returned > 0 ||
      (await this.points.assignedPointIds(tx, userId, now)).includes(o.pointId)
    );
  }

  resolve(
    context: CommandContext,
    id: string,
    body: Wire['ResolvePointOrder'],
  ) {
    return this.commands.runAuction(context, 'resolvePointOrder', id, body, {
      discover: async (tx) => {
        const o = await this.order(tx, id);
        return [o.buyerId, o.sellerId];
      },
      authorize: async (tx, actor) => {
        const o = await this.order(tx, id);
        await this.independentAdmin(tx, actor, o);
        return o;
      },
      mutate: async (tx, actor, before, receiptId) => {
        const reason = body.reason.trim();
        if (reason.length < 10)
          invalidField('reason', 'Hãy ghi lý do quyết định ít nhất 10 ký tự.');
        await tx.lock('auctions', [before.auctionId]);
        await tx.lock('point_orders', [id]);
        const o = await this.order(tx, id);
        if (o.version !== body.expectedVersion) throw conflict();
        if (o.state !== 'ResolutionPending') throw invalidState();
        const fault: Fault = body.fault ?? null;
        let faults = ALLOWED[o.resolutionReason!][body.decision];
        if (!faults)
          invalidField(
            'decision',
            o.collectedAt
              ? 'Sách đã giao cho người mua: chỉ có thể bác khiếu nại hoặc yêu cầu trả sách về điểm.'
              : o.resolutionReason === 'DeliveryFailed'
                ? 'Giao hàng không thành công: chỉ có thể yêu cầu hãng trả sách về điểm.'
                : o.resolutionReason === 'RecipientDecisionOverdue'
                  ? 'Người mua không phản hồi biên bản: chỉ có thể hủy an toàn và hoàn tiền.'
                  : 'Sách còn ở điểm: chỉ có thể hoàn tiền hoặc mở lại thời hạn nhận.',
          );
        // ADR 0044: a delivery the point did not hand to the carrier in time
        // is never the buyer's default.
        if (
          o.fulfillmentMethod === 'CarrierOutbound' &&
          o.resolutionReason === 'CollectionOverdue' &&
          body.decision === 'RefundBuyer'
        )
          faults = ['NoFault'];
        if (!faults!.includes(fault))
          invalidField(
            'fault',
            body.decision === 'RefundBuyer'
              ? 'Hãy chọn lỗi phù hợp với lý do mở hồ sơ.'
              : 'Quyết định này không ghi lỗi.',
          );
        const now = await this.clock.decision(tx, context.auth);
        const record = (journalId: string | null) =>
          tx.c.point_order_resolutions.insertOne({
            _id: randomUUID(),
            orderId: o._id,
            decision: body.decision,
            openReason: o.resolutionReason!,
            reason,
            adminId: actor._id,
            journalId,
            fault,
            decidedAt: now,
            receiptId,
          });
        if (body.decision === 'DismissClaim') {
          await record(null);
          const next = await this.transition(
            tx,
            o,
            {
              state: 'Inspection',
              resolutionReason: null,
              resolutionNote: null,
              resolutionOpenedAt: null,
            },
            now,
          );
          return {
            ...PointOrdersService.change(next, now, 'PointOrderClaimDismissed'),
            reason,
          };
        }
        if (body.decision === 'RequireReturn') {
          await record(null);
          const next = await this.transition(
            tx,
            o,
            {
              state: 'ReturnPending',
              returnDeadline: pointDeadline(now, RETURN_WINDOW_MS),
            },
            now,
          );
          return {
            ...PointOrdersService.change(next, now, 'PointOrderReturnRequired'),
            reason,
          };
        }
        if (body.decision === 'ResumeCollection') {
          await record(null);
          const next = await this.transition(
            tx,
            o,
            {
              // acceptedAt stays as the buyer left it: an Admin decision
              // opens this window, not a buyer acceptance of the report.
              state: 'ReadyForCollection',
              collectionOpenedAt: now,
              collectionDeadline: pointDeadline(now, COLLECTION_WINDOW_MS),
              resolutionReason: null,
              resolutionNote: null,
              resolutionOpenedAt: null,
            },
            now,
          );
          return {
            ...PointOrdersService.change(
              next,
              now,
              'PointOrderCollectionResumed',
            ),
            reason,
          };
        }
        // RefundBuyer: the full frozen total returns from the Order hold to
        // the buyer once; the Order closes and the book goes back to reclaim.
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
        await record(journal._id);
        const a = (await tx.c.auctions.findOne({ _id: o.auctionId }))!;
        await this.reservations.transfer(
          tx,
          o.contextId,
          a.contextId,
          o.listingId,
          now,
          receiptId,
        );
        const closed = await tx.c.workflow_contexts.updateOne(
          { _id: o.contextId, ownershipPhase: 'Holding', version: 1 },
          { $set: { ownershipPhase: 'Closed' }, $inc: { version: 1 } },
        );
        if (closed.modifiedCount !== 1) throw conflict();
        const next = await this.transition(
          tx,
          o,
          { state: 'Cancelled', closedAt: now },
          now,
        );
        // A misdescribed book goes back with its listing sent to revision.
        await this.intakes.requireReclaim(
          tx,
          o.intakeId,
          fault === 'BookMisdescribed' ? 'BookMisdescribed' : 'OrderCancelled',
          now,
        );
        if (fault === 'BuyerDefault')
          await recordViolation(tx, {
            userId: o.buyerId,
            kind: 'PointOrderBuyerDefault',
            sourceId: o._id,
            recordedAt: now,
            receiptId,
          });
        tx.check(`auction:${a._id}`, () => checkAuction(tx, a._id));
        return {
          ...PointOrdersService.change(next, now, 'PointOrderRefunded'),
          reason,
        };
      },
    });
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

  queue(auth: Actor): Promise<Wire['PointOrderResolutionQueue']> {
    return this.commands.read(auth, async (tx, actor) => {
      requireActive(actor);
      if (!actor.roles.some((r) => r.role === 'ADMIN'))
        throw new DomainError(
          403,
          'FORBIDDEN',
          'Chỉ quản trị viên được xem danh sách này.',
        );
      const now = await tx.now();
      const rows = await tx.c.point_orders
        .find(
          { state: 'ResolutionPending' },
          { sort: { resolutionOpenedAt: 1, _id: 1 }, limit: 100 },
        )
        .toArray();
      const items: Wire['PointOrderResolutionItem'][] = [];
      for (const o of rows) {
        if (items.length === 50) break;
        if (
          (await this.involved(tx, actor._id, o, now)) ||
          (await this.decidedEarlierClaim(tx, actor._id, o))
        )
          continue;
        const item = await tx.c.workflow_items.findOne({
          _id: `${o.contextId}:${o.listingId}`,
        });
        const point = await tx.c.handover_points.findOne({ _id: o.pointId });
        items.push({
          id: o._id,
          version: o.version,
          title: String((item?.snapshot as { title?: string })?.title ?? ''),
          pointName: point?.name ?? '',
          openReason: o.resolutionReason!,
          note: o.resolutionNote,
          openedAt: o.resolutionOpenedAt!.toISOString(),
          buyerTotal: o.buyerTotal,
        });
      }
      return { items, serverTime: now.toISOString() };
    });
  }
}
