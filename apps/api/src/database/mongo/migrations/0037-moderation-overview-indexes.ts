import type { Db } from 'mongodb';
import { index, type CollectionSpec } from '../schema-dsl.js';

const indexes = [
  {
    collection: 'catalog_revisions',
    field: 'submittedAt',
    name: 'catalog_revisions_submitted_at_idx',
  },
  {
    collection: 'catalog_decisions',
    field: 'decidedAt',
    name: 'catalog_decisions_decided_at_idx',
  },
  {
    collection: 'listing_decisions',
    field: 'decidedAt',
    name: 'listing_decisions_decided_at_idx',
  },
] as const;
export function withModerationIndexes(spec: CollectionSpec): CollectionSpec {
  const entry = indexes.find((value) => value.collection === spec.name);
  return entry
    ? {
        ...spec,
        indexes: [...spec.indexes, index({ [entry.field]: 1 }, entry.name)],
      }
    : spec;
}
export const moderationOverviewIndexesMigration = {
  id: '0037-moderation-overview-indexes',
  definition: { indexes },
  async up(db: Db) {
    for (const entry of indexes)
      await db
        .collection(entry.collection)
        .createIndex({ [entry.field]: 1 }, { name: entry.name });
  },
};
