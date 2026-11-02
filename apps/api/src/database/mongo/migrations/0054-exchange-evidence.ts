import type { Db } from 'mongodb';
import {
  document,
  index,
  unique,
  t,
  type CollectionSpec,
} from '../schema-dsl.js';
export const exchangeEvidenceSpecs: CollectionSpec[] = [
  {
    name: 'exchange_evidence',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      exchangeId: t.uuid(),
      uploaderId: t.uuid(),
      fileName: t.str(120),
      mimeType: t.enum(
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf',
        'video/mp4',
      ),
      byteSize: t.int(1, 100000000),
      sha256: t.sha(),
      reservedBytes: t.int(1, 100000000),
      status: t.enum('Pending', 'Ready'),
      version: t.int(1, 2),
      createdAt: t.date(),
      uploadedAt: t.ndate(),
      createReceiptId: t.uuid(),
      uploadReceiptId: t.nuuid(),
    }),
    expr: {
      $or: [
        {
          $and: [
            { $eq: ['$status', 'Pending'] },
            { $eq: ['$version', 1] },
            { $eq: ['$uploadedAt', null] },
            { $eq: ['$uploadReceiptId', null] },
          ],
        },
        {
          $and: [
            { $eq: ['$status', 'Ready'] },
            { $eq: ['$version', 2] },
            { $ne: ['$uploadedAt', null] },
            { $ne: ['$uploadReceiptId', null] },
          ],
        },
      ],
    },
    indexes: [
      unique(
        { exchangeId: 1, uploaderId: 1, sha256: 1 },
        'exchange_evidence_hash',
      ),
      index({ exchangeId: 1, createdAt: 1 }, 'exchange_evidence_list'),
      index({ uploaderId: 1, createdAt: 1 }, 'exchange_evidence_rate'),
    ],
  },
  {
    name: 'exchange_evidence_assignments',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      assigneeId: t.uuid(),
      version: t.int(1),
      updatedAt: t.date(),
      lockSeq: t.lockSeq(),
    }),
    indexes: [],
  },
];
export const exchangeEvidenceMigration = {
  id: '0054-exchange-evidence',
  definition: { collections: exchangeEvidenceSpecs },
  async up(db: Db) {
    const { applyCollectionSpecs } = await import('./index.js');
    await applyCollectionSpecs(db, exchangeEvidenceSpecs);
  },
};
