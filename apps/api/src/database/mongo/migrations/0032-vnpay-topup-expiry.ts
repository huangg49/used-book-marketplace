import type { Db, Document } from 'mongodb';
import { document, index, t, type CollectionSpec } from '../schema-dsl.js';
import { baselineCollections } from './0001-baseline-schema.js';
import { integratedWalletPointCommandSpecs } from './0027-wallet-point-command-union.js';
import {
  paymentSpecs,
  withPayments,
} from './0022-vnpay-wallet-listing-fees.js';

export function withVNPayExpiry(spec: CollectionSpec): CollectionSpec {
  if (spec.name === 'topup_intents')
    return {
      ...spec,
      schema: document({
        ...(spec.schema.properties as Record<string, Document>),
        state: t.enum(
          'Pending',
          'Processing',
          'Succeeded',
          'Failed',
          'Cancelled',
          'ReviewRequired',
        ),
      }),
    };
  if (spec.name === 'simulated_payment_events')
    return {
      ...spec,
      schema: document({
        ...(spec.schema.properties as Record<string, Document>),
        provider: t.enum(
          'LatLaiSimulator-v1',
          'VNPaySandbox-v1',
          'VNPayExpiry-v1',
        ),
      }),
    };
  if (spec.name === 'vnpay_payments')
    return {
      ...spec,
      indexes: [
        ...spec.indexes,
        index({ expiresAt: 1, _id: 1 }, 'vnpay_payment_expiry_idx'),
      ],
    };
  if (!['mutation_receipts', 'audit_events'].includes(spec.name)) return spec;
  const field = spec.name === 'mutation_receipts' ? '$operation' : '$action';
  const expr = JSON.parse(JSON.stringify(spec.expr)) as Document;
  let found = 0;
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    const value = node as Document;
    if (
      value.$in?.[0] === field &&
      Array.isArray(value.$in[1]) &&
      value.$in[1].includes('applyVNPayIpn')
    ) {
      value.$in[1].push('expireVNPayTopup');
      found++;
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(expr);
  if (found !== 1)
    throw new Error(`VNPay principal rule missing in ${spec.name}`);
  return { ...spec, expr };
}

export const vnpayExpirySpecs = [
  ...integratedWalletPointCommandSpecs,
  ...baselineCollections
    .filter((spec) =>
      ['topup_intents', 'simulated_payment_events'].includes(spec.name),
    )
    .map(withPayments),
  ...paymentSpecs.filter((spec) => spec.name === 'vnpay_payments'),
].map(withVNPayExpiry);

export const vnpayTopupExpiryMigration = {
  id: '0032-vnpay-topup-expiry',
  definition: vnpayExpirySpecs,
  async up(db: Db) {
    const { applyCollectionSpecs } = await import('./index.js');
    await applyCollectionSpecs(db, vnpayExpirySpecs);
  },
};
