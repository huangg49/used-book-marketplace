import type { Db } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import { document, index, t, unique, type CollectionSpec } from '../schema-dsl.js';

export const wishlistSpec: CollectionSpec = {
  name: 'wishlist_items',
  access: 'deletable',
  schema: document({
    _id: t.uuid(),
    userId: t.uuid(),
    subjectType: t.enum('CATALOG_BOOK', 'LISTING'),
    subjectId: t.uuid(),
    wantsToExchange: t.bool(),
    receiveNotifications: t.bool(),
    createdAt: t.date(),
    updatedAt: t.date(),
  }),
  indexes: [
    unique({ userId: 1, subjectType: 1, subjectId: 1 }, 'wishlist_items_unique_user_subject_idx'),
    index({ userId: 1, createdAt: -1 }, 'wishlist_items_user_created_at_idx'),
  ],
};

export const wishlistMigration = {
  id: '0004-wishlist',
  definition: wishlistSpec,
  up: async (db: Db) => {
    await applyCollectionSpecs(db, [wishlistSpec]);
  },
};
