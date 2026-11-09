import type { Db, Document, MongoClient } from 'mongodb';
import {
  and,
  f,
  lte,
  notNull,
  or,
  plusMs,
  type CollectionSpec,
} from '../schema-dsl.js';
import {
  AUCTION_NIGHT_ALLOWANCE_MS,
  AUCTION_OPEN_GRACE_MS,
} from './auction-constants.js';

// ADR 0085: an auction that reaches its minimum after its open time opens 10
// minutes later, or at 07:00 when that falls between 23:00 and 07:00 (Vietnam
// time). Its start can then lie past the 24 h deadline by at most that delay,
// so the 0069 rule "startAt <= opensAt + 24 h" gains the allowance once the
// minimum was reached (biddingOpenedAt set). A waiting auction keeps it exactly.
const OLD_DEADLINE = lte(f('startAt'), plusMs('opensAt', AUCTION_OPEN_GRACE_MS));
const NEW_DEADLINE = or(
  OLD_DEADLINE,
  and(
    notNull('biddingOpenedAt'),
    lte(
      f('startAt'),
      plusMs('opensAt', AUCTION_OPEN_GRACE_MS + AUCTION_NIGHT_ALLOWANCE_MS),
    ),
  ),
);

function replace(x: unknown, from: string, to: unknown): { value: unknown; hits: number } {
  if (JSON.stringify(x) === from) return { value: to, hits: 1 };
  if (Array.isArray(x)) {
    let hits = 0;
    const value = x.map((v) => {
      const r = replace(v, from, to);
      hits += r.hits;
      return r.value;
    });
    return { value, hits };
  }
  if (x && typeof x === 'object') {
    let hits = 0;
    const value: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x)) {
      const r = replace(v, from, to);
      hits += r.hits;
      value[k] = r.value;
    }
    return { value, hits };
  }
  return { value: x, hits: 0 };
}

export function withAuctionReachedNotice(spec: CollectionSpec): CollectionSpec {
  if (spec.name !== 'auctions') return spec;
  const r = replace(spec.expr, JSON.stringify(OLD_DEADLINE), NEW_DEADLINE);
  if (r.hits !== 1)
    throw new Error(`0073: expected one rule ${JSON.stringify(OLD_DEADLINE)}, found ${r.hits}`);
  return { ...spec, expr: r.value as Document };
}

export function createAuctionReachedNoticeMigration(previous: CollectionSpec[]) {
  const collections = previous
    .filter((s) => s.name === 'auctions')
    .map(withAuctionReachedNotice);
  return {
    id: '0073-auction-reached-notice',
    definition: { collections, policy: 'auction-reached-notice-v1' },
    async up(db: Db, _client: MongoClient) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
    },
  };
}
