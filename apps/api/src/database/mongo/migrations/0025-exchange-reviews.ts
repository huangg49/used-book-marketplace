import type { Db } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import type { CollectionSpec } from '../schema-dsl.js';
import { document, t, unique } from '../schema-dsl.js';

export const transactionReviewSpecs: CollectionSpec[] = [
  {
    name: 'transaction_reviews',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      transactionType: t.enum('Exchange', 'Order'),
      transactionId: t.uuid(),
      authorId: t.uuid(),
      authorName: t.str(120),
      targetUserId: t.uuid(),
      bookRating: t.int(1, 5),
      partnerRating: t.int(1, 5),
      tags: { bsonType: 'array', items: t.str(60) },
      comment: t.str(1000),
      publishedAt: t.ndate(),
      createdAt: t.date(),
      updatedAt: t.date(),
      lockSeq: t.int(0),
    }),
    indexes: [
      unique(
        { transactionId: 1, authorId: 1 },
        'transaction_reviews_tx_author_key',
      ),
      {
        key: { targetUserId: 1, createdAt: -1 },
        name: 'transaction_reviews_target_created_idx',
      },
    ],
  },
];

export const exchangeReviewsMigration = {
  id: '0025-exchange-reviews',
  definition: { collections: transactionReviewSpecs },
  async up(db: Db) {
    await applyCollectionSpecs(db, transactionReviewSpecs);
  },
};
