import type { Db } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import { transactionReviewSpecs } from './0025-exchange-reviews.js';

export const transactionReviewValidatorFixMigration = {
  id: '0039-transaction-review-validator-fix',
  definition: { collections: transactionReviewSpecs },
  async up(db: Db) {
    await applyCollectionSpecs(db, transactionReviewSpecs);
  },
};
