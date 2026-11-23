import type { Db } from 'mongodb';
import type { CollectionSpec } from '../schema-dsl.js';
import type { ExchangeDoc } from '../documents.js';
import { exchangeAmounts } from '../../../modules/exchanges/exchange-agreement.js';

export function withProportionalExchangeDeposits(spec: CollectionSpec): CollectionSpec {
  if (spec.name !== 'exchanges') return spec;
  const rewrite = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (!value || typeof value !== 'object') return value;
    const record = value as Record<string, unknown>;
    if ('$eq' in record) {
      const pair = record.$eq;
      if (
        Array.isArray(pair) &&
        pair[0] === '$initiatorDeposit' &&
        pair[1] === '$agreement.recipientBook.exchangeValue'
      ) {
        return {
          $eq: [
            '$initiatorDeposit',
            { $sum: '$agreement.initiatorBooks.exchangeValue' },
          ],
        };
      }
      if (
        Array.isArray(pair) &&
        pair[0] === '$recipientDeposit' &&
        typeof pair[1] === 'object' &&
        pair[1] !== null &&
        (pair[1] as Record<string, unknown>).$sum ===
          '$agreement.initiatorBooks.exchangeValue'
      ) {
        return {
          $eq: ['$recipientDeposit', '$agreement.recipientBook.exchangeValue'],
        };
      }
    }
    if ('$gt' in record) {
      const pair = record.$gt;
      if (
        Array.isArray(pair) &&
        pair[0] === '$initiatorDeposit' &&
        pair[1] === '$recipientDeposit'
      ) {
        return { $lt: ['$initiatorDeposit', '$recipientDeposit'] };
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

export function createExchangeProportionalDepositsMigration(previous: CollectionSpec) {
  const collections = [withProportionalExchangeDeposits(previous)];
  return {
    id: '0086-exchange-proportional-deposits',
    definition: { collections, backfill: 'proportionalDepositsV1' },
    async up(db: Db) {
      const { applyCollectionSpecs, currentCollections } = await import('./index.js');
      const currentExchange = currentCollections().find((spec) => spec.name === 'exchanges');
      if (!currentExchange) throw new Error('Expected current Exchange collection spec');
      await applyCollectionSpecs(db, [currentExchange]);
      const exchanges = db.collection<ExchangeDoc>('exchanges');
      // Only backfill exchanges where neither party has locked funds yet so
      // active/historical exchanges stay consistent with immutable Ledger holds.
      for await (const row of exchanges.find({
        agreement: { $ne: null },
        initiatorFundedAt: null,
        recipientFundedAt: null,
        status: { $in: ['Proposed', 'AcceptedAwaitingFunding'] },
      })) {
        if (row.agreement) {
          const amounts = exchangeAmounts(
            row.agreement,
            row.initiatorId,
            row.recipientId,
            row.negotiatedDiffAmount,
            row.diffPayerId,
          );
          if (
            amounts.initiatorDeposit !== row.initiatorDeposit ||
            amounts.recipientDeposit !== row.recipientDeposit ||
            amounts.diffAmount !== row.diffAmount ||
            amounts.diffPayerId !== row.diffPayerId
          ) {
            await exchanges.updateOne(
              { _id: row._id, revision: row.revision },
              {
                $set: {
                  initiatorDeposit: amounts.initiatorDeposit,
                  recipientDeposit: amounts.recipientDeposit,
                  diffAmount: amounts.diffAmount,
                  diffPayerId: amounts.diffPayerId,
                },
              },
            );
          }
        }
      }
    },
  };
}
