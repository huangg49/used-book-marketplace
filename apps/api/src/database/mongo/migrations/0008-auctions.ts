import type { Db, Document } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import { baselineCollections } from './0001-baseline-schema.js';
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
  t,
  unique,
  uniqueWhenSet,
  type CollectionSpec,
} from '../schema-dsl.js';

// Bounded auctions (ADR 0030, LOCAL-AUCTION-01 §6). Adds the two simulated
// HCM points with Staff assignments and capacity slots, the auction intake
// (receipt + inspection at the point), the auction aggregate, one bidder
// projection per participant and the append-only bid history. Workflow
// contexts gain the AuctionIntake kind; receipts/audit accept the auction
// worker principals. Order creation from an auction is a later increment.

import {
  AUCTION_DROPOFF_MS,
  AUCTION_DURATION_MS,
  AUCTION_MAX_PRICE,
  AUCTION_MIN_PRICE,
  AUCTION_PAYMENT_MS,
  BUY_NOW_PAYMENT_MS,
  HANDOVER_POINT_A,
  HANDOVER_POINT_B,
} from './auction-constants.js';
export {
  AUCTION_DROPOFF_MS,
  AUCTION_DURATION_MS,
  AUCTION_MAX_PRICE,
  AUCTION_MIN_PRICE,
  AUCTION_PAYMENT_MS,
  BUY_NOW_PAYMENT_MS,
  HANDOVER_POINT_A,
  HANDOVER_POINT_B,
};

export const handoverPoints = [
  {
    _id: HANDOVER_POINT_A,
    code: 'HCM-DEMO-01',
    name: 'Lật lại — Điểm demo A',
    displayAddress:
      'Bàn tiếp nhận A — không phải địa điểm giao dịch thực tế, TP.HCM',
    serviceAreaCode: 'HCM-DEMO-v1',
    capacity: 20,
    status: 'Active',
    demoOnly: true,
    lockSeq: 0,
  },
  {
    _id: HANDOVER_POINT_B,
    code: 'HCM-DEMO-02',
    name: 'Lật lại — Điểm demo B',
    displayAddress:
      'Bàn tiếp nhận B — không phải địa điểm giao dịch thực tế, TP.HCM',
    serviceAreaCode: 'HCM-DEMO-v1',
    capacity: 20,
    status: 'Active',
    demoOnly: true,
    lockSeq: 0,
  },
];

const AUCTION_SYSTEM_OPERATIONS: [string, string][] = [
  ['AuctionClose', 'closeAuction'],
  ['AuctionPaymentExpiry', 'expireAuctionPayment'],
  ['AuctionIntakeExpiry', 'expireAuctionIntake'],
];

const onGrid = (price: string) =>
  eq({ $mod: [{ $subtract: [f(price), f('startPrice')] }, f('step')] }, 0);
const priceRange = (price: string) =>
  between(f(price), AUCTION_MIN_PRICE, AUCTION_MAX_PRICE);

const handoverPointSpec: CollectionSpec = {
  name: 'handover_points',
  access: 'mutable',
  schema: document({
    _id: t.uuid(),
    code: t.str(40),
    name: t.str(120),
    displayAddress: t.str(300),
    serviceAreaCode: t.enum('HCM-DEMO-v1'),
    capacity: t.int(1, 200),
    status: t.enum('Active', 'Paused', 'Closed'),
    demoOnly: t.bool(),
    lockSeq: t.lockSeq(),
  }),
  indexes: [unique({ code: 1 }, 'handover_points_code_key')],
};

const pointStaffAssignmentSpec: CollectionSpec = {
  name: 'point_staff_assignments',
  access: 'mutable',
  schema: document({
    _id: t.uuid(),
    pointId: t.uuid(),
    userId: t.uuid(),
    validFrom: t.date(),
    validTo: t.ndate(),
    createdAt: t.date(),
  }),
  expr: or(isNull('validTo'), gt(f('validTo'), f('validFrom'))),
  indexes: [
    index({ userId: 1, pointId: 1 }, 'point_staff_assignments_user_point_idx'),
  ],
};

