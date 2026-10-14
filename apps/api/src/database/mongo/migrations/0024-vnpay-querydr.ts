import type { Db, Document } from 'mongodb';
import type { CollectionSpec } from '../schema-dsl.js';
import { directSettlementPrincipalSpecs } from './0023-direct-order-settlement-principals.js';
import { applyCollectionSpecs } from './index.js';

// Keep all applied definitions/checksums intact. Only the authenticated VNPay
// system principal may apply QueryDR evidence to a topup receipt/audit chain.
export function withVNPayQuery(spec: CollectionSpec): CollectionSpec {
  if (!['mutation_receipts', 'audit_events'].includes(spec.name)) return spec;
  const field = spec.name === 'mutation_receipts' ? '$operation' : '$action';
  const expr = JSON.parse(JSON.stringify(spec.expr)) as Document;
  let found = 0;
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const value = node as Document;
    if (value.$eq?.[0] === field && value.$eq?.[1] === 'applyVNPayIpn') {
      delete value.$eq;
      value.$in = [field, ['applyVNPayIpn', 'applyVNPayQuery']];
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
export const querySpecs = directSettlementPrincipalSpecs.map(withVNPayQuery);
export const vnpayQueryMigration = {
  id: '0024-vnpay-querydr',
  definition: querySpecs,
  async up(db: Db) {
    await applyCollectionSpecs(db, querySpecs);
  },
};
