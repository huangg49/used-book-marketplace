import type { Db } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import { document, index, t, type CollectionSpec } from '../schema-dsl.js';

// Online price lookup (ADR 0029). One lookup record per catalog book holds
// the lease that keeps a single search running and the time the next one is
// allowed. Offers are new-book prices read from allowed shop pages; unlike
// the staff-curated price_references, the app writes them, so they live in
// their own collection and never mix with what staff entered.
export const priceLookupSpec: CollectionSpec = {
  name: 'price_lookups',
  access: 'mutable',
  schema: document({
    _id: t.uuid(),
    status: t.enum('Running', 'Done', 'Failed'),
    runId: t.uuid(),
    leaseUntil: t.date(),
    nextAt: t.date(),
    lastRunAt: t.date(),
    offersFound: t.int(0, 20),
    failure: t.nstr(40),
    model: t.nstr(80),
    inputTokens: t.int(0),
    outputTokens: t.int(0),
    searches: t.int(0),
    costMicroUsd: t.int(0),
    createdAt: t.date(),
    updatedAt: t.date(),
  }),
  indexes: [],
};

export const onlinePriceOfferSpec: CollectionSpec = {
  name: 'online_price_offers',
  access: 'mutable',
  schema: document({
    _id: t.uuid(),
    bookId: t.uuid(),
    runId: t.uuid(),
    shop: t.str(120),
    url: t.str(500, '^https://'),
    amount: t.int(1000, 10_000_000),
    isbnMatched: t.bool(),
    pageTitle: t.nstr(300),
    observedAt: t.date(),
    retiredAt: t.ndate(),
    createdAt: t.date(),
  }),
  indexes: [
    index({ bookId: 1, retiredAt: 1, observedAt: -1 }, 'online_price_offers_book_idx'),
  ],
};

export const onlinePriceSpecs = [priceLookupSpec, onlinePriceOfferSpec];

export const onlinePriceLookupMigration = {
  id: '0007-online-price-lookup',
  definition: onlinePriceSpecs,
  up: async (db: Db) => {
    await applyCollectionSpecs(db, onlinePriceSpecs);
  },
};
