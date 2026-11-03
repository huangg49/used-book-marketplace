import type { Db } from 'mongodb';
import { and, eq, f, gte, lte, type CollectionSpec } from '../schema-dsl.js';
import {
  AUCTION_STEP_MAX,
  AUCTION_STEP_MIN,
  AUCTION_STEP_UNIT,
  AUCTION_STEPS,
} from './auction-constants.js';

// ADR 0068: the Seller may enter their own bid step. 0056 limited `step` to the
// AUCTION_STEPS list via `$in`; this replaces only that check with a range on
// the AUCTION_STEP_UNIT grid. The preset list stays valid inside the range.
const STEP_COLLECTIONS = ['auction_intakes', 'auctions', 'point_orders'];
const stepRange = and(
  gte(f('step'), AUCTION_STEP_MIN),
  lte(f('step'), AUCTION_STEP_MAX),
  eq({ $mod: [f('step'), AUCTION_STEP_UNIT] }, 0),
);

const replaceStepList = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(replaceStepList);
  if (!node || typeof node !== 'object') return node;
  const value = (node as Record<string, unknown>).$in;
  if (
    Array.isArray(value) &&
    value[0] === f('step') &&
    JSON.stringify(value[1]) === JSON.stringify(AUCTION_STEPS)
  )
    return stepRange;
  return Object.fromEntries(
    Object.entries(node).map(([key, child]) => [key, replaceStepList(child)]),
  );
};

export function withCustomAuctionStep(spec: CollectionSpec): CollectionSpec {
  if (!STEP_COLLECTIONS.includes(spec.name) || !spec.expr) return spec;
  return { ...spec, expr: replaceStepList(spec.expr) as typeof spec.expr };
}

export function createCustomAuctionStepMigration(previous: CollectionSpec[]) {
  const collections = previous.map(withCustomAuctionStep);
  return {
    id: '0057-custom-auction-step',
    definition: { collections, policy: 'auction-step-range-v1' },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
    },
  };
}
