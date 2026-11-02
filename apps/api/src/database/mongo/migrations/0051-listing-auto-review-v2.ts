import type { Db } from 'mongodb';
import {
  and,
  document,
  eq,
  f,
  index,
  ne,
  or,
  t,
  unique,
  type CollectionSpec,
} from '../schema-dsl.js';
import { listingAutoReviewSpec } from './0050-listing-auto-review.js';

// ADR 0062: what each review rested on (server facts apart from model judgments),
// its policy version and cost; never photos. Rows from 0050 are backfilled as
// "not recorded" so every field stays present.
const reviewFields = {
  policyVersion: t.nstr(40),
  facts: t.nobject(),
  photoHashes: {
    bsonType: 'array',
    maxItems: 8,
    items: { bsonType: 'string', pattern: '^[a-f0-9]{16}$' },
  },
  // 0..9999, derived from the revision id. Below the configured rate means sampled.
  sampleBucket: t.nint(0, 9999),
  inputTokens: t.int(0),
  outputTokens: t.int(0),
  costMicroUsd: t.int(0),
  latencyMs: t.nint(0),
};
export const listingAutoReviewSpecV2: CollectionSpec = {
  ...listingAutoReviewSpec,
  schema: document({
    ...listingAutoReviewSpec.schema.properties,
    ...reviewFields,
  }),
};

// Post-publication checks on AI-approved revisions. A check only ever raises a
// flag for a person; publishing state changes through a Staff command.
export const listingAutoReviewCheckSpec: CollectionSpec = {
  name: 'listing_auto_review_checks',
  access: 'mutable',
  schema: document({
    _id: t.uuid(),
    revisionId: t.uuid(),
    listingId: t.uuid(),
    selection: t.enum('AiRecheck', 'HumanAudit', 'StaffOverride'),
    status: t.enum('Passed', 'Skipped', 'Open', 'Cleared', 'Confirmed'),
    reasons: {
      bsonType: 'array',
      maxItems: 30,
      items: { bsonType: 'string', maxLength: 60 },
    },
    assessment: t.nobject(),
    facts: t.nobject(),
    model: t.nstr(120),
    policyVersion: t.nstr(40),
    inputTokens: t.int(0),
    outputTokens: t.int(0),
    costMicroUsd: t.int(0),
    resolvedBy: t.nuuid(),
    resolvedAt: t.ndate(),
    note: t.nstr(1000),
    version: t.int(1),
    createdAt: t.date(),
    updatedAt: t.date(),
    lockSeq: t.lockSeq(),
  }),
  // A person is named exactly when a person closed the check.
  expr: or(
    and(
      or(eq(f('status'), 'Cleared'), eq(f('status'), 'Confirmed')),
      ne(f('resolvedBy'), null),
      ne(f('resolvedAt'), null),
      ne(f('note'), null),
    ),
    and(
      ne(f('status'), 'Cleared'),
      ne(f('status'), 'Confirmed'),
      eq(f('resolvedBy'), null),
      eq(f('resolvedAt'), null),
      eq(f('note'), null),
    ),
  ),
  indexes: [
    unique(
      { revisionId: 1, selection: 1 },
      'listing_auto_review_checks_revision_selection_key',
    ),
    index(
      { status: 1, createdAt: 1, _id: 1 },
      'listing_auto_review_checks_status_created_idx',
    ),
    index({ listingId: 1 }, 'listing_auto_review_checks_listing_idx'),
  ],
};

export const listingAutoReviewV2Migration = {
  id: '0051-listing-auto-review-v2',
  definition: {
    collections: [listingAutoReviewSpecV2, listingAutoReviewCheckSpec],
    policy: 'facts-apart-from-judgments-flags-never-unpublish-v1',
  },
  async up(db: Db) {
    const { applyCollectionSpecs } = await import('./index.js');
    await db.collection(listingAutoReviewSpec.name).updateMany(
      { policyVersion: { $exists: false } },
      {
        $set: {
          policyVersion: null,
          facts: null,
          photoHashes: [],
          sampleBucket: null,
          inputTokens: 0,
          outputTokens: 0,
          costMicroUsd: 0,
          latencyMs: null,
        },
      },
    );
    await applyCollectionSpecs(db, [
      listingAutoReviewSpecV2,
      listingAutoReviewCheckSpec,
    ]);
  },
};
