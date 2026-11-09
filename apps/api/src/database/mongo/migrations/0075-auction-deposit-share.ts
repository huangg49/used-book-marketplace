import type { Db, Document, MongoClient } from 'mongodb';
import {
  and,
  document,
  eq,
  f,
  gte,
  isNull,
  lte,
  or,
  type CollectionSpec,
} from '../schema-dsl.js';
import { AUCTION_DEPOSIT_UNIT, AUCTION_MIN_PRICE, MONEY_MAX } from './auction-constants.js';

// ADR 0087: who keeps a forfeited deposit, and a seller-set deposit.
//
// ledger_journals: AuctionDepositSellerShare moves the seller's share of a
// forfeited deposit from the platform account to the seller's wallet, once per
// auction, when the non-paying winner leaves the book unsold.
// auction_intakes: depositAmount, the seller's registration deposit (null =
// the 10% default); the service bounds it, the validator keeps it whole
// thousands and inside the start price.
// auctions: a deposit is never above the start price (true of every row).
// member_notifications: AuctionDepositShareReceived for the seller.
export const DEPOSIT_SHARE_JOURNAL = 'AuctionDepositSellerShare';
export const DEPOSIT_SHARE_NOTIFICATIONS = ['AuctionDepositShareReceived'] as const;

const absent = (name: string) => eq({ $ifNull: [f(name), null] }, null);
const depositMoney = {
  bsonType: ['int', 'long', 'double', 'null'],
  minimum: AUCTION_MIN_PRICE,
  maximum: MONEY_MAX,
  multipleOf: AUCTION_DEPOSIT_UNIT,
};
const depositInsidePrice = or(
  isNull('depositAmount'),
  and(gte(f('depositAmount'), AUCTION_MIN_PRICE), lte(f('depositAmount'), f('startPrice'))),
);

export function withAuctionDepositShare(spec: CollectionSpec): CollectionSpec {
  const properties = spec.schema.properties as Record<string, Document>;
  if (spec.name === 'auction_intakes')
    return {
      ...spec,
      schema: document({ ...properties, depositAmount: depositMoney }),
      expr: spec.expr ? and(spec.expr, depositInsidePrice) : depositInsidePrice,
    };
  if (spec.name === 'auctions')
    return { ...spec, expr: and(spec.expr!, depositInsidePrice) };
  if (spec.name === 'ledger_journals')
    return {
      ...spec,
      schema: {
        ...spec.schema,
        properties: {
          ...properties,
          type: {
            ...properties.type,
            enum: [...(properties.type.enum as string[]), DEPOSIT_SHARE_JOURNAL],
          },
        },
      },
      expr: or(
        spec.expr!,
        and(
          eq(f('type'), DEPOSIT_SHARE_JOURNAL),
          { $ne: [f('auctionId'), null] },
          { $ne: [f('receiptId'), null] },
          isNull('topupId'),
          isNull('eventId'),
          isNull('orderId'),
          absent('listingFeeId'),
          absent('withdrawalId'),
        ),
      ),
    };
  if (spec.name === 'member_notifications')
    return {
      ...spec,
      schema: {
        ...spec.schema,
        properties: {
          ...properties,
          kind: {
            ...properties.kind,
            enum: [...(properties.kind.enum as string[]), ...DEPOSIT_SHARE_NOTIFICATIONS],
          },
        },
      },
    };
  return spec;
}

const NAMES = ['auction_intakes', 'auctions', 'ledger_journals', 'member_notifications'];

export function createAuctionDepositShareMigration(previous: CollectionSpec[]) {
  const before = previous.filter((s) => NAMES.includes(s.name));
  if (before.length !== NAMES.length) throw new Error('0075: missing a predecessor spec');
  const collections = before.map(withAuctionDepositShare);
  // Accepts intake rows without depositAmount while they are backfilled.
  const transition = collections.map((spec): CollectionSpec => {
    if (spec.name !== 'auction_intakes') return spec;
    const old = before.find((s) => s.name === spec.name)!;
    const missing = { $eq: [{ $type: f('depositAmount') }, 'missing'] };
    return {
      ...spec,
      schema: {
        ...spec.schema,
        required: (spec.schema.required as string[]).filter((field) => field !== 'depositAmount'),
      },
      expr: or(old.expr ? and(missing, old.expr) : missing, spec.expr),
    };
  });
  return {
    id: '0075-auction-deposit-share',
    definition: { transition, collections, policy: 'auction-deposit-share-v1' },
    async up(db: Db, client: MongoClient) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, transition);
      const session = client.startSession();
      try {
        await session.withTransaction(
          async () => {
            await db
              .collection('auction_intakes')
              .updateMany({ depositAmount: { $exists: false } }, { $set: { depositAmount: null } }, { session });
          },
          { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
        );
      } finally {
        await session.endSession();
      }
      await applyCollectionSpecs(db, collections);
    },
  };
}
