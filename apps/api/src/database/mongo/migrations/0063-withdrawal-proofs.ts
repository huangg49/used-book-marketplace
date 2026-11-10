import type { Db } from 'mongodb';
import { document, index, unique, t, type CollectionSpec } from '../schema-dsl.js';
import { withdrawalSpecs } from './0060-wallet-withdrawals.js';
import { withManualWithdrawals } from './0061-manual-wallet-withdrawals.js';

export const withdrawalProofSpecs: CollectionSpec[] = [{
  name: 'withdrawal_proofs',
  access: 'mutable',
  schema: document({
    _id: t.uuid(),
    withdrawalId: t.uuid(),
    uploaderId: t.uuid(),
    mimeType: t.enum('image/jpeg', 'image/png', 'image/webp'),
    byteSize: t.int(1, 10000000),
    sha256: t.sha(),
    reservedBytes: t.int(1, 12000000),
    status: t.enum('Pending', 'Ready'),
    version: t.int(1, 2),
    createdAt: t.date(),
    uploadedAt: t.ndate(),
    derivativeBytes: t.nint(),
    width: t.nint(),
    height: t.nint(),
    createReceiptId: t.uuid(),
    uploadReceiptId: t.nuuid(),
  }),
  expr: {
    $or: [
      {$and: [{ $eq: ['$status', 'Pending'] }, { $eq: ['$version', 1] }, { $eq: ['$uploadedAt', null] }, { $eq: ['$uploadReceiptId', null] }]},
      {$and: [{ $eq: ['$status', 'Ready'] }, { $eq: ['$version', 2] }, { $ne: ['$uploadedAt', null] }, { $ne: ['$uploadReceiptId', null]}]},
    ],
  },
  indexes: [
    unique({ withdrawalId: 1 }, 'withdrawal_proof_one_per_withdrawal'),
    index({ uploaderId: 1, createdAt: 1 }, 'withdrawal_proof_uploader'),
  ],
}];

export function withWithdrawalProofReference(spec: CollectionSpec): CollectionSpec {
  if (spec.name !== 'withdrawals') return spec;
  return {
    ...spec,
    schema: {
      ...spec.schema,
      properties: { ...spec.schema.properties, proofId: t.nuuid() },
    },
  };
}

export const withdrawalProofMigration = {
  id: '0063-withdrawal-proofs',
  definition: {
    collections: [
      ...withdrawalSpecs.map(withManualWithdrawals).map(withWithdrawalProofReference),
      ...withdrawalProofSpecs,
    ],
  },
  async up(db: Db) {
    const { applyCollectionSpecs } = await import('./index.js');
    await applyCollectionSpecs(db, withdrawalProofSpecs);
  },
};
