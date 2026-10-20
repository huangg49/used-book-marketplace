import { isDeepStrictEqual } from 'node:util';
import type { Db, Document, MongoClient } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import { pointOrderCollectionSpecs } from './0009-point-orders.js';
import {
  pointCollectionSpecs,
  withPointCollectionChanges,
} from './0010-point-collection.js';
import {
  resolutionCollectionSpecs,
  withResolutionChanges,
} from './0011-point-order-resolution.js';
import { withSettlementChanges } from './0012-point-order-settlement.js';
import { withRulesChanges } from './0013-auction-business-rules.js';
import { POINT_DELIVERY_MS } from './auction-constants.js';
import {
  and,
  document,
  eq,
  f,
  gt,
  gte,
  HOUR_MS,
  index,
  isNull,
  lt,
  lte,
  notNull,
  oneOf,
  or,
  plusMs,
  t,
  unique,
  type CollectionSpec,
} from '../schema-dsl.js';

// ADR 0044: an auction winner may have the book delivered from the point by
// the simulated carrier. Payment may switch the default SelfCollect to
// CarrierOutbound with a positive outbound fee. After the report is accepted,
// Staff hand the book to the carrier (InTransit), and a carrier Delivered
// event starts the inspection window. A failed or late delivery is resolved
// by a required return to the point.
const INSPECTION = 72 * HOUR_MS;
const TRACKING = '^LL-[A-Z0-9]{8,32}$';
const method = (m: string) => eq(f('fulfillmentMethod'), m);

// Previous clauses, rebuilt exactly as migrations 0009–0012 wrote them.
const oldCollected = or(
  and(isNull('collectedAt'), isNull('inspectionDeadline')),
  and(
    notNull('collectionOpenedAt'),
    gte(f('collectedAt'), f('collectionOpenedAt')),
    lt(f('collectedAt'), f('collectionDeadline')),
    eq(f('inspectionDeadline'), plusMs('collectedAt', INSPECTION)),
  ),
);
const newCollected = or(
  and(isNull('collectedAt'), isNull('inspectionDeadline')),
  and(
    method('SelfCollect'),
    notNull('collectionOpenedAt'),
    gte(f('collectedAt'), f('collectionOpenedAt')),
    lt(f('collectedAt'), f('collectionDeadline')),
    eq(f('inspectionDeadline'), plusMs('collectedAt', INSPECTION)),
  ),
  // Delivered by the carrier: the inspection window starts at delivery.
  and(
    method('CarrierOutbound'),
    notNull('dispatchedAt'),
    gte(f('collectedAt'), f('dispatchedAt')),
    eq(f('inspectionDeadline'), plusMs('collectedAt', INSPECTION)),
  ),
);
const oldReturn = or(
  and(isNull('returnDeadline'), isNull('returnedAt')),
  and(
    notNull('collectedAt'),
    gt(f('returnDeadline'), f('collectedAt')),
    or(
      isNull('returnedAt'),
      and(
        gte(f('returnedAt'), f('collectedAt')),
        lt(f('returnedAt'), f('returnDeadline')),
      ),
    ),
  ),
);
const newReturn = or(
  ...oldReturn.$or,
  // The carrier brings an undelivered book back to the point.
  and(
    isNull('collectedAt'),
    notNull('dispatchedAt'),
    gt(f('returnDeadline'), f('dispatchedAt')),
    or(
      isNull('returnedAt'),
      and(
        gte(f('returnedAt'), f('dispatchedAt')),
        lt(f('returnedAt'), f('returnDeadline')),
      ),
    ),
  ),
);
const oldReady = and(
  eq(f('state'), 'ReadyForCollection'),
  gte(f('version'), 3),
  or(notNull('acceptedAt'), gte(f('version'), 4)),
  notNull('collectionOpenedAt'),
  isNull('collectedAt'),
  isNull('resolutionReason'),
  isNull('closedAt'),
);
const newReady = and(...oldReady.$and, isNull('dispatchedAt'));
const inTransit = and(
  eq(f('state'), 'InTransit'),
  gte(f('version'), 4),
  method('CarrierOutbound'),
  notNull('dispatchedAt'),
  isNull('collectedAt'),
  isNull('resolutionReason'),
  isNull('returnDeadline'),
  isNull('closedAt'),
);
const oldReturnPending = and(
  eq(f('state'), 'ReturnPending'),
  gte(f('version'), 6),
  notNull('collectedAt'),
  notNull('returnDeadline'),
  oneOf(f('resolutionReason'), ['InspectionClaim', 'ReturnOverdue']),
  isNull('returnedAt'),
  isNull('closedAt'),
);
const newReturnPending = and(
  eq(f('state'), 'ReturnPending'),
  gte(f('version'), 6),
  notNull('returnDeadline'),
  or(
    and(
      notNull('collectedAt'),
      oneOf(f('resolutionReason'), ['InspectionClaim', 'ReturnOverdue']),
    ),
    and(
      isNull('collectedAt'),
      notNull('dispatchedAt'),
      eq(f('resolutionReason'), 'DeliveryFailed'),
    ),
  ),
  isNull('returnedAt'),
  isNull('closedAt'),
);
const deliveryFailed = and(
  eq(f('resolutionReason'), 'DeliveryFailed'),
  notNull('dispatchedAt'),
  isNull('collectedAt'),
  gte(f('resolutionOpenedAt'), f('dispatchedAt')),
);
const methodAndFee = or(
  and(method('SelfCollect'), eq(f('outboundFee'), 0)),
  and(method('CarrierOutbound'), gt(f('outboundFee'), 0), notNull('paidAt')),
);
const dispatch = or(
  and(
    isNull('dispatchedAt'),
    isNull('deliveryDeadline'),
    isNull('trackingCode'),
  ),
  and(
    method('CarrierOutbound'),
    notNull('collectionOpenedAt'),
    gte(f('dispatchedAt'), f('collectionOpenedAt')),
    lt(f('dispatchedAt'), f('collectionDeadline')),
    eq(f('deliveryDeadline'), plusMs('dispatchedAt', POINT_DELIVERY_MS)),
    notNull('trackingCode'),
  ),
);

