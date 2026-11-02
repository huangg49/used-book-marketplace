import type { Db } from 'mongodb';
import type { CollectionSpec } from '../schema-dsl.js';
import { AUCTION_MAX_PRICE, MONEY_MAX } from './auction-constants.js';

// ADR 0067: auction prices, declared values and the ledger amounts they move
// have no business ceiling. Values above int32 are stored by the driver as
// double, so these fields accept every numeric BSON type but stay integral
// and within the exact JavaScript integer range.
const amount = (previous: Record<string, unknown>) => {
  const types = ([] as unknown[]).concat(previous.bsonType ?? []);
  return {
    bsonType: ['int', 'long', 'double', ...(types.includes('null') ? ['null'] : [])],
    ...(previous.minimum !== undefined ? { minimum: previous.minimum } : {}),
    maximum: MONEY_MAX,
    multipleOf: 1,
  };
};

const FIELDS: Record<string, string[]> = {
  auction_intakes: ['startPrice', 'buyNowPrice', 'protectiveValue'],
  auctions: ['startPrice', 'buyNowPrice', 'currentPrice', 'finalPrice'],
  auction_bidders: ['level'],
  auction_bids: ['amount', 'priceBefore', 'priceAfter'],
  point_orders: ['bookPrice', 'buyerTotal', 'commission', 'sellerProceeds'],
  // Incidents snapshot the protective value and may approve up to it.
  point_incidents: [
    'protectedValue',
    'approvedAmount',
    'fundedAmount',
    'unfundedAmount',
  ],
  ledger_entries: ['debit', 'credit'],
};

// The 0008/0009 $expr price range ends in `$lte: [<price>, 1_000_000]`.
const liftCeiling = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(liftCeiling);
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [
      key,
      key === '$lte' && Array.isArray(value) && value[1] === AUCTION_MAX_PRICE
        ? [value[0], MONEY_MAX]
        : liftCeiling(value),
    ]),
  );
};

export function withUncappedAuctionAmounts(
  spec: CollectionSpec,
): CollectionSpec {
  const fields = FIELDS[spec.name];
  if (!fields) return spec;
  const properties = spec.schema.properties as Record<
    string,
    Record<string, unknown>
  >;
  return {
    ...spec,
    schema: {
      ...spec.schema,
      properties: {
        ...properties,
        ...Object.fromEntries(
          fields.map((name) => [name, amount(properties[name])]),
        ),
      },
    },
    ...(spec.expr ? { expr: liftCeiling(spec.expr) as typeof spec.expr } : {}),
  };
}

export function createUncappedAuctionAmountsMigration(
  previous: CollectionSpec[],
) {
  const collections = previous.map(withUncappedAuctionAmounts);
  return {
    id: '0054-uncapped-auction-amounts',
    definition: { collections, policy: 'auction-amounts-safe-integer-v1' },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
    },
  };
}
