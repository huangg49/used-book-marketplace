import type { Db } from 'mongodb';
import type { CollectionSpec } from '../schema-dsl.js';
import { withFreeShipping } from './0052-free-shipping.js';

// 0052 (free shipping) and 0054/0056/0057 (auction amounts and steps) each
// collMod point_orders from their own snapshot, so whichever runs last drops
// the other's change. Reapply the combined validator; the transforms touch
// disjoint rules, so their order does not matter.
export function createAuctionFreeShippingReconcileMigration(
  previous: CollectionSpec[],
) {
  const collections = previous
    .filter((spec) => spec.name === 'point_orders')
    .map(withFreeShipping);
  return {
    id: '0059-auction-free-shipping-reconcile',
    definition: { collections },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
    },
  };
}
