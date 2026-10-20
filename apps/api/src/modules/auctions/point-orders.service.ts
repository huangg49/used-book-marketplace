import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AuctionDoc,
  Json,
  PointOrderContextDoc,
  PointOrderDoc,
} from '../../database/mongo/documents.js';
import {
  POINT_ORDER_COMMISSION_BPS,
  RECIPIENT_DECISION_MS,
} from '../../database/mongo/migrations/auction-constants.js';
import type { Tx } from '../../database/mongo/transaction.js';
import {
  DomainError,
  conflict,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import {
  MongoCommandService,
  member,
  type Actor,
  type AuctionChange,
  type CommandContext,
} from '../commands/mongo-command.service.js';
import { ReservationsService } from '../reservations/reservations.service.js';
import { LedgerService } from '../wallet/ledger.service.js';
import { AuctionClock } from './auction-clock.js';
import { checkAuction } from './auction-invariants.js';
import { notifyAuction } from './auction-notifications.js';
import {
  deliveryChoice,
  deliveryPrice,
  deliverySnapshot,
  deliveryView,
} from './point-delivery.js';
import { checkPointOrder } from './point-order-invariants.js';

// ViaPoint Order formed by an auction win or Buy Now (FR-AU06/07, FR-O05).
// Formation and expiry run inside the auction transaction that decided them;
// payment locks the auction before the Order so it serializes with expiry.
@Injectable()
export class PointOrdersService {
  constructor(
    private readonly commands: MongoCommandService,
    private readonly reservations: ReservationsService,
    private readonly ledger: LedgerService,
    private readonly clock: AuctionClock,
  ) {}

  static change(
    o: PointOrderDoc,
    decidedAt: Date,
    event: string,
  ): AuctionChange {
    return {
      entityType: 'PointOrder',
      entityId: o._id,
      intakeId: o.intakeId,
      auctionId: o.auctionId,
      orderId: o._id,
      contextId: o.contextId,
      version: o.version,
      state: o.state,
      decidedAt,
      currentPrice: null,
      minimumBid: null,
      leading: null,
      event,
    };
  }

  // Caller holds the auction lock and has decided the winner and deadline.
  async form(
    tx: Tx,
    a: AuctionDoc,
    buyerId: string,
    bookPrice: number,
    paymentDeadline: Date,
    now: Date,
    receiptId: string,
  ) {
    const intakeItem = await tx.c.workflow_items.findOne({
      _id: `${a.contextId}:${a.listingId}`,
    });
    if (!intakeItem) throw invalidState();
    const commission = Math.round(
      (bookPrice * POINT_ORDER_COMMISSION_BPS) / 10_000,
    );
    const o: PointOrderDoc = {
      _id: randomUUID(),
      source: 'Auction',
      auctionId: a._id,
      intakeId: a.intakeId,
      contextId: randomUUID(),
      listingId: a.listingId,
      buyerId,
      sellerId: a.sellerId,
      pointId: a.pointId,
      fulfillmentMethod: 'SelfCollect',
      bookPrice,
      outboundFee: 0,
      buyerTotal: bookPrice,
      commissionBps: POINT_ORDER_COMMISSION_BPS,
      commission,
      sellerProceeds: bookPrice - commission,
      state: 'AwaitingPayment',
      version: 1,
      createdAt: now,
      paymentDeadline,
      paidAt: null,
      closedAt: null,
      updatedAt: now,
      acceptanceDeadline: null,
      acceptedAt: null,
      collectionDeadline: null,
      collectedAt: null,
      inspectionDeadline: null,
      resolutionReason: null,
      resolutionNote: null,
      resolutionOpenedAt: null,
      collectionOpenedAt: null,
      returnDeadline: null,
      returnedAt: null,
      dispatchedAt: null,
      deliveryDeadline: null,
      trackingCode: null,
      lockSeq: 0,
    };
    const context: PointOrderContextDoc = {
      _id: o.contextId,
      kind: 'PointOrder',
      orderId: o._id,
      auctionIntakeId: null,
      version: 1,
      ownershipPhase: 'Holding',
      lockSeq: 0,
    };
    await tx.c.workflow_contexts.insertOne(context);
    await tx.c.point_orders.insertOne(o);
    await tx.c.workflow_items.insertOne({
      ...intakeItem,
      _id: `${o.contextId}:${o.listingId}`,
      contextId: o.contextId,
    });
    // Frozen agreement; later policy or price changes never edit it.
    await tx.c.agreement_snapshots.insertOne({
      _id: o.contextId,
      snapshot: {
        schemaVersion: 1,
        policyVersion: 'HCM-AUCTION-v1',
        method: 'ViaPoint',
        source: 'Auction',
        demoOnly: true,
        currency: 'VND',
        auctionId: a._id,
        buyerId,
        sellerId: a.sellerId,
        pointId: a.pointId,
        fulfillmentMethod: 'SelfCollect',
        createdAt: now.toISOString(),
        paymentDeadline: paymentDeadline.toISOString(),
        amounts: {
          bookPrice,
          outboundFee: 0,
          buyerTotal: o.buyerTotal,
          commissionBps: POINT_ORDER_COMMISSION_BPS,
          commission,
          sellerProceedsOnCompletion: o.sellerProceeds,
        },
      } as unknown as Json,
    });
    await this.reservations.transfer(
      tx,
      a.contextId,
      o.contextId,
      a.listingId,
      now,
      receiptId,
    );
    tx.check(`point-order:${o._id}`, () => checkPointOrder(tx, o._id));
    return o;
  }

  // Caller holds the auction lock: unpaid at the deadline, the commitment
  // returns to the intake for reclaim. No charge, no runner-up (FR-AU08).
  async expire(tx: Tx, orderId: string, now: Date, receiptId: string) {
    await tx.lock('point_orders', [orderId]);
    const o = (await tx.c.point_orders.findOne({ _id: orderId }))!;
    if (o.state !== 'AwaitingPayment' || now < o.paymentDeadline)
      throw invalidState();
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
    const next = await tx.c.point_orders.findOneAndUpdate(
      { _id: o._id, version: o.version, state: 'AwaitingPayment' },
      {
        $set: { state: 'PaymentExpired', closedAt: now, updatedAt: now },
        $inc: { version: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!next) throw conflict();
    tx.check(`point-order:${o._id}`, () => checkPointOrder(tx, o._id));
    return next;
  }

  private async own(tx: Tx, id: string, userId: string, buyerOnly: boolean) {
    const o = await tx.c.point_orders.findOne({ _id: id });
    if (!o || (o.buyerId !== userId && (buyerOnly || o.sellerId !== userId)))
      throw notFound();
    return o;
  }

  pay(context: CommandContext, id: string, body: Wire['PayPointOrder']) {
    return this.commands.runAuction(context, 'payPointOrder', id, body, {
      discover: async (tx) => {
        const o = await this.own(tx, id, context.auth.user.id, true);
        return [o.buyerId, o.sellerId];
      },
      authorize: async (tx, actor) => {
        member(actor);
        return this.own(tx, id, actor._id, true);
      },
      mutate: async (tx, _actor, before, receiptId) => {
        const method = deliveryChoice(body);
        await tx.lock('auctions', [before.auctionId]);
        await tx.lock('point_orders', [id]);
        const o = (await tx.c.point_orders.findOne({ _id: id }))!;
        if (o.version !== body.expectedVersion) throw conflict();
        if (o.state !== 'AwaitingPayment') throw invalidState();
        const seller = (await tx.c.users.findOne({ _id: o.sellerId }))!;
        if (
          !seller.emailVerifiedAt ||
          !['ACTIVE', 'RESTRICTED'].includes(seller.status)
        )
          throw new DomainError(
            403,
            'AccountIneligible',
            'Người bán hiện không đủ điều kiện nhận thanh toán.',
          );
        const accounts = await this.ledger.lockOrder(
          tx,
          o.buyerId,
          o._id,
          true,
        );
        const now = await this.clock.decision(tx, context.auth);
        if (now >= o.paymentDeadline)
          throw new DomainError(
            409,
            'InvalidState',
            'Đã quá hạn thanh toán cho phiên đấu giá này.',
          );
        // ADR 0044: delivery adds the outbound fee to the one payment.
        const delivery =
          method === 'CarrierOutbound'
            ? await deliverySnapshot(tx, o, body, now, receiptId)
            : null;
        const outboundFee = delivery?.outboundFee ?? 0;
        await this.ledger.postOrder(
          tx,
          o._id,
          receiptId,
          accounts,
          o.bookPrice + outboundFee,
          now,
        );
        if (delivery) await tx.c.point_order_deliveries.insertOne(delivery);
        const next = await tx.c.point_orders.findOneAndUpdate(
          { _id: o._id, version: o.version, state: 'AwaitingPayment' },
          {
            // Payment opens the 72 h recipient decision on the report (POL-32).
            $set: {
              fulfillmentMethod: method,
              outboundFee,
              buyerTotal: o.bookPrice + outboundFee,
              state: 'Fulfilling',
              paidAt: now,
              acceptanceDeadline: new Date(
                now.getTime() + RECIPIENT_DECISION_MS,
              ),
              updatedAt: now,
            },
            $inc: { version: 1 },
          },
          { returnDocument: 'after' },
        );
        if (!next) throw conflict();
        const a = (await tx.c.auctions.findOne({ _id: o.auctionId }))!;
        const sold = await tx.c.auctions.findOneAndUpdate(
          { _id: a._id, version: a.version, orderId: o._id },
          { $set: { state: 'Sold', updatedAt: now }, $inc: { version: 1 } },
        );
        if (!sold) throw conflict();
        tx.check(`auction:${a._id}`, () => checkAuction(tx, a._id));
        tx.check(`point-order:${o._id}`, () => checkPointOrder(tx, o._id));
        const paid = (await tx.c.auctions.findOne({ _id: a._id }))!;
        await notifyAuction(tx, paid, 'AuctionPaid', [o.sellerId], now);
        return PointOrdersService.change(next, now, 'PointOrderPaymentHeld');
      },
    });
  }

  read(auth: Actor, id: string): Promise<Wire['PointOrder']> {
    // Existing obligation: a LOCKED participant still reads a paid Order.
    return this.commands.readObligation(auth, async (tx, actor) => {
      member(actor);
      const o = await this.own(tx, id, actor._id, false);
      const item = await tx.c.workflow_items.findOne({
        _id: `${o.contextId}:${o.listingId}`,
      });
      const point = await tx.c.handover_points.findOne({ _id: o.pointId });
      const intake = (await tx.c.auction_intakes.findOne({
        _id: o.intakeId,
      }))!;
      return {
        id: o._id,
        source: 'Auction',
        auctionId: o.auctionId,
        listingId: o.listingId,
        title: String((item?.snapshot as { title?: string })?.title ?? ''),
        pointId: o.pointId,
        pointName: point?.name ?? '',
        role: o.buyerId === actor._id ? 'Buyer' : 'Seller',
        method: 'ViaPoint',
        fulfillmentMethod: o.fulfillmentMethod,
        state: o.state,
        version: o.version,
        currency: 'VND',
        demoOnly: true,
        amounts: {
          bookPrice: o.bookPrice,
          outboundFee: o.outboundFee,
          buyerTotal: o.buyerTotal,
          commissionBps: o.commissionBps,
          commission: o.commission,
          sellerProceedsOnCompletion: o.sellerProceeds,
        },
        createdAt: o.createdAt.toISOString(),
        paymentDeadline: o.paymentDeadline.toISOString(),
        paidAt: o.paidAt?.toISOString() ?? null,
        closedAt: o.closedAt?.toISOString() ?? null,
        report: {
          outcome: 'Pass',
          inspectedAt: intake.inspectedAt!.toISOString(),
          note: intake.inspectionNote,
          scope:
            'Đã kiểm tra tình trạng tại điểm theo checklist; không xác nhận sách chính hãng.',
        },
        acceptanceDeadline: o.acceptanceDeadline?.toISOString() ?? null,
        acceptedAt: o.acceptedAt?.toISOString() ?? null,
        collectionDeadline: o.collectionDeadline?.toISOString() ?? null,
        collectedAt: o.collectedAt?.toISOString() ?? null,
        inspectionDeadline: o.inspectionDeadline?.toISOString() ?? null,
        refunded: o.state === 'Cancelled',
        settled: o.state === 'Completed',
        returnDeadline: o.returnDeadline?.toISOString() ?? null,
        returnedAt: o.returnedAt?.toISOString() ?? null,
        resolution: o.resolutionReason
          ? {
              reason: o.resolutionReason,
              openedAt: o.resolutionOpenedAt!.toISOString(),
            }
          : null,
        // The seller never sees the buyer's address (ADR 0044).
        delivery:
          o.fulfillmentMethod === 'CarrierOutbound' && o.buyerId === actor._id
            ? deliveryView(
                o,
                (await tx.c.point_order_deliveries.findOne({ _id: o._id }))!,
              )
            : null,
        serverTime: (await tx.now()).toISOString(),
      };
    });
  }

  // ADR 0044: prices delivery of an unpaid Order to one of the buyer's
  // addresses. Reserves nothing; payment rechecks address version and fee.
  deliveryQuote(
    auth: Actor,
    id: string,
    addressId: string,
  ): Promise<Wire['PointOrderDeliveryQuote']> {
    return this.commands.read(auth, async (tx, actor) => {
      member(actor);
      const o = await this.own(tx, id, actor._id, true);
      if (o.state !== 'AwaitingPayment') throw invalidState();
      const { address, policyCode, fee } = await deliveryPrice(
        tx,
        o,
        addressId,
      );
      return {
        orderId: o._id,
        addressId: address._id,
        addressVersion: address.version,
        serviceAreaCode: address.serviceAreaCode,
        policyCode,
        bookPrice: o.bookPrice,
        outboundFee: fee,
        buyerTotal: o.bookPrice + fee,
        currency: 'VND',
        demoOnly: true,
      };
    });
  }
}
