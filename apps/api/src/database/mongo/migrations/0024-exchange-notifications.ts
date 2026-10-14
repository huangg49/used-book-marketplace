import type { Db } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import type { CollectionSpec } from '../schema-dsl.js';
import { document, gte, isNull, or, t, unique } from '../schema-dsl.js';

export const ALL_NOTIFICATION_KINDS = [
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
] as const;

export const exchangeNotificationSpecs: CollectionSpec[] = [
  {
    name: 'member_notifications',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      userId: t.uuid(),
      kind: t.enum(...ALL_NOTIFICATION_KINDS),
      title: t.str(120),
      body: t.str(400),
      targetType: t.enum('Auction', 'Exchange'),
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

export const withExchangeNotificationChanges = (spec: CollectionSpec): CollectionSpec =>
  spec.name === 'member_notifications' ? exchangeNotificationSpecs[0]! : spec;

export const exchangeNotificationsMigration = {
  id: '0024-exchange-notifications',
  definition: { collections: exchangeNotificationSpecs },
  async up(db: Db) {
    await applyCollectionSpecs(db, exchangeNotificationSpecs);
  },
};
