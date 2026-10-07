import type { Db, Document } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import { baselineCollections } from './0001-baseline-schema.js';
import {
  CAPITAL_ACCOUNT_ID,
  CLEARING_ACCOUNT_ID,
  OPENING_JOURNAL_ID,
} from './0002-reference-data.js';
import {
  auctionCollectionSpecs,
  withSystemOperations,
} from './0008-auctions.js';
import { pointOrderChangedSpecs } from './0009-point-orders.js';
import { pointCollectionChangedSpecs } from './0010-point-collection.js';
import {
  resolutionChangedSpecs,
  resolutionCollectionSpecs,
} from './0011-point-order-resolution.js';
import {
  AUCTION_PAYMENT_MS,
  INSPECTION_WINDOW_MS,
  PLATFORM_COMMISSION_ACCOUNT_ID,
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
  isNull,
  lte,
  ne,
  nonNullCount,
  notNull,
  oneOf,
  or,
  plusMs,
  t,
  unique,
  type CollectionSpec,
} from '../schema-dsl.js';

// Completion of a ViaPoint Order formed by an auction (FR-T03, FR-D01/02,
// SRS §9.1, FR-H02). After the handover the buyer has one inspection window:
// - no claim: the settlement worker posts one OrderSettlement journal from the
//   Order hold (seller P − C, platform C + outbound fee), the listing becomes
//   Sold and the slot, commitment and both contexts close;
// - a claim opens ResolutionPending; an independent Admin dismisses it (back
//   to Inspection, settled after the window) or requires the book back at the
//   point. Staff record the return, which refunds the whole hold and sends the
//   book to the seller's reclaim. A missed return deadline reopens resolution.

export { PLATFORM_COMMISSION_ACCOUNT_ID };

const PRE_COLLECTION = [
  'ReportRejected',
  'RecipientDecisionOverdue',
  'CollectionOverdue',
];
const POST_COLLECTION = ['InspectionClaim', 'ReturnOverdue'];
const COLLECTION_MIN_MS = 72 * 3_600_000;
const COLLECTION_MAX_MS = COLLECTION_MIN_MS + 34 * 3_600_000;

const pointOrderBase = resolutionChangedSpecs.find(
  (s) => s.name === 'point_orders',
)!;
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
      'ReturnPending',
      'Completed',
      'Cancelled',
      'PaymentExpired',
    ),
    resolutionReason: t.nenum(...PRE_COLLECTION, ...POST_COLLECTION),
    returnDeadline: t.ndate(),
    returnedAt: t.ndate(),
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
    // Pre-collection reasons only without a handover; claims only after it.
    or(
      and(isNull('resolutionReason'), isNull('resolutionOpenedAt')),
      and(
        oneOf(f('resolutionReason'), PRE_COLLECTION),
        isNull('collectedAt'),
        gte(f('resolutionOpenedAt'), f('paidAt')),
      ),
      and(
        eq(f('resolutionReason'), 'InspectionClaim'),
        notNull('collectedAt'),
        gte(f('resolutionOpenedAt'), f('collectedAt')),
        { $lt: [f('resolutionOpenedAt'), f('inspectionDeadline')] },
      ),
      and(
        eq(f('resolutionReason'), 'ReturnOverdue'),
        notNull('returnDeadline'),
        gte(f('resolutionOpenedAt'), f('collectedAt')),
      ),
    ),
    // A return is required only after a handover and received at most once.
    or(
      and(isNull('returnDeadline'), isNull('returnedAt')),
      and(
        notNull('collectedAt'),
        gt(f('returnDeadline'), f('collectedAt')),
        or(
          isNull('returnedAt'),
          and(gte(f('returnedAt'), f('collectedAt')), {
            $lt: [f('returnedAt'), f('returnDeadline')],
          }),
        ),
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
        // Opened by the buyer's acceptance (v3) or, without one, by an Admin
        // ResumeCollection decision (checked at commit against its record).
        or(notNull('acceptedAt'), gte(f('version'), 4)),
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
        isNull('returnedAt'),
        isNull('closedAt'),
      ),
      and(
        eq(f('state'), 'ResolutionPending'),
        gte(f('version'), 3),
        notNull('paidAt'),
        notNull('resolutionReason'),
        isNull('returnedAt'),
        isNull('closedAt'),
      ),
      and(
        eq(f('state'), 'ReturnPending'),
        gte(f('version'), 6),
        notNull('collectedAt'),
        notNull('returnDeadline'),
        oneOf(f('resolutionReason'), POST_COLLECTION),
        isNull('returnedAt'),
        isNull('closedAt'),
      ),
      // Settled only once the whole inspection window has passed unclaimed.
      and(
        eq(f('state'), 'Completed'),
        gte(f('version'), 5),
        notNull('collectedAt'),
        isNull('resolutionReason'),
        isNull('returnedAt'),
        gte(f('closedAt'), f('inspectionDeadline')),
      ),
      and(
        eq(f('state'), 'Cancelled'),
        gte(f('version'), 4),
        notNull('paidAt'),
        notNull('resolutionReason'),
        gte(f('closedAt'), f('paidAt')),
        or(
          and(isNull('collectedAt'), isNull('returnedAt')),
          and(notNull('returnedAt'), eq(f('closedAt'), f('returnedAt'))),
        ),
      ),
    ),
  ),
};

