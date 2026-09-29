import { Injectable } from '@nestjs/common';
import type { Document } from 'mongodb';
import { MongoService } from '../../database/mongo/mongo.service.js';
import type { Tx } from '../../database/mongo/transaction.js';
import { DomainError } from '../commands/domain-error.js';
import { OrdersService } from './orders.service.js';
import { OrderClock } from './order-clock.js';

// Carrier pickups whose delivery deadline passed without a delivery review.
const deliveryCandidates = (now: Date): Document[] => [
  { $match: { outcome: 'Applied', deliveryDeadline: { $lte: now } } },
  {
    $lookup: {
      from: 'direct_orders',
      localField: 'orderId',
      foreignField: '_id',
      as: 'o',
    },
  },
  { $match: { 'o.state': { $in: ['InTransit', 'ResolutionPending'] } } },
  {
    $lookup: {
      from: 'order_delivery_reviews',
      localField: 'orderId',
      foreignField: 'orderId',
      as: 'r',
    },
  },
  { $match: { r: { $size: 0 } } },
];
// Preparing orders whose pickup deadline passed.
const pickupCandidates = (now: Date): Document[] => [
  { $match: { pickupDeadline: { $lte: now } } },
  {
    $lookup: {
      from: 'direct_orders',
      localField: '_id',
      foreignField: '_id',
      as: 'o',
    },
  },
  { $match: { 'o.state': 'Preparing' } },
];