// One unreleased slot per book; count(active) <= capacity under the point lock.
const pointSlotSpec: CollectionSpec = {
  name: 'point_slots',
  access: 'mutable',
  schema: document({
    _id: t.uuid(),
    pointId: t.uuid(),
    listingId: t.uuid(),
    contextId: t.uuid(),
    active: t.bool(),
    reservedAt: t.date(),
    releasedAt: t.ndate(),
    releaseReason: t.nenum('Cancelled', 'Reclaimed'),
    lockSeq: t.lockSeq(),
  }),
  expr: or(
    and(eq(f('active'), true), isNull('releasedAt'), isNull('releaseReason')),
    and(
      eq(f('active'), false),
      notNull('releasedAt'),
      notNull('releaseReason'),
      gte(f('releasedAt'), f('reservedAt')),
    ),
  ),
  indexes: [
    unique({ listingId: 1 }, 'point_slots_one_active_listing', {
      active: true,
    }),
    index({ pointId: 1, active: 1 }, 'point_slots_point_active_idx'),
  ],
};

const INTAKE_STATES = [
  'AwaitingDropoff',
  'Received',
  'Passed',
  'Auctioning',
  'ReclaimRequired',
  'Reclaimed',
  'Cancelled',
];
const RECLAIM_REASONS = [
  'SellerCancelled',
  'InspectionFailed',
  'Unsold',
  'PaymentExpired',
  'AuctionCancelled',
];

const auctionIntakeSpec: CollectionSpec = {
  name: 'auction_intakes',
  access: 'mutable',
  schema: document({
    _id: t.uuid(),
    contextId: t.uuid(),
    listingId: t.uuid(),
    listingRevisionId: t.uuid(),
    sellerId: t.uuid(),
    pointId: t.uuid(),
    slotId: t.uuid(),
    startPrice: t.int(),
    step: t.int(),
    buyNowPrice: t.nint(),
    protectiveValue: t.int(0),
    policyCode: t.enum('HCM-AUCTION-v1'),
    state: t.enum(...INTAKE_STATES),
    version: t.int(1),
    createdAt: t.date(),
    dropoffDeadline: t.date(),
    receivedAt: t.ndate(),
    receivedBy: t.nuuid(),
    shelfCode: t.nstr(40),
    inspectedAt: t.ndate(),
    inspectorId: t.nuuid(),
    inspectionOutcome: t.nenum('Pass', 'Fail'),
    inspectionNote: t.nstr(1000),
    auctionId: t.nuuid(),
    reclaimReason: t.nenum(...RECLAIM_REASONS),
    closedAt: t.ndate(),
    updatedAt: t.date(),
    lockSeq: t.lockSeq(),
  }),
  expr: and(
    priceRange('startPrice'),
    oneOf(f('step'), [10_000, 50_000]),
    or(
      isNull('buyNowPrice'),
      and(
        gt(f('buyNowPrice'), f('startPrice')),
        priceRange('buyNowPrice'),
        onGrid('buyNowPrice'),
      ),
    ),
    eq(f('dropoffDeadline'), plusMs('createdAt', AUCTION_DROPOFF_MS)),
    gte(f('updatedAt'), f('createdAt')),
    // Receipt and inspection are recorded once, in order.
    or(
      and(isNull('receivedAt'), isNull('receivedBy'), isNull('shelfCode')),
      and(notNull('receivedAt'), notNull('receivedBy'), notNull('shelfCode')),
    ),
    or(
      and(
        isNull('inspectedAt'),
        isNull('inspectorId'),
        isNull('inspectionOutcome'),
      ),
      and(
        notNull('receivedAt'),
        gte(f('inspectedAt'), f('receivedAt')),
        notNull('inspectorId'),
        notNull('inspectionOutcome'),
      ),
    ),
    or(
      and(
        eq(f('state'), 'AwaitingDropoff'),
        isNull('receivedAt'),
        isNull('auctionId'),
      ),
      and(
        eq(f('state'), 'Received'),
        notNull('receivedAt'),
        isNull('inspectedAt'),
      ),
      and(
        eq(f('state'), 'Passed'),
        eq(f('inspectionOutcome'), 'Pass'),
        isNull('auctionId'),
      ),
      and(eq(f('state'), 'Auctioning'), notNull('auctionId')),
      and(
        oneOf(f('state'), ['ReclaimRequired', 'Reclaimed']),
        notNull('receivedAt'),
        notNull('reclaimReason'),
      ),
      and(
        eq(f('state'), 'Cancelled'),
        isNull('receivedAt'),
        notNull('closedAt'),
      ),
    ),
    or(
      ne(f('state'), 'Reclaimed'),
      and(notNull('closedAt'), gte(f('closedAt'), f('receivedAt'))),
    ),
  ),
  indexes: [
    unique({ contextId: 1 }, 'auction_intakes_context_id_key'),
    index({ sellerId: 1, state: 1 }, 'auction_intakes_seller_state_idx'),
    index({ pointId: 1, state: 1 }, 'auction_intakes_point_state_idx'),
    index({ state: 1, dropoffDeadline: 1 }, 'auction_intakes_dropoff_idx'),
  ],
};

