import type { Db } from 'mongodb';
import type { CollectionSpec } from '../schema-dsl.js';
import { t } from '../schema-dsl.js';
import { exchangePhase6ChangedSpecs } from './0031-exchange-multi-book.js';
import { applyCollectionSpecs } from './index.js';

// Frozen POL-08 baseline. Do not import mutable runtime policy into a migration.
const INSPECTION_MS = 72 * 3_600_000;
export function withExchangeInspectionDeadlines(
  spec: CollectionSpec,
): CollectionSpec {
  if (spec.name !== 'exchanges') return spec;
  const validDeadline = (side: string) => ({
    $or: [
      { $eq: [{ $ifNull: [`$${side}InspectionDeadline`, null] }, null] },
      {
        $and: [
          { $ne: [{ $ifNull: [`$${side}ReceivedAt`, null] }, null] },
          {
            $gte: [
              `$${side}InspectionDeadline`,
              { $add: [`$${side}ReceivedAt`, INSPECTION_MS] },
            ],
          },
        ],
      },
    ],
  });
  return {
    ...spec,
    expr: {
      $and: [
        spec.expr ?? {},
        validDeadline('initiator'),
        validDeadline('recipient'),
      ],
    },
    schema: {
      ...spec.schema,
      properties: {
        ...spec.schema.properties,
        initiatorInspectionDeadline: t.ndate(),
        recipientInspectionDeadline: t.ndate(),
      },
    },
  };
}
const specs = exchangePhase6ChangedSpecs
  .filter((s) => s.name === 'exchanges')
  .map(withExchangeInspectionDeadlines);

export const exchangeInspectionDeadlinesMigration = {
  id: '0039-exchange-inspection-deadlines',
  definition: {
    specs,
    inspectionMs: INSPECTION_MS,
    backfill: 'active-received-at-v1',
  },
  async up(db: Db) {
    await applyCollectionSpecs(db, specs);
    // Preserve terminal history and already pinned deadlines. Never move money,
    // delete dispute evidence or release books as part of a schema migration.
    await db
      .collection('exchanges')
      .updateMany(
        { status: { $in: ['InTransit', 'Delivered', 'ResolutionPending'] } },
        [
          {
            $set: {
              initiatorInspectionDeadline: {
                $ifNull: [
                  '$initiatorInspectionDeadline',
                  {
                    $cond: [
                      {
                        $ne: [
                          { $ifNull: ['$initiatorReceivedAt', null] },
                          null,
                        ],
                      },
                      {
                        $max: [
                          { $add: ['$initiatorReceivedAt', INSPECTION_MS] },
                          '$inspectionDeadline',
                        ],
                      },
                      null,
                    ],
                  },
                ],
              },
              recipientInspectionDeadline: {
                $ifNull: [
                  '$recipientInspectionDeadline',
                  {
                    $cond: [
                      {
                        $ne: [
                          { $ifNull: ['$recipientReceivedAt', null] },
                          null,
                        ],
                      },
                      {
                        $max: [
                          { $add: ['$recipientReceivedAt', INSPECTION_MS] },
                          '$inspectionDeadline',
                        ],
                      },
                      null,
                    ],
                  },
                ],
              },
            },
          },
          {
            $set: {
              inspectionDeadline: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$initiatorInspectionDeadline', null] },
                      { $ne: ['$recipientInspectionDeadline', null] },
                    ],
                  },
                  {
                    $max: [
                      '$initiatorInspectionDeadline',
                      '$recipientInspectionDeadline',
                    ],
                  },
                  null,
                ],
              },
            },
          },
        ],
      );
  },
};
