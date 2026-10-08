import type { Db, Document } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import { baselineCollections } from './0001-baseline-schema.js';
import { auctionCollectionSpecs } from './0008-auctions.js';
import {
  AUCTION_DURATION_MS,
  AUCTION_MAX_PRICE,
  AUCTION_MIN_PRICE,
  AUCTION_PAYMENT_MS,
  BUY_NOW_PAYMENT_MS,
  POINT_ORDER_COMMISSION_BPS,
} from './auction-constants.js';
export { POINT_ORDER_COMMISSION_BPS };
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

// Auction winner payment (ADR 0030 follow-up). A won auction or Buy Now forms
// a ViaPoint Order (`point_orders`) with its own PointOrder workflow context.
// The listing's exclusive commitment moves between contexts without being
// released (Transferred events), so commitments now keep counting versions.
// Auctions gain the Sold outcome and a link to their Order.

const pointOrderSpec: CollectionSpec = {
  name: 'point_orders',
  access: 'mutable',
  schema: document({
    _id: t.uuid(),
    source: t.enum('Auction'),
    auctionId: t.uuid(),
    intakeId: t.uuid(),
    contextId: t.uuid(),
    listingId: t.uuid(),
    buyerId: t.uuid(),
    sellerId: t.uuid(),
    pointId: t.uuid(),
    fulfillmentMethod: t.enum('SelfCollect'),
    bookPrice: t.int(AUCTION_MIN_PRICE, AUCTION_MAX_PRICE),
    outboundFee: t.int(0, 0),
    buyerTotal: t.int(AUCTION_MIN_PRICE),
    commissionBps: t.int(
      POINT_ORDER_COMMISSION_BPS,
      POINT_ORDER_COMMISSION_BPS,
    ),
    commission: t.int(0),
    sellerProceeds: t.int(0),
    state: t.enum('AwaitingPayment', 'Fulfilling', 'PaymentExpired'),
    version: t.int(1, 2),
    createdAt: t.date(),
    paymentDeadline: t.date(),
    paidAt: t.ndate(),
    closedAt: t.ndate(),
    updatedAt: t.date(),
    lockSeq: t.lockSeq(),
  }),
  expr: and(
    ne(f('buyerId'), f('sellerId')),
    eq(f('buyerTotal'), { $add: [f('bookPrice'), f('outboundFee')] }),
    // commission = round(P × 5%) in the application; |20·C − P| <= 10.
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
      and(
        eq(f('state'), 'AwaitingPayment'),
        eq(f('version'), 1),
        isNull('paidAt'),
        isNull('closedAt'),
      ),
      and(
        eq(f('state'), 'Fulfilling'),
        eq(f('version'), 2),
        notNull('paidAt'),
        gte(f('paidAt'), f('createdAt')),
        { $lt: [f('paidAt'), f('paymentDeadline')] },
        isNull('closedAt'),
      ),
      and(
        eq(f('state'), 'PaymentExpired'),
        eq(f('version'), 2),
        isNull('paidAt'),
        gte(f('closedAt'), f('paymentDeadline')),
      ),
    ),
  ),
  indexes: [
    unique({ auctionId: 1 }, 'point_orders_auction_id_key'),
    unique({ contextId: 1 }, 'point_orders_context_id_key'),
    index({ buyerId: 1, createdAt: -1 }, 'point_orders_buyer_idx'),
    index({ sellerId: 1, createdAt: -1 }, 'point_orders_seller_idx'),
  ],
};

// --------------------------------------------- changed collection specs
const baseline = (name: string) =>
  baselineCollections.find((spec) => spec.name === name)!;
const auctionBase = auctionCollectionSpecs.find((s) => s.name === 'auctions')!;

// orderId points at direct_orders for kind Order and at point_orders for kind
// PointOrder; the kind decides which aggregate owns the context.
const workflowContextSpec: CollectionSpec = {
  ...baseline('workflow_contexts'),
  schema: document({
    _id: t.uuid(),
    kind: t.enum('Order', 'AuctionIntake', 'PointOrder'),
    orderId: t.nuuid(),
    auctionIntakeId: t.nuuid(),
    version: t.int(1, 2),
    ownershipPhase: t.enum('Holding', 'Closed'),
    lockSeq: t.lockSeq(),
  }),
  expr: or(
    and(
      oneOf(f('kind'), ['Order', 'PointOrder']),
      notNull('orderId'),
      isNull('auctionIntakeId'),
    ),
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
    version: t.int(1),
    reason: t.nenum('Cancelled', 'PaymentExpired', 'Reclaimed'),
  }),
  expr: or(
    and(eq(f('status'), 'Active'), isNull('endedAt'), isNull('reason')),
    and(
      eq(f('status'), 'Released'),
      gte(f('version'), 2),
      notNull('endedAt'),
      notNull('reason'),
      gte(f('endedAt'), f('acquiredAt')),
    ),
  ),
};

