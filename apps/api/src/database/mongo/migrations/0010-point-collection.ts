import type { Db, Document } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import { pointOrderCollectionSpecs } from './0009-point-orders.js';
import { auctionChangedSpecs, withSystemOperations } from './0008-auctions.js';
import {
  AUCTION_PAYMENT_MS,
  COLLECTION_CODE_TTL_MS,
  INSPECTION_WINDOW_MS,
  RECIPIENT_DECISION_MS,
} from './auction-constants.js';
import {
  and,
  between,
  document,
  eq,
  f,
  gt,
  gte,
  index,
  isNull,
  lte,
  ne,
  notNull,
  oneOf,
  or,
  plusMs,
  SHA256_PATTERN,
  t,
  unique,
  type CollectionSpec,
} from '../schema-dsl.js';

// Collection at the point for ViaPoint Orders (FR-H09, FR-H11, FR-T03;
// POL-32/33/37). After payment the recipient decides on the inspection report
// within 72 h; acceptance opens a collection window; a one-time code entered
// by assigned Staff records the handover and starts the 72 h inspection
// window. Rejection or a missed deadline opens ResolutionPending; nothing is
// auto-accepted or refunded here.

const pointOrderBase = pointOrderCollectionSpecs[0];
const RESOLUTION_REASONS = [
  'ReportRejected',
  'RecipientDecisionOverdue',
  'CollectionOverdue',
];
// A collection deadline is 72 h after acceptance, moved to the next closing
// time when it falls outside point hours (at most about one day later).
const COLLECTION_MIN_MS = 72 * 3_600_000;
const COLLECTION_MAX_MS = COLLECTION_MIN_MS + 34 * 3_600_000;

