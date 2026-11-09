import type { Db, Document, MongoClient } from 'mongodb';
import {
  and,
  document,
  eq,
  f,
  gte,
  isNull,
  lte,
  ne,
  or,
  plusMs,
  t,
  type CollectionSpec,
} from '../schema-dsl.js';
import {
  AUCTION_OPEN_GRACE_MS,
  AUCTION_START_CEILING_MS,
} from './auction-constants.js';
import { OPEN_MODES as LIFECYCLE_OPEN_MODES } from './0067-auction-lifecycle.js';

// ADR 0081: a registration auction always opens at the seller's chosen time
// (opensAt) and only once minBidders registered; the seller has no "open
// now". Until the minimum is reached startAt is the registration deadline
// opensAt + 24 h; reaching it moves startAt to opensAt, or to that moment when
// opensAt passed. So startAt always lies in [opensAt, opensAt + 24 h] and the
// open time itself stays within the 0067 ceiling publishedAt + 72 h. Older
// WhenReady/Scheduled rows keep their 0067 rules and get opensAt null.
export const OPEN_MODES = [...LIFECYCLE_OPEN_MODES, 'ScheduledGrace'] as const;

const scheduledOpenRule = and(
  eq(isNull('opensAt'), ne(f('openMode'), 'ScheduledGrace')),
  or(
    isNull('opensAt'),
    and(
      lte(f('opensAt'), plusMs('publishedAt', AUCTION_START_CEILING_MS)),
      gte(f('startAt'), f('opensAt')),
      lte(f('startAt'), plusMs('opensAt', AUCTION_OPEN_GRACE_MS)),
    ),
  ),
);

export function withAuctionScheduledOpen(spec: CollectionSpec): CollectionSpec {
  if (spec.name !== 'auctions') return spec;
  const properties = spec.schema.properties as Record<string, Document>;
  return {
    ...spec,
    schema: document({
      ...properties,
      openMode: t.nenum(...OPEN_MODES),
      opensAt: t.ndate(),
    }),
    expr: spec.expr ? and(spec.expr, scheduledOpenRule) : scheduledOpenRule,
  };
}

const NAMES = ['auctions'];

export function createAuctionScheduledOpenMigration(previous: CollectionSpec[]) {
  const before = previous.filter((s) => NAMES.includes(s.name));
  const collections = before.map(withAuctionScheduledOpen);
  // Accepts auction rows without opensAt while they are backfilled.
  const transition = collections.map((spec): CollectionSpec => {
    const old = before.find((s) => s.name === spec.name)!;
    const missing = { $eq: [{ $type: f('opensAt') }, 'missing'] };
    return {
      ...spec,
      schema: {
        ...spec.schema,
        required: (spec.schema.required as string[]).filter(
          (field) => field !== 'opensAt',
        ),
      },
      expr: or(old.expr ? and(missing, old.expr) : missing, spec.expr),
    };
  });
  return {
    id: '0069-auction-scheduled-open',
    definition: { transition, collections, policy: 'auction-scheduled-open-v1' },
    async up(db: Db, client: MongoClient) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, transition);
      const session = client.startSession();
      try {
        await session.withTransaction(
          async () => {
            await db
              .collection('auctions')
              .updateMany(
                { opensAt: { $exists: false } },
                { $set: { opensAt: null } },
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
