import type { Db } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import {
  and,
  document,
  eq,
  f,
  index,
  isNull,
  lte,
  notNull,
  or,
  t,
  type CollectionSpec,
} from '../schema-dsl.js';

const condition = () => t.nenum('LikeNew', 'Good', 'Fair', 'Worn');

// Curated, sourced price facts (ADR 0028). The app may only read them; the
// import tool writes as the migrator. InternalAsking is computed from approved
// listings at request time and never stored here.
export const priceReferenceSpec: CollectionSpec = {
  name: 'price_references',
  access: 'reference',
  schema: document({
    _id: t.uuid(),
    bookId: t.uuid(),
    isbn: t.nstr(13, '^(?:[0-9]{9}[0-9X]|[0-9]{13})$'),
    kind: t.enum('CoverPrice', 'EditorialReference', 'CompletedSale'),
    amount: t.int(1000, 10_000_000),
    condition: condition(),
    sourceLabel: t.str(160),
    sourceUrl: t.nstr(500, '^https://'),
    observedAt: t.date(),
    enteredBy: t.str(80),
    rightsNote: t.str(300),
    retiredAt: t.ndate(),
    createdAt: t.date(),
  }),
  indexes: [
    index({ bookId: 1, observedAt: -1 }, 'price_references_book_observed_idx'),
  ],
};

// One document per suggestion request. Pending reserves quota before the
// provider call; the result (or failure) and the seller's later decision are
// written back. Kept for evaluation and cost reporting; no contact data.
export const priceSuggestionSpec: CollectionSpec = {
  name: 'price_suggestions',
  access: 'mutable',
  schema: document({
    _id: t.uuid(),
    ownerId: t.uuid(),
    listingId: t.uuid(),
    bookId: t.uuid(),
    inputFingerprint: t.sha(),
    status: t.enum('Pending', 'Suggested', 'NeedsMoreData', 'Refused', 'Failed'),
    failure: t.nenum('Timeout', 'InvalidOutput', 'ProviderError', 'Refusal'),
    evidenceLevel: t.enum('Strong', 'Limited', 'Insufficient'),
    rangeLow: t.nint(10_000, 1_000_000),
    rangeHigh: t.nint(10_000, 1_000_000),
    response: t.nobject(),
    model: t.nstr(80),
    inputTokens: t.nint(0),
    outputTokens: t.nint(0),
    costMicroUsd: t.nint(0),
    latencyMs: t.nint(0),
    outcome: t.nobject(),
    createdAt: t.date(),
    expiresAt: t.date(),
    updatedAt: t.date(),
    lockSeq: t.lockSeq(),
  }),
  expr: and(
    // A range exists exactly when a suggestion was made, low <= high.
    or(
      and(
        eq(f('status'), 'Suggested'),
        notNull('rangeLow'),
        notNull('rangeHigh'),
        lte(f('rangeLow'), f('rangeHigh')),
      ),
      and(
        { $ne: [f('status'), 'Suggested'] },
        isNull('rangeLow'),
        isNull('rangeHigh'),
      ),
    ),
    or(eq(f('status'), 'Failed'), isNull('failure')),
    // A decision is recorded only against a delivered suggestion.
    or(isNull('outcome'), eq(f('status'), 'Suggested')),
  ),
  indexes: [
    index({ ownerId: 1, createdAt: -1 }, 'price_suggestions_owner_created_idx'),
    index(
      { listingId: 1, inputFingerprint: 1, createdAt: -1 },
      'price_suggestions_listing_input_idx',
    ),
  ],
};

// Daily per-user and global counters (calls, provider cost); removed by TTL.
export const priceAssistUsageSpec: CollectionSpec = {
  name: 'price_assist_usage',
  access: 'mutable',
  schema: document({
    _id: t.str(120),
    calls: t.int(0),
    costMicroUsd: t.int(0),
    expiresAt: t.date(),
  }),
  indexes: [
    {
      key: { expiresAt: 1 },
      name: 'price_assist_usage_ttl',
      expireAfterSeconds: 0,
    },
  ],
};

export const priceAssistSpecs = [
  priceReferenceSpec,
  priceSuggestionSpec,
  priceAssistUsageSpec,
];

export const priceAssistMigration = {
  id: '0005-price-assist',
  definition: priceAssistSpecs,
  up: async (db: Db) => {
    await applyCollectionSpecs(db, priceAssistSpecs);
  },
};
