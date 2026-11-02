import type { Db } from 'mongodb';
import type { CollectionSpec } from '../schema-dsl.js';
import { withListingAutoReview } from './0050-listing-auto-review.js';

// Both independently applied 0050 migrations replace receipt/audit validators.
// Keep their definitions/checksums frozen and reconcile after either upgrade.
export function createSupportAutoReviewUnionMigration(
  support: CollectionSpec[],
) {
  const changed = support
    .filter((spec) => ['mutation_receipts', 'audit_events'].includes(spec.name))
    .map(withListingAutoReview);
  return {
    id: '0051-support-auto-review-union',
    definition: {
      collections: changed,
      policy: 'preserve-support-target-and-auto-review-principal-v1',
    },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, changed);
    },
  };
}
