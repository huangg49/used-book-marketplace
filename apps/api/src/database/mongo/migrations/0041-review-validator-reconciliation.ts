import type { Db } from 'mongodb';
import { reviewLifecycleSpecs } from './0040-transaction-review-lifecycle.js';
import { applyCollectionSpecs } from './index.js';

// Main's legacy 0039 can arrive after local 0040 has already been applied.
// A new migration must restore the current validator even when 0040 is skipped.
// Do not replay 0040's legacy backfill: modern version-1 reviews are not legacy.
export const reviewValidatorReconciliationMigration = {
  id: '0041-review-validator-reconciliation',
  definition: { collections: reviewLifecycleSpecs },
  async up(db: Db) {
    await applyCollectionSpecs(db, reviewLifecycleSpecs);
  },
};
