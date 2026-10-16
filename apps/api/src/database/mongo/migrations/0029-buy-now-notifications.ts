import type { Db } from 'mongodb';
import type { CollectionSpec } from '../schema-dsl.js';
import { document, gte, isNull, or, t, unique } from '../schema-dsl.js';

// A complete forward-only validator; no top-level import of the migration
// registry, so importing this migration directly cannot initialize a partial registry.
export const buyNowNotificationSpecs: CollectionSpec[] = [
  {
    name: 'member_notifications',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      userId: t.uuid(),
      kind: t.enum(
        'AuctionOutbid',
        'AuctionWon',
        'AuctionSold',
        'AuctionBoughtNow',
        'AuctionUnsold',
        'AuctionCancelled',
        'AuctionOnHold',
        'AuctionPaymentExpired',
        'AuctionPaid',
        'ExchangeProposed',
        'ExchangeAccepted',
        'ExchangeFunded',
        'ExchangeShipped',
        'ExchangeReceived',
        'ExchangeCompleted',
        'ExchangeCancelled',
        'ExchangeRejected',
        'OrderBuyNowPaid',
      ),
      title: t.str(120),
      body: t.str(400),
      targetType: t.enum('Auction', 'Exchange', 'Order'),
      targetId: t.uuid(),
      dedupeKey: t.str(200),
      createdAt: t.date(),
      readAt: t.ndate(),
    }),
    expr: or(isNull('readAt'), gte('$readAt', '$createdAt')),
    indexes: [
      unique({ dedupeKey: 1 }, 'member_notifications_dedupe_key'),
      {
        key: { userId: 1, createdAt: -1, _id: -1 },
        name: 'member_notifications_user_created_idx',
      },
      {
        key: { userId: 1, readAt: 1 },
        name: 'member_notifications_user_unread_idx',
      },
    ],
  },
];
export const withBuyNowNotifications = (spec: CollectionSpec) =>
  spec.name === 'member_notifications' ? buyNowNotificationSpecs[0]! : spec;
export const buyNowNotificationsMigration = {
  id: '0029-buy-now-notifications',
  definition: buyNowNotificationSpecs,
  async up(db: Db) {
    const { applyCollectionSpecs } = await import('./index.js');
    await applyCollectionSpecs(db, buyNowNotificationSpecs);
  },
};
