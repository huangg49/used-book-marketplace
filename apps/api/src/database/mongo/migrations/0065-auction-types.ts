import type { Db, Document, MongoClient } from 'mongodb';
import {
  and,
  document,
  eq,
  f,
  gt,
  gte,
  isNull,
  lte,
  or,
  t,
  type CollectionSpec,
} from '../schema-dsl.js';
import { MONEY_MAX } from './auction-constants.js';

// ADR 0076: auction formats. English keeps every earlier rule. Dutch stores
// the floor in startPrice and the opening price in dutchTopPrice (on the
// startPrice + n × step grid, so every descending price stays on the grid the
// auctions validator already requires); acceptance reuses the ADR 0074
// Instant end (buyNowAt = endAt). Sealed formats have no Buy Now. Existing
// rows are backfilled as English.
export const AUCTION_FORMATS = [
  'English',
  'Dutch',
  'SealedFirst',
  'SealedSecond',
] as const;
const COLLECTIONS = ['auction_intakes', 'auctions'];
const FIELDS = ['auctionType', 'dutchTopPrice', 'dutchIntervalSeconds'];
const money = {
  bsonType: ['int', 'long', 'double', 'null'],
  minimum: 10000,
  maximum: MONEY_MAX,
  multipleOf: 1,
};

export const formatRule = and(
  { $in: [f('auctionType'), [...AUCTION_FORMATS]] },
  or(
    and(
      eq(f('auctionType'), 'English'),
      isNull('dutchTopPrice'),
      isNull('dutchIntervalSeconds'),
    ),
    and(
      eq(f('auctionType'), 'Dutch'),
      isNull('buyNowPrice'),
      eq(f('buyNowMode'), 'Instant'),
      gt(f('dutchTopPrice'), f('startPrice')),
      lte(f('dutchTopPrice'), MONEY_MAX),
      eq(
        { $mod: [{ $subtract: [f('dutchTopPrice'), f('startPrice')] }, f('step')] },
        0,
      ),
      gte(f('dutchIntervalSeconds'), 10),
      lte(f('dutchIntervalSeconds'), 3600),
    ),
    and(
      { $in: [f('auctionType'), ['SealedFirst', 'SealedSecond']] },
      isNull('buyNowPrice'),
      isNull('dutchTopPrice'),
      isNull('dutchIntervalSeconds'),
    ),
  ),
);

export function withAuctionTypes(spec: CollectionSpec): CollectionSpec {
  if (!COLLECTIONS.includes(spec.name)) return spec;
  return {
    ...spec,
    schema: document({
      ...(spec.schema.properties as Record<string, Document>),
      auctionType: t.enum(...AUCTION_FORMATS),
      dutchTopPrice: money,
      dutchIntervalSeconds: t.nint(10, 3600),
    }),
    expr: spec.expr ? and(spec.expr, formatRule) : formatRule,
  };
}

export function createAuctionTypesMigration(previous: CollectionSpec[]) {
  const before = previous.filter((s) => COLLECTIONS.includes(s.name));
  const collections = before.map(withAuctionTypes);
  // Accepts rows without the new fields (old rules) while they are backfilled.
  const transition = collections.map((spec): CollectionSpec => {
    const old = before.find((s) => s.name === spec.name)!;
    const missing = { $eq: [{ $type: f('auctionType') }, 'missing'] };
    return {
      ...spec,
      schema: {
        ...spec.schema,
        required: (spec.schema.required as string[]).filter(
          (field) => !FIELDS.includes(field),
        ),
      },
      expr: or(old.expr ? and(missing, old.expr) : missing, spec.expr!),
    };
  });
  return {
    id: '0065-auction-types',
    definition: { transition, collections, policy: 'auction-formats-v1' },
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
                  { auctionType: { $exists: false } },
                  {
                    $set: {
                      auctionType: 'English',
                      dutchTopPrice: null,
                      dutchIntervalSeconds: null,
                    },
                  },
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
