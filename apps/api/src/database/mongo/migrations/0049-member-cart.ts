import type { Db } from 'mongodb';
import { document, t, type CollectionSpec } from '../schema-dsl.js';
export const memberCartSpec: CollectionSpec = {
  name: 'member_carts',
  access: 'mutable',
  schema: document({
    _id: t.uuid(),
    version: t.int(1),
    lockSeq: t.lockSeq(),
    items: {
      bsonType: 'array',
      maxItems: 50,
      items: document({
        listingId: t.uuid(),
        priceAtAdd: t.int(0),
        addedAt: t.date(),
      }),
    },
    createdAt: t.date(),
    updatedAt: t.date(),
  }),
  expr: {
    $eq: [
      { $size: '$items' },
      { $size: { $setUnion: ['$items.listingId', []] } },
    ],
  },
  indexes: [],
};
export const memberCartMigration = {
  id: '0049-member-cart',
  definition: {
    collections: [memberCartSpec],
    policy: 'one-owner-bounded-fifty-unique-rows-no-reservation-v1',
  },
  async up(db: Db) {
    const { applyCollectionSpecs } = await import('./index.js');
    await applyCollectionSpecs(db, [memberCartSpec]);
  },
};
