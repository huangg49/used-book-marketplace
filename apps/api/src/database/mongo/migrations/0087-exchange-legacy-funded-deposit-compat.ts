import type { Db } from 'mongodb';
import type { CollectionSpec } from '../schema-dsl.js';

function isProportionalInitClause(node: unknown): boolean {
  if (!node || typeof node !== 'object' || !('$eq' in node)) return false;
  const pair = (node as { $eq?: unknown }).$eq;
  return (
    Array.isArray(pair) &&
    pair[0] === '$initiatorDeposit' &&
    typeof pair[1] === 'object' &&
    pair[1] !== null &&
    (pair[1] as Record<string, unknown>).$sum ===
      '$agreement.initiatorBooks.exchangeValue'
  );
}

function isProportionalRecipClause(node: unknown): boolean {
  if (!node || typeof node !== 'object' || !('$eq' in node)) return false;
  const pair = (node as { $eq?: unknown }).$eq;
  return (
    Array.isArray(pair) &&
    pair[0] === '$recipientDeposit' &&
    pair[1] === '$agreement.recipientBook.exchangeValue'
  );
}

function flipDepositOrderForLegacy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(flipDepositOrderForLegacy);
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if ('$lt' in record) {
    const pair = record.$lt;
    if (
      Array.isArray(pair) &&
      pair[0] === '$initiatorDeposit' &&
      pair[1] === '$recipientDeposit'
    ) {
      return { $gt: ['$initiatorDeposit', '$recipientDeposit'] };
    }
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, nested]) => [
      key,
      flipDepositOrderForLegacy(nested),
    ]),
  );
}

// Preserves proportional deposits for all new and unfunded exchanges while still
// allowing already-funded or closed legacy cross-deposit exchanges to update
// without contradicting their immutable Ledger holds.
export function withLegacyFundedExchangeDepositCompat(
  spec: CollectionSpec,
): CollectionSpec {
  if (spec.name !== 'exchanges') return spec;
  const rewrite = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (!value || typeof value !== 'object') return value;
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.$and)) {
      const items = record.$and;
      const initIdx = items.findIndex(isProportionalInitClause);
      const recipIdx = items.findIndex(isProportionalRecipClause);
      if (initIdx >= 0 && recipIdx === initIdx + 1 && items[recipIdx + 1]) {
        const propInit = items[initIdx];
        const propRecip = items[recipIdx];
        const propDiff = items[recipIdx + 1];
        const legacyDiff = flipDepositOrderForLegacy(propDiff);
        const combined = {
          $or: [
            { $and: [propInit, propRecip, propDiff] },
            {
              $and: [
                {
                  $or: [
                    { $ne: [{ $ifNull: ['$initiatorFundedAt', null] }, null] },
                    { $ne: [{ $ifNull: ['$recipientFundedAt', null] }, null] },
                    {
                      $in: [
                        '$status',
                        [
                          'Preparing',
                          'InTransit',
                          'Delivered',
                          'ResolutionPending',
                          'Completed',
                          'Cancelled',
                        ],
                      ],
                    },
                  ],
                },
                {
                  $eq: [
                    '$initiatorDeposit',
                    '$agreement.recipientBook.exchangeValue',
                  ],
                },
                {
                  $eq: [
                    '$recipientDeposit',
                    { $sum: '$agreement.initiatorBooks.exchangeValue' },
                  ],
                },
                legacyDiff,
              ],
            },
          ],
        };
        return {
          ...record,
          $and: [
            ...items.slice(0, initIdx).map(rewrite),
            combined,
            ...items.slice(recipIdx + 2).map(rewrite),
          ],
        };
      }
    }
    return Object.fromEntries(
      Object.entries(record).map(([key, nested]) => [key, rewrite(nested)]),
    );
  };
  return {
    ...spec,
    expr: rewrite(spec.expr) as CollectionSpec['expr'],
  };
}

export function createLegacyFundedExchangeDepositCompatMigration(
  previous: CollectionSpec,
) {
  const collections = [withLegacyFundedExchangeDepositCompat(previous)];
  return {
    id: '0087-exchange-legacy-funded-deposit-compat',
    definition: { collections },
    async up(db: Db) {
      const { applyCollectionSpecs, currentCollections } = await import(
        './index.js'
      );
      const currentExchange = currentCollections().find(
        (spec) => spec.name === 'exchanges',
      );
      if (!currentExchange) {
        throw new Error('Expected current Exchange collection spec');
      }
      await applyCollectionSpecs(db, [currentExchange]);
    },
  };
}
