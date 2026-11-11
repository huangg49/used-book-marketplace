import type { Db } from 'mongodb';
import { onlinePriceSpecs } from './0007-online-price-lookup.js';
import { applyCollectionSpecs } from './index.js';
import { t, type CollectionSpec } from '../schema-dsl.js';

export function withOnlinePriceCatalogRevision(spec: CollectionSpec): CollectionSpec {
  return {
    ...spec,
    schema: {
      ...spec.schema,
      properties: { ...spec.schema.properties, catalogRevisionId: t.uuid() },
    },
  };
}

// Existing lookup records predate pending-book searches and remain readable
// for confirmed books. Every new lookup and offer identifies its revision.
const specs = onlinePriceSpecs.map(withOnlinePriceCatalogRevision);

export const onlinePriceCatalogRevisionMigration = {
  id: '0076-online-price-catalog-revision',
  definition: specs,
  up: async (db: Db) => applyCollectionSpecs(db, specs),
};
