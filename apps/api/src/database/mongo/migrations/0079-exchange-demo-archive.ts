import type { Db } from 'mongodb';
import { t, type CollectionSpec } from '../schema-dsl.js';

export function withExchangeDemoArchive(spec: CollectionSpec): CollectionSpec {
  if (spec.name !== 'exchanges') return spec;
  return {
    ...spec,
    schema: {
      ...spec.schema,
      properties: { ...spec.schema.properties, demoArchivedAt: t.date() },
    },
  };
}

export function createExchangeDemoArchiveMigration(previous: CollectionSpec) {
  const collections = [withExchangeDemoArchive(previous)];
  return {
    id: '0079-exchange-demo-archive',
    definition: { collections },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
    },
  };
}