const pointOrderSpec: CollectionSpec = {
  ...pointOrderBase,
  schema: document({
    ...(pointOrderBase.schema.properties as Record<string, Document>),
    state: t.enum(
      'AwaitingPayment',
      'Fulfilling',
      'ReadyForCollection',
      'Inspection',
      'ResolutionPending',
      'PaymentExpired',
    ),
    version: t.int(1, 4),
    acceptanceDeadline: t.ndate(),
    acceptedAt: t.ndate(),
    collectionDeadline: t.ndate(),
    collectedAt: t.ndate(),
    inspectionDeadline: t.ndate(),
    resolutionReason: t.nenum(...RESOLUTION_REASONS),
    resolutionNote: t.nstr(1000),
    resolutionOpenedAt: t.ndate(),
  }),
  expr: and(
    ne(f('buyerId'), f('sellerId')),
    eq(f('buyerTotal'), { $add: [f('bookPrice'), f('outboundFee')] }),
    between(
      { $multiply: [f('commission'), 20] },
      { $subtract: [f('bookPrice'), 10] },
      { $add: [f('bookPrice'), 10] },
    ),
    eq(f('sellerProceeds'), { $subtract: [f('bookPrice'), f('commission')] }),
    gt(f('paymentDeadline'), f('createdAt')),
    lte(f('paymentDeadline'), plusMs('createdAt', AUCTION_PAYMENT_MS)),
    gte(f('updatedAt'), f('createdAt')),
    // Payment opens the recipient decision window.
    or(
      and(isNull('paidAt'), isNull('acceptanceDeadline')),
      and(
        notNull('paidAt'),
        gte(f('paidAt'), f('createdAt')),
        { $lt: [f('paidAt'), f('paymentDeadline')] },
        eq(f('acceptanceDeadline'), plusMs('paidAt', RECIPIENT_DECISION_MS)),
      ),
    ),
    or(
      and(isNull('acceptedAt'), isNull('collectionDeadline')),
      and(
        notNull('paidAt'),
        gte(f('acceptedAt'), f('paidAt')),
        { $lt: [f('acceptedAt'), f('acceptanceDeadline')] },
        gte(f('collectionDeadline'), plusMs('acceptedAt', COLLECTION_MIN_MS)),
        lte(f('collectionDeadline'), plusMs('acceptedAt', COLLECTION_MAX_MS)),
      ),
    ),
    or(
      and(isNull('collectedAt'), isNull('inspectionDeadline')),
      and(
        notNull('acceptedAt'),
        gte(f('collectedAt'), f('acceptedAt')),
        { $lt: [f('collectedAt'), f('collectionDeadline')] },
        eq(
          f('inspectionDeadline'),
          plusMs('collectedAt', INSPECTION_WINDOW_MS),
        ),
      ),
    ),
    or(
      and(
        isNull('resolutionReason'),
        isNull('resolutionOpenedAt'),
        isNull('resolutionNote'),
      ),
      and(
        notNull('resolutionReason'),
        notNull('resolutionOpenedAt'),
        gte(f('resolutionOpenedAt'), f('paidAt')),
      ),
    ),
    or(
      and(
        eq(f('state'), 'AwaitingPayment'),
        eq(f('version'), 1),
        isNull('paidAt'),
        isNull('closedAt'),
      ),
      and(
        eq(f('state'), 'PaymentExpired'),
        eq(f('version'), 2),
        isNull('paidAt'),
        gte(f('closedAt'), f('paymentDeadline')),
      ),
      and(
        eq(f('state'), 'Fulfilling'),
        eq(f('version'), 2),
        notNull('paidAt'),
        isNull('acceptedAt'),
        isNull('resolutionReason'),
        isNull('closedAt'),
      ),
      and(
        eq(f('state'), 'ReadyForCollection'),
        eq(f('version'), 3),
        notNull('acceptedAt'),
        isNull('collectedAt'),
        isNull('resolutionReason'),
        isNull('closedAt'),
      ),
      and(
        eq(f('state'), 'Inspection'),
        eq(f('version'), 4),
        notNull('collectedAt'),
        isNull('resolutionReason'),
        isNull('closedAt'),
      ),
      and(
        eq(f('state'), 'ResolutionPending'),
        isNull('collectedAt'),
        isNull('closedAt'),
        or(
          and(
            eq(f('version'), 3),
            isNull('acceptedAt'),
            oneOf(f('resolutionReason'), [
              'ReportRejected',
              'RecipientDecisionOverdue',
            ]),
          ),
          and(
            eq(f('version'), 4),
            notNull('acceptedAt'),
            eq(f('resolutionReason'), 'CollectionOverdue'),
          ),
        ),
      ),
    ),
  ),
  indexes: [
    ...pointOrderBase.indexes,
    index(
      { state: 1, acceptanceDeadline: 1 },
      'point_orders_acceptance_deadline_idx',
    ),
    index(
      { state: 1, collectionDeadline: 1 },
      'point_orders_collection_deadline_idx',
    ),
    index({ pointId: 1, state: 1 }, 'point_orders_point_state_idx'),
  ],
};

// One-time collection code (POL-37): only a salted hash is stored; a new
// code revokes the previous unused one. Bound to recipient, book and point.
const collectionCodeSpec: CollectionSpec = {
  name: 'collection_codes',
  access: 'mutable',
  schema: document({
    _id: t.uuid(),
    orderId: t.uuid(),
    recipientId: t.uuid(),
    listingId: t.uuid(),
    pointId: t.uuid(),
    salt: t.str(64, '^[a-f0-9]{32}$'),
    codeHash: t.str(64, SHA256_PATTERN),
    issuedAt: t.date(),
    expiresAt: t.date(),
    live: t.bool(),
    usedAt: t.ndate(),
    revokedAt: t.ndate(),
    receiptId: t.uuid(),
    lockSeq: t.lockSeq(),
  }),
  expr: and(
    eq(f('expiresAt'), plusMs('issuedAt', COLLECTION_CODE_TTL_MS)),
    or(isNull('usedAt'), isNull('revokedAt')),
    eq(f('live'), and(isNull('usedAt'), isNull('revokedAt'))),
    or(isNull('usedAt'), gte(f('usedAt'), f('issuedAt'))),
  ),
  indexes: [
    index({ orderId: 1, issuedAt: -1 }, 'collection_codes_order_idx'),
    unique({ orderId: 1 }, 'collection_codes_one_live_per_order', {
      live: true,
    }),
  ],
};

