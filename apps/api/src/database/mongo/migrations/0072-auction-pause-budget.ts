import type { Db, Document, MongoClient } from 'mongodb';
import {
  and,
  document,
  eq,
  f,
  gte,
  index,
  isNull,
  lte,
  notNull,
  or,
  plusMs,
  t,
  type CollectionSpec,
} from '../schema-dsl.js';
import {
  AUCTION_HOLD_MAX_MS,
  AUCTION_OPEN_CEILING_MS,
  AUCTION_PAUSE_BUDGET_MS,
  AUCTION_START_CEILING_MS,
} from './auction-constants.js';

// ADR 0084: one pause model. An OnHold auction records why (holdReason) and
// when it auto-cancels (holdUntil: heldAt + the smaller of 48 h and the pause
// budget left). A resume gives the paused time back: every stored time moves
// by the same amount and pausedMs adds it up (≤ 72 h in total). Relative
// rules (endAt vs plannedEndAt and buyNowAt, startAt vs opensAt) still hold
// after a uniform move; the three ceilings fixed on publishedAt grow by
// pausedMs.
const WHEN_READY_CEILING = 24 * 3_600_000; // 0067, ADR 0079
const ceilings: [number, string][] = [
  [WHEN_READY_CEILING, 'startAt'],
  [AUCTION_START_CEILING_MS, 'startAt'],
  [AUCTION_OPEN_CEILING_MS, 'opensAt'],
];
const replacements: [unknown, unknown][] = ceilings.map(([ms, field]) => [
  lte(f(field), plusMs('publishedAt', ms)),
  lte(f(field), { $add: [f('publishedAt'), ms, f('pausedMs')] }),
]);
// 0037 "startAt ≤ updatedAt + 7 d" is relative to the last write, so it needs no change.

const pauseRule = and(
  eq(eq(f('state'), 'OnHold'), notNull('holdReason')),
  eq(eq(f('state'), 'OnHold'), notNull('holdUntil')),
  or(
    isNull('holdUntil'),
    and(
      notNull('heldAt'),
      gte(f('holdUntil'), f('heldAt')),
      lte(f('holdUntil'), plusMs('heldAt', AUCTION_HOLD_MAX_MS)),
      lte(
        { $add: [f('pausedMs'), { $subtract: [f('holdUntil'), f('heldAt')] }] },
        AUCTION_PAUSE_BUDGET_MS,
      ),
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

export const HOLD_REASONS = ['Eligibility', 'Review'] as const;

export function withAuctionPauseBudget(spec: CollectionSpec): CollectionSpec {
  if (spec.name !== 'auctions') return spec;
  let expr: unknown = spec.expr;
  for (const [from, to] of replacements) {
    const r = replace(expr, JSON.stringify(from), to);
    if (r.hits !== 1)
      throw new Error(`0072: expected one rule ${JSON.stringify(from)}, found ${r.hits}`);
    expr = r.value;
  }
  const properties = spec.schema.properties as Record<string, Document>;
  return {
    ...spec,
    schema: document({
      ...properties,
      holdReason: t.nenum(...HOLD_REASONS),
      holdUntil: t.ndate(),
      pausedMs: t.int(0, AUCTION_PAUSE_BUDGET_MS),
    }),
    expr: and(expr as Document, pauseRule),
    indexes: [
      ...spec.indexes,
      index({ state: 1, holdUntil: 1 }, 'auctions_state_hold_until_idx'),
    ],
  };
}

const NEW_FIELDS = ['holdReason', 'holdUntil', 'pausedMs'];

export function createAuctionPauseBudgetMigration(previous: CollectionSpec[]) {
  const before = previous.filter((s) => s.name === 'auctions');
  const collections = before.map(withAuctionPauseBudget);
  // Accepts auction rows without the new fields while they are backfilled.
  const transition = collections.map((spec): CollectionSpec => {
    const old = before.find((s) => s.name === spec.name)!;
    const missing = { $eq: [{ $type: f('pausedMs') }, 'missing'] };
    return {
      ...spec,
      schema: {
        ...spec.schema,
        required: (spec.schema.required as string[]).filter(
          (field) => !NEW_FIELDS.includes(field),
        ),
      },
      expr: or(old.expr ? and(missing, old.expr) : missing, spec.expr),
    };
  });
  return {
    id: '0072-auction-pause-budget',
    definition: { transition, collections, policy: 'auction-pause-budget-v1' },
    async up(db: Db, client: MongoClient) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, transition);
      const session = client.startSession();
      try {
        await session.withTransaction(
          async () => {
            const auctions = db.collection('auctions');
            // A held row keeps its ADR 0079 ceiling: heldAt + 48 h.
            await auctions.updateMany(
              { pausedMs: { $exists: false }, state: 'OnHold' },
              [
                {
                  $set: {
                    pausedMs: 0,
                    holdReason: 'Eligibility',
                    holdUntil: { $add: ['$heldAt', AUCTION_HOLD_MAX_MS] },
                  },
                },
              ],
              { session },
            );
            await auctions.updateMany(
              { pausedMs: { $exists: false } },
              { $set: { pausedMs: 0, holdReason: null, holdUntil: null } },
              { session },
            );
          },
          {
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' },
          },
        );
      } finally {
        await session.endSession();
      }
      await applyCollectionSpecs(db, collections);
    },
  };
}