// Replaces exactly one occurrence of `from` in `node`; zero or several stop.
function replaceOnce(node: unknown, from: unknown, to: unknown) {
  let hits = 0;
  const walk = (n: unknown): unknown => {
    if (isDeepStrictEqual(n, from)) {
      hits++;
      return to;
    }
    if (Array.isArray(n)) return n.map(walk);
    if (n && typeof n === 'object')
      return Object.fromEntries(
        Object.entries(n).map(([k, v]) => [k, walk(v)]),
      );
    return n;
  };
  const out = walk(node);
  if (hits !== 1)
    throw new Error(`point_orders expr: expected one clause, found ${hits}`);
  return out;
}
const isResolutionClause = (n: unknown) =>
  JSON.stringify(n).startsWith(
    '{"$or":[{"$and":[{"$eq":["$resolutionReason",null]}',
  );
const isStateClause = (n: unknown) =>
  JSON.stringify(n).startsWith(
    '{"$or":[{"$and":[{"$eq":["$state","AwaitingPayment"]}',
  );

const pointOrders = (spec: CollectionSpec): CollectionSpec => {
  const props = spec.schema.properties as Record<string, Document>;
  let expr: unknown = spec.expr;
  expr = replaceOnce(expr, oldCollected, newCollected);
  expr = replaceOnce(expr, oldReturn, newReturn);
  expr = replaceOnce(expr, oldReady, newReady);
  expr = replaceOnce(expr, oldReturnPending, newReturnPending);
  const clauses = (expr as { $and: Document[] }).$and.map((c) => {
    if (isResolutionClause(c))
      return or(...(c.$or as unknown[]), deliveryFailed);
    if (isStateClause(c)) return or(...(c.$or as unknown[]), inTransit);
    return c;
  });
  if (
    clauses.filter(isResolutionClause).length !== 1 ||
    clauses.filter(isStateClause).length !== 1
  )
    throw new Error('point_orders expr: resolution/state clause not found');
  return {
    ...spec,
    schema: document({
      ...props,
      fulfillmentMethod: t.enum('SelfCollect', 'CarrierOutbound'),
      outboundFee: t.int(0, 1_000_000),
      state: t.enum(...(props.state.enum as string[]), 'InTransit'),
      resolutionReason: t.nenum(
        ...(props.resolutionReason.enum as (string | null)[]).filter(
          (r): r is string => r !== null,
        ),
        'DeliveryFailed',
      ),
      dispatchedAt: t.ndate(),
      deliveryDeadline: t.ndate(),
      trackingCode: t.nstr(40, TRACKING),
    }),
    expr: and(...clauses, methodAndFee, dispatch),
    indexes: [
      ...spec.indexes,
      index(
        { deliveryDeadline: 1, _id: 1 },
        'point_orders_delivery_deadline_idx',
        { deliveryDeadline: { $type: 'date' } },
      ),
    ],
  };
};

// Custody leaves the point once: a code-checked counter handover, or the
// Staff hand-off to the carrier, which has no collection code.
const handovers = (spec: CollectionSpec): CollectionSpec => ({
  ...spec,
  schema: document({
    ...(spec.schema.properties as Record<string, Document>),
    codeId: t.nuuid(),
    method: t.enum('SelfCollect', 'CarrierOutbound'),
  }),
  expr: and(
    spec.expr,
    or(
      and(eq(f('method'), 'SelfCollect'), notNull('codeId')),
      and(eq(f('method'), 'CarrierOutbound'), isNull('codeId')),
    ),
  ),
});

