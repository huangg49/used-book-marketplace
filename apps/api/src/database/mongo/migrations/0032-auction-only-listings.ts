import type { Db, MongoClient } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import { baselineCollections } from './0001-baseline-schema.js';
import { document, index, t, type CollectionSpec } from '../schema-dsl.js';

// ADR 0041: a listing belongs to one immutable channel. Existing listings are
// marketplace listings; the auction flow creates Auction listings.
export const LISTING_CHANNELS = ['Marketplace', 'Auction'] as const;

export const withListingChannel = (spec: CollectionSpec): CollectionSpec => {
  if (spec.name !== 'listings') return spec;
  return {
    ...spec,
    schema: document({
      ...(spec.schema.properties as Record<string, unknown>),
      channel: t.enum(...LISTING_CHANNELS),
    } as Parameters<typeof document>[0]),
    indexes: [
      ...spec.indexes,
      index(
        { ownerId: 1, channel: 1, updatedAt: 1, _id: 1 },
        'listings_owner_id_channel_updated_at_id_idx',
      ),
    ],
  };
};

const listingsSpec = baselineCollections.find((s) => s.name === 'listings')!;
const finalSpec = withListingChannel(listingsSpec);
// Accepts documents with or without channel while existing ones are backfilled.
const transitionSpec: CollectionSpec = {
  ...finalSpec,
  schema: {
    ...finalSpec.schema,
    required: (finalSpec.schema.required as string[]).filter(
      (field) => field !== 'channel',
    ),
  },
};

export const auctionOnlyListingsMigration = {
  id: '0032-auction-only-listings',
  definition: { transition: transitionSpec, collections: [finalSpec] },
  async up(db: Db, client: MongoClient) {
    await applyCollectionSpecs(db, [transitionSpec]);
    const session = client.startSession();
    try {
      await session.withTransaction(
        async () => {
          await db
            .collection('listings')
            .updateMany(
              { channel: { $exists: false } },
              { $set: { channel: 'Marketplace' } },
              { session },
            );
        },
        { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
      );
    } finally {
      await session.endSession();
    }
    await applyCollectionSpecs(db, [finalSpec]);
  },
};
