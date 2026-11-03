import type { Db } from 'mongodb';
import type { CollectionSpec } from '../schema-dsl.js';
import { AUCTION_STEPS } from './auction-constants.js';

// ADR 0068: Sellers choose the bid step from AUCTION_STEPS. 0008/0009 froze
// `step` to [10_000, 50_000] via `$in`; only that list is replaced.
const LEGACY_STEPS = [10_000, 50_000];
const STEP_COLLECTIONS = ['auction_intakes', 'auctions', 'point_orders'];

const widenSteps = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(widenSteps);
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [
      key,
      key === '$in' &&
      Array.isArray(value) &&
      value[0] === '$step' &&
      JSON.stringify(value[1]) === JSON.stringify(LEGACY_STEPS)
        ? [value[0], [...AUCTION_STEPS]]
        : widenSteps(value),
    ]),
  );
};

export function withAuctionStepOptions(spec: CollectionSpec): CollectionSpec {
  if (!STEP_COLLECTIONS.includes(spec.name) || !spec.expr) return spec;
  return { ...spec, expr: widenSteps(spec.expr) as typeof spec.expr };
}

export function createAuctionStepOptionsMigration(previous: CollectionSpec[]) {
  const collections = previous
    .filter((spec) => STEP_COLLECTIONS.includes(spec.name))
    .map(withAuctionStepOptions);
  return {
    id: '0056-auction-step-options',
    definition: { collections, policy: 'auction-steps-v2' },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
    },
  };
}
