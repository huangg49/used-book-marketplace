import type { Db } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import type { CollectionSpec } from '../schema-dsl.js';
import { document, t } from '../schema-dsl.js';
import { exchangePhase3ChangedSpecs } from './0018-exchanges-proposal-expiry.js';

const OPTIONAL_COMPLETION_FIELDS = new Set([
  'inspectionDeadline',
  'completedAt',
  'initiatorAddress',
  'recipientAddress',
  'initiatorShipment',
  'recipientShipment',
]);

export const withExchangePhase4Changes = (
  spec: CollectionSpec,
): CollectionSpec => {
  if (spec.name !== 'exchanges') return spec;
  const existingProps = spec.schema.properties as Record<string, unknown>;
  const rawSchema = document({
    ...existingProps,
    inspectionDeadline: t.ndate(),
    completedAt: t.ndate(),
    initiatorAddress: t.nobject(),
    recipientAddress: t.nobject(),
    initiatorShipment: t.nobject(),
    recipientShipment: t.nobject(),
  });

  return {
    ...spec,
    schema: {
      ...rawSchema,
      required: (rawSchema.required as string[]).filter(
        (field) => !OPTIONAL_COMPLETION_FIELDS.has(field),
      ),
    },
    indexes: [
      ...spec.indexes,
      {
        key: { status: 1, inspectionDeadline: 1 },
        name: 'exchanges_status_inspection_deadline_idx',
      },
    ],
  };
};

export const exchangePhase4ChangedSpecs = exchangePhase3ChangedSpecs.map(
  withExchangePhase4Changes,
);

export const exchangesPhase4Migration = {
  id: '0022-exchange-completion',
  definition: { collections: exchangePhase4ChangedSpecs },
  async up(db: Db) {
    await applyCollectionSpecs(db, exchangePhase4ChangedSpecs);
  },
};
