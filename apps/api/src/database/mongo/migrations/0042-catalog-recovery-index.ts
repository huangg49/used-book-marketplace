import type { Db } from 'mongodb';
import { index, type CollectionSpec } from '../schema-dsl.js';
import { recoveryKeys } from '../../../common/catalog-recovery-keys.js';
import { applyCollectionSpecs, currentCollections } from './index.js';

const property = {
  bsonType: 'array',
  maxItems: 1100,
  uniqueItems: true,
  items: { bsonType: 'string', minLength: 2, maxLength: 3 },
};
export const recoveryIndex = index(
  { status: 1, recoveryKeys: 1, _id: 1 },
  'catalog_books_status_recovery_keys_id_idx',
);
export function withCatalogRecovery(spec: CollectionSpec): CollectionSpec {
  if (spec.name !== 'catalog_books') return spec;
  const schema = spec.schema as { properties: Record<string, unknown> };
  // Additive compatibility with legacy import/fixtures. Current writes and backfill populate it.
  return {
    ...spec,
    schema: {
      ...spec.schema,
      properties: { ...schema.properties, recoveryKeys: property },
    },
    indexes: [...spec.indexes, recoveryIndex],
  };
}
export const catalogRecoveryMigration = {
  id: '0042-catalog-recovery-index',
  definition: {
    property,
    recoveryIndex,
    derivation:
      'V1: NFD/ASCII accents; letters and numbers; unique sorted first3 per word>=2; title+authors',
    backfill:
      'current revision only; projection update increments lockSeq/updatedAt, no business version change',
  },
  async up(db: Db) {
    await applyCollectionSpecs(
      db,
      currentCollections().filter((s) => s.name === 'catalog_books'),
    );
    const books = db.collection<{
      _id: string;
      currentRevisionId: string | null;
      recoveryKeys?: string[];
    }>('catalog_books');
    for await (const b of books.find({})) {
      const r = b.currentRevisionId
        ? await db
            .collection<{ _id: string; title: string; authors: string[] }>(
              'catalog_revisions',
            )
            .findOne({ _id: b.currentRevisionId })
        : null;
      const keys = r ? recoveryKeys(r.title, r.authors) : [];
      if (JSON.stringify(b.recoveryKeys) !== JSON.stringify(keys))
        await books.updateOne(
          { _id: b._id, currentRevisionId: b.currentRevisionId },
          {
            $set: { recoveryKeys: keys, updatedAt: new Date() },
            $inc: { lockSeq: 1 },
          },
        );
    }
  },
};