const commitmentEventBase = baseline('commitment_events');
const commitmentEventSpec: CollectionSpec = {
  ...commitmentEventBase,
  schema: document({
    ...(commitmentEventBase.schema.properties as Record<string, Document>),
    sequence: t.int(1),
    kind: t.enum('Acquired', 'Transferred', 'Released'),
  }),
  expr: and(
    eq(f('afterVersion'), f('sequence')),
    eq(f('beforeVersion'), { $subtract: [f('sequence'), 1] }),
    or(
      and(eq(f('kind'), 'Acquired'), eq(f('sequence'), 1)),
      and(oneOf(f('kind'), ['Transferred', 'Released']), gte(f('sequence'), 2)),
    ),
  ),
};

const priceRange = (price: string) =>
  between(f(price), AUCTION_MIN_PRICE, AUCTION_MAX_PRICE);
const onGrid = (price: string) =>
  eq({ $mod: [{ $subtract: [f(price), f('startPrice')] }, f('step')] }, 0);
const auctionSpec: CollectionSpec = {
  ...auctionBase,
  schema: document({
    ...(auctionBase.schema.properties as Record<string, Document>),
    state: t.enum(
      'Active',
      'BuyNowPending',
      'AwaitingWinnerPayment',
      'Sold',
      'Unsold',
      'OnHold',
      'Cancelled',
      'PaymentExpired',
    ),
    orderId: t.nuuid(),
  }),
  expr: and(
    priceRange('startPrice'),
    oneOf(f('step'), [10_000, 50_000]),
    eq(f('endAt'), plusMs('startAt', AUCTION_DURATION_MS)),
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
      and(
        isNull('winnerId'),
        isNull('finalPrice'),
        isNull('paymentDeadline'),
        isNull('orderId'),
      ),
      and(
        notNull('winnerId'),
        notNull('finalPrice'),
        notNull('paymentDeadline'),
        ne(f('winnerId'), f('sellerId')),
        oneOf(f('state'), [
          'BuyNowPending',
          'AwaitingWinnerPayment',
          'Sold',
          'PaymentExpired',
        ]),
      ),
    ),
    or(
      and(eq(f('state'), 'Active'), isNull('closedAt'), isNull('winnerId')),
      and(eq(f('state'), 'OnHold'), isNull('closedAt'), isNull('winnerId')),
      and(
        eq(f('state'), 'BuyNowPending'),
        notNull('orderId'),
        eq(f('bidderCount'), 0),
        eq(f('finalPrice'), f('buyNowPrice')),
        eq(f('paymentDeadline'), plusMs('closedAt', BUY_NOW_PAYMENT_MS)),
      ),
      and(
        eq(f('state'), 'AwaitingWinnerPayment'),
        notNull('orderId'),
        eq(f('winnerId'), f('leaderId')),
        eq(f('finalPrice'), f('currentPrice')),
        eq(f('paymentDeadline'), plusMs('endAt', AUCTION_PAYMENT_MS)),
        gte(f('closedAt'), f('endAt')),
      ),
      and(eq(f('state'), 'Sold'), notNull('orderId'), notNull('closedAt')),
      and(eq(f('state'), 'PaymentExpired'), notNull('closedAt')),
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
    ...auctionBase.indexes,
    uniqueWhenSet('orderId', 'auctions_order_id_key'),
  ],
};

export const pointOrderChangedSpecs = [
  workflowContextSpec,
  exclusiveCommitmentSpec,
  commitmentEventSpec,
  auctionSpec,
];
export const pointOrderCollectionSpecs = [pointOrderSpec];

export const withPointOrderChanges = (spec: CollectionSpec) =>
  pointOrderChangedSpecs.find((s) => s.name === spec.name) ?? spec;

export const pointOrdersMigration = {
  id: '0009-point-orders',
  definition: {
    collections: pointOrderCollectionSpecs,
    changed: pointOrderChangedSpecs,
  },
  up: async (db: Db) => {
    await db
      .collection('auctions')
      .updateMany({ orderId: { $exists: false } }, { $set: { orderId: null } });
    await applyCollectionSpecs(db, [
      ...pointOrderCollectionSpecs,
      ...pointOrderChangedSpecs,
    ]);
  },
};
