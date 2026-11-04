import type { Db } from 'mongodb';
import { t, type CollectionSpec } from '../schema-dsl.js';
import { withdrawalSpecs } from './0060-wallet-withdrawals.js';

// Optional for legacy rows: do not reinterpret an in-flight simulator payout.
export function withManualWithdrawals(spec: CollectionSpec): CollectionSpec {
  if (spec.name !== 'withdrawals') return spec;
  return {
    ...spec,
    schema: {
      ...spec.schema,
      properties: {
        ...spec.schema.properties,
        processingMode: t.enum('Manual'),
      },
    },
  };
}
const collections = withdrawalSpecs
  .filter((s) => s.name === 'withdrawals')
  .map(withManualWithdrawals);
export const manualWithdrawalsMigration = {
  id: '0061-manual-wallet-withdrawals',
  definition: {
    collections,
    policy: 'owner-request-manual-admin-approval-completes-wallet-only-v1',
  },
  async up(db: Db) {
    const { applyCollectionSpecs } = await import('./index.js');
    await applyCollectionSpecs(db, collections);
  },
};
