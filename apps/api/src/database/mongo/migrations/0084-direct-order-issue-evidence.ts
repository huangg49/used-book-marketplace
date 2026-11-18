import type { Db } from 'mongodb';
import { document, t, unique, type CollectionSpec } from '../schema-dsl.js';

export const directOrderIssueEvidenceSpec: CollectionSpec = {
  name: 'direct_order_issue_evidence',
  access: 'mutable',
  schema: document({
    _id: t.uuid(), caseId: t.uuid(), orderId: t.uuid(), uploaderId: t.uuid(),
    mimeType: t.enum('image/jpeg', 'image/png', 'image/webp', 'video/mp4'),
    byteSize: t.int(1, 8000000), sha256: t.sha(), status: t.enum('Pending', 'Ready'),
    createdAt: t.date(), createdReceiptId: t.uuid(), uploadedAt: t.ndate(), uploadReceiptId: t.nuuid(),
    lockSeq: t.lockSeq(),
  }),
  expr: {
    $or: [
      { $and: [{ $eq: ['$status', 'Pending'] }, { $eq: ['$uploadedAt', null] }, { $eq: ['$uploadReceiptId', null] }] },
      { $and: [{ $eq: ['$status', 'Ready'] }, { $gte: ['$uploadedAt', '$createdAt'] }, { $ne: ['$uploadReceiptId', null] }] },
    ],
  },
  indexes: [unique({ caseId: 1, sha256: 1 }, 'direct_issue_evidence_case_sha_key')],
};

export const directOrderIssueEvidenceMigration = {
  id: '0084-direct-order-issue-evidence',
  definition: { collections: [directOrderIssueEvidenceSpec] },
  async up(db: Db) {
    const { applyCollectionSpecs } = await import('./index.js');
    await applyCollectionSpecs(db, [directOrderIssueEvidenceSpec]);
  },
};
