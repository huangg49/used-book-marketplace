import type { Db } from 'mongodb';
import type { CollectionSpec } from '../schema-dsl.js';
import { withSystemOperations } from './0008-auctions.js';
import { paymentChangedSpecs } from './0022-vnpay-wallet-listing-fees.js';
import { applyCollectionSpecs } from './index.js';

// Forward-only repair: 0022 is already applied on the owner's database.
// Keep its checksum and add the existing DirectDelivery worker's principal
// pair without granting any user or HTTP endpoint a system identity.
export function withDirectSettlementPrincipal(spec: CollectionSpec): CollectionSpec {
  if (!['mutation_receipts', 'audit_events'].includes(spec.name)) return spec;
  return withSystemOperations(spec, spec.name === 'mutation_receipts' ? 'operation' : 'action', [['OrderInspectionExpiry', 'settleDirectOrder']]);
}
export const directSettlementPrincipalSpecs = paymentChangedSpecs
  .filter(spec => ['mutation_receipts', 'audit_events'].includes(spec.name))
  .map(withDirectSettlementPrincipal);
export const directSettlementPrincipalMigration = {
  id: '0023-direct-order-settlement-principals',
  definition: directSettlementPrincipalSpecs,
  async up(db: Db) { await applyCollectionSpecs(db, directSettlementPrincipalSpecs); },
};
