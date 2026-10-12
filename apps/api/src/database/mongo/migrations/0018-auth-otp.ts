import type { Db } from 'mongodb';
import { document, index, t, type CollectionSpec } from '../schema-dsl.js';
import { applyCollectionSpecs } from './index.js';

export const authOtpSpecs: CollectionSpec[] = [
  {
    name: 'auth_otp_challenges',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      userId: t.nuuid(),
      emailHash: t.sha(),
      purpose: t.enum('VerifyEmail', 'ResetPassword'),
      codeHash: t.sha(),
      attempts: t.int(0, 5),
      lockSeq: t.int(0),
      createdAt: t.date(),
      expiresAt: t.date(),
      consumedAt: t.ndate(),
    }),
    indexes: [
      index(
        { emailHash: 1, purpose: 1, createdAt: -1 },
        'auth_otp_email_purpose',
      ),
      index({ userId: 1, purpose: 1, createdAt: -1 }, 'auth_otp_user_purpose'),
      { key: { expiresAt: 1 }, name: 'auth_otp_expiry', expireAfterSeconds: 0 },
    ],
  },
];
export const authOtpMigration = {
  id: '0018-auth-otp',
  definition: authOtpSpecs,
  async up(db: Db) {
    await applyCollectionSpecs(db, authOtpSpecs);
  },
};
