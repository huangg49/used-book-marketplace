import type { Db } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import { baselineCollections } from './0001-baseline-schema.js';
import { withBookBundles } from './0035-whole-book-bundles.js';
import { withBundleReviewSearch } from './0036-bundle-review-search.js';
import { type CollectionSpec } from '../schema-dsl.js';

const exchangePreferences = {
  bsonType: ['object', 'null'],
  additionalProperties: false,
  properties: {
    targetCategory: { bsonType: ['string', 'null'], maxLength: 100 },
    targetAuthor: { bsonType: ['string', 'null'], maxLength: 150 },
    targetDescription: { bsonType: ['string', 'null'], maxLength: 500 },
  },
};

export function withListingExchangePreferences(spec: CollectionSpec): CollectionSpec {
  if (spec.name !== 'listing_revisions') return spec;
  return {
    ...spec,
    schema: {
      ...spec.schema,
      properties: {
        ...(spec.schema.properties as Record<string, unknown>),
        exchangePreferences,
      },
    },
  };
}

const specs = baselineCollections
  .filter((spec) => spec.name === 'listing_revisions')
  .map(withBookBundles)
  .map(withBundleReviewSearch)
  .map(withListingExchangePreferences);

export const listingExchangePreferencesMigration = {
  id: '0046-listing-exchange-preferences',
  definition: {
    collections: specs,
    purpose: 'Support exchange preferences on listing revisions for smart bilateral matching',
  },
  async up(db: Db) {
    await applyCollectionSpecs(db, specs);
  },
};

