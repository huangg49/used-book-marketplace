import { isDeepStrictEqual } from 'node:util';
import type { Db, Document, MongoClient } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import { auctionCollectionSpecs } from './0008-auctions.js';
import { withPointOrderChanges } from './0009-point-orders.js';
import { withResolutionChanges } from './0011-point-order-resolution.js';
import { withSettlementChanges } from './0012-point-order-settlement.js';
import { withRulesChanges } from './0013-auction-business-rules.js';
import { withPointAdministrationChanges } from './0022-point-administration.js';
import { withInspectionEvidenceChanges } from './0023-inspection-evidence.js';
import {
  AUCTION_DURATION_MS,
  BUY_NOW_CHALLENGE_MS,
} from './auction-constants.js';
import {
  and,
  document,
  eq,
  f,
  gte,
  isNull,
  notNull,
  or,
  plusMs,
  t,
  type CollectionSpec,
} from '../schema-dsl.js';

// ADR 0043: Buy Now opens a 60-second window. The fixed 24-hour end becomes
// the upper bound: with buyNowAt set, endAt = min(startAt + 24 h, buyNowAt + 60 s).
const fixedEnd = eq(f('endAt'), plusMs('startAt', AUCTION_DURATION_MS));
const challengeEnd = or(
  and(isNull('buyNowAt'), fixedEnd),
  and(
    notNull('buyNowAt'),
    gte(f('buyNowAt'), f('startAt')),
    gte(f('bidderCount'), 1),
    eq(f('endAt'), {
      $min: [
        plusMs('startAt', AUCTION_DURATION_MS),
        plusMs('buyNowAt', BUY_NOW_CHALLENGE_MS),
      ],
    }),
  ),
);
const replaced = (node: unknown): unknown => {
  if (isDeepStrictEqual(node, fixedEnd)) return challengeEnd;
  if (Array.isArray(node)) return node.map(replaced);
  if (node && typeof node === 'object')
    return Object.fromEntries(
      Object.entries(node).map(([k, v]) => [k, replaced(v)]),
    );
  return node;
};

export const withBuyNowChallenge = (spec: CollectionSpec): CollectionSpec => {
  if (spec.name !== 'auctions') return spec;
  const expr = replaced(spec.expr) as Document;
  if (isDeepStrictEqual(expr, spec.expr))
    throw new Error('auctions expr no longer has the fixed 24-hour end');
  return {
    ...spec,
    schema: document({
      ...(spec.schema.properties as Record<string, Document>),
      buyNowAt: t.ndate(),
    }),
    expr,
  };
};

const previous = auctionCollectionSpecs
  .map(withPointOrderChanges)
  .map(withResolutionChanges)
  .map(withSettlementChanges)
  .map(withRulesChanges)
  .map(withPointAdministrationChanges)
  .map(withInspectionEvidenceChanges)
  .find((spec) => spec.name === 'auctions')!;
const finalSpec = withBuyNowChallenge(previous);
// Accepts auctions without buyNowAt while existing ones are backfilled.
const transitionSpec: CollectionSpec = {
  ...finalSpec,
  schema: {
    ...finalSpec.schema,
    required: (finalSpec.schema.required as string[]).filter(
      (field) => field !== 'buyNowAt',
    ),
  },
  expr: or(
    and({ $eq: [{ $type: f('buyNowAt') }, 'missing'] }, previous.expr),
    finalSpec.expr,
  ),
};

export const buyNowChallengeMigration = {
  id: '0033-buy-now-challenge',
  definition: { transition: transitionSpec, collections: [finalSpec] },
  async up(db: Db, client: MongoClient) {
    await applyCollectionSpecs(db, [transitionSpec]);
    const session = client.startSession();
    try {
      await session.withTransaction(
        async () => {
          await db
            .collection('auctions')
            .updateMany(
              { buyNowAt: { $exists: false } },
              { $set: { buyNowAt: null } },
              { session },
            );
        },
        { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
      );
    } finally {
      await session.endSession();
    }
    await applyCollectionSpecs(db, [finalSpec]);
  },
};
