import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { Json } from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import {
  MongoCommandService,
  member,
  requireActive,
  canonicalJson,
  type Actor,
  type CommandContext,
} from '../commands/mongo-command.service.js';
import {
  conflict,
  DomainError,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { OrderClock } from '../orders/order-clock.js';
import { checkShipment } from '../orders/order-invariants.js';
import { LedgerService } from '../wallet/ledger.service.js';
import { CarrierSimulator } from './carrier-simulator.js';

// Shipments, their evidence links and carrier events are append-only. Every
// writer takes the Order fulfillment locks first (OrdersService.locked), which
// replaces PostgreSQL's extra FOR UPDATE/FOR SHARE on shipment and evidence rows.
@Injectable()
export class ShipmentsService {
  constructor(
    private readonly commands: MongoCommandService,
    private readonly orders: OrdersService,
    private readonly clock: OrderClock,
    private readonly ledger: LedgerService,
    private readonly input: ContractInput,
    private readonly simulator: CarrierSimulator,
  ) {}
  private async own(tx: Tx, id: string, actorId: string, sellerOnly = false) {
    const o = await tx.c.direct_orders.findOne({ _id: id.toLowerCase() });
    if (!o || (o.sellerId !== actorId && (sellerOnly || o.buyerId !== actorId)))
      throw notFound();
    const preparation = await tx.c.order_preparations.findOne({ _id: o._id });
    return { ...o, preparation };
  }
  private async decision(tx: Tx, auth: Actor) {
    const now = await this.clock.now(tx);
    const s = await tx.c.auth_sessions.findOne({ _id: auth.sessionId });
    if (!s || s.revokedAt || s.expiresAt <= now)
      throw new DomainError(
        401,
        'SESSION_EXPIRED',
        'Phiên đăng nhập đã hết hạn.',
      );
    return now;
  }
  register(
    context: CommandContext,
    orderId: string,
    body: Wire['RegisterDirectShipment'],
  ) {
    return this.commands.runShipment(context, orderId, body, {
      discover: async (tx) => {
        const o = await this.own(tx, orderId, context.auth.user.id, true);
        return [o.buyerId, o.sellerId];
      },
      authorize: async (tx, actor) => {
        member(actor);
        const o = await this.own(tx, orderId, actor._id, true);
        await this.decision(tx, context.auth);
        return o;
      },
      mutate: async (tx, _actor, _before, receiptId) => {
        const { o, commitment } = await this.orders.lockForFulfillment(
          tx,
          orderId,
        );
        if (o.version !== body.expectedOrderVersion) throw conflict();
        if (
          o.state !== 'Preparing' ||
          !o.preparation ||
          commitment.status !== 'Active'
        )
          throw invalidState();
        if (await tx.c.direct_shipments.findOne({ orderId: o._id }))
          throw conflict();
        const evidenceIds = body.packagingEvidenceIds.map((id) =>
          id.toLowerCase(),
        );
        const images = await tx.c.order_packaging_evidence.countDocuments({
          _id: { $in: evidenceIds },
          orderId: o._id,
          status: 'Ready',
        });
        if (images !== evidenceIds.length)
          throw new DomainError(
            422,
            'MediaNotReady',
            'Chọn ảnh đóng gói đã tải xong thuộc đơn này.',
          );
        // Serialize identical tracking across independent Orders before
        // querying the unique key (the former advisory lock).
        await tx.c.command_locks.updateOne(
          {
            _id: createHash('sha256')
              .update(
                canonicalJson(['tracking', body.carrier, body.trackingCode]),
              )
              .digest('hex'),
          },
          {
            $inc: { lockSeq: 1 },
            $set: { expiresAt: new Date(Date.now() + 7 * 86_400_000) },
          },
          { upsert: true },
        );
        if (
          await tx.c.direct_shipments.findOne({
            carrier: body.carrier,
            trackingCode: body.trackingCode,
          })
        )
          throw conflict();
        await this.ledger.lockOrder(tx, o.buyerId, o._id, false);
        if (
          (await this.ledger.orderFunds(tx, o._id)).held !== o.quote.buyerTotal
        )
          throw invalidState();
        const now = await this.decision(tx, context.auth);
        if (now >= o.preparation.pickupDeadline) throw conflict();
        const agreement = this.input.body(
          'DirectOrderAgreement',
          o.context!.agreement!.snapshot,
        );
        const shipmentId = randomUUID();
        // Evidence links are inserted with the shipment, before its receipt;
        // membership is sealed afterwards (the collection is append-only).
        await tx.c.shipment_packaging_evidence.insertMany(
          evidenceIds.map((evidenceId, position) => ({
            _id: `${shipmentId}:${evidenceId}`,
            shipmentId,
            orderId: o._id,
            evidenceId,
            position,
          })),
        );
        await tx.c.direct_shipments.insertOne({
          _id: shipmentId,
          orderId: o._id,
          version: 1,
          state: 'LabelCreated',
          carrier: body.carrier,
          trackingCode: body.trackingCode,
          direction: 'Outbound',
          origin: agreement.origin as unknown as Json,
          destination: agreement.destination as unknown as Json,
          shippingFee: agreement.amounts.shippingFee,
          feePolicy: 'SellerAdvanceBuyerReimbursement',
          registeredAt: now,
          receiptId,
        });
        tx.check(`shipment:${shipmentId}`, () => checkShipment(tx, shipmentId));
        return {
          entityType: 'Shipment',
          entityId: shipmentId,
          orderId: o._id,
          contextId: o.context!._id,
          version: 1,
          state: 'LabelCreated',
          decidedAt: now,
          event: 'DirectShipmentRegistered',
        };
      },
    });
  }
  read(auth: Actor, orderId: string): Promise<Wire['PrivateDirectShipment']> {
    return this.commands.readObligation(auth, async (tx, actor) => {
      member(actor);
      const o = await this.own(tx, orderId, actor._id);
      const s = await tx.c.direct_shipments.findOne({ orderId: o._id });
      if (!s) throw notFound();
      const evidence = await tx.c.shipment_packaging_evidence
        .find({ shipmentId: s._id }, { sort: { position: 1 } })
        .toArray();
      const pickup = await tx.c.carrier_pickup_events.findOne({
        shipmentId: s._id,
        outcome: 'Applied',
      });
      const review = await tx.c.carrier_pickup_reviews.findOne({
        orderId: o._id,
      });
      const origin = this.input.body('OrderContact', s.origin),
        destination = this.input.body('OrderContact', s.destination);
      return {
        id: s._id,
        orderId: o._id,
        version: pickup ? 2 : 1,
        state: pickup ? 'PickedUp' : 'LabelCreated',
        direction: 'Outbound',
        method: 'DirectDelivery',
        carrier: 'LatLaiSimulator',
        trackingCode: s.trackingCode,
        demoOnly: true,
        label: 'Mô phỏng đồ án',
        registeredAt: s.registeredAt.toISOString(),
        pickupDeadline: o.preparation!.pickupDeadline.toISOString(),
        packagingEvidenceIds: evidence.map((e) => e.evidenceId),
        origin: actor._id === o.sellerId ? origin : null,
        destination,
        shippingFee: s.shippingFee,
        currency: 'VND',
        feePolicy: 'SellerAdvanceBuyerReimbursement',
        pickupConfirmed: !!pickup,
        pickup: pickup
          ? {
              eventId: pickup._id,
              occurredAt: pickup.occurredAt.toISOString(),
              receivedAt: pickup.receivedAt.toISOString(),
              deliveryDeadline: pickup.deliveryDeadline!.toISOString(),
            }
          : null,
        carrierReview: review
          ? {
              id: review._id,
              openedAt: review.openedAt.toISOString(),
              reason: review.reason,
              status: 'Open',
            }
          : null,
      };
    });
  }
  emit(context: CommandContext, event: Wire['SimulatedPickupEvent']) {
    return this.ingest(context, event, this.simulator.sign(event));
  }
  deliver(context: CommandContext, event: Wire['SimulatedDeliveryEvent']) {
    const signature = this.simulator.signDelivery(event);
    this.simulator.verifyDelivery(event, signature);
    return this.orders.recordDelivery(context, event, signature);
  }
  ingest(
    context: CommandContext,
    event: Wire['SimulatedPickupEvent'],
    signature: string,
  ) {
    this.simulator.verify(event, signature);
    if (context.key !== event.eventId)
      throw new DomainError(
        422,
        'VALIDATION_ERROR',
        'Mã yêu cầu phải trùng mã sự kiện.',
      );
    const locate = async (tx: Tx) => {
      const s = await tx.c.direct_shipments.findOne({
        _id: event.shipmentId.toLowerCase(),
      });
      if (
        !s ||
        s.orderId !== event.orderId ||
        s.carrier !== event.carrier ||
        s.trackingCode !== event.trackingCode
      )
        throw notFound();
      return {
        s,
        o: (await tx.c.direct_orders.findOne({ _id: s.orderId }))!,
      };
    };
    return this.commands.runCarrier(context, event, {
      discover: async (tx) => {
        const { o } = await locate(tx);
        return [o.buyerId, o.sellerId];
      },
      authorize: async (tx, actor) => {
        requireActive(actor);
        if (!actor.roles.some((r) => r.role === 'TEST_OPERATOR'))
          throw new DomainError(
            403,
            'FORBIDDEN',
            'Cần quyền vận hành mô phỏng.',
          );
        const { o } = await locate(tx);
        if ([o.buyerId, o.sellerId].includes(actor._id))
          throw new DomainError(
            403,
            'FORBIDDEN',
            'Người vận hành phải độc lập với hai bên giao dịch.',
          );
        await this.decision(tx, context.auth);
      },
      mutate: async (tx, _actor, _before, receiptId) => {
        const { o, commitment } = await this.orders.lockForFulfillment(
          tx,
          event.orderId,
        );
        const { s } = await locate(tx);
        if (
          !o.preparation ||
          !['Preparing', 'InTransit', 'ResolutionPending'].includes(o.state) ||
          commitment.status !== 'Active'
        )
          throw invalidState();
        await this.ledger.lockOrder(tx, o.buyerId, o._id, false);
        if (
          (await this.ledger.orderFunds(tx, o._id)).held !== o.quote.buyerTotal
        )
          throw invalidState();
        const now = await this.decision(tx, context.auth),
          occurredAt = new Date(event.occurredAt);
        if (occurredAt < s.registeredAt || occurredAt > now)
          throw new DomainError(
            422,
            'VALIDATION_ERROR',
            'Thời điểm lấy hàng phải từ lúc đăng ký đến lúc tiếp nhận.',
          );
        const events = await tx.c.carrier_pickup_events
          .find({ shipmentId: s._id }, { sort: { sequence: 1 } })
          .toArray();
        if (events.length >= 128)
          throw new DomainError(
            429,
            'RATE_LIMITED',
            'Đã đạt giới hạn sự kiện của vận đơn.',
          );
        const outcome = events.length
          ? events[0].occurredAt.getTime() === occurredAt.getTime()
            ? 'Duplicate'
            : 'ReviewRequired'
          : o.state === 'Preparing' && now < o.preparation.pickupDeadline
            ? 'Applied'
            : 'ReviewRequired';
        await tx.c.carrier_pickup_events.insertOne({
          _id: event.eventId,
          orderId: o._id,
          shipmentId: s._id,
          sequence: events.length + 1,
          occurredAt,
          receivedAt: now,
          outcome,
          deliveryDeadline:
            outcome === 'Applied'
              ? new Date(occurredAt.getTime() + 240 * 3600000)
              : null,
          policyCode: 'CARRIER-PICKUP-v1',
          payloadHash: createHash('sha256')
            .update(canonicalJson(event))
            .digest('hex'),
          signature,
          receiptId,
        });
        const transition = await this.orders.recordCarrierPickup(
          tx,
          o._id,
          event.eventId,
          outcome,
          now,
        );
        return {
          entityType: 'CarrierEvent',
          entityId: event.eventId,
          shipmentId: s._id,
          orderId: o._id,
          contextId: o.context!._id,
          version: events.length + 1,
          state: 'Recorded',
          outcome,
          ...transition,
          decidedAt: now,
          event: 'CarrierPickupRecorded',
        };
      },
    });
  }
  history(auth: Actor, orderId: string): Promise<Wire['PickupEventList']> {
    return this.commands.readObligation(auth, async (tx, actor) => {
      member(actor);
      const o = await this.own(tx, orderId, actor._id);
      if (!(await tx.c.direct_shipments.findOne({ orderId: o._id })))
        throw notFound();
      const events = await tx.c.carrier_pickup_events
        .find({ orderId: o._id }, { sort: { sequence: 1 }, limit: 128 })
        .toArray();
      return {
        items: events.map((e) => ({
          id: e._id,
          sequence: e.sequence,
          occurredAt: e.occurredAt.toISOString(),
          receivedAt: e.receivedAt.toISOString(),
          outcome: e.outcome,
        })),
      };
    });
  }
}