// Decisions per opening reason: refund/resume while the book is still at the
// point; dismiss/require return once the buyer has it.
const resolutionBase = resolutionCollectionSpecs[0];
const resolutionSpec: CollectionSpec = {
  ...resolutionBase,
  schema: document({
    ...(resolutionBase.schema.properties as Record<string, Document>),
    decision: t.enum(
      'RefundBuyer',
      'ResumeCollection',
      'DismissClaim',
      'RequireReturn',
    ),
    openReason: t.enum(...PRE_COLLECTION, ...POST_COLLECTION),
  }),
  expr: or(
    and(
      eq(f('decision'), 'RefundBuyer'),
      oneOf(f('openReason'), PRE_COLLECTION),
      notNull('journalId'),
    ),
    and(
      eq(f('decision'), 'ResumeCollection'),
      oneOf(f('openReason'), PRE_COLLECTION),
      isNull('journalId'),
    ),
    and(
      oneOf(f('decision'), ['DismissClaim', 'RequireReturn']),
      oneOf(f('openReason'), POST_COLLECTION),
      isNull('journalId'),
    ),
  ),
};

// The claim text and the Staff return record are append-only evidence.
const claimSpec: CollectionSpec = {
  name: 'point_order_claims',
  access: 'appendOnly',
  schema: document({
    _id: t.uuid(),
    orderId: t.uuid(),
    claimantId: t.uuid(),
    description: t.str(5000),
    claimedAt: t.date(),
    receiptId: t.uuid(),
  }),
  indexes: [unique({ orderId: 1 }, 'point_order_claims_order_id_key')],
};
const returnSpec: CollectionSpec = {
  name: 'point_returns',
  access: 'appendOnly',
  schema: document({
    _id: t.uuid(),
    orderId: t.uuid(),
    pointId: t.uuid(),
    staffId: t.uuid(),
    returnedBy: t.uuid(),
    note: t.nstr(1000),
    journalId: t.uuid(),
    receivedAt: t.date(),
    receiptId: t.uuid(),
  }),
  expr: ne(f('staffId'), f('returnedBy')),
  indexes: [unique({ orderId: 1 }, 'point_returns_order_id_key')],
};

// ----------------------------------------------------- changed collections
const baseline = (name: string) =>
  baselineCollections.find((spec) => spec.name === name)!;

const journalBase = baseline('ledger_journals');
const ledgerJournalSpec: CollectionSpec = {
  ...journalBase,
  schema: document({
    ...(journalBase.schema.properties as Record<string, Document>),
    type: t.enum(
      'OpeningCapital',
      'Topup',
      'OrderPayment',
      'OrderRefund',
      'OrderSettlement',
    ),
  }),
  expr: or(
    and(
      eq(f('type'), 'OpeningCapital'),
      eq(nonNullCount('topupId', 'eventId', 'orderId', 'receiptId'), 0),
      eq(f('_id'), OPENING_JOURNAL_ID),
    ),
    and(
      eq(f('type'), 'Topup'),
      notNull('topupId'),
      notNull('eventId'),
      isNull('orderId'),
      isNull('receiptId'),
    ),
    and(
      oneOf(f('type'), ['OrderPayment', 'OrderRefund', 'OrderSettlement']),
      isNull('topupId'),
      isNull('eventId'),
      notNull('orderId'),
      notNull('receiptId'),
    ),
  ),
};

// One platform commission account (SRS §9.1); only settled fees reach it.
const walletBase = baseline('wallet_accounts');
const walletAccountSpec: CollectionSpec = {
  ...walletBase,
  schema: document({
    ...(walletBase.schema.properties as Record<string, Document>),
    purpose: t.enum(
      'UserAvailable',
      'OrderHold',
      'SimulatorCapital',
      'SimulatorClearing',
      'PlatformCommission',
    ),
  }),
  expr: or(
    and(
      eq(f('purpose'), 'UserAvailable'),
      notNull('ownerId'),
      isNull('orderId'),
    ),
    and(eq(f('purpose'), 'OrderHold'), isNull('ownerId'), notNull('orderId')),
    and(
      isNull('ownerId'),
      isNull('orderId'),
      or(
        and(
          eq(f('purpose'), 'SimulatorCapital'),
          eq(f('_id'), CAPITAL_ACCOUNT_ID),
        ),
        and(
          eq(f('purpose'), 'SimulatorClearing'),
          eq(f('_id'), CLEARING_ACCOUNT_ID),
        ),
        and(
          eq(f('purpose'), 'PlatformCommission'),
          eq(f('_id'), PLATFORM_COMMISSION_ACCOUNT_ID),
        ),
      ),
    ),
  ),
};

