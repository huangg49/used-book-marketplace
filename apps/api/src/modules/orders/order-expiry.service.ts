import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { DomainError } from '../commands/domain-error.js';
import { OrdersService } from './orders.service.js';
import { OrderClock } from './order-clock.js';
import { Prisma } from '../../generated/prisma/client.js';

const deliveryCandidates = (now: Date) => Prisma.sql`
  FROM carrier_pickup_events e JOIN direct_orders o ON o.id=e.order_id
  WHERE e.outcome='Applied' AND e.delivery_deadline<=${now}
    AND o.state IN ('InTransit','ResolutionPending')
    AND NOT EXISTS(SELECT 1 FROM order_delivery_reviews r WHERE r.order_id=o.id)`;
@Injectable()
export class OrderExpiryWorker {
  constructor(
    private readonly db: DatabaseService,
    private readonly orders: OrdersService,
    private readonly clock: OrderClock,
  ) {}
  async tick() {
    // Candidate discovery takes no row lock. The command locks users before Order.
    const candidates = await this.db.$transaction(async (tx) => {
      const now = await this.clock.now(tx);
      return tx.directOrder.findMany({
        where: { state: 'AwaitingPayment', paymentDeadline: { lte: now } },
        orderBy: [{ paymentDeadline: 'asc' }, { id: 'asc' }],
        take: 100,
        select: { id: true },
      });
    });
    let processed = 0,
      skipped = 0,
      failed = 0;
    for (const o of candidates) {
      try {
        await this.orders.expire(o.id);
        processed++;
      } catch (e) {
        if (e instanceof DomainError && e.getStatus() === 409) skipped++;
        else failed++;
      }
    }
    // Separate bounded scans prevent a broken refund starving deadline decisions.
    // Neither scan holds an Order lock while waiting for participant locks.
    for (const phase of ['confirmation', 'refund', 'pickup'] as const) {
      const rows = await this.db.$transaction(async (tx) => {
        const now = await this.clock.now(tx);
        return tx.directOrder.findMany({
          where:
            phase === 'confirmation'
              ? {
                  state: 'PendingSellerConfirmation',
                  sellerConfirmationDeadline: { lte: now },
                }
              : phase === 'refund'
                ? { state: 'SettlementPending' }
                : {
                    state: 'Preparing',
                    preparation: { pickupDeadline: { lte: now } },
                  },
          orderBy:
            phase === 'confirmation'
              ? [{ sellerConfirmationDeadline: 'asc' }, { id: 'asc' }]
              : phase === 'refund'
                ? [{ cancellationRequestedAt: 'asc' }, { id: 'asc' }]
                : [{ preparation: { pickupDeadline: 'asc' } }, { id: 'asc' }],
          take: 100,
          select: { id: true },
        });
      });
      for (const row of rows) {
        try {
          if (phase === 'confirmation')
            await this.orders.expireConfirmation(row.id);
          else if (phase === 'refund') await this.orders.refund(row.id);
          else await this.orders.expirePickup(row.id);
          processed++;
        } catch (e) {
          if (e instanceof DomainError && e.getStatus() === 409) skipped++;
          else failed++;
        }
      }
    }
    const deliveries = await this.db.$transaction(async (tx) => {
      const now = await this.clock.now(tx);
      return tx.$queryRaw<{ orderId: string }[]>(
        Prisma.sql`SELECT e.order_id AS "orderId" ${deliveryCandidates(now)} ORDER BY e.delivery_deadline,e.id LIMIT 100`,
      );
    });
    for (const row of deliveries) {
      try {
        await this.orders.expireDelivery(row.orderId);
        processed++;
      } catch (e) {
        if (e instanceof DomainError && e.getStatus() === 409) skipped++;
        else failed++;
      }
    }
    const backlog = await this.db.$transaction(async (tx) => {
      const now = await this.clock.now(tx),
        where = { state: 'AwaitingPayment', paymentDeadline: { lte: now } };
      const remaining = await tx.directOrder.count({ where });
      const oldest = await tx.directOrder.findFirst({
        where,
        orderBy: { paymentDeadline: 'asc' },
        select: { paymentDeadline: true },
      });
      const confirmation = await tx.directOrder.findFirst({
        where: {
          state: 'PendingSellerConfirmation',
          sellerConfirmationDeadline: { lte: now },
        },
        orderBy: { sellerConfirmationDeadline: 'asc' },
      });
      const refund = await tx.directOrder.findFirst({
        where: { state: 'SettlementPending' },
        orderBy: { cancellationRequestedAt: 'asc' },
      });
      const confirmationRemaining = await tx.directOrder.count({
        where: {
          state: 'PendingSellerConfirmation',
          sellerConfirmationDeadline: { lte: now },
        },
      });
      const refundRemaining = await tx.directOrder.count({
        where: { state: 'SettlementPending' },
      });
      const deadlines = [
        oldest?.paymentDeadline,
        confirmation?.sellerConfirmationDeadline,
        refund?.cancellationRequestedAt,
      ].filter((d): d is Date => !!d);
      const [deliveryBacklog] = await tx.$queryRaw<
        { count: number; oldest: Date | null }[]
      >(
        Prisma.sql`SELECT count(*)::integer AS count,min(e.delivery_deadline) AS oldest ${deliveryCandidates(now)}`,
      );
      if (deliveryBacklog.oldest) deadlines.push(deliveryBacklog.oldest);
      const openDeliveryReviews = await tx.orderDeliveryReview.count();
      const oldestDeliveryReview = await tx.orderDeliveryReview.findFirst({
        orderBy: [{ openedAt: 'asc' }, { id: 'asc' }],
      });
      const pickupWhere = {
        state: 'Preparing',
        preparation: { pickupDeadline: { lte: now } },
      };
      const pickupRemaining = await tx.directOrder.count({
        where: pickupWhere,
      });
      const oldestPickup = await tx.orderPreparation.findFirst({
        where: { order: pickupWhere },
        orderBy: { pickupDeadline: 'asc' },
      });
      if (oldestPickup) deadlines.push(oldestPickup.pickupDeadline);
      const openPickupReviews = await tx.pickupReview.count();
      const openCarrierReviews = await tx.carrierPickupReview.count();
      const oldestReview = await tx.pickupReview.findFirst({
        orderBy: { openedAt: 'asc' },
      });
      return {
        remaining:
          remaining +
          confirmationRemaining +
          refundRemaining +
          pickupRemaining +
          deliveryBacklog.count,
        deliveryRemaining: deliveryBacklog.count,
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
        pickupRemaining,
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