@Injectable()
export class OrderExpiryWorker {
  constructor(
    private readonly mongo: MongoService,
    private readonly orders: OrdersService,
    private readonly clock: OrderClock,
  ) {}
  // Candidate discovery is a read in its own snapshot and takes no locks; each
  // command then locks users before the Order and decides with $$NOW.
  private scan<T>(fn: (tx: Tx, now: Date) => Promise<T>) {
    return this.mongo.tx(async (tx) => fn(tx, await this.clock.now(tx)));
  }
  async tick() {
    const candidates = await this.scan((tx, now) =>
      tx.c.direct_orders
        .find(
          { state: 'AwaitingPayment', paymentDeadline: { $lte: now } },
          { sort: { paymentDeadline: 1, _id: 1 }, limit: 100 },
        )
        .toArray(),
    );
    let processed = 0,
      skipped = 0,
      failed = 0;
    const attempt = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        processed++;
      } catch (e) {
        if (e instanceof DomainError && e.getStatus() === 409) skipped++;
        else failed++;
      }
    };
    for (const o of candidates) await attempt(() => this.orders.expire(o._id));
    // Separate bounded scans prevent a broken refund starving deadline decisions.
    // Neither scan holds an Order lock while waiting for participant locks.
    for (const phase of ['confirmation', 'refund', 'pickup'] as const) {
      const ids = await this.scan(async (tx, now) => {
        if (phase === 'pickup')
          return (
            await tx.c.order_preparations
              .aggregate<{ _id: string }>([
                ...pickupCandidates(now),
                { $sort: { pickupDeadline: 1, _id: 1 } },
                { $limit: 100 },
                { $project: { _id: 1 } },
              ])
              .toArray()
          ).map((row) => row._id);
        const rows = await tx.c.direct_orders
          .find(
            phase === 'confirmation'
              ? {
                  state: 'PendingSellerConfirmation',
                  sellerConfirmationDeadline: { $lte: now },
                }
              : { state: 'SettlementPending' },
            {
              sort:
                phase === 'confirmation'
                  ? { sellerConfirmationDeadline: 1, _id: 1 }
                  : { cancellationRequestedAt: 1, _id: 1 },
              limit: 100,
            },
          )
          .toArray();
        return rows.map((row) => row._id);
      });
      for (const id of ids)
        await attempt(() =>
          phase === 'confirmation'
            ? this.orders.expireConfirmation(id)
            : phase === 'refund'
              ? this.orders.refund(id)
              : this.orders.expirePickup(id),
        );
    }
    const deliveries = await this.scan((tx, now) =>
      tx.c.carrier_pickup_events
        .aggregate<{ orderId: string }>([
          ...deliveryCandidates(now),
          { $sort: { deliveryDeadline: 1, _id: 1 } },
          { $limit: 100 },
          { $project: { _id: 0, orderId: 1 } },
        ])
        .toArray(),
    );
    for (const row of deliveries)
      await attempt(() => this.orders.expireDelivery(row.orderId));
    const backlog = await this.scan(async (tx, now) => {
      const unpaid = {
        state: 'AwaitingPayment',
        paymentDeadline: { $lte: now },
      };
      const confirmationWhere = {
        state: 'PendingSellerConfirmation',
        sellerConfirmationDeadline: { $lte: now },
      };
      const remaining = await tx.c.direct_orders.countDocuments(unpaid);
      const oldest = await tx.c.direct_orders.findOne(unpaid, {
        sort: { paymentDeadline: 1 },
      });
      const confirmation = await tx.c.direct_orders.findOne(confirmationWhere, {
        sort: { sellerConfirmationDeadline: 1 },
      });
      const refund = await tx.c.direct_orders.findOne(
        { state: 'SettlementPending' },
        { sort: { cancellationRequestedAt: 1 } },
      );
      const confirmationRemaining =
        await tx.c.direct_orders.countDocuments(confirmationWhere);
      const refundRemaining = await tx.c.direct_orders.countDocuments({
        state: 'SettlementPending',
      });
      const deadlines = [
        oldest?.paymentDeadline,
        confirmation?.sellerConfirmationDeadline,
        refund?.cancellationRequestedAt,
      ].filter((d): d is Date => !!d);
      const [deliveryBacklog] = await tx.c.carrier_pickup_events
        .aggregate<{ count: number; oldest: Date | null }>([
          ...deliveryCandidates(now),
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              oldest: { $min: '$deliveryDeadline' },
            },
          },
        ])
        .toArray();
      if (deliveryBacklog?.oldest) deadlines.push(deliveryBacklog.oldest);
      const openDeliveryReviews =
        await tx.c.order_delivery_reviews.countDocuments();
      const oldestDeliveryReview = await tx.c.order_delivery_reviews.findOne(
        {},
        { sort: { openedAt: 1, _id: 1 } },
      );
      const pickups = await tx.c.order_preparations
        .aggregate<{ pickupDeadline: Date }>([
          ...pickupCandidates(now),
          { $sort: { pickupDeadline: 1 } },
        ])
        .toArray();
      if (pickups[0]) deadlines.push(pickups[0].pickupDeadline);
      const openPickupReviews = await tx.c.pickup_reviews.countDocuments();
      const openCarrierReviews =
        await tx.c.carrier_pickup_reviews.countDocuments();
      const oldestReview = await tx.c.pickup_reviews.findOne(
        {},
        { sort: { openedAt: 1 } },
      );
      const deliveryRemaining = deliveryBacklog?.count ?? 0;
      return {
        remaining:
          remaining +
          confirmationRemaining +
          refundRemaining +
          pickups.length +
          deliveryRemaining,
        deliveryRemaining,
        openDeliveryReviews,
        oldestDeliveryReviewAgeSeconds: oldestDeliveryReview
          ? Math.max(
              0,
              Math.floor(
                (now.getTime() - oldestDeliveryReview.openedAt.getTime()) /
                  1000,
              ),
            )
          : 0,
        pickupRemaining: pickups.length,
        openPickupReviews,
        openCarrierReviews,
        oldestPickupReviewAgeSeconds: oldestReview
          ? Math.floor((now.getTime() - oldestReview.openedAt.getTime()) / 1000)
          : 0,
        unpaidRemaining: remaining,
        confirmationRemaining,
        refundRemaining,
        oldestLagSeconds: deadlines.length
          ? Math.floor(
              (now.getTime() - Math.min(...deadlines.map((d) => d.getTime()))) /
                1000,
            )
          : 0,
      };
    });
    return { processed, skipped, failed, ...backlog };
  }
}
