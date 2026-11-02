import type { Db } from 'mongodb';
import { listingAutoReviewSpecV2 } from './0052-listing-auto-review-v2.js';

// Must precede 0052-listing-auto-review-v2: that frozen migration backfills
// fields while the v1 validator still rejects additional properties.
// Already-upgraded installations keep their strict v2 validator unchanged.
const defaults = {
  policyVersion: null,
  facts: null,
  photoHashes: [],
  sampleBucket: null,
  inputTokens: 0,
  outputTokens: 0,
  costMicroUsd: 0,
  latencyMs: null,
};
const transitional = {
  ...listingAutoReviewSpecV2,
  schema: {
    ...listingAutoReviewSpecV2.schema,
    required: listingAutoReviewSpecV2.schema.required.filter(
      (field: string) => !(field in defaults),
    ),
  },
};

export const autoReviewV2UpgradeBridgeMigration = {
  id: '0056-auto-review-v2-upgrade-bridge',
  definition: { transitional, final: listingAutoReviewSpecV2, defaults },
  async up(db: Db) {
    const { applyCollectionSpecs } = await import('./index.js');
    await applyCollectionSpecs(db, [transitional]);
    await db.collection(listingAutoReviewSpecV2.name).updateMany(
      { policyVersion: { $exists: false } },
      { $set: defaults },
    );
    await applyCollectionSpecs(db, [listingAutoReviewSpecV2]);
  },
};
