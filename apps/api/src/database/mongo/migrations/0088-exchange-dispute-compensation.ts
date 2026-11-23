import type { Db } from 'mongodb';
import { t, type CollectionSpec } from '../schema-dsl.js';

export function withExchangeDisputeCompensation(
  spec: CollectionSpec,
): CollectionSpec {
  if (spec.name !== 'exchanges') return spec;
  return {
    ...spec,
    schema: {
      ...spec.schema,
      properties: {
        ...spec.schema.properties,
        resolutionCompensationAmount: t.nint(0),
      },
    },
  };
}

export function createExchangeDisputeCompensationMigration(
  previous: CollectionSpec,
) {
  const collections = [withExchangeDisputeCompensation(previous)];
  return {
    id: '0088-exchange-dispute-compensation',
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
