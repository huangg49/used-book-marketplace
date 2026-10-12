import type { Db } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import type { CollectionSpec } from '../schema-dsl.js';
import { and, document, eq, gte, isNull, notNull, or, t, unique } from '../schema-dsl.js';

export const exchangeCollectionSpecs: CollectionSpec[] = [
  {
    name: 'exchanges',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      initiatorId: t.uuid(),
      recipientId: t.uuid(),
      initiatorListingId: t.uuid(),
      recipientListingId: t.uuid(),
      status: t.enum('Proposed', 'AcceptedAwaitingFunding', 'Preparing', 'InTransit', 'Delivered', 'Completed', 'Cancelled', 'ResolutionPending'),
      revision: t.int(1),
      initiatorDeposit: t.int(0),
      recipientDeposit: t.int(0),
      diffAmount: t.int(0),
      diffPayerId: t.nuuid(),
      createdAt: t.date(),
      updatedAt: t.date(),
    }),
    expr: and(
      { $ne: ['$initiatorId', '$recipientId'] },
      { $ne: ['$initiatorListingId', '$recipientListingId'] },
      gte('$updatedAt', '$createdAt'),
      or(
        eq('$diffAmount', 0),
        and({ $gt: ['$diffAmount', 0] }, notNull('diffPayerId'))
      )
    ),
    indexes: [
      { key: { initiatorId: 1, updatedAt: -1, _id: -1 }, name: 'exchanges_initiator_updated_idx' },
      { key: { recipientId: 1, updatedAt: -1, _id: -1 }, name: 'exchanges_recipient_updated_idx' },
      { key: { initiatorListingId: 1, status: 1 }, name: 'exchanges_initiator_listing_idx' },
      { key: { recipientListingId: 1, status: 1 }, name: 'exchanges_recipient_listing_idx' },
    ],
  },
];

export const exchangesMigration = {
  id: '0016-exchanges',
  definition: { collections: exchangeCollectionSpecs },
  async up(db: Db) {
    await applyCollectionSpecs(db, exchangeCollectionSpecs);
  },
};
