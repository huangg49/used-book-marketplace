import type { Db, Document, MongoClient } from 'mongodb';
import {
  and,
  eq,
  f,
  lte,
  ne,
  or,
  plusMs,
  type CollectionSpec,
} from '../schema-dsl.js';
import {
  AUCTION_MAX_OPEN_CHANGES,
  AUCTION_OPEN_CEILING_MS,
  AUCTION_SCHEDULE_HORIZON_MS,
  AUCTION_START_CEILING_MS,
} from './auction-constants.js';

// ADR 0082: a ScheduledGrace auction (ADR 0081) may open up to 30 days after
// it was published and its open time changes at most twice. Two earlier rules
// are replaced on the auctions validator:
// - 0037 "startAt <= updatedAt + 7 days" no longer applies to ScheduledGrace
//   (its own 0069 rules bound startAt to [opensAt, opensAt + 24 h]);
// - 0069 "opensAt <= publishedAt + 72 h" becomes "+ 30 days".
// WhenReady/Scheduled rows keep their 0037/0067 rules.
const OLD_HORIZON = lte(f('startAt'), plusMs('updatedAt', AUCTION_SCHEDULE_HORIZON_MS));
const OLD_OPEN_CEILING = lte(f('opensAt'), plusMs('publishedAt', AUCTION_START_CEILING_MS));
const replacements: [unknown, unknown][] = [
  [OLD_HORIZON, or(eq(f('openMode'), 'ScheduledGrace'), OLD_HORIZON)],
  [OLD_OPEN_CEILING, lte(f('opensAt'), plusMs('publishedAt', AUCTION_OPEN_CEILING_MS))],
];
const openChangesRule = or(
  ne(f('openMode'), 'ScheduledGrace'),
  lte(f('scheduleRevision'), AUCTION_MAX_OPEN_CHANGES),
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

export function withAuctionOpenMonth(spec: CollectionSpec): CollectionSpec {
  if (spec.name !== 'auctions') return spec;
  let expr: unknown = spec.expr;
  for (const [from, to] of replacements) {
    const r = replace(expr, JSON.stringify(from), to);
    if (r.hits !== 1)
      throw new Error(`0070: expected one rule ${JSON.stringify(from)}, found ${r.hits}`);
    expr = r.value;
  }
  return { ...spec, expr: and(expr as Document, openChangesRule) };
}

export function createAuctionOpenMonthMigration(previous: CollectionSpec[]) {
  const collections = previous
    .filter((s) => s.name === 'auctions')
    .map(withAuctionOpenMonth);
  return {
    id: '0070-auction-open-month',
    definition: { collections, policy: 'auction-open-month-v1' },
    async up(db: Db, _client: MongoClient) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
    },
  };
}
