import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import type {
  CollectionAttemptDoc,
  PointOrderDoc,
} from '../../database/mongo/documents.js';
import {
  COLLECTION_ATTEMPT_WINDOW_MS,
  COLLECTION_CODE_TTL_MS,
  COLLECTION_MAX_WRONG_ATTEMPTS,
  COLLECTION_WINDOW_MS,
  INSPECTION_WINDOW_MS,
  POINT_DELIVERY_MS,
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
  canonicalJson,
  member,
  requireActive,
  type Actor,
  type CommandContext,
  type CurrentActor,
} from '../commands/mongo-command.service.js';
import { AuctionClock } from './auction-clock.js';
import { HandoverPointsService } from './handover-points.service.js';
import {
  deliveryView,
  signPointDelivery,
  verifyPointDelivery,
} from './point-delivery.js';
import { isPointOpen, pointDeadline } from './point-hours.js';
import { checkPointOrder } from './point-order-invariants.js';
import { PointOrdersService } from './point-orders.service.js';
import { stepKey } from './system-key.js';

const hashCode = (salt: string, orderId: string, code: string) =>
  createHash('sha256').update(`${salt}:${orderId}:${code}`).digest('hex');
const sameHash = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
const closedPoint = () =>
  new DomainError(
    409,
    'InvalidState',
    'Điểm giao nhận đang đóng cửa (09:00–18:00). Hãy bàn giao trong giờ mở cửa.',
  );
const late = (message: string) => new DomainError(409, 'InvalidState', message);
const delivered = () =>
  new DomainError(
    409,
    'InvalidState',
    'Đơn này giao tận nơi: điểm giao sách cho hãng vận chuyển, không dùng mã nhận.',
  );

// Recipient decision, collection code and Staff handover for a paid ViaPoint
// Order (FR-H09, FR-H11, FR-T03; POL-32/33/37). Lock order: users -> session
// -> Order -> codes. A refused code is committed as an attempt (rate limit)
// and reported in the receipt; nothing here accepts, refunds or releases.
@Injectable()
export class PointCollectionService {
  constructor(
    private readonly commands: MongoCommandService,
    private readonly points: HandoverPointsService,
    private readonly clock: AuctionClock,
    private readonly config: ConfigService,
  ) {}

