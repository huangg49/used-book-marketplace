import type { Db } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import type { CollectionSpec } from '../schema-dsl.js';
import { document, gte, isNull, or, t, unique } from '../schema-dsl.js';
import { withSystemOperations } from './0008-auctions.js';
import { purchaseConversationChangedSpecs } from './0014-purchase-conversations.js';

// FR-N03/N04: the durable inbox is the primary notification channel; realtime
// is supplementary. Rows are written in the same transaction as the business
// event they report, so a rolled-back command never notifies. The text carries
// prices and states only: no address, code, evidence or private Auto ceiling.
export const NOTIFICATION_KINDS = [
  'AuctionOutbid',
  'AuctionWon',
  'AuctionSold',
  'AuctionBoughtNow',
  'AuctionUnsold',
  'AuctionCancelled',
  'AuctionOnHold',
  'AuctionPaymentExpired',
  'AuctionPaid',
] as const;

export const notificationSpecs: CollectionSpec[] = [
  {
    name: 'member_notifications',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      userId: t.uuid(),
      kind: t.enum(...NOTIFICATION_KINDS),
      title: t.str(120),
      body: t.str(400),
      targetType: t.enum('Auction'),
      targetId: t.uuid(),
      // One row per recipient and event; a retried transaction cannot duplicate it.
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

// FR-AU09: the worker holds an Active auction as soon as its seller or leader
// is no longer eligible, instead of waiting for the close.
const latest = (name: string) => {
  const spec = purchaseConversationChangedSpecs.find((row) => row.name === name);
  if (!spec) throw new Error(`Missing current ${name} schema`);
  return spec;
};
export const notificationChangedSpecs = [
  withSystemOperations(latest('mutation_receipts'), 'operation', [
    ['AuctionHold', 'holdAuction'],
  ]),
  withSystemOperations(latest('audit_events'), 'action', [
    ['AuctionHold', 'holdAuction'],
  ]),
];

export const withNotificationChanges = (spec: CollectionSpec) =>
  notificationChangedSpecs.find((s) => s.name === spec.name) ?? spec;

export const memberNotificationsMigration = {
  id: '0015-member-notifications',
  definition: {
    collections: notificationSpecs,
    changed: notificationChangedSpecs,
  },
  async up(db: Db) {
    await applyCollectionSpecs(db, [
      ...notificationSpecs,
      ...notificationChangedSpecs,
    ]);
  },
};
