import type { Db, MongoClient } from 'mongodb';
import { index, type CollectionSpec } from '../schema-dsl.js';

// ADR 0083: the Admin queue groups open reports about the same target (for
// example several flags on one auction) and filters the queue by target. Both
// read support_cases by target and state, so they get an index. No document
// or validator change.
export const SUPPORT_TARGET_INDEX = index(
  { 'target.type': 1, 'target.id': 1, state: 1 },
  'support_target_state_idx',
);

export function withSupportTargetIndex(spec: CollectionSpec): CollectionSpec {
  if (spec.name !== 'support_cases') return spec;
  return { ...spec, indexes: [...spec.indexes, SUPPORT_TARGET_INDEX] };
}

export function createSupportTargetIndexMigration(previous: CollectionSpec[]) {
  const collections = previous
    .filter((s) => s.name === 'support_cases')
    .map(withSupportTargetIndex);
  return {
    id: '0071-support-target-index',
    definition: { collections, policy: 'support-target-index-v1' },
    async up(db: Db, _client: MongoClient) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
    },
  };
}