// Every Staff code entry, kept to enforce 5 wrong attempts per 15 minutes.
const collectionAttemptSpec: CollectionSpec = {
  name: 'collection_attempts',
  access: 'appendOnly',
  schema: document({
    _id: t.uuid(),
    orderId: t.uuid(),
    staffId: t.uuid(),
    codeId: t.nuuid(),
    outcome: t.enum('Accepted', 'WrongCode', 'Expired', 'RateLimited'),
    receiptId: t.uuid(),
    at: t.date(),
  }),
  indexes: [index({ orderId: 1, at: -1 }, 'collection_attempts_order_idx')],
};

// The custody transfer to the recipient; one per Order.
const pointHandoverSpec: CollectionSpec = {
  name: 'point_handovers',
  access: 'appendOnly',
  schema: document({
    _id: t.uuid(),
    orderId: t.uuid(),
    listingId: t.uuid(),
    pointId: t.uuid(),
    recipientId: t.uuid(),
    staffId: t.uuid(),
    codeId: t.uuid(),
    method: t.enum('SelfCollect'),
    handedOverAt: t.date(),
    receiptId: t.uuid(),
  }),
  expr: ne(f('staffId'), f('recipientId')),
  indexes: [unique({ orderId: 1 }, 'point_handovers_order_key')],
};

export const pointCollectionSpecs = [
  collectionCodeSpec,
  collectionAttemptSpec,
  pointHandoverSpec,
];
// The deadline worker may open a resolution task for an unanswered report or
// an uncollected book; it never accepts, refunds or releases anything.
const changedAuctionSpec = (name: string) =>
  auctionChangedSpecs.find((spec) => spec.name === name)!;
const POINT_ORDER_SYSTEM_OPERATIONS: [string, string][] = [
  ['PointOrderDeadline', 'openPointOrderResolution'],
];
export const pointCollectionChangedSpecs = [
  pointOrderSpec,
  withSystemOperations(
    changedAuctionSpec('mutation_receipts'),
    'operation',
    POINT_ORDER_SYSTEM_OPERATIONS,
  ),
  withSystemOperations(
    changedAuctionSpec('audit_events'),
    'action',
    POINT_ORDER_SYSTEM_OPERATIONS,
  ),
];
export const withPointCollectionChanges = (spec: CollectionSpec) =>
  pointCollectionChangedSpecs.find((s) => s.name === spec.name) ?? spec;

const NEW_FIELDS = [
  'acceptanceDeadline',
  'acceptedAt',
  'collectionDeadline',
  'collectedAt',
  'inspectionDeadline',
  'resolutionReason',
  'resolutionNote',
  'resolutionOpenedAt',
];

export const pointCollectionMigration = {
  id: '0010-point-collection',
  definition: {
    collections: pointCollectionSpecs,
    changed: pointCollectionChangedSpecs,
  },
  up: async (db: Db) => {
    const orders = db.collection('point_orders');
    for (const field of NEW_FIELDS)
      await orders.updateMany(
        { [field]: { $exists: false } },
        { $set: { [field]: null } },
      );
    // Orders paid before this migration get their decision window now.
    await orders.updateMany(
      { paidAt: { $ne: null }, acceptanceDeadline: null },
      [
        {
          $set: {
            acceptanceDeadline: { $add: ['$paidAt', RECIPIENT_DECISION_MS] },
          },
        },
      ],
    );
    await applyCollectionSpecs(db, [
      ...pointCollectionSpecs,
      ...pointCollectionChangedSpecs,
    ]);
  },
};
