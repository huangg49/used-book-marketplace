import type { Db, MongoClient } from 'mongodb';
import { index, type CollectionSpec } from '../schema-dsl.js';

// ADR 0087: the seller's deposit share reads this auction's forfeit and share
// journals (at payout and in the commit-time check), so ledger_journals gets
// an index on auctionId and type. No document or validator change.
export const LEDGER_AUCTION_INDEX = index(
  { auctionId: 1, type: 1 },
  'ledger_journals_auction_type_idx',
);

export function withLedgerAuctionIndex(spec: CollectionSpec): CollectionSpec {
  if (spec.name !== 'ledger_journals') return spec;
  return { ...spec, indexes: [...spec.indexes, LEDGER_AUCTION_INDEX] };
}

export function createLedgerAuctionIndexMigration(previous: CollectionSpec[]) {
  const collections = previous
    .filter((s) => s.name === 'ledger_journals')
    .map(withLedgerAuctionIndex);
  if (collections.length !== 1) throw new Error('0076: missing ledger_journals spec');
  return {
    id: '0076-ledger-auction-index',
    definition: { collections, policy: 'ledger-auction-index-v1' },
    async up(db: Db, _client: MongoClient) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
    },
  };
}
