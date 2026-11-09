import { isDeepStrictEqual } from 'node:util';
import type { Db, Document, MongoClient } from 'mongodb';
import {
  and,
  document,
  eq,
  f,
  or,
  plusMs,
  t,
  type CollectionSpec,
} from '../schema-dsl.js';
import {
  BUY_NOW_CHALLENGE_MS,
  BUY_NOW_RIVAL_CHALLENGE_MS,
} from './auction-constants.js';

// ADR 0074: the Seller chooses at intake whether Buy Now opens the ADR
// 0043/0070 challenge window (Challenge) or ends the auction at once
// (Instant). The mode is copied to the auction. For Instant the end rule is
// endAt = min(plannedEndAt, buyNowAt), i.e. the Buy Now moment; for Challenge
// the 0058 rule (60 s or 5 min) stays. Existing rows are backfilled with
// Challenge so their end rule does not change.
const MODES = ['Challenge', 'Instant'] as const;
const COLLECTIONS = ['auction_intakes', 'auctions'];

const windowEnd = (ms: number) =>
  eq(f('endAt'), { $min: [f('plannedEndAt'), plusMs('buyNowAt', ms)] });
const challengeWindow = or(
  windowEnd(BUY_NOW_CHALLENGE_MS),
  windowEnd(BUY_NOW_RIVAL_CHALLENGE_MS),
);
const modeWindow = or(
  and(eq(f('buyNowMode'), 'Challenge'), challengeWindow),
  and(eq(f('buyNowMode'), 'Instant'), windowEnd(0)),
);

const replaced = (node: unknown): unknown => {
  if (isDeepStrictEqual(node, challengeWindow)) return modeWindow;
  if (Array.isArray(node)) return node.map(replaced);
  if (node && typeof node === 'object')
    return Object.fromEntries(
      Object.entries(node).map(([k, v]) => [k, replaced(v)]),
    );
  return node;
};

export function withBuyNowMode(spec: CollectionSpec): CollectionSpec {
  if (!COLLECTIONS.includes(spec.name)) return spec;
  const schema = document({
    ...(spec.schema.properties as Record<string, Document>),
    buyNowMode: t.enum(...MODES),
  });
  if (spec.name === 'auction_intakes') return { ...spec, schema };
  const expr = replaced(spec.expr) as Document;
  if (isDeepStrictEqual(expr, spec.expr))
    throw new Error('auctions expr no longer has the ADR 0070 Buy Now window');
  return { ...spec, schema, expr };
}

export function createBuyNowModeMigration(previous: CollectionSpec[]) {
  const before = previous.filter((spec) => COLLECTIONS.includes(spec.name));
  const collections = before.map(withBuyNowMode);
  // Accepts rows without buyNowMode (old end rule) while they are backfilled.
  const transition = collections.map((spec): CollectionSpec => {
    const old = before.find((s) => s.name === spec.name)!;
    return {
      ...spec,
      schema: {
        ...spec.schema,
        required: (spec.schema.required as string[]).filter(
          (field) => field !== 'buyNowMode',
        ),
      },
      ...(spec.expr
        ? {
            expr: or(
              and({ $eq: [{ $type: f('buyNowMode') }, 'missing'] }, old.expr),
              spec.expr,
            ),
          }
        : {}),
    };
  });
  return {
    id: '0063-auction-buy-now-mode',
    definition: { transition, collections, policy: 'auction-buy-now-mode-v1' },
    async up(db: Db, client: MongoClient) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, transition);
      const session = client.startSession();
      try {
        await session.withTransaction(
          async () => {
            for (const name of COLLECTIONS)
              await db
                .collection(name)
                .updateMany(
                  { buyNowMode: { $exists: false } },
                  { $set: { buyNowMode: 'Challenge' } },
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
