import type { Db, Document } from 'mongodb';
import type { CollectionSpec } from '../schema-dsl.js';
import { pointAdministrationChangedSpecs } from './0022-point-administration.js';
import { withPayments } from './0022-vnpay-wallet-listing-fees.js';
import { withDirectSettlementPrincipal } from './0023-direct-order-settlement-principals.js';
import { withVNPayQuery } from './0024-vnpay-querydr.js';
import { applyCollectionSpecs } from './index.js';

// Both branches have applied, frozen migrations which replace receipt/audit
// validators. Reconcile their schemas after either branch upgrades to the union.
// Preserve exactly one target for VNPay and DirectDelivery worker principals,
// including the optional pointId added by point administration.
export const integratedWalletPointCommandSpecs = pointAdministrationChangedSpecs
  .filter((spec) => ['mutation_receipts', 'audit_events'].includes(spec.name))
  .map(withPayments)
  .map(withDirectSettlementPrincipal)
  .map(withVNPayQuery)
  .map((spec): CollectionSpec => {
    const includePointTarget = (node: unknown): unknown => {
      if (Array.isArray(node)) {
        const next = node.map(includePointTarget);
        return next.includes('$topupId') &&
          next.includes('$listingId') &&
          !next.includes('$pointId')
          ? [...next, '$pointId']
          : next;
      }
      if (node && typeof node === 'object')
        return Object.fromEntries(
          Object.entries(node).map(([key, value]) => [
            key,
            includePointTarget(value),
          ]),
        );
      return node;
    };
    return { ...spec, expr: includePointTarget(spec.expr) as Document };
  });

export const withIntegratedWalletPointCommands = (spec: CollectionSpec) =>
  integratedWalletPointCommandSpecs.find((next) => next.name === spec.name) ??
  spec;

export const integratedWalletPointMigration = {
  id: '0027-wallet-point-command-union',
  definition: integratedWalletPointCommandSpecs,
  async up(db: Db) {
    await applyCollectionSpecs(db, integratedWalletPointCommandSpecs);
  },
};
