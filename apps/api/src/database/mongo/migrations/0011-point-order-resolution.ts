import type { Db, Document } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import { auctionCollectionSpecs } from './0008-auctions.js';
import { pointCollectionChangedSpecs } from './0010-point-collection.js';
import {
  AUCTION_PAYMENT_MS,
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
  or,
  plusMs,
  t,
  type CollectionSpec,
} from '../schema-dsl.js';

// Independent Admin resolution of a ViaPoint Order in ResolutionPending
// (FR-H09, FR-AU08/09). The book is still at the point in that state, so the
// decision is either a full refund of the Order hold (Order Cancelled, the
// commitment returns to the intake for reclaim) or a new collection window.
// A resumed window is measured from `collectionOpenedAt`, so Order versions
// and windows are no longer pinned to the first acceptance.

const pointOrderBase = pointCollectionChangedSpecs.find(
  (s) => s.name === 'point_orders',
)!;
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
      'Cancelled',
      'PaymentExpired',
    ),
    version: t.int(1, 50),
    collectionOpenedAt: t.ndate(),
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
    or(
      and(isNull('paidAt'), isNull('acceptanceDeadline')),
      and(
        notNull('paidAt'),
        gte(f('paidAt'), f('createdAt')),
        { $lt: [f('paidAt'), f('paymentDeadline')] },
        eq(f('acceptanceDeadline'), plusMs('paidAt', RECIPIENT_DECISION_MS)),
      ),
    ),
    or(isNull('acceptedAt'), gte(f('acceptedAt'), f('paidAt'))),
    // The current collection window: first acceptance or an Admin resume.
    or(
      and(isNull('collectionOpenedAt'), isNull('collectionDeadline')),
      and(
        notNull('paidAt'),
        gte(f('collectionOpenedAt'), f('paidAt')),
        gte(
          f('collectionDeadline'),
          plusMs('collectionOpenedAt', COLLECTION_MIN_MS),
        ),
        lte(
          f('collectionDeadline'),
          plusMs('collectionOpenedAt', COLLECTION_MAX_MS),
        ),
      ),
    ),
    or(
      and(isNull('collectedAt'), isNull('inspectionDeadline')),
      and(
        notNull('collectionOpenedAt'),
        gte(f('collectedAt'), f('collectionOpenedAt')),
        { $lt: [f('collectedAt'), f('collectionDeadline')] },
        eq(
          f('inspectionDeadline'),
          plusMs('collectedAt', INSPECTION_WINDOW_MS),
        ),
      ),
    ),
    or(
      and(isNull('resolutionReason'), isNull('resolutionOpenedAt')),
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
        isNull('collectionOpenedAt'),
        isNull('resolutionReason'),
        isNull('closedAt'),
      ),
      and(
        eq(f('state'), 'ReadyForCollection'),
        gte(f('version'), 3),
        notNull('acceptedAt'),
        notNull('collectionOpenedAt'),
        isNull('collectedAt'),
        isNull('resolutionReason'),
        isNull('closedAt'),
      ),
      and(
        eq(f('state'), 'Inspection'),
        gte(f('version'), 4),
        notNull('collectedAt'),
        isNull('resolutionReason'),
        isNull('closedAt'),
      ),
      and(
        eq(f('state'), 'ResolutionPending'),
        gte(f('version'), 3),
        notNull('paidAt'),
        isNull('collectedAt'),
        notNull('resolutionReason'),
        isNull('closedAt'),
      ),
      and(
        eq(f('state'), 'Cancelled'),
        gte(f('version'), 4),
        notNull('paidAt'),
        isNull('collectedAt'),
        notNull('resolutionReason'),
        gte(f('closedAt'), f('paidAt')),
      ),
    ),
  ),
  indexes: [
    ...pointOrderBase.indexes,
    index({ state: 1, resolutionOpenedAt: 1 }, 'point_orders_resolution_idx'),
  ],
};

// Append-only decision record; a refund decision names its ledger journal.
const resolutionSpec: CollectionSpec = {
  name: 'point_order_resolutions',
  access: 'appendOnly',
  schema: document({
    _id: t.uuid(),
    orderId: t.uuid(),
    decision: t.enum('RefundBuyer', 'ResumeCollection'),
    openReason: t.enum(
      'ReportRejected',
      'RecipientDecisionOverdue',
      'CollectionOverdue',
    ),
    reason: t.str(1000),
    adminId: t.uuid(),
    journalId: t.nuuid(),
    decidedAt: t.date(),
    receiptId: t.uuid(),
  }),
  expr: or(
    and(eq(f('decision'), 'RefundBuyer'), notNull('journalId')),
    and(eq(f('decision'), 'ResumeCollection'), isNull('journalId')),
  ),
  indexes: [
    index({ orderId: 1, decidedAt: 1 }, 'point_order_resolutions_order_idx'),
  ],
};

const intakeBase = auctionCollectionSpecs.find(
  (s) => s.name === 'auction_intakes',
)!;
const intakeSpec: CollectionSpec = {
  ...intakeBase,
  schema: document({
    ...(intakeBase.schema.properties as Record<string, Document>),
    reclaimReason: t.nenum(
      'SellerCancelled',
      'InspectionFailed',
      'Unsold',
      'PaymentExpired',
      'AuctionCancelled',
      'OrderCancelled',
    ),
  }),
};

export const resolutionCollectionSpecs = [resolutionSpec];
export const resolutionChangedSpecs = [pointOrderSpec, intakeSpec];
export const withResolutionChanges = (spec: CollectionSpec) =>
  resolutionChangedSpecs.find((s) => s.name === spec.name) ?? spec;

export const pointOrderResolutionMigration = {
  id: '0011-point-order-resolution',
  definition: {
    collections: resolutionCollectionSpecs,
    changed: resolutionChangedSpecs,
  },
  up: async (db: Db) => {
    const orders = db.collection('point_orders');
    await orders.updateMany({ collectionOpenedAt: { $exists: false } }, [
      { $set: { collectionOpenedAt: { $ifNull: ['$acceptedAt', null] } } },
    ]);
    await applyCollectionSpecs(db, [
      ...resolutionCollectionSpecs,
      ...resolutionChangedSpecs,
    ]);
  },
};
