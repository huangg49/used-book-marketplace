import type { Db } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import { baselineCollections } from './0001-baseline-schema.js';
import { withDirectDeliveryCompletionChanges } from './0020-direct-delivery-completion.js';
import type { CollectionSpec } from '../schema-dsl.js';

// PostgreSQL-imported Orders predate the delivery completion fields.  Missing
// fields must remain valid for their historical states; the 0020 $expr still
// requires all three fields when an Order enters Inspection or Completed.
const LEGACY_OPTIONAL_FIELDS = new Set([
  'deliveredAt',
  'inspectionDeadline',
  'completedAt',
]);

export const withDirectDeliveryCompletionLegacyShape = (
  spec: CollectionSpec,
): CollectionSpec => {
  if (spec.name !== 'direct_orders') return spec;
  const completed = withDirectDeliveryCompletionChanges(spec);
  return {
    ...completed,
    schema: {
      ...completed.schema,
      required: (completed.schema.required as string[]).filter(
        (field) => !LEGACY_OPTIONAL_FIELDS.has(field),
      ),
    },
  };
};

export const directDeliveryCompletionLegacyShapeMigration = {
  id: '0021-direct-delivery-completion-legacy-shape',
  definition: {
    directOrders: withDirectDeliveryCompletionLegacyShape(
      baselineCollections.find((spec) => spec.name === 'direct_orders')!,
    ),
  },
  async up(db: Db) {
    await applyCollectionSpecs(db, [
      withDirectDeliveryCompletionLegacyShape(
        baselineCollections.find((spec) => spec.name === 'direct_orders')!,
      ),
    ]);
  },
};
