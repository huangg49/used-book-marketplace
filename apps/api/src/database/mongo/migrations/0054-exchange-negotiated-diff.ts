import type { Db } from 'mongodb';
import type { CollectionSpec } from '../schema-dsl.js';
import { t } from '../schema-dsl.js';
import { exchangeMutualCancellationSpecs } from './0045-exchange-mutual-cancellation.js';
import { withExchangeAgreement } from './0053-exchange-agreement.js';

export function withNegotiatedDiff(spec: CollectionSpec): CollectionSpec {
  if (spec.name !== 'exchanges') return spec;
  const withAgreement = withExchangeAgreement(spec);
  return {
    ...withAgreement,
    schema: {
      ...withAgreement.schema,
      properties: {
        ...(withAgreement.schema.properties as object),
        negotiatedDiffAmount: t.nint(0),
      },
    },
    expr: {
      $and: [
        spec.expr ?? {},
        {
          $or: [
            { $eq: [{ $ifNull: ['$agreement', null] }, null] },
            {
              $and: [
                {
                  $eq: [
                    '$agreement.initiatorBooks.listingId',
                    {
                      $ifNull: [
                        '$initiatorListingIds',
                        ['$initiatorListingId'],
                      ],
                    },
                  ],
                },
                {
                  $eq: [
                    '$agreement.recipientBook.listingId',
                    '$recipientListingId',
                  ],
                },
                { $eq: ['$agreement.recipientBook.ownerId', '$recipientId'] },
                {
                  $allElementsTrue: {
                    $map: {
                      input: { $ifNull: ['$agreement.initiatorBooks', []] },
                      as: 'b',
                      in: { $eq: ['$$b.ownerId', '$initiatorId'] },
                    },
                  },
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
                {
                  $or: [
                    // Case A: Unnegotiated - strictly mathematical difference between deposits
                    {
                      $and: [
                        { $eq: [{ $ifNull: ['$negotiatedDiffAmount', null] }, null] },
                        {
                          $eq: [
                            '$diffAmount',
                            {
                              $abs: {
                                $subtract: ['$initiatorDeposit', '$recipientDeposit'],
                              },
                            },
                          ],
                        },
                        {
                          $eq: [
                            '$diffPayerId',
                            {
                              $cond: [
                                { $eq: ['$initiatorDeposit', '$recipientDeposit'] },
                                null,
                                {
                                  $cond: [
                                    { $gt: ['$initiatorDeposit', '$recipientDeposit'] },
                                    '$initiatorId',
                                    '$recipientId',
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                    // Case B: Negotiated - custom diffAmount agrees with negotiatedDiffAmount
                    {
                      $and: [
                        { $ne: [{ $ifNull: ['$negotiatedDiffAmount', null] }, null] },
                        { $eq: ['$diffAmount', '$negotiatedDiffAmount'] },
                        { $gte: ['$diffAmount', 0] },
                        {
                          $eq: [
                            '$diffPayerId',
                            {
                              $cond: [
                                { $eq: ['$diffAmount', 0] },
                                null,
                                {
                                  $cond: [
                                    { $gt: ['$initiatorDeposit', '$recipientDeposit'] },
                                    '$initiatorId',
                                    '$recipientId',
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

export const exchangeNegotiatedDiffSpecs = exchangeMutualCancellationSpecs
  .filter((spec) => spec.name === 'exchanges')
  .map(withNegotiatedDiff);

export const exchangeNegotiatedDiffMigration = {
  id: '0054-exchange-negotiated-diff',
  definition: { collections: exchangeNegotiatedDiffSpecs },
  async up(db: Db) {
    const { applyCollectionSpecs } = await import('./index.js');
    await applyCollectionSpecs(db, exchangeNegotiatedDiffSpecs);
  },
};
