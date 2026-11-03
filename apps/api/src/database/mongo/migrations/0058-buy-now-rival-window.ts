import { isDeepStrictEqual } from 'node:util';
import type { Db } from 'mongodb';
import { eq, f, or, plusMs, type CollectionSpec } from '../schema-dsl.js';
import {
  BUY_NOW_CHALLENGE_MS,
  BUY_NOW_RIVAL_CHALLENGE_MS,
} from './auction-constants.js';

// ADR 0070: a Buy Now by the current leader keeps the ADR 0043 60-second
// window; one by a non-leader gives the others 5 minutes. 0037 pinned endAt to
// min(plannedEndAt, buyNowAt + 60 s); this replaces only that equality so
// either window is valid. Existing auctions already satisfy the 60 s branch.
const windowEnd = (ms: number) =>
  eq(f('endAt'), { $min: [f('plannedEndAt'), plusMs('buyNowAt', ms)] });
const oneMinute = windowEnd(BUY_NOW_CHALLENGE_MS);
const eitherWindow = or(oneMinute, windowEnd(BUY_NOW_RIVAL_CHALLENGE_MS));

const replaced = (node: unknown): unknown => {
  if (isDeepStrictEqual(node, oneMinute)) return eitherWindow;
  if (Array.isArray(node)) return node.map(replaced);
  if (node && typeof node === 'object')
    return Object.fromEntries(
      Object.entries(node).map(([k, v]) => [k, replaced(v)]),
    );
  return node;
};

export function withBuyNowRivalWindow(spec: CollectionSpec): CollectionSpec {
  if (spec.name !== 'auctions' || !spec.expr) return spec;
  const expr = replaced(spec.expr) as typeof spec.expr;
  if (isDeepStrictEqual(expr, spec.expr))
    throw new Error('auctions expr no longer has the ADR 0047 Buy Now end rule');
  return { ...spec, expr };
}

export function createBuyNowRivalWindowMigration(previous: CollectionSpec[]) {
  const collections = previous.map(withBuyNowRivalWindow);
  return {
    id: '0058-buy-now-rival-window',
    definition: { collections, policy: 'buy-now-rival-window-v1' },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
    },
  };
}
