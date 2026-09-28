import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import {
  CommandService,
  member,
  requireActive,
  canonicalJson,
  type Actor,
  type CommandContext,
  type Tx,
} from '../commands/command.service.js';
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
import { LedgerService } from '../wallet/ledger.service.js';
import { CarrierSimulator } from './carrier-simulator.js';

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly commands: CommandService,
    private readonly orders: OrdersService,
    private readonly clock: OrderClock,
    private readonly ledger: LedgerService,
    private readonly input: ContractInput,
    private readonly simulator: CarrierSimulator,
  ) {}
  private async own(tx: Tx, id: string, actorId: string, sellerOnly = false) {
    const o = await tx.directOrder.findUnique({
      where: { id },
      include: { context: true, preparation: true },
    });
    if (!o || (o.sellerId !== actorId && (sellerOnly || o.buyerId !== actorId)))
      throw notFound();
    return o;
  }
  private async decision(tx: Tx, auth: Actor) {
    const now = await this.clock.now(tx);
    const s = await tx.authSession.findUnique({
      where: { id: auth.sessionId },
    });
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
        const o = await this.own(tx, orderId, actor.id, true);
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
        if (await tx.directShipment.findUnique({ where: { orderId } }))
          throw conflict();
        const ids = [...body.packagingEvidenceIds].sort();
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM order_packaging_evidence WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR SHARE`,
        );
        const images = await tx.orderPackagingEvidence.findMany({
          where: { id: { in: ids }, orderId, status: 'Ready' },
        });
        if (images.length !== ids.length)
          throw new DomainError(
            422,
            'MediaNotReady',
            'Chọn ảnh đóng gói đã tải xong thuộc đơn này.',
          );
        // Serialize identical tracking across independent Orders before querying the unique key.
        const trackingLock = `${body.carrier}/${body.trackingCode}`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${trackingLock},78301))::text`;
        if (
          await tx.directShipment.findUnique({
            where: {
              carrier_trackingCode: {
                carrier: body.carrier,
                trackingCode: body.trackingCode,
              },
            },
          })
        )
          throw conflict();
        await this.ledger.lockOrder(tx, o.buyerId, orderId, false);
        if (
          (await this.ledger.orderFunds(tx, orderId)).held !==
          o.quote.buyerTotal
        )
          throw invalidState();
        const now = await this.decision(tx, context.auth);
        if (now >= o.preparation.pickupDeadline) throw conflict();
        const agreement = this.input.body(
          'DirectOrderAgreement',
          o.context!.agreement!.snapshot,
        );
        const shipment = await tx.directShipment.create({
          data: {
            orderId,
            carrier: body.carrier,
            trackingCode: body.trackingCode,
            origin: agreement.origin,
            destination: agreement.destination,
            shippingFee: agreement.amounts.shippingFee,
            registeredAt: now,
            receiptId,
          },
        });
        await tx.shipmentPackagingEvidence.createMany({
          data: body.packagingEvidenceIds.map((evidenceId, position) => ({
            shipmentId: shipment.id,
            orderId,
            evidenceId,
            position,
          })),
        });
        return {
          entityType: 'Shipment',
          entityId: shipment.id,
          orderId,
          contextId: o.context!.id,
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
      const o = await this.own(tx, orderId, actor.id);
      const s = await tx.directShipment.findUnique({
        where: { orderId },
        include: { evidence: { orderBy: { position: 'asc' } } },
      });
      if (!s) throw notFound();
      const pickup = await tx.carrierPickupEvent.findFirst({
        where: { shipmentId: s.id, outcome: 'Applied' },
      });
      const review = await tx.carrierPickupReview.findUnique({
        where: { orderId },
      });
      const origin = this.input.body('OrderContact', s.origin),
        destination = this.input.body('OrderContact', s.destination);
      return {
        id: s.id,
        orderId,
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
        packagingEvidenceIds: s.evidence.map((e) => e.evidenceId),
        origin: actor.id === o.sellerId ? origin : null,
        destination,
        shippingFee: s.shippingFee,
        currency: 'VND',
        feePolicy: 'SellerAdvanceBuyerReimbursement',
        pickupConfirmed: !!pickup,
        pickup: pickup
          ? {
              eventId: pickup.id,
              occurredAt: pickup.occurredAt.toISOString(),
              receivedAt: pickup.receivedAt.toISOString(),
              deliveryDeadline: pickup.deliveryDeadline!.toISOString(),
            }
          : null,
        carrierReview: review
          ? {
              id: review.id,
              openedAt: review.openedAt.toISOString(),
              reason: review.reason as 'LatePickup' | 'ConflictingPickup',
              status: 'Open',
            }
          : null,
      };
    });
  }
  emit(context: CommandContext, event: Wire['SimulatedPickupEvent']) {
    return this.ingest(context, event, this.simulator.sign(event));
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
      const s = await tx.directShipment.findUnique({
        where: { id: event.shipmentId },
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
        o: await tx.directOrder.findUniqueOrThrow({ where: { id: s.orderId } }),
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
        if ([o.buyerId, o.sellerId].includes(actor.id))
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
        await tx.$queryRaw`SELECT id FROM direct_shipments WHERE id=${event.shipmentId}::uuid FOR UPDATE`;
        const { s } = await locate(tx);
        if (
          !o.preparation ||
          !['Preparing', 'InTransit', 'ResolutionPending'].includes(o.state) ||
          commitment.status !== 'Active'
        )
          throw invalidState();
        await this.ledger.lockOrder(tx, o.buyerId, o.id, false);
        if (
          (await this.ledger.orderFunds(tx, o.id)).held !== o.quote.buyerTotal
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
        const events = await tx.carrierPickupEvent.findMany({
          where: { shipmentId: s.id },
          orderBy: { sequence: 'asc' },
        });
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
        await tx.carrierPickupEvent.create({
          data: {
            id: event.eventId,
            orderId: o.id,
            shipmentId: s.id,
            sequence: events.length + 1,
            occurredAt,
            receivedAt: now,
            outcome,
            deliveryDeadline:
              outcome === 'Applied'
                ? new Date(occurredAt.getTime() + 240 * 3600000)
                : null,
            payloadHash: createHash('sha256')
              .update(canonicalJson(event))
              .digest('hex'),
            signature,
            receiptId,
          },
        });
        const transition = await this.orders.recordCarrierPickup(
          tx,
          o.id,
          event.eventId,
          outcome,
          now,
        );
        return {
          entityType: 'CarrierEvent',
          entityId: event.eventId,
          shipmentId: s.id,
          orderId: o.id,
          contextId: o.context!.id,
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
      await this.own(tx, orderId, actor.id);
      if (!(await tx.directShipment.findUnique({ where: { orderId } })))
        throw notFound();
      const events = await tx.carrierPickupEvent.findMany({
        where: { orderId },
        orderBy: { sequence: 'asc' },
        take: 128,
      });
      return {
        items: events.map((e) => ({
          id: e.id,
          sequence: e.sequence,
          occurredAt: e.occurredAt.toISOString(),
          receivedAt: e.receivedAt.toISOString(),
          outcome: e.outcome as Wire['PickupEvent']['outcome'],
        })),
      };
    });
  }
}
