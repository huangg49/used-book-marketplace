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
import { withBuyNowChallenge } from './0033-buy-now-challenge.js';
import {
  AUCTION_DURATION_MS,
  AUCTION_MAX_DURATION_MS,
  AUCTION_MAX_SCHEDULE_EDITS,
  AUCTION_MIN_DURATION_MS,
  AUCTION_SCHEDULE_HORIZON_MS,
  BUY_NOW_CHALLENGE_MS,
} from './auction-constants.js';
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

// ADR 0047: the seller publishes a Passed intake now or at a future startAt
// and chooses the length. plannedEndAt replaces the fixed startAt + 24 h as
// the upper bound of the ADR 0043 window. Existing auctions are backfilled
// with plannedEndAt = startAt + 24 h, so their end does not change.
const challengeEnd = (end: unknown) =>
  or(
    and(isNull('buyNowAt'), eq(f('endAt'), end)),
    and(
      notNull('buyNowAt'),
      gte(f('buyNowAt'), f('startAt')),
      gte(f('bidderCount'), 1),
      eq(f('endAt'), {
        $min: [end, plusMs('buyNowAt', BUY_NOW_CHALLENGE_MS)],
      }),
    ),
  );
const fixedChallengeEnd = challengeEnd(
  plusMs('startAt', AUCTION_DURATION_MS),
);
const scheduledEnd = and(
  challengeEnd(f('plannedEndAt')),
  gte(f('plannedEndAt'), plusMs('startAt', AUCTION_MIN_DURATION_MS)),
  lte(f('plannedEndAt'), plusMs('startAt', AUCTION_MAX_DURATION_MS)),
  gte(f('startAt'), f('publishedAt')),
  // Each schedule write sets updatedAt, which only grows afterwards.
  lte(f('startAt'), plusMs('updatedAt', AUCTION_SCHEDULE_HORIZON_MS)),
);
const replaced = (node: unknown): unknown => {
  if (isDeepStrictEqual(node, fixedChallengeEnd)) return scheduledEnd;
  if (Array.isArray(node)) return node.map(replaced);
  if (node && typeof node === 'object')
    return Object.fromEntries(
      Object.entries(node).map(([k, v]) => [k, replaced(v)]),
    );
  return node;
};

export const withSellerScheduledAuctions = (
  spec: CollectionSpec,
): CollectionSpec => {
  if (spec.name !== 'auctions') return spec;
  const expr = replaced(spec.expr) as Document;
  if (isDeepStrictEqual(expr, spec.expr))
    throw new Error('auctions expr no longer has the ADR 0043 end rule');
  return {
    ...spec,
    schema: document({
      ...(spec.schema.properties as Record<string, Document>),
      plannedEndAt: t.date(),
      publishedAt: t.date(),
      publishedBy: t.enum('Staff', 'Seller'),
      scheduleRevision: t.int(0, AUCTION_MAX_SCHEDULE_EDITS),
    }),
    expr,
    indexes: [
      ...spec.indexes,
      index({ state: 1, startAt: 1 }, 'auctions_state_start_at_idx'),
    ],
  };
};

const NEW_FIELDS = [
  'plannedEndAt',
  'publishedAt',
  'publishedBy',
  'scheduleRevision',
];
const previous = auctionCollectionSpecs
  .map(withPointOrderChanges)
  .map(withResolutionChanges)
  .map(withSettlementChanges)
  .map(withRulesChanges)
  .map(withPointAdministrationChanges)
  .map(withInspectionEvidenceChanges)
  .map(withBuyNowChallenge)
  .find((spec) => spec.name === 'auctions')!;
const finalSpec = withSellerScheduledAuctions(previous);
// Accepts auctions without the new fields while existing ones are backfilled.
const transitionSpec: CollectionSpec = {
  ...finalSpec,
  schema: {
    ...finalSpec.schema,
    required: (finalSpec.schema.required as string[]).filter(
      (field) => !NEW_FIELDS.includes(field),
    ),
  },
  expr: or(
    and({ $eq: [{ $type: f('plannedEndAt') }, 'missing'] }, previous.expr),
    finalSpec.expr,
  ),
};

export const sellerScheduledAuctionsMigration = {
  id: '0037-seller-scheduled-auctions',
  definition: { transition: transitionSpec, collections: [finalSpec] },
  async up(db: Db, client: MongoClient) {
    await applyCollectionSpecs(db, [transitionSpec]);
    const session = client.startSession();
    try {
      await session.withTransaction(
        async () => {
          await db.collection('auctions').updateMany(
            { plannedEndAt: { $exists: false } },
            [
              {
                $set: {
                  plannedEndAt: { $add: ['$startAt', AUCTION_DURATION_MS] },
                  publishedAt: '$startAt',
                  publishedBy: 'Staff',
                  scheduleRevision: 0,
                },
              },
            ],
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
