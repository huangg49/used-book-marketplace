import type { Db, Document } from 'mongodb';
import {
  and,
  document,
  eq,
  f,
  index,
  isNull,
  notNull,
  or,
  t,
  unique,
  uniqueWhenSet,
  type CollectionSpec,
} from '../schema-dsl.js';

export const WITHDRAWAL_STATES = [
  'Requested',
  'Approved',
  'Processing',
  'Completed',
  'Rejected',
  'FailedVerified',
  'Refunded',
] as const;
export const WITHDRAWAL_JOURNALS = [
  'WithdrawalHold',
  'WithdrawalPayout',
  'WithdrawalRefund',
] as const;
const amount = {
  bsonType: ['int', 'long', 'double'],
  minimum: 50000,
  maximum: Number.MAX_SAFE_INTEGER,
  multipleOf: 1,
};
export const withdrawalSpecs: CollectionSpec[] = [
  {
    name: 'withdrawals',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      ownerId: t.uuid(),
      ownerName: t.str(120),
      amount,
      reason: t.enum('SaleProceeds', 'Personal', 'Leaving', 'Other'),
      reasonDetail: t.str(500),
      recipient: document({
        bankName: { ...t.str(100), minLength: 2 },
        accountNumber: t.str(30, '^[0-9]{6,30}$'),
        accountHolder: { ...t.str(120), minLength: 2 },
      }),
      holdId: t.uuid(),
      state: t.enum(...WITHDRAWAL_STATES),
      version: t.int(1),
      approverId: t.nuuid(),
      payoutRef: t.nuuid(),
      createdAt: t.date(),
      updatedAt: t.date(),
      lockSeq: t.lockSeq(),
      history: {
        bsonType: 'array',
        minItems: 1,
        maxItems: 200,
        items: document({
          state: t.enum(...WITHDRAWAL_STATES),
          at: t.date(),
          note: t.str(500),
        }),
      },
    }),
    expr: and(
      { $gte: [f('updatedAt'), f('createdAt')] },
      or(
        and(
          eq(f('state'), 'Requested'),
          isNull('approverId'),
          isNull('payoutRef'),
        ),
        and(
          eq(f('state'), 'Approved'),
          notNull('approverId'),
          isNull('payoutRef'),
        ),
        and(
          eq(f('state'), 'Rejected'),
          notNull('approverId'),
          isNull('payoutRef'),
        ),
        and(
          {
            $in: [
              f('state'),
              ['Processing', 'Completed', 'FailedVerified', 'Refunded'],
            ],
          },
          notNull('approverId'),
          notNull('payoutRef'),
        ),
      ),
    ),
    indexes: [
      index({ ownerId: 1, createdAt: 1, _id: 1 }, 'withdrawals_owner_created'),
      index({ state: 1, createdAt: 1, _id: 1 }, 'withdrawals_state_created'),
      unique({ holdId: 1 }, 'withdrawals_hold_unique'),
      uniqueWhenSet('payoutRef', 'withdrawals_payout_unique'),
    ],
  },
  {
    name: 'withdrawal_events',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      withdrawalId: t.uuid(),
      payoutRef: t.uuid(),
      payloadHash: t.sha(),
      outcome: t.enum('Unknown', 'Succeeded', 'FailedVerified'),
      receiptId: t.uuid(),
      receivedAt: t.date(),
    }),
    indexes: [
      index({ withdrawalId: 1, receivedAt: 1 }, 'withdrawal_events_request'),
    ],
  },
];

export function withWithdrawals(spec: CollectionSpec): CollectionSpec {
  const properties = spec.schema.properties as Record<string, Document>;
  if (spec.name === 'wallet_accounts')
    return {
      ...spec,
      schema: {
        ...spec.schema,
        properties: {
          ...properties,
          withdrawalId: t.nuuid(),
          purpose: {
            ...properties.purpose,
            enum: [...properties.purpose.enum, 'WithdrawalHold'],
          },
        },
      },
      expr: or(
        and(spec.expr!, eq({ $ifNull: [f('withdrawalId'), null] }, null)),
        and(
          eq(f('purpose'), 'WithdrawalHold'),
          isNull('ownerId'),
          isNull('orderId'),
          notNull('withdrawalId'),
        ),
      ),
      indexes: [
        ...spec.indexes,
        uniqueWhenSet('withdrawalId', 'wallet_accounts_withdrawal_unique'),
      ],
    };
  if (spec.name === 'ledger_journals')
    return {
      ...spec,
      schema: {
        ...spec.schema,
        properties: {
          ...properties,
          withdrawalId: t.nuuid(),
          type: {
            ...properties.type,
            enum: [...properties.type.enum, ...WITHDRAWAL_JOURNALS],
          },
        },
      },
      expr: or(
        and(spec.expr!, eq({ $ifNull: [f('withdrawalId'), null] }, null)),
        and(
          { $in: [f('type'), [...WITHDRAWAL_JOURNALS]] },
          notNull('withdrawalId'),
          notNull('receiptId'),
          isNull('topupId'),
          isNull('eventId'),
          isNull('orderId'),
          eq({ $ifNull: [f('listingFeeId'), null] }, null),
        ),
      ),
      indexes: [
        ...spec.indexes,
        unique({ withdrawalId: 1, type: 1 }, 'ledger_withdrawal_type_unique', {
          withdrawalId: { $type: 'string' },
        }),
      ],
    };
  if (['mutation_receipts', 'audit_events'].includes(spec.name)) {
    const extend = (node: unknown): unknown => {
      if (Array.isArray(node)) {
        const next = node.map(extend);
        return next.includes('$listingId') && next.includes('$topupId')
          ? [...next, '$withdrawalId']
          : next;
      }
      if (node && typeof node === 'object')
        return Object.fromEntries(
          Object.entries(node).map(([k, v]) => [k, extend(v)]),
        );
      return node;
    };
    return {
      ...spec,
      schema: {
        ...spec.schema,
        properties: { ...properties, withdrawalId: t.nuuid() },
      },
      expr: extend(spec.expr) as Document,
    };
  }
  if (spec.name === 'member_notifications')
    return {
      ...spec,
      schema: {
        ...spec.schema,
        properties: {
          ...properties,
          kind: {
            ...properties.kind,
            enum: [...properties.kind.enum, 'WithdrawalUpdated'],
          },
          targetType: {
            ...properties.targetType,
            enum: [...properties.targetType.enum, 'Withdrawal'],
          },
        },
      },
    };
  return spec;
}
export function createWithdrawalsMigration(previous: CollectionSpec[]) {
  const names = [
    'wallet_accounts',
    'ledger_journals',
    'mutation_receipts',
    'audit_events',
    'member_notifications',
  ];
  const collections = [
    ...previous.filter((s) => names.includes(s.name)).map(withWithdrawals),
    ...withdrawalSpecs,
  ];
  return {
    id: '0060-wallet-withdrawals',
    definition: {
      collections,
      policy: 'simulated-independent-review-reserve-before-approval-v1',
    },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
    },
  };
}
