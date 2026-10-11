import type { Db } from 'mongodb';
import {
  document,
  index,
  t,
  unique,
  type CollectionSpec,
} from '../schema-dsl.js';
import { applyCollectionSpecs } from './index.js';

export const accountRecoverySpecs: CollectionSpec[] = [
  {
    name: 'auth_action_tokens',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      userId: t.uuid(),
      purpose: t.enum('VerifyEmail', 'ResetPassword'),
      tokenHash: t.sha(),
      createdAt: t.date(),
      expiresAt: t.date(),
      consumedAt: t.ndate(),
    }),
    indexes: [
      unique({ tokenHash: 1 }, 'auth_action_token_hash'),
      index(
        { userId: 1, purpose: 1, createdAt: -1 },
        'auth_action_user_purpose',
      ),
      {
        key: { expiresAt: 1 },
        name: 'auth_action_expiry',
        expireAfterSeconds: 0,
      },
    ],
  },
  {
    name: 'auth_mail_jobs',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      userId: t.uuid(),
      tokenId: t.nuuid(),
      encryptedPayload: t.str(8192),
      status: t.enum('Pending', 'Sending', 'Sent', 'Failed', 'Cancelled'),
      attempts: t.int(0, 8),
      nextAttemptAt: t.date(),
      leaseId: t.nuuid(),
      leaseUntil: t.ndate(),
      expiresAt: t.date(),
      createdAt: t.date(),
      updatedAt: t.date(),
    }),
    indexes: [
      index({ status: 1, nextAttemptAt: 1 }, 'auth_mail_pending'),
      index({ tokenId: 1 }, 'auth_mail_token'),
      {
        key: { expiresAt: 1 },
        name: 'auth_mail_expiry',
        expireAfterSeconds: 86400,
      },
    ],
  },
  {
    name: 'auth_events',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      userId: t.uuid(),
      action: t.enum('Registered', 'EmailVerified', 'PasswordReset'),
      createdAt: t.date(),
    }),
    indexes: [index({ userId: 1, createdAt: -1 }, 'auth_events_user')],
  },
];
export const accountRecoveryMigration = {
  id: '0017-account-recovery',
  definition: accountRecoverySpecs,
  async up(db: Db) {
    await applyCollectionSpecs(db, accountRecoverySpecs);
  },
};
