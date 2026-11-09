import type { Db } from 'mongodb';
import { withdrawalSpecs } from './0060-wallet-withdrawals.js';
import { withManualWithdrawals } from './0061-manual-wallet-withdrawals.js';
import { withWithdrawalProofReference } from './0063-withdrawal-proofs.js';

const collections = withdrawalSpecs
  .map(withManualWithdrawals)
  .map(withWithdrawalProofReference);

export const withdrawalProofReferenceMigration = {
  id: '0064-withdrawal-proof-reference',
  definition: {
    collections,
    policy: 'apply-withdrawal-proof-reference-validator-v1',
  },
  async up(db: Db) {
    const { applyCollectionSpecs } = await import('./index.js');
    await applyCollectionSpecs(db, collections);
  },
};