const AUCTION_STATES = [
  'Active',
  'BuyNowPending',
  'AwaitingWinnerPayment',
  'Unsold',
  'OnHold',
  'Cancelled',
  'PaymentExpired',
];

const auctionSpec: CollectionSpec = {
  name: 'auctions',
  access: 'mutable',
  schema: document({
    _id: t.uuid(),
    intakeId: t.uuid(),
    contextId: t.uuid(),
    listingId: t.uuid(),
    sellerId: t.uuid(),
    pointId: t.uuid(),
    startPrice: t.int(),
    step: t.int(),
    buyNowPrice: t.nint(),
    startAt: t.date(),
    endAt: t.date(),
    state: t.enum(...AUCTION_STATES),
    currentPrice: t.nint(),
    leaderId: t.nuuid(),
    bidderCount: t.int(0),
    bidCount: t.int(0),
    nextSequence: t.int(1),
    winnerId: t.nuuid(),
    finalPrice: t.nint(),
    closedAt: t.ndate(),
    paymentDeadline: t.ndate(),
    cancelReason: t.nstr(1000),
    version: t.int(1),
    updatedAt: t.date(),
    lockSeq: t.lockSeq(),
  }),
  expr: and(
    priceRange('startPrice'),
    oneOf(f('step'), [10_000, 50_000]),
    eq(f('endAt'), plusMs('startAt', AUCTION_DURATION_MS)),
    // Price and leader exist together, on the grid, never under start.
    or(
      and(isNull('currentPrice'), isNull('leaderId'), eq(f('bidderCount'), 0)),
      and(
        notNull('currentPrice'),
        notNull('leaderId'),
        gte(f('currentPrice'), f('startPrice')),
        lte(f('currentPrice'), AUCTION_MAX_PRICE),
        onGrid('currentPrice'),
        gte(f('bidderCount'), 1),
      ),
    ),
    or(
      and(isNull('winnerId'), isNull('finalPrice'), isNull('paymentDeadline')),
      and(
        notNull('winnerId'),
        notNull('finalPrice'),
        notNull('paymentDeadline'),
        ne(f('winnerId'), f('sellerId')),
        oneOf(f('state'), [
          'BuyNowPending',
          'AwaitingWinnerPayment',
          'PaymentExpired',
        ]),
      ),
    ),
    or(
      and(eq(f('state'), 'Active'), isNull('closedAt'), isNull('winnerId')),
      and(eq(f('state'), 'OnHold'), isNull('closedAt'), isNull('winnerId')),
      and(
        eq(f('state'), 'BuyNowPending'),
        eq(f('bidderCount'), 0),
        eq(f('finalPrice'), f('buyNowPrice')),
        eq(f('paymentDeadline'), plusMs('closedAt', BUY_NOW_PAYMENT_MS)),
      ),
      and(
        eq(f('state'), 'AwaitingWinnerPayment'),
        eq(f('winnerId'), f('leaderId')),
        eq(f('finalPrice'), f('currentPrice')),
        eq(f('paymentDeadline'), plusMs('endAt', AUCTION_PAYMENT_MS)),
        gte(f('closedAt'), f('endAt')),
      ),
      and(
        eq(f('state'), 'PaymentExpired'),
        notNull('winnerId'),
        notNull('closedAt'),
      ),
      and(
        eq(f('state'), 'Unsold'),
        eq(f('bidderCount'), 0),
        gte(f('closedAt'), f('endAt')),
      ),
      and(
        eq(f('state'), 'Cancelled'),
        notNull('closedAt'),
        notNull('cancelReason'),
      ),
    ),
  ),
  indexes: [
    unique({ intakeId: 1 }, 'auctions_intake_id_key'),
    index({ state: 1, endAt: 1 }, 'auctions_state_end_at_idx'),
    index({ state: 1, paymentDeadline: 1 }, 'auctions_state_payment_idx'),
  ],
};

