import type { Db } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import { baselineCollections } from './0001-baseline-schema.js';
import type { CollectionSpec } from '../schema-dsl.js';
import { and, document, eq, f, gte, isNull, lt, notNull, or, plusMs, t, unique } from '../schema-dsl.js';

// A DirectDelivery order is only settled after a custody signal starts the
// inspection window.  The existing baseline expression remains valid for all
// historical states; this expression admits only the two new terminal-path
// shapes and therefore cannot loosen the old order protocol.
const INSPECTION_MS = 72 * 60 * 60 * 1000;

const completionShape = and(
  notNull('paidAt'),
  gte(f('paidAt'), f('createdAt')),
  lt(f('paidAt'), f('paymentDeadline')),
  eq(f('sellerConfirmationDeadline'), plusMs('paidAt', 48 * 60 * 60 * 1000)),
  isNull('cancellationRequestedAt'),
  isNull('cancellationReason'),
  notNull('deliveredAt'),
  eq(f('inspectionDeadline'), plusMs('deliveredAt', INSPECTION_MS)),
  or(
    and(
      eq(f('state'), 'Inspection'),
      eq(f('version'), 5),
      isNull('completedAt'),
      isNull('closedAt'),
    ),
    and(
      eq(f('state'), 'Completed'),
      eq(f('version'), 6),
      notNull('completedAt'),
      gte(f('completedAt'), f('inspectionDeadline')),
      eq(f('closedAt'), f('completedAt')),
    ),
  ),
);

export const withDirectDeliveryCompletionChanges = (
  spec: CollectionSpec,
): CollectionSpec => {
  if (spec.name !== 'direct_orders') return spec;
  const properties = spec.schema.properties as Record<string, never>;
  return {
    ...spec,
    schema: document({
      ...properties,
      state: t.enum(
        'AwaitingPayment', 'Cancelled', 'PaymentExpired',
        'PendingSellerConfirmation', 'SettlementPending', 'Preparing',
        'InTransit', 'ResolutionPending', 'Inspection', 'Completed',
      ),
      deliveredAt: t.ndate(),
      inspectionDeadline: t.ndate(),
      completedAt: t.ndate(),
    }),
    expr: or(spec.expr!, completionShape),
    indexes: [
      ...spec.indexes,
      { key: { state: 1, inspectionDeadline: 1, _id: 1 }, name: 'direct_orders_inspection_deadline_idx' },
    ],
  };
};

export const directDeliveryCompletionSpecs: CollectionSpec[] = [
  {
    name: 'direct_delivery_events',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      orderId: t.uuid(),
      shipmentId: t.uuid(),
      source: t.enum('CarrierDelivered', 'BuyerReceived'),
      occurredAt: t.date(),
      receivedAt: t.date(),
      payloadHash: t.sha(),
      signature: t.sha(),
      receiptId: t.uuid(),
    }),
    expr: and(gte(f('receivedAt'), f('occurredAt'))),
    indexes: [
      unique({ orderId: 1 }, 'direct_delivery_events_order_id_key'),
      unique({ receiptId: 1 }, 'direct_delivery_events_receipt_id_key'),
    ],
  },
];

export const directDeliveryCompletionMigration = {
  id: '0020-direct-delivery-completion',
  // Keep the full validator/index definition in the checksum payload.  A
  // migration must not silently accept a changed custody or completion rule.
  definition: {
    inspectionHours: 72,
    directOrders: withDirectDeliveryCompletionChanges(
      baselineCollections.find((spec) => spec.name === 'direct_orders')!,
    ),
    collections: directDeliveryCompletionSpecs,
  },
  async up(db: Db) {
    // New required nullable columns must exist before strict validation is
    // installed; no historical economic or custody value is backfilled.
    await db.collection('direct_orders').updateMany(
      { deliveredAt: { $exists: false } },
      { $set: { deliveredAt: null, inspectionDeadline: null, completedAt: null } },
    );
    await applyCollectionSpecs(db, [
      withDirectDeliveryCompletionChanges(baselineCollections.find((spec) => spec.name === 'direct_orders')!),
      ...directDeliveryCompletionSpecs,
    ]);
  },
};
