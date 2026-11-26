import type { Db, Document } from 'mongodb';
import type { CollectionSpec } from '../schema-dsl.js';
import { FREE_SHIPPING_POLICY } from './0052-free-shipping.js';

export const POINT_DELIVERY_POLICY = 'POINT-DELIVERY-v1';
export const POINT_DELIVERY_FEE = 30_000;

export function withSplitShippingPolicies(spec: CollectionSpec): CollectionSpec {
  if (spec.name !== 'sale_quote_policy_selection') return spec;
  const next = structuredClone(spec);
  next.schema.properties._id = {
    bsonType: 'string',
    enum: ['DirectSale', 'PointDelivery'],
  };
  return next;
}

export function createSplitShippingPoliciesMigration(
  previousSelectionSpec: CollectionSpec,
) {
  const collections = [withSplitShippingPolicies(previousSelectionSpec)];
  return {
    id: '0093-split-direct-and-point-shipping-policies',
    definition: {
      collections,
      directPolicyCode: FREE_SHIPPING_POLICY,
      pointPolicyCode: POINT_DELIVERY_POLICY,
      pointShippingFee: POINT_DELIVERY_FEE,
    },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);

      const currentSelection = await db
        .collection<Document & { _id: string }>('sale_quote_policy_selection')
        .findOne({ _id: 'DirectSale' });
      const currentPolicy =
        currentSelection &&
        (await db
          .collection<Document & { _id: string }>('sale_quote_policies')
          .findOne({ _id: currentSelection.policyCode }));
      const commissionBps =
        typeof currentPolicy?.commissionBps === 'number'
          ? currentPolicy.commissionBps
          : 500;
      const ttlSeconds =
        typeof currentPolicy?.ttlSeconds === 'number'
          ? currentPolicy.ttlSeconds
          : 300;

      // Direct sales (Buy Now & Negotiated): members ship externally -> 0 VND platform shipping fee.
      await db
        .collection<Document & { _id: string }>('sale_quote_policies')
        .updateOne(
          { _id: FREE_SHIPPING_POLICY },
          {
            $setOnInsert: {
              shippingFee: 0,
              commissionBps,
              ttlSeconds,
            },
          },
          { upsert: true },
        );
      await db
        .collection<Document & { _id: string }>('sale_quote_policy_selection')
        .updateOne(
          { _id: 'DirectSale' },
          { $set: { policyCode: FREE_SHIPPING_POLICY } },
          { upsert: true },
        );

      // Auction outbound delivery from Lật Lại handover point -> 30,000 VND pass-through fee.
      await db
        .collection<Document & { _id: string }>('sale_quote_policies')
        .updateOne(
          { _id: POINT_DELIVERY_POLICY },
          {
            $setOnInsert: {
              shippingFee: POINT_DELIVERY_FEE,
              commissionBps,
              ttlSeconds,
            },
          },
          { upsert: true },
        );
      await db
        .collection<Document & { _id: string }>('sale_quote_policy_selection')
        .updateOne(
          { _id: 'PointDelivery' },
          { $set: { policyCode: POINT_DELIVERY_POLICY } },
          { upsert: true },
        );
    },
  };
}
