import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PointOrderDoc } from '../../database/mongo/documents.js';
import { COLLECTION_WINDOW_MS } from '../../database/mongo/migrations/auction-constants.js';
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
import { pointDeadline } from './point-hours.js';
import { checkPointOrder } from './point-order-invariants.js';
import { PointOrdersService } from './point-orders.service.js';

// Independent Admin decision on a ViaPoint Order in ResolutionPending. The
// book is still at the point (no handover happened), so the only outcomes are
// a full refund of the Order hold with reclaim, or a new collection window.
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
  }
  private async involved(tx: Tx, userId: string, o: PointOrderDoc, now: Date) {
    const intake = await tx.c.auction_intakes.findOne({ _id: o.intakeId });
    return (
      userId === o.buyerId ||
      userId === o.sellerId ||
      userId === intake?.receivedBy ||
      userId === intake?.inspectorId ||
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
        if (o.state !== 'ResolutionPending' || o.collectedAt)
          throw invalidState();
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
            decidedAt: now,
            receiptId,
          });
        if (body.decision === 'ResumeCollection') {
          await record(null);
          const next = await this.transition(
            tx,
            o,
            {
              state: 'ReadyForCollection',
              acceptedAt: o.acceptedAt ?? now,
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
        await this.intakes.requireReclaim(
          tx,
          o.intakeId,
          'OrderCancelled',
          now,
        );
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
        if (await this.involved(tx, actor._id, o, now)) continue;
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
