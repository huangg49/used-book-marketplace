import type { DirectOrderDoc, DirectOrderJourneyEventDoc, Json } from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import { invalidState } from '../commands/domain-error.js';

export const listedBySeller = (snapshot?: Json | null) =>
  (snapshot as { listedPurchaseBySeller?: boolean } | null | undefined)?.listedPurchaseBySeller === true;

export const journeyEventId = (orderId: string, action: DirectOrderJourneyEventDoc['action']) =>
  `${orderId}:${action}`;

export async function assertInspectionWasSkipped(tx: Tx, order: DirectOrderDoc, receiptId: string, now: Date) {
  const skipped = await tx.c.direct_order_journey_events.findOne({ _id: journeyEventId(order._id, 'SkipInspection') });
  const context = await tx.c.workflow_contexts.findOne({ orderId: order._id });
  const agreement = context ? await tx.c.agreement_snapshots.findOne({ _id: context._id }) : null;
  if (!listedBySeller(agreement?.snapshot) || order.state !== 'Inspection' ||
    !order.inspectionDeadline || now >= order.inspectionDeadline ||
    skipped?.receiptId !== receiptId || skipped.actorId !== order.buyerId ||
    skipped.occurredAt.getTime() !== now.getTime() ||
    await tx.c.direct_order_journey_events.findOne({ orderId: order._id, supportCaseId: { $ne: null } }))
    throw invalidState();
}
