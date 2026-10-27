import type { Db } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import {
  and,
  document,
  eq,
  f,
  index,
  isNull,
  notNull,
  oneOf,
  or,
  t,
  unique,
  type CollectionSpec,
} from '../schema-dsl.js';

// ADR 0048: one document per photo autofill request. Pending reserves quota
// before the provider call; the checked fields (or failure) are written back.
// Holds no photo bytes, account or contact data. Usage and cost share
// price_assist_usage with the price assistant (one daily AI budget).
export const autofillSuggestionSpec: CollectionSpec = {
  name: 'autofill_suggestions',
  access: 'mutable',
  schema: document({
    _id: t.uuid(),
    ownerId: t.uuid(),
    listingId: t.uuid(),
    mediaIds: {
      bsonType: 'array',
      minItems: 1,
      maxItems: 3,
      uniqueItems: true,
      items: t.uuid(),
    },
    // sha256 over the photos' content hashes and the model.
    inputFingerprint: t.sha(),
    requestKey: t.uuid(),
    requestHash: t.sha(),
    status: t.enum('Pending', 'Suggested', 'NeedsMoreData', 'Failed'),
    failure: t.nenum('Timeout', 'InvalidOutput', 'ProviderError', 'Refusal'),
    response: t.nobject(),
    model: t.nstr(120),
    inputTokens: t.nint(0),
    outputTokens: t.nint(0),
    costMicroUsd: t.nint(0),
    latencyMs: t.nint(0),
    createdAt: t.date(),
    expiresAt: t.date(),
    updatedAt: t.date(),
    lockSeq: t.lockSeq(),
  }),
  expr: and(
    // An answer exists exactly for delivered results; failures carry a kind.
    or(
      and(oneOf(f('status'), ['Suggested', 'NeedsMoreData']), notNull('response')),
      and(oneOf(f('status'), ['Pending', 'Failed']), isNull('response')),
    ),
    or(
      and(eq(f('status'), 'Failed'), notNull('failure')),
      and({ $ne: [f('status'), 'Failed'] }, isNull('failure')),
    ),
  ),
  indexes: [
    unique({ ownerId: 1, requestKey: 1 }, 'autofill_suggestions_owner_request_key_idx'),
    index({ ownerId: 1, createdAt: -1 }, 'autofill_suggestions_owner_created_idx'),
    index(
      { listingId: 1, inputFingerprint: 1, createdAt: -1 },
      'autofill_suggestions_listing_input_idx',
    ),
  ],
};

export const listingAutofillSpecs = [autofillSuggestionSpec];

export const listingAutofillMigration = {
  id: '0038-listing-autofill',
  definition: listingAutofillSpecs,
  up: async (db: Db) => {
    await applyCollectionSpecs(db, listingAutofillSpecs);
  },
};
