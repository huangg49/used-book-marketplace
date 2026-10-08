import type { Db, Document } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import {
  settlementChangedSpecs,
  settlementCollectionSpecs,
} from './0012-point-order-settlement.js';
import {
  and,
  document,
  eq,
  f,
  index,
  isNull,
  ne,
  notNull,
  oneOf,
  or,
  t,
  unique,
  type CollectionSpec,
} from '../schema-dsl.js';

// Business-rule review of the auction flow (LOCAL-AUCTION-01 FR-H08/H09,
// FR-AU08, SRS §9.3, FR-D01, POL-17):
// - a refund decision states the fault; the allowed decision depends on why
//   the Order is pending, and only a buyer default records a violation;
// - a book refunded as misdescribed goes back to reclaim with its listing
//   sent back to revision (BookMisdescribed);
// - Staff check a returned book against the report; a mismatch is a refused,
//   committed attempt with no custody change and no refund;
// - a dismissed claim no longer blocks a new claim inside the window;
// - verified member violations (non-payment, buyer default) are recorded.

const POST_COLLECTION = ['InspectionClaim', 'ReturnOverdue'];
export const REFUND_FAULTS = ['BookMisdescribed', 'BuyerDefault', 'NoFault'];

const changed = (name: string) =>
  settlementChangedSpecs.find((s) => s.name === name)!;
const created = (name: string) =>
  settlementCollectionSpecs.find((s) => s.name === name)!;

// Decision matrix (also enforced by the service with readable errors):
// - RecipientDecisionOverdue: refund only (buyer default or no fault);
// - ReportRejected: refund as misdescribed / no fault, or resume collection
//   when the rejection is unfounded (no immediate refund for a change of mind);
// - CollectionOverdue: refund (buyer default / no fault) or resume;
// - after the handover: dismiss the claim or require the book back.
const resolutionBase = changed('point_order_resolutions');
const resolutionSpec: CollectionSpec = {
  ...resolutionBase,
  schema: document({
    ...(resolutionBase.schema.properties as Record<string, Document>),
    fault: t.nenum(...REFUND_FAULTS),
  }),
  expr: or(
    and(
      eq(f('decision'), 'RefundBuyer'),
      notNull('journalId'),
      or(
        and(
          eq(f('openReason'), 'RecipientDecisionOverdue'),
          oneOf(f('fault'), ['BuyerDefault', 'NoFault']),
        ),
        and(
          eq(f('openReason'), 'ReportRejected'),
          oneOf(f('fault'), ['BookMisdescribed', 'NoFault']),
        ),
        and(
          eq(f('openReason'), 'CollectionOverdue'),
          oneOf(f('fault'), ['BuyerDefault', 'NoFault']),
        ),
      ),
    ),
    and(
      eq(f('decision'), 'ResumeCollection'),
      oneOf(f('openReason'), ['ReportRejected', 'CollectionOverdue']),
      isNull('journalId'),
      isNull('fault'),
    ),
    and(
      oneOf(f('decision'), ['DismissClaim', 'RequireReturn']),
      oneOf(f('openReason'), POST_COLLECTION),
      isNull('journalId'),
      isNull('fault'),
    ),
  ),
};

// One open claim at a time (the Order state), several over the window.
const claimBase = created('point_order_claims');
const claimSpec: CollectionSpec = {
  ...claimBase,
  indexes: [
    index({ orderId: 1, claimedAt: 1 }, 'point_order_claims_order_idx'),
  ],
};

// Every return attempt is recorded; only an accepted one refunds, once.
const returnBase = created('point_returns');
const returnSpec: CollectionSpec = {
  ...returnBase,
  schema: document({
    ...(returnBase.schema.properties as Record<string, Document>),
    outcome: t.enum('Accepted', 'Refused'),
    journalId: t.nuuid(),
  }),
  expr: and(
    ne(f('staffId'), f('returnedBy')),
    or(
      and(eq(f('outcome'), 'Accepted'), notNull('journalId')),
      and(eq(f('outcome'), 'Refused'), isNull('journalId'), notNull('note')),
    ),
  ),
  indexes: [
    unique({ orderId: 1 }, 'point_returns_accepted_order_key', {
      outcome: 'Accepted',
    }),
    index({ orderId: 1, receivedAt: 1 }, 'point_returns_order_idx'),
  ],
};

const intakeBase = changed('auction_intakes');
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
      'OrderReturned',
      'BookMisdescribed',
    ),
  }),
};

// FR-AU08 / POL-17: verified violations only. A late worker or an Admin
// "no fault" finding never records one.
const violationSpec: CollectionSpec = {
  name: 'member_violations',
  access: 'appendOnly',
  schema: document({
    _id: t.uuid(),
    userId: t.uuid(),
    kind: t.enum('AuctionNonPayment', 'PointOrderBuyerDefault'),
    sourceId: t.uuid(),
    recordedAt: t.date(),
    receiptId: t.uuid(),
  }),
  indexes: [
    unique({ kind: 1, sourceId: 1 }, 'member_violations_source_key'),
    index({ userId: 1, recordedAt: -1 }, 'member_violations_user_idx'),
  ],
};

export const rulesCollectionSpecs = [violationSpec];
export const rulesChangedSpecs = [
  resolutionSpec,
  claimSpec,
  returnSpec,
  intakeSpec,
];
export const withRulesChanges = (spec: CollectionSpec) =>
  rulesChangedSpecs.find((s) => s.name === spec.name) ?? spec;

export const auctionBusinessRulesMigration = {
  id: '0013-auction-business-rules',
  definition: {
    collections: rulesCollectionSpecs,
    changed: rulesChangedSpecs,
    dropped: [
      'point_order_claims.point_order_claims_order_id_key',
      'point_returns.point_returns_order_id_key',
    ],
  },
  up: async (db: Db) => {
    // Decisions made before this rule carry no stated fault.
    await db
      .collection('point_order_resolutions')
      .updateMany({ fault: { $exists: false } }, [
        {
          $set: {
            fault: {
              $cond: [{ $eq: ['$decision', 'RefundBuyer'] }, 'NoFault', null],
            },
          },
        },
      ]);
    await db
      .collection('point_returns')
      .updateMany(
        { outcome: { $exists: false } },
        { $set: { outcome: 'Accepted' } },
      );
    for (const [collection, name] of [
      ['point_order_claims', 'point_order_claims_order_id_key'],
      ['point_returns', 'point_returns_order_id_key'],
    ])
      if (await db.collection(collection).indexExists(name))
        await db.collection(collection).dropIndex(name);
    await applyCollectionSpecs(db, [
      ...rulesCollectionSpecs,
      ...rulesChangedSpecs,
    ]);
  },
};
