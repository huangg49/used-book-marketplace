import type { Db } from 'mongodb';
import type { CollectionSpec } from '../schema-dsl.js';
import { document, t } from '../schema-dsl.js';
import { exchangeMutualCancellationSpecs } from './0045-exchange-mutual-cancellation.js';

const book = document({
  listingId: t.uuid(),
  listingVersion: t.int(1),
  revisionId: t.uuid(),
  ownerId: t.uuid(),
  ownerDisplayName: t.str(),
  bookId: t.uuid(),
  catalogRevisionId: t.uuid(),
  book: {
    ...document({
      title: t.str(300),
      authors: {
        bsonType: 'array',
        minItems: 1,
        maxItems: 10,
        items: t.str(200),
      },
      publisher: t.nstr(200),
      publicationYear: t.nint(1, 9999),
      language: t.str(35),
      edition: t.nstr(200),
      category: t.str(),
      isbn: t.nstr(),
      categoryId: t.nstr(),
      attributes: t.object(),
      series: t.nstr(),
    }),
    required: [
      'title',
      'authors',
      'publisher',
      'publicationYear',
      'language',
      'edition',
      'category',
      'isbn',
    ],
  },
  condition: t.enum('LikeNew', 'Good', 'Fair', 'Worn'),
  description: t.str(),
  pages: t.str(),
  coverNote: t.str(),
  notes: t.str(),
  accessories: t.str(),
  exchangeValue: t.int(1),
  readable: t.bool(),
  hasMissingPages: t.bool(),
  missingEssentialContent: t.bool(),
  mediaIds: {
    bsonType: 'array',
    minItems: 1,
    maxItems: 8,
    uniqueItems: true,
    items: t.uuid(),
  },
});
const agreement = {
  ...document({
    initiatorBooks: {
      bsonType: 'array',
      minItems: 1,
      maxItems: 5,
      items: book,
    },
    recipientBook: book,
  }),
  bsonType: ['object', 'null'],
};

// Optional for old records: no historical content/price is invented or backfilled.
export function withExchangeAgreement(spec: CollectionSpec): CollectionSpec {
  if (spec.name !== 'exchanges') return spec;
  return {
    ...spec,
    schema: {
      ...spec.schema,
      properties: { ...(spec.schema.properties as object), agreement },
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
          ],
        },
      ],
    },
  };
}
export const exchangeAgreementSpecs = exchangeMutualCancellationSpecs.map(
  withExchangeAgreement,
);
export const exchangeAgreementMigration = {
  id: '0052-exchange-agreement',
  definition: { collections: exchangeAgreementSpecs },
  async up(db: Db) {
    const { applyCollectionSpecs } = await import('./index.js');
    await applyCollectionSpecs(db, exchangeAgreementSpecs);
  },
};
