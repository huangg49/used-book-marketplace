import type { Db } from 'mongodb';
import { document, t, type CollectionSpec } from '../schema-dsl.js';

export function withExchangeOutboundDeliveryVerification(spec: CollectionSpec): CollectionSpec {
  if (spec.name !== 'exchanges') return spec;
  return {
    ...spec,
    schema: {
      ...spec.schema,
      properties: {
        ...(spec.schema.properties as Record<string, unknown>),
        outboundDeliveryVerification: document({
          verifiedAt: t.date(),
          verifiedBy: t.uuid(),
          evidenceId: t.uuid(),
          note: t.str(500),
        }),
      },
    },
  };
}

export function createExchangeOutboundDeliveryMigration(previous: CollectionSpec) {
  const collections = [withExchangeOutboundDeliveryVerification(previous)];
  return {
    id: '0078-exchange-outbound-delivery-verification',
    definition: { collections },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
    },
  };
}