// One current commitment per bidder; the max of an Auto bidder is private.
const auctionBidderSpec: CollectionSpec = {
  name: 'auction_bidders',
  access: 'mutable',
  schema: document({
    _id: t.str(),
    auctionId: t.uuid(),
    bidderId: t.uuid(),
    alias: t.int(1),
    mode: t.enum('Manual', 'Auto'),
    level: t.int(AUCTION_MIN_PRICE, AUCTION_MAX_PRICE),
    levelSequence: t.int(1),
    fulfillmentMethod: t.enum('SelfCollect'),
    firstBidAt: t.date(),
    updatedAt: t.date(),
    version: t.int(1),
    lockSeq: t.lockSeq(),
  }),
  expr: and(
    eq(f('_id'), { $concat: [f('auctionId'), ':', f('bidderId')] }),
    gte(f('updatedAt'), f('firstBidAt')),
  ),
  indexes: [
    unique({ auctionId: 1, alias: 1 }, 'auction_bidders_auction_alias_key'),
    index(
      { auctionId: 1, level: -1, levelSequence: 1 },
      'auction_bidders_ranking_idx',
    ),
    index({ bidderId: 1, firstBidAt: -1 }, 'auction_bidders_bidder_idx'),
  ],
};

const auctionBidSpec: CollectionSpec = {
  name: 'auction_bids',
  access: 'appendOnly',
  schema: document({
    _id: t.uuid(),
    auctionId: t.uuid(),
    bidderId: t.uuid(),
    kind: t.enum('Manual', 'AutoSet', 'AutoDisable', 'BuyNow'),
    amount: t.nint(AUCTION_MIN_PRICE, AUCTION_MAX_PRICE),
    levelSequence: t.nint(1),
    priceBefore: t.nint(),
    priceAfter: t.nint(),
    leaderAfter: t.nuuid(),
    receiptId: t.uuid(),
    decidedAt: t.date(),
  }),
  expr: or(
    and(eq(f('kind'), 'AutoDisable'), isNull('amount')),
    and(ne(f('kind'), 'AutoDisable'), notNull('amount')),
  ),
  indexes: [
    index({ auctionId: 1, decidedAt: 1 }, 'auction_bids_auction_idx'),
    index({ bidderId: 1, decidedAt: -1 }, 'auction_bids_bidder_idx'),
    unique({ receiptId: 1 }, 'auction_bids_receipt_id_key'),
  ],
};