  private async order(tx: Tx, id: string) {
    const o = await tx.c.point_orders.findOne({ _id: id });
    if (!o) throw notFound();
    return o;
  }
  private async buyerOrder(tx: Tx, id: string, actor: CurrentActor) {
    member(actor);
    const o = await this.order(tx, id);
    if (o.buyerId !== actor._id) throw notFound();
    return o;
  }
  private async locked(tx: Tx, id: string, expectedVersion: number) {
    await tx.lock('point_orders', [id]);
    const o = await this.order(tx, id);
    if (o.version !== expectedVersion) throw conflict();
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
  private revokeLiveCodes(tx: Tx, orderId: string, now: Date) {
    return tx.c.collection_codes.updateMany(
      { orderId, live: true },
      { $set: { live: false, revokedAt: now }, $inc: { lockSeq: 1 } },
    );
  }

  // ---------------------------------------------------- recipient decision
  accept(
    context: CommandContext,
    id: string,
    body: Wire['AcceptPointOrderReport'],
  ) {
    return this.commands.runAuction(
      context,
      'acceptPointOrderReport',
      id,
      body,
      {
        authorize: (tx, actor) => this.buyerOrder(tx, id, actor),
        mutate: async (tx) => {
          const o = await this.locked(tx, id, body.expectedVersion);
          if (o.state !== 'Fulfilling') throw invalidState();
          const now = await this.clock.decision(tx, context.auth);
          if (now >= o.acceptanceDeadline!)
            throw late(
              'Đã quá hạn phản hồi biên bản; yêu cầu đang được chuyển xử lý.',
            );
          const next = await this.transition(
            tx,
            o,
            {
              state: 'ReadyForCollection',
              acceptedAt: now,
              collectionOpenedAt: now,
              collectionDeadline: pointDeadline(now, COLLECTION_WINDOW_MS),
            },
            now,
          );
          return PointOrdersService.change(
            next,
            now,
            'PointOrderReportAccepted',
          );
        },
      },
    );
  }

  // Rejection opens a resolution task; it never refunds or releases here.
  reject(
    context: CommandContext,
    id: string,
    body: Wire['RejectPointOrderReport'],
  ) {
    return this.commands.runAuction(
      context,
      'rejectPointOrderReport',
      id,
      body,
      {
        authorize: (tx, actor) => this.buyerOrder(tx, id, actor),
        mutate: async (tx) => {
          const reason = body.reason.trim();
          if (reason.length < 10)
            invalidField('reason', 'Hãy mô tả lý do ít nhất 10 ký tự.');
          const o = await this.locked(tx, id, body.expectedVersion);
          if (o.state !== 'Fulfilling') throw invalidState();
          const now = await this.clock.decision(tx, context.auth);
          if (now >= o.acceptanceDeadline!)
            throw late(
              'Đã quá hạn phản hồi biên bản; yêu cầu đang được chuyển xử lý.',
            );
          const next = await this.transition(
            tx,
            o,
            {
              state: 'ResolutionPending',
              resolutionReason: 'ReportRejected',
              resolutionNote: reason,
              resolutionOpenedAt: now,
            },
            now,
          );
          return {
            ...PointOrdersService.change(next, now, 'PointOrderReportRejected'),
            reason,
          };
        },
      },
    );
  }

  // ------------------------------------------------------ collection code
  // The raw code exists only in this response: the stored receipt carries
  // the expiry, so a replay returns code null and the buyer asks again.
  async requestCode(
    context: CommandContext,
    id: string,
    body: Wire['RequestCollectionCode'],
  ): Promise<{ receipt: Wire['CollectionCodeIssued']; replayed: boolean }> {
    let code: string | null = null;
    const result = await this.commands.runAuction(
      context,
      'requestCollectionCode',
      id,
      body,
      {
        authorize: (tx, actor) => this.buyerOrder(tx, id, actor),
        mutate: async (tx, _actor, _before, receiptId) => {
          const o = await this.locked(tx, id, body.expectedVersion);
          if (o.state !== 'ReadyForCollection') throw invalidState();
          if (o.fulfillmentMethod === 'CarrierOutbound') throw delivered();
          const now = await this.clock.decision(tx, context.auth);
          if (now >= o.collectionDeadline!)
            throw late('Đã quá hạn nhận sách; yêu cầu đang được chuyển xử lý.');
          await this.revokeLiveCodes(tx, o._id, now);
          const issued = String(randomInt(0, 1_000_000)).padStart(6, '0');
          const salt = randomBytes(16).toString('hex');
          const expiresAt = new Date(now.getTime() + COLLECTION_CODE_TTL_MS);
          await tx.c.collection_codes.insertOne({
            _id: randomUUID(),
            orderId: o._id,
            recipientId: o.buyerId,
            listingId: o.listingId,
            pointId: o.pointId,
            salt,
            codeHash: hashCode(salt, o._id, issued),
            issuedAt: now,
            expiresAt,
            live: true,
            usedAt: null,
            revokedAt: null,
            receiptId,
            lockSeq: 0,
          });
          tx.check(`point-order:${o._id}`, () => checkPointOrder(tx, o._id));
          code = issued;
          return {
            ...PointOrdersService.change(o, now, 'CollectionCodeIssued'),
            codeExpiresAt: expiresAt,
          };
        },
      },
    );
    // A transaction retry may run mutate again; only the committed run's code
    // survives in `code`, and a replay never reaches mutate.
    return {
      receipt: { receipt: result.receipt, code: result.replayed ? null : code },
      replayed: result.replayed,
    };
  }

  // ----------------------------------------------------- Staff handover
  // STAFF with a current assignment at the Order's point, independent of
  // buyer and seller; checked before any receipt replay.
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
        'Chỉ nhân viên điểm được bàn giao sách.',
      );
    if (actor._id === o.buyerId || actor._id === o.sellerId)
      throw new DomainError(
        403,
        'SelfReviewForbidden',
        'Nhân viên không được bàn giao giao dịch của chính mình.',
      );
    await this.points.requireAssigned(tx, actor._id, o.pointId, now);
  }

  handover(
    context: CommandContext,
    id: string,
    body: Wire['HandOverPointOrder'],
  ) {
    return this.commands.runAuction(context, 'handOverPointOrder', id, body, {
      discover: async (tx) => [(await this.order(tx, id)).buyerId],
      authorize: async (tx, actor) => {
        const o = await this.order(tx, id);
        await this.staffFor(tx, actor, o, await this.clock.now(tx));
        return o;
      },
      mutate: async (tx, actor, _before, receiptId) => {
        const o = await this.locked(tx, id, body.expectedVersion);
        const now = await this.clock.decision(tx, context.auth);
        await this.points.requireAssigned(tx, actor._id, o.pointId, now);
        if (o.state !== 'ReadyForCollection') throw invalidState();
        if (o.fulfillmentMethod === 'CarrierOutbound') throw delivered();
        if (now >= o.collectionDeadline!)
          throw late('Đã quá hạn nhận sách; yêu cầu đang được chuyển xử lý.');
        if (!isPointOpen(now)) throw closedPoint();
        const recipient = await tx.c.users.findOne({ _id: o.buyerId });
        if (
          !recipient?.emailVerifiedAt ||
          !['ACTIVE', 'RESTRICTED', 'LOCKED'].includes(recipient.status)
        )
          throw new DomainError(
            409,
            'InvalidState',
            'Tài khoản người nhận hiện không thể nhận sách.',
          );
        await tx.lock(
          'collection_codes',
          (
            await tx.c.collection_codes
              .find({ orderId: o._id, live: true })
              .toArray()
          ).map((c) => c._id),
        );
        const wrong = await tx.c.collection_attempts.countDocuments({
          orderId: o._id,
          outcome: 'WrongCode',
          at: { $gt: new Date(now.getTime() - COLLECTION_ATTEMPT_WINDOW_MS) },
        });
        const live = await tx.c.collection_codes.findOne({
          orderId: o._id,
          live: true,
        });
        const record = (
          outcome: CollectionAttemptDoc['outcome'],
          codeId: string | null,
        ) =>
          tx.c.collection_attempts.insertOne({
            _id: randomUUID(),
            orderId: o._id,
            staffId: actor._id,
            codeId,
            outcome,
            receiptId,
            at: now,
          });
        const refused = async (
          outcome: 'WrongCode' | 'Expired' | 'RateLimited',
          used: number,
        ) => {
          await record(outcome, live?._id ?? null);
          tx.check(`point-order:${o._id}`, () => checkPointOrder(tx, o._id));
          return {
            ...PointOrdersService.change(o, now, 'CollectionCodeRefused'),
            collectionOutcome: outcome,
            attemptsRemaining: Math.max(
              0,
              COLLECTION_MAX_WRONG_ATTEMPTS - used,
            ),
          };
        };
        if (wrong >= COLLECTION_MAX_WRONG_ATTEMPTS)
          return refused('RateLimited', wrong);
        if (!live || now >= live.expiresAt) return refused('Expired', wrong);
        if (!sameHash(hashCode(live.salt, o._id, body.code), live.codeHash))
          return refused('WrongCode', wrong + 1);
        const used = await tx.c.collection_codes.updateOne(
          { _id: live._id, live: true },
          { $set: { live: false, usedAt: now } },
        );
        if (used.modifiedCount !== 1) throw conflict();
        await record('Accepted', live._id);
        await tx.c.point_handovers.insertOne({
          _id: randomUUID(),
          orderId: o._id,
          listingId: o.listingId,
          pointId: o.pointId,
          recipientId: o.buyerId,
          staffId: actor._id,
          codeId: live._id,
          method: 'SelfCollect',
          handedOverAt: now,
          receiptId,
        });
        // Receipt at the counter opens the buyer inspection window (FR-T03).
        const next = await this.transition(
          tx,
          o,
          {
            state: 'Inspection',
            collectedAt: now,
            inspectionDeadline: new Date(now.getTime() + INSPECTION_WINDOW_MS),
          },
          now,
        );
        return {
          ...PointOrdersService.change(next, now, 'PointOrderHandedOver'),
          collectionOutcome: 'HandedOver' as const,
          attemptsRemaining: COLLECTION_MAX_WRONG_ATTEMPTS - wrong,
        };
      },
    });
  }

  // ------------------------------------------------- delivery (ADR 0044)
  // The assigned Staff hand the book to the simulated carrier within the
  // window the report acceptance opened. Custody leaves the point once: this
  // handover has no code, and the counter handover refuses delivery Orders.
  dispatch(
    context: CommandContext,
    id: string,
    body: Wire['DispatchPointOrder'],
  ) {
    return this.commands.runAuction(context, 'dispatchPointOrder', id, body, {
      discover: async (tx) => [(await this.order(tx, id)).buyerId],
      authorize: async (tx, actor) => {
        const o = await this.order(tx, id);
        await this.staffFor(tx, actor, o, await this.clock.now(tx));
        return o;
      },
      mutate: async (tx, actor, _before, receiptId) => {
        const o = await this.locked(tx, id, body.expectedVersion);
        const now = await this.clock.decision(tx, context.auth);
        await this.points.requireAssigned(tx, actor._id, o.pointId, now);
        if (
          o.state !== 'ReadyForCollection' ||
          o.fulfillmentMethod !== 'CarrierOutbound'
        )
          throw invalidState();
        if (now >= o.collectionDeadline!)
          throw late(
            'Đã quá hạn giao sách cho hãng; yêu cầu đang được chuyển xử lý.',
          );
        if (!isPointOpen(now)) throw closedPoint();
        await tx.c.point_handovers.insertOne({
          _id: randomUUID(),
          orderId: o._id,
          listingId: o.listingId,
          pointId: o.pointId,
          recipientId: o.buyerId,
          staffId: actor._id,
          codeId: null,
          method: 'CarrierOutbound',
          handedOverAt: now,
          receiptId,
        });
        const next = await this.transition(
          tx,
          o,
          {
            state: 'InTransit',
            dispatchedAt: now,
            deliveryDeadline: new Date(now.getTime() + POINT_DELIVERY_MS),
            trackingCode: `LL-${randomBytes(6).toString('hex').toUpperCase()}`,
          },
          now,
        );
        return PointOrdersService.change(next, now, 'PointOrderDispatched');
      },
    });
  }

  // An independent TEST_OPERATOR reports the simulated carrier outcome once.
  // Delivered starts the inspection window from the delivery time (FR-T03)
  // and never settles; Failed opens DeliveryFailed for an independent Admin.
  recordDelivery(
    context: CommandContext,
    event: Wire['SimulatedPointDeliveryEvent'],
  ) {
    const signature = signPointDelivery(this.config, event);
    verifyPointDelivery(this.config, event, signature);
    if (context.key !== event.eventId)
      throw new DomainError(
        422,
        'VALIDATION_ERROR',
        'Mã yêu cầu phải trùng mã sự kiện.',
      );
    const id = event.orderId.toLowerCase();
    return this.commands.runAuction(context, 'recordPointDelivery', id, event, {
      discover: async (tx) => {
        const o = await this.order(tx, id);
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
        const o = await this.order(tx, id);
        if ([o.buyerId, o.sellerId].includes(actor._id))
          throw new DomainError(
            403,
            'FORBIDDEN',
            'Người vận hành phải độc lập với hai bên giao dịch.',
          );
        return o;
      },
      mutate: async (tx, _actor, before, receiptId) => {
        const o = await this.locked(tx, id, before.version);
        if (o.state !== 'InTransit') throw invalidState();
        if (o.trackingCode !== event.trackingCode) throw notFound();
        const now = await this.clock.decision(tx, context.auth);
        const occurredAt = new Date(event.occurredAt);
        if (
          occurredAt < o.dispatchedAt! ||
          occurredAt > now ||
          occurredAt >= o.deliveryDeadline!
        )
          throw new DomainError(
            422,
            'VALIDATION_ERROR',
            'Thời điểm giao phải từ lúc điểm giao cho hãng đến trước hạn giao.',
          );
        await tx.c.point_carrier_events.insertOne({
          _id: event.eventId,
          orderId: o._id,
          trackingCode: event.trackingCode,
          outcome: event.outcome,
          occurredAt,
          receivedAt: now,
          payloadHash: createHash('sha256')
            .update(canonicalJson(event))
            .digest('hex'),
          signature,
          receiptId,
        });
        if (event.outcome === 'Delivered') {
          const next = await this.transition(
            tx,
            o,
            {
              state: 'Inspection',
              collectedAt: occurredAt,
              inspectionDeadline: new Date(
                occurredAt.getTime() + INSPECTION_WINDOW_MS,
              ),
            },
            now,
          );
          return PointOrdersService.change(next, now, 'PointOrderDelivered');
        }
        const next = await this.transition(
          tx,
          o,
          {
            state: 'ResolutionPending',
            resolutionReason: 'DeliveryFailed',
            resolutionNote: 'Hãng vận chuyển báo giao không thành công.',
            resolutionOpenedAt: now,
          },
          now,
        );
        return PointOrdersService.change(next, now, 'PointOrderDeliveryFailed');
      },
    });
  }

  // The operator's list of deliveries awaiting a carrier outcome. Orders the
  // operator buys or sells are left out (the event command refuses them);
  // no recipient address or contact leaves the server here.
  simulatedDeliveries(
    auth: Actor,
  ): Promise<Wire['SimulatedPointDeliveryQueue']> {
    return this.commands.read(auth, async (tx, actor) => {
      requireActive(actor);
      if (!actor.roles.some((r) => r.role === 'TEST_OPERATOR'))
        throw new DomainError(403, 'FORBIDDEN', 'Cần quyền vận hành mô phỏng.');
      const now = await tx.now();
      const orders = await tx.c.point_orders
        .find(
          {
            state: 'InTransit',
            buyerId: { $ne: actor._id },
            sellerId: { $ne: actor._id },
          },
          { sort: { deliveryDeadline: 1, _id: 1 }, limit: 50 },
        )
        .toArray();
      const items: Wire['SimulatedPointDeliveryItem'][] = [];
      for (const o of orders) {
        const item = await tx.c.workflow_items.findOne({
          _id: `${o.contextId}:${o.listingId}`,
        });
        const point = await tx.c.handover_points.findOne({ _id: o.pointId });
        items.push({
          orderId: o._id,
          title: String((item?.snapshot as { title?: string })?.title ?? ''),
          pointName: point?.name ?? '',
          carrier: 'LatLaiSimulator',
          trackingCode: o.trackingCode!,
          dispatchedAt: o.dispatchedAt!.toISOString(),
          deliveryDeadline: o.deliveryDeadline!.toISOString(),
        });
      }
      return { items, serverTime: now.toISOString() };
    });
  }

  queue(auth: Actor): Promise<Wire['PointCollectionQueue']> {
    return this.commands.read(auth, async (tx, actor) => {
      requireActive(actor);
      if (!actor.roles.some((r) => r.role === 'STAFF'))
        throw new DomainError(
          403,
          'FORBIDDEN',
          'Chỉ nhân viên điểm được xem danh sách này.',
        );
      const now = await tx.now();
      const pointIds = await this.points.assignedPointIds(tx, actor._id, now);
      const orders = await tx.c.point_orders
        .find(
          {
            pointId: { $in: pointIds },
            state: {
              $in: ['Fulfilling', 'ReadyForCollection', 'ReturnPending'],
            },
            buyerId: { $ne: actor._id },
            sellerId: { $ne: actor._id },
          },
          { sort: { collectionDeadline: 1, paidAt: 1 }, limit: 50 },
        )
        .toArray();
      const items: Wire['PointCollectionItem'][] = [];
      for (const o of orders) {
        const buyer = await tx.c.users.findOne({ _id: o.buyerId });
        const intake = await tx.c.auction_intakes.findOne({ _id: o.intakeId });
        const item = await tx.c.workflow_items.findOne({
          _id: `${o.contextId}:${o.listingId}`,
        });
        items.push({
          id: o._id,
          version: o.version,
          title: String((item?.snapshot as { title?: string })?.title ?? ''),
          state: o.state,
          recipientName: buyer?.displayName ?? '',
          fulfillmentMethod: o.fulfillmentMethod,
          // The label for the carrier; only for delivery Orders.
          delivery:
            o.fulfillmentMethod === 'CarrierOutbound'
              ? deliveryView(
                  o,
                  (await tx.c.point_order_deliveries.findOne({ _id: o._id }))!,
                )
              : null,
          shelfCode: intake?.shelfCode ?? null,
          collectionDeadline: o.collectionDeadline?.toISOString() ?? null,
          returnDeadline:
            o.state === 'ReturnPending'
              ? o.returnDeadline!.toISOString()
              : null,
        });
      }
      return { items, serverTime: now.toISOString() };
    });
  }

  // ----------------------------------------------------------- worker
  // POL-32/33: no response, no collection or no required return by the
  // deadline opens a resolution task. No auto-accept, refund or forfeiture.
  openResolution(id: string, version: number) {
    return this.commands.systemAuction(
      'PointOrderDeadline',
      stepKey(id, version),
      {
        discover: async () => [],
        authorize: (tx) => this.order(tx, id),
        mutate: async (tx, before) => {
          if (before.version !== version) throw invalidState();
          const o = await this.locked(tx, id, version);
          const now = await this.clock.now(tx);
          if (o.state === 'Fulfilling' && now >= o.acceptanceDeadline!) {
            const next = await this.transition(
              tx,
              o,
              {
                state: 'ResolutionPending',
                resolutionReason: 'RecipientDecisionOverdue',
                resolutionOpenedAt: now,
              },
              now,
            );
            return PointOrdersService.change(
              next,
              now,
              'PointOrderDecisionOverdue',
            );
          }
          if (
            o.state === 'ReadyForCollection' &&
            now >= o.collectionDeadline!
          ) {
            await this.revokeLiveCodes(tx, o._id, now);
            const next = await this.transition(
              tx,
              o,
              {
                state: 'ResolutionPending',
                resolutionReason: 'CollectionOverdue',
                resolutionOpenedAt: now,
              },
              now,
            );
            return PointOrdersService.change(
              next,
              now,
              'PointOrderCollectionOverdue',
            );
          }
          // ADR 0044: no carrier outcome by the delivery deadline.
          if (o.state === 'InTransit' && now >= o.deliveryDeadline!) {
            const next = await this.transition(
              tx,
              o,
              {
                state: 'ResolutionPending',
                resolutionReason: 'DeliveryFailed',
                resolutionNote: 'Quá hạn giao hàng mà hãng chưa báo kết quả.',
                resolutionOpenedAt: now,
              },
              now,
            );
            return PointOrdersService.change(
              next,
              now,
              'PointOrderDeliveryOverdue',
            );
          }
          if (o.state === 'ReturnPending' && now >= o.returnDeadline!) {
            // An undelivered book the carrier has not brought back reopens
            // the delivery failure; a delivered one is a missed return.
            const next = await this.transition(
              tx,
              o,
              {
                state: 'ResolutionPending',
                resolutionReason: o.collectedAt
                  ? 'ReturnOverdue'
                  : 'DeliveryFailed',
                resolutionOpenedAt: now,
              },
              now,
            );
            return PointOrdersService.change(
              next,
              now,
              'PointOrderReturnOverdue',
            );
          }
          throw invalidState();
        },
      },
    );
  }
}