// A failed delivery can only be resolved by requiring the book back.
const resolutions = (spec: CollectionSpec): CollectionSpec => {
  const props = spec.schema.properties as Record<string, Document>;
  return {
    ...spec,
    schema: document({
      ...props,
      openReason: t.enum(
        ...(props.openReason.enum as string[]),
        'DeliveryFailed',
      ),
    }),
    expr: or(
      ...(spec.expr as { $or: unknown[] }).$or,
      and(
        eq(f('decision'), 'RequireReturn'),
        eq(f('openReason'), 'DeliveryFailed'),
        isNull('journalId'),
        isNull('fault'),
      ),
    ),
  };
};

export const withAuctionDelivery = (spec: CollectionSpec): CollectionSpec =>
  spec.name === 'point_orders'
    ? pointOrders(spec)
    : spec.name === 'point_handovers'
      ? handovers(spec)
      : spec.name === 'point_order_resolutions'
        ? resolutions(spec)
        : spec;

// The delivery choice made at payment: address and fee snapshot, never edited.
const deliverySpec: CollectionSpec = {
  name: 'point_order_deliveries',
  access: 'appendOnly',
  schema: document({
    _id: t.uuid(),
    buyerId: t.uuid(),
    addressId: t.uuid(),
    addressVersion: t.int(1),
    recipientName: t.str(200),
    phone: t.str(40),
    serviceAreaCode: t.str(100),
    localityCode: t.str(100),
    detail: t.str(1000),
    policyCode: t.str(100),
    outboundFee: t.int(1, 1_000_000),
    chosenAt: t.date(),
    receiptId: t.uuid(),
  }),
  indexes: [],
};
// Signed simulated carrier outcomes; at most one per Order in v1.
const carrierEventSpec: CollectionSpec = {
  name: 'point_carrier_events',
  access: 'appendOnly',
  schema: document({
    _id: t.uuid(),
    orderId: t.uuid(),
    trackingCode: t.str(40, TRACKING),
    outcome: t.enum('Delivered', 'Failed'),
    occurredAt: t.date(),
    receivedAt: t.date(),
    payloadHash: t.sha(),
    signature: t.str(200),
    receiptId: t.uuid(),
  }),
  expr: lte(f('occurredAt'), f('receivedAt')),
  indexes: [unique({ orderId: 1 }, 'point_carrier_events_order_key')],
};
export const auctionDeliveryCollectionSpecs = [deliverySpec, carrierEventSpec];

const find = (specs: CollectionSpec[], name: string) =>
  specs.find((s) => s.name === name)!;
const previousOrders = find(
  pointOrderCollectionSpecs
    .map(withPointCollectionChanges)
    .map(withResolutionChanges)
    .map(withSettlementChanges),
  'point_orders',
);
const finalOrders = withAuctionDelivery(previousOrders);
const finalHandovers = withAuctionDelivery(
  find(pointCollectionSpecs, 'point_handovers'),
);
const finalResolutions = withAuctionDelivery(
  find(
    resolutionCollectionSpecs.map(withSettlementChanges).map(withRulesChanges),
    'point_order_resolutions',
  ),
);
const NEW_FIELDS = ['dispatchedAt', 'deliveryDeadline', 'trackingCode'];
// Accepts Orders without the new fields while existing ones are backfilled.
const transitionOrders: CollectionSpec = {
  ...finalOrders,
  schema: {
    ...finalOrders.schema,
    required: (finalOrders.schema.required as string[]).filter(
      (field) => !NEW_FIELDS.includes(field),
    ),
  },
  expr: or(
    and(
      { $eq: [{ $type: f('dispatchedAt') }, 'missing'] },
      previousOrders.expr,
    ),
    finalOrders.expr,
  ),
};

export const auctionDeliveryMigration = {
  id: '0034-auction-delivery',
  definition: {
    transition: transitionOrders,
    collections: [
      finalOrders,
      finalHandovers,
      finalResolutions,
      ...auctionDeliveryCollectionSpecs,
    ],
  },
  async up(db: Db, client: MongoClient) {
    await applyCollectionSpecs(db, [transitionOrders]);
    const session = client.startSession();
    try {
      await session.withTransaction(
        async () => {
          await db.collection('point_orders').updateMany(
            { dispatchedAt: { $exists: false } },
            {
              $set: {
                dispatchedAt: null,
                deliveryDeadline: null,
                trackingCode: null,
              },
            },
            { session },
          );
        },
        { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
      );
    } finally {
      await session.endSession();
    }
    await applyCollectionSpecs(db, [
      finalOrders,
      finalHandovers,
      finalResolutions,
      ...auctionDeliveryCollectionSpecs,
    ]);
  },
};
