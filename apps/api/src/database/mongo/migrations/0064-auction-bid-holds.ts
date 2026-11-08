import type { Db, Document } from 'mongodb';
import {
  and,
  eq,
  f,
  isNull,
  notNull,
  or,
  t,
  type CollectionSpec,
} from '../schema-dsl.js';

// ADR 0075: the current leader's commitment is held in the wallet. One hold
// account per (auction, bidder), owned through holderId (ownerId stays null so
// the UserAvailable lookup by ownerId is unchanged, as for WithdrawalHold).
// Journals move money between the holder's available account and that hold;
// several per auction are allowed (the hold rises with the leader's level and
// is released when outbid, cancelled, unsold, expired or paid).
export const AUCTION_HOLD_JOURNALS = [
  'AuctionBidHold',
  'AuctionBidRelease',
] as const;
export const AUCTION_HOLD_NOTIFICATIONS = [
  'AuctionFundsHeld',
  'AuctionFundsReleased',
] as const;
const absent = (name: string) => eq({ $ifNull: [f(name), null] }, null);

export function withAuctionBidHolds(spec: CollectionSpec): CollectionSpec {
  const properties = spec.schema.properties as Record<string, Document>;
  if (spec.name === 'wallet_accounts')
    return {
      ...spec,
      schema: {
        ...spec.schema,
        properties: {
          ...properties,
          auctionId: t.nuuid(),
          holderId: t.nuuid(),
          purpose: {
            ...properties.purpose,
            enum: [...properties.purpose.enum, 'AuctionBidHold'],
          },
        },
      },
      expr: or(
        and(spec.expr!, absent('auctionId'), absent('holderId')),
        and(
          eq(f('purpose'), 'AuctionBidHold'),
          isNull('ownerId'),
          isNull('orderId'),
          absent('withdrawalId'),
          notNull('auctionId'),
          notNull('holderId'),
        ),
      ),
      indexes: [
        ...spec.indexes,
        {
          key: { auctionId: 1, holderId: 1 },
          name: 'wallet_accounts_auction_holder_unique',
          unique: true,
          partialFilterExpression: { auctionId: { $type: 'string' } },
        },
      ],
    };
  if (spec.name === 'ledger_journals')
    return {
      ...spec,
      schema: {
        ...spec.schema,
        properties: {
          ...properties,
          auctionId: t.nuuid(),
          type: {
            ...properties.type,
            enum: [...properties.type.enum, ...AUCTION_HOLD_JOURNALS],
          },
        },
      },
      expr: or(
        and(spec.expr!, absent('auctionId')),
        and(
          { $in: [f('type'), [...AUCTION_HOLD_JOURNALS]] },
          notNull('auctionId'),
          notNull('receiptId'),
          isNull('topupId'),
          isNull('eventId'),
          isNull('orderId'),
          absent('listingFeeId'),
          absent('withdrawalId'),
        ),
      ),
      indexes: [
        ...spec.indexes,
        {
          key: { auctionId: 1, sequence: 1 },
          name: 'ledger_journals_auction_idx',
          partialFilterExpression: { auctionId: { $type: 'string' } },
        },
      ],
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
            enum: [...properties.kind.enum, ...AUCTION_HOLD_NOTIFICATIONS],
          },
        },
      },
    };
  return spec;
}

const NAMES = ['wallet_accounts', 'ledger_journals', 'member_notifications'];
export function createAuctionBidHoldsMigration(previous: CollectionSpec[]) {
  const collections = previous
    .filter((s) => NAMES.includes(s.name))
    .map(withAuctionBidHolds);
  return {
    id: '0064-auction-bid-holds',
    definition: { collections, policy: 'auction-leader-hold-v1' },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
    },
  };
}
