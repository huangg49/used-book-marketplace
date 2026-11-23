import type { Db } from 'mongodb';
import type { CollectionSpec } from '../schema-dsl.js';
import type { ExchangeDoc } from '../documents.js';
import { exchangeAmounts } from '../../../modules/exchanges/exchange-agreement.js';

export function withProportionalExchangeDeposits(spec: CollectionSpec): CollectionSpec {
  if (spec.name !== 'exchanges') return spec;
  const exprStr = JSON.stringify(spec.expr);
  const updatedExprStr = exprStr
    .replace(
      '["$initiatorDeposit","$agreement.recipientBook.exchangeValue"]',
      '["$initiatorDeposit",{"$sum":"$agreement.initiatorBooks.exchangeValue"}]',
    )
    .replace(
      '["$recipientDeposit",{"$sum":"$agreement.initiatorBooks.exchangeValue"}]',
      '["$recipientDeposit","$agreement.recipientBook.exchangeValue"]',
    )
    .replace(
      '{"$gt":["$initiatorDeposit","$recipientDeposit"]},"$initiatorId","$recipientId"',
      '{"$lt":["$initiatorDeposit","$recipientDeposit"]},"$initiatorId","$recipientId"',
    );

  return {
    ...spec,
    expr: JSON.parse(updatedExprStr),
  };
}

export function createExchangeProportionalDepositsMigration(previous: CollectionSpec) {
  const collections = [withProportionalExchangeDeposits(previous)];
  return {
    id: '0086-exchange-proportional-deposits',
    definition: { collections, backfill: 'proportionalDepositsV1' },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
      const exchanges = db.collection<ExchangeDoc>('exchanges');
      for await (const row of exchanges.find({ agreement: { $ne: null } })) {
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
