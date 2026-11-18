import type { Db } from 'mongodb';
import { and, document, eq, f, gte, isNull, lt, notNull, or, plusMs, t, unique, type CollectionSpec } from '../schema-dsl.js';

export const directDeliveryJourneySpec: CollectionSpec = {
  name: 'direct_order_journey_events',
  access: 'appendOnly',
  schema: document({
    _id: t.str(64),
    orderId: t.uuid(),
    actorId: t.uuid(),
    action: t.enum('Pickup', 'OutForDelivery', 'Deliver', 'Acknowledge', 'ReportNonReceipt', 'ReportCondition', 'SkipInspection'),
    occurredAt: t.date(),
    receiptId: t.uuid(),
    supportCaseId: t.nuuid(),
  }),
  expr: and(
    eq(f('_id'), { $concat: [f('orderId'), ':', f('action')] }),
    or(
      and({ $in: [f('action'), ['ReportNonReceipt', 'ReportCondition']] }, notNull('supportCaseId')),
      and({ $not: [{ $in: [f('action'), ['ReportNonReceipt', 'ReportCondition']] }] }, isNull('supportCaseId')),
    ),
  ),
  indexes: [
    unique({ orderId: 1, action: 1 }, 'direct_order_journey_order_action_key'),
    unique({ receiptId: 1 }, 'direct_order_journey_receipt_key'),
  ],
};

export function withDirectOrderDeliveryJourney(spec: CollectionSpec): CollectionSpec {
  if (spec.name === 'conversation_terms') {
    return {
      ...spec,
      schema: { ...spec.schema, properties: { ...spec.schema.properties, listedPriceAccepted: t.bool() } },
      expr: and(spec.expr!, or(
        { $ne: [f('listedPriceAccepted'), true] },
        and(eq(f('mode'), 'Negotiation'), notNull('agreedPrice'), notNull('agreedListingRevisionId')),
      )),
    };
  }
  if (spec.name !== 'direct_orders') return spec;
  const inspectionOutcome = and(
    eq(f('version'), 6),
    notNull('paidAt'), gte(f('paidAt'), f('createdAt')), lt(f('paidAt'), f('paymentDeadline')),
    eq(f('sellerConfirmationDeadline'), plusMs('paidAt', 48 * 3600000)),
    isNull('cancellationRequestedAt'), isNull('cancellationReason'),
    notNull('deliveredAt'), gte(f('deliveredAt'), f('paidAt')),
    eq(f('inspectionDeadline'), plusMs('deliveredAt', 72 * 3600000)),
    or(
      and(eq(f('state'), 'ResolutionPending'), isNull('completedAt'), isNull('closedAt')),
      and(eq(f('state'), 'Completed'), notNull('completedAt'), eq(f('completedAt'), f('closedAt')),
        gte(f('completedAt'), f('deliveredAt')), lt(f('completedAt'), f('inspectionDeadline'))),
    ),
  );
  return { ...spec, expr: or(spec.expr!, inspectionOutcome) };
}

export function createDirectOrderDeliveryJourneyMigration(previous: CollectionSpec[]) {
  const collections = [...previous.map(withDirectOrderDeliveryJourney), directDeliveryJourneySpec];
  return {
    id: '0083-direct-order-delivery-journey',
    definition: { collections },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
    },
  };
}
