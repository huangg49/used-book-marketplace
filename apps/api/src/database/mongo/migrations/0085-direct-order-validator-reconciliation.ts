import type { Db } from 'mongodb';
import type { CollectionSpec } from '../schema-dsl.js';

// An older demo migration can arrive after 0083 was already applied and
// replace its direct_orders validator. Restore the final schema in both orders.
export function createDirectOrderValidatorReconciliationMigration(
  directOrderSpec: CollectionSpec,
) {
  const collections = [directOrderSpec];
  return {
    id: '0085-direct-order-validator-reconciliation',
    definition: { collections },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
    },
  };
}
