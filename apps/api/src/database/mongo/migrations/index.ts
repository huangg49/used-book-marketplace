import { createHash } from 'node:crypto';
import type { Db, MongoClient } from 'mongodb';
import { canonicalJson } from '../../../common/canonical-json.js';
import type { CollectionSpec } from '../schema-dsl.js';
import { baselineCollections } from './0001-baseline-schema.js';
import { insertReferenceData, referenceData } from './0002-reference-data.js';
import {
  backfillTitleKeys,
  catalogTitleKey,
  withTitleKey,
} from './0003-catalog-title-key.js';
import { wishlistMigration, wishlistSpec } from './0004-wishlist.js';
import { priceAssistMigration } from './0005-price-assist.js';
import {
  priceAssistSpecsV2,
  priceSuggestionInputMigration,
} from './0006-price-suggestion-input.js';
import {
  onlinePriceLookupMigration,
  onlinePriceSpecs,
} from './0007-online-price-lookup.js';
import {
  auctionCollectionSpecs,
  auctionsMigration,
  withAuctionChanges,
} from './0008-auctions.js';
import {
  pointOrderCollectionSpecs,
  pointOrdersMigration,
  withPointOrderChanges,
} from './0009-point-orders.js';
import {
  pointCollectionMigration,
  pointCollectionSpecs,
  withPointCollectionChanges,
} from './0010-point-collection.js';

export interface Migration {
  id: string;
  // Frozen content the checksum is computed from; editing an applied
  // migration makes the runner refuse to continue.
  definition: unknown;
  up(db: Db, client: MongoClient): Promise<void>;
}

export const validatorOf = (spec: CollectionSpec) => ({
  $jsonSchema: spec.schema,
  ...(spec.expr ? { $expr: spec.expr } : {}),
});

export async function applyCollectionSpecs(db: Db, specs: CollectionSpec[]) {
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map(
      (c) => c.name,
    ),
  );
  for (const spec of specs) {
    const options = {
      validator: validatorOf(spec),
      validationLevel: 'strict' as const,
      validationAction: 'error' as const,
    };
    if (existing.has(spec.name))
      await db.command({ collMod: spec.name, ...options });
    else await db.createCollection(spec.name, options);
    if (spec.indexes.length)
      await db.collection(spec.name).createIndexes(spec.indexes);
  }
}

export const migrations: Migration[] = [
  {
    id: '0001-baseline-schema',
    definition: baselineCollections,
    up: (db) => applyCollectionSpecs(db, baselineCollections),
  },
  {
    id: '0002-reference-data',
    definition: referenceData,
    async up(db, client) {
      const session = client.startSession();
      try {
        await session.withTransaction(() => insertReferenceData(db, session), {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
        });
      } finally {
        await session.endSession();
      }
    },
  },
  {
    id: '0003-catalog-title-key',
    definition: catalogTitleKey,
    async up(db) {
      await backfillTitleKeys(db);
      await applyCollectionSpecs(
        db,
        baselineCollections
          .filter((spec) => spec.name === catalogTitleKey.collection)
          .map(withTitleKey),
      );
    },
  },
  wishlistMigration,
  priceAssistMigration,
  priceSuggestionInputMigration,
  onlinePriceLookupMigration,
  auctionsMigration,
  pointOrdersMigration,
  pointCollectionMigration,
];

export const checksumOf = (migration: Migration) =>
  createHash('sha256')
    .update(canonicalJson(migration.definition))
    .digest('hex');

// The latest schema, for tests and for the app role privileges.
export const currentCollections = (): CollectionSpec[] => [
  ...baselineCollections
    .map(withTitleKey)
    .map(withAuctionChanges)
    .map(withPointOrderChanges)
    .map(withPointCollectionChanges),
  wishlistSpec,
  ...priceAssistSpecsV2,
  ...onlinePriceSpecs,
  ...auctionCollectionSpecs.map(withPointOrderChanges),
  ...pointOrderCollectionSpecs.map(withPointCollectionChanges),
  ...pointCollectionSpecs,
];
