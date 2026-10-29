import type { Db } from 'mongodb';
import { applyCollectionSpecs, currentCollections } from './index.js';
import type { CollectionSpec } from '../schema-dsl.js';

const origin = {
  bsonType: ['string', 'null'],
  pattern: '^[a-z0-9][a-z0-9._:-]{1,99}$',
  maxLength: 100,
};
export function withPriceSourceOrigin(spec: CollectionSpec): CollectionSpec {
  if (spec.name !== 'price_references') return spec;
  const schema = spec.schema as { properties: Record<string, unknown> };
  return {
    ...spec,
    schema: {
      ...spec.schema,
      properties: { ...schema.properties, sourceGroup: origin },
    },
  };
}
export const priceSourceOriginMigration = {
  id: '0043-price-source-origin',
  definition: {
    origin,
    compatibility:
      'Optional nullable sourceGroup; no inferred backfill or rewrites of historical suggestions.',
  },
  async up(db: Db) {
    await applyCollectionSpecs(
      db,
      currentCollections().filter((s) => s.name === 'price_references'),
    );
  },
};
