import type { Db } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import type { CollectionSpec } from '../schema-dsl.js';
import { document, t } from '../schema-dsl.js';
import { exchangePhase4ChangedSpecs } from './0022-exchange-completion.js';

const OPTIONAL_COMPLETION_FIELDS = new Set([
  'inspectionDeadline',
  'completedAt',
  'initiatorAddress',
  'recipientAddress',
  'initiatorShipment',
  'recipientShipment',
  'initiatorCompletedAt',
  'recipientCompletedAt',
]);

export const withExchangePhase5Changes = (
  spec: CollectionSpec,
): CollectionSpec => {
  if (spec.name !== 'exchanges') return spec;
  const existingProps = spec.schema.properties as Record<string, unknown>;
  const rawSchema = document({
    ...existingProps,
    initiatorCompletedAt: t.ndate(),
    recipientCompletedAt: t.ndate(),
  });

  return {
    ...spec,
    schema: {
      ...rawSchema,
      required: (rawSchema.required as string[]).filter(
        (field) => !OPTIONAL_COMPLETION_FIELDS.has(field),
      ),
    },
  };
};

export const exchangePhase5ChangedSpecs = exchangePhase4ChangedSpecs.map(
  withExchangePhase5Changes,
);

export const exchangeMutualCompletionMigration = {
  id: '0026-exchange-mutual-completion',
  definition: { collections: exchangePhase5ChangedSpecs },
  async up(db: Db) {
    await applyCollectionSpecs(db, exchangePhase5ChangedSpecs);
  },
};