const slotBase = auctionCollectionSpecs.find((s) => s.name === 'point_slots')!;
const pointSlotSpec: CollectionSpec = {
  ...slotBase,
  schema: document({
    ...(slotBase.schema.properties as Record<string, Document>),
    releaseReason: t.nenum('Cancelled', 'Reclaimed', 'Sold'),
  }),
};

const commitmentBase = pointOrderChangedSpecs.find(
  (s) => s.name === 'exclusive_commitments',
)!;
const exclusiveCommitmentSpec: CollectionSpec = {
  ...commitmentBase,
  schema: document({
    ...(commitmentBase.schema.properties as Record<string, Document>),
    reason: t.nenum('Cancelled', 'PaymentExpired', 'Reclaimed', 'Completed'),
  }),
};

// The intake of a sold book ends Sold, closed by the settlement.
const intakeBase = resolutionChangedSpecs.find(
  (s) => s.name === 'auction_intakes',
)!;
const intakeSpec: CollectionSpec = {
  ...intakeBase,
  schema: document({
    ...(intakeBase.schema.properties as Record<string, Document>),
    state: t.enum(
      'AwaitingDropoff',
      'Received',
      'Passed',
      'Auctioning',
      'ReclaimRequired',
      'Reclaimed',
      'Cancelled',
      'Sold',
    ),
    reclaimReason: t.nenum(
      'SellerCancelled',
      'InspectionFailed',
      'Unsold',
      'PaymentExpired',
      'AuctionCancelled',
      'OrderCancelled',
      'OrderReturned',
    ),
  }),
  expr: withStateBranch(
    intakeBase.expr!,
    'Auctioning',
    and(
      eq(f('state'), 'Sold'),
      notNull('auctionId'),
      isNull('reclaimReason'),
      gte(f('closedAt'), f('receivedAt')),
    ),
  ),
};

// The intake rule lists one branch per state inside an $or; add the new
// branch next to the existing one and fail loudly if the shape moved.
function withStateBranch(expr: Document, anchor: string, branch: Document) {
  const copy = JSON.parse(JSON.stringify(expr)) as Document;
  let found = 0;
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      const hit = node.some(
        (x) =>
          (x as Document)?.$and?.[0]?.$eq?.[0] === f('state') &&
          (x as Document)?.$and?.[0]?.$eq?.[1] === anchor,
      );
      if (hit) {
        found++;
        node.push(branch);
        return;
      }
      node.forEach(visit);
    } else if (node && typeof node === 'object')
      Object.values(node).forEach(visit);
  };
  visit(copy);
  if (found !== 1) throw new Error('Intake state rule not found');
  return copy;
}

// The settlement worker is the only new system writer.
const SETTLEMENT_SYSTEM_OPERATIONS: [string, string][] = [
  ['PointOrderSettlement', 'settlePointOrder'],
];
const withSettlementOperations = (name: string, field: string) =>
  withSystemOperations(
    pointCollectionChangedSpecs.find((s) => s.name === name)!,
    field,
    SETTLEMENT_SYSTEM_OPERATIONS,
  );

export const settlementCollectionSpecs = [claimSpec, returnSpec];
export const settlementChangedSpecs = [
  pointOrderSpec,
  resolutionSpec,
  ledgerJournalSpec,
  walletAccountSpec,
  pointSlotSpec,
  exclusiveCommitmentSpec,
  intakeSpec,
  withSettlementOperations('mutation_receipts', 'operation'),
  withSettlementOperations('audit_events', 'action'),
];
export const withSettlementChanges = (spec: CollectionSpec) =>
  settlementChangedSpecs.find((s) => s.name === spec.name) ?? spec;

const commissionAccount = {
  _id: PLATFORM_COMMISSION_ACCOUNT_ID,
  ownerId: null,
  orderId: null,
  purpose: 'PlatformCommission',
  currency: 'VND',
};

export const pointOrderSettlementMigration = {
  id: '0012-point-order-settlement',
  definition: {
    collections: settlementCollectionSpecs,
    changed: settlementChangedSpecs,
    reference: [commissionAccount],
  },
  up: async (db: Db) => {
    const orders = db.collection('point_orders');
    for (const field of ['returnDeadline', 'returnedAt'])
      await orders.updateMany(
        { [field]: { $exists: false } },
        { $set: { [field]: null } },
      );
    await applyCollectionSpecs(db, [
      ...settlementCollectionSpecs,
      ...settlementChangedSpecs,
    ]);
    const accounts = db.collection('wallet_accounts');
    if (!(await accounts.findOne({ _id: commissionAccount._id } as never)))
      await accounts.insertOne(commissionAccount as never);
    const locks = db.collection('account_locks');
    if (!(await locks.findOne({ _id: commissionAccount._id } as never)))
      await locks.insertOne({
        _id: commissionAccount._id,
        lockSeq: 0,
      } as never);
  },
};
