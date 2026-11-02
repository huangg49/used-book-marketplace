import type { Db, Document } from 'mongodb';
import type { CollectionSpec } from '../schema-dsl.js';

export const FREE_SHIPPING_POLICY = 'DIRECT-FREE-SHIPPING-v1';

// Extend the latest validators without modifying historical migration checksums.
export function withFreeShipping(spec: CollectionSpec): CollectionSpec {
  if (spec.name === 'point_order_deliveries') {
    const next = structuredClone(spec);
    next.schema.properties.outboundFee.minimum = 0;
    return next;
  }
  if (spec.name !== 'point_orders') return spec;
  const relax = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(relax);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key === '$gt' && JSON.stringify(child) === '["$outboundFee",0]'
          ? '$gte'
          : key,
        relax(child),
      ]),
    );
  };
  return { ...spec, expr: relax(spec.expr) as CollectionSpec['expr'] };
}

export function createFreeShippingMigration(previous: CollectionSpec[]) {
  const collections = previous
    .filter((s) => ['point_orders', 'point_order_deliveries'].includes(s.name))
    .map(withFreeShipping);
  return {
    id: '0052-free-shipping',
    definition: {
      collections,
      policyCode: FREE_SHIPPING_POLICY,
      shippingFee: 0,
    },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
      const selection = await db
        .collection<Document & { _id: string }>('sale_quote_policy_selection')
        .findOne({ _id: 'DirectSale' });
      const policy =
        selection &&
        (await db
          .collection<Document & { _id: string }>('sale_quote_policies')
          .findOne({ _id: selection.policyCode }));
      if (!policy)
        throw new Error('DirectSale policy must exist before free shipping');
      await db
        .collection<Document & { _id: string }>('sale_quote_policies')
        .updateOne(
          { _id: FREE_SHIPPING_POLICY },
          {
            $setOnInsert: {
              shippingFee: 0,
              commissionBps: policy.commissionBps,
              ttlSeconds: policy.ttlSeconds,
            },
          },
          { upsert: true },
        );
      await db
        .collection<Document & { _id: string }>('sale_quote_policy_selection')
        .updateOne(
          { _id: 'DirectSale' },
          { $set: { policyCode: FREE_SHIPPING_POLICY } },
        );
      // Old quotes become Changed through policyCode; orders/ledger are untouched.
    },
  };
}