export const auctionCollectionSpecs = [
  handoverPointSpec,
  pointStaffAssignmentSpec,
  pointSlotSpec,
  auctionIntakeSpec,
  auctionSpec,
  auctionBidderSpec,
  auctionBidSpec,
];

// ------------------------------------------------- changed baseline specs
const baseline = (name: string) =>
  baselineCollections.find((spec) => spec.name === name)!;

const workflowContextSpec: CollectionSpec = {
  ...baseline('workflow_contexts'),
  schema: document({
    _id: t.uuid(),
    kind: t.enum('Order', 'AuctionIntake'),
    orderId: t.nuuid(),
    auctionIntakeId: t.nuuid(),
    version: t.int(1, 2),
    ownershipPhase: t.enum('Holding', 'Closed'),
    lockSeq: t.lockSeq(),
  }),
  expr: or(
    and(eq(f('kind'), 'Order'), notNull('orderId'), isNull('auctionIntakeId')),
    and(
      eq(f('kind'), 'AuctionIntake'),
      isNull('orderId'),
      notNull('auctionIntakeId'),
    ),
  ),
  indexes: [
    uniqueWhenSet('orderId', 'workflow_contexts_order_id_set_key'),
    uniqueWhenSet('auctionIntakeId', 'workflow_contexts_auction_intake_id_key'),
  ],
};

const commitmentBase = baseline('exclusive_commitments');
const exclusiveCommitmentSpec: CollectionSpec = {
  ...commitmentBase,
  schema: document({
    ...(commitmentBase.schema.properties as Record<string, Document>),
    reason: t.nenum('Cancelled', 'PaymentExpired', 'Reclaimed'),
  }),
};

// The baseline principal rule lists (systemActor, operation) pairs inside an
// $or; append the auction worker pairs there and nowhere else.
function withSystemOperations(spec: CollectionSpec, field: string) {
  const expr = JSON.parse(JSON.stringify(spec.expr)) as Document;
  let found = 0;
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      const pairs = node.filter(
        (x) =>
          (x as Document)?.$and?.[0]?.$eq?.[0] === '$systemActor' &&
          (x as Document)?.$and?.[1]?.$eq?.[0] === f(field),
      );
      if (pairs.length && pairs.length === node.length) {
        found++;
        for (const [actor, op] of AUCTION_SYSTEM_OPERATIONS)
          node.push(and(eq(f('systemActor'), actor), eq(f(field), op)));
        return;
      }
      node.forEach(visit);
    } else if (node && typeof node === 'object')
      Object.values(node).forEach(visit);
  };
  visit(expr);
  if (found !== 1) throw new Error(`Principal rule not found in ${spec.name}`);
  return { ...spec, expr };
}

export const auctionChangedSpecs = [
  workflowContextSpec,
  exclusiveCommitmentSpec,
  withSystemOperations(baseline('mutation_receipts'), 'operation'),
  withSystemOperations(baseline('audit_events'), 'action'),
];

export const withAuctionChanges = (spec: CollectionSpec) =>
  auctionChangedSpecs.find((s) => s.name === spec.name) ?? spec;

export const auctionsMigration = {
  id: '0008-auctions',
  definition: {
    collections: auctionCollectionSpecs,
    changed: auctionChangedSpecs,
    handoverPoints,
  },
  up: async (db: Db) => {
    await db
      .collection('workflow_contexts')
      .updateMany(
        { auctionIntakeId: { $exists: false } },
        { $set: { auctionIntakeId: null } },
      );
    const contexts = db.collection('workflow_contexts');
    if (await contexts.indexExists('workflow_contexts_order_id_key'))
      await contexts.dropIndex('workflow_contexts_order_id_key');
    await applyCollectionSpecs(db, [
      ...auctionCollectionSpecs,
      ...auctionChangedSpecs,
    ]);
    const points = db.collection<Document & { _id: string }>('handover_points');
    for (const point of handoverPoints)
      await points.updateOne(
        { _id: point._id },
        { $setOnInsert: point },
        { upsert: true },
      );
  },
};
