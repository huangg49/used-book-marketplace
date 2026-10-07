import type { Tx } from '../../database/mongo/transaction.js';
import type { PointOrderState } from '../../database/mongo/documents.js';
import { pointOrderContext } from '../reservations/workflow-context.js';
import { balanceOf } from '../wallet/ledger.service.js';
import { checkIntake } from './auction-invariants.js';

// Commit-time shape of a ViaPoint Order formed by an auction (migration 0009):
// context, frozen snapshot, auction outcome, commitment owner and Order hold.
const fail = (message: string): never => {
  throw new Error(`Point order invariant: ${message}`);
};
const AUCTION_STATE: Record<PointOrderState, readonly string[]> = {
  AwaitingPayment: ['BuyNowPending', 'AwaitingWinnerPayment'],
  Fulfilling: ['Sold'],
  ReadyForCollection: ['Sold'],
  Inspection: ['Sold'],
  ResolutionPending: ['Sold'],
  ReturnPending: ['Sold'],
  Completed: ['Sold'],
  Cancelled: ['Sold'],
  PaymentExpired: ['PaymentExpired'],
};

export async function checkPointOrder(tx: Tx, orderId: string) {
  const o = await tx.c.point_orders.findOne({ _id: orderId });
  if (!o) return;
  const open = !['PaymentExpired', 'Cancelled', 'Completed'].includes(o.state);
  const c = pointOrderContext(
    await tx.c.workflow_contexts.findOne({ _id: o.contextId }),
  );
  if (
    !c ||
    c.orderId !== o._id ||
    c.ownershipPhase !== (open ? 'Holding' : 'Closed') ||
    c.version !== (open ? 1 : 2)
  )
    fail('order/context mismatch');
  const item = await tx.c.workflow_items.findOne({
    _id: `${o.contextId}:${o.listingId}`,
  });
  const agreement = await tx.c.agreement_snapshots.findOne({
    _id: o.contextId,
  });
  const amounts = (agreement?.snapshot as { amounts?: { buyerTotal?: number } })
    ?.amounts;
  if (!item || amounts?.buyerTotal !== o.buyerTotal)
    fail('order snapshot mismatch');
  const a = await tx.c.auctions.findOne({ _id: o.auctionId });
  if (
    !a ||
    a.orderId !== o._id ||
    a.intakeId !== o.intakeId ||
    a.winnerId !== o.buyerId ||
    a.sellerId !== o.sellerId ||
    a.finalPrice !== o.bookPrice ||
    a.paymentDeadline?.getTime() !== o.paymentDeadline.getTime() ||
    !AUCTION_STATE[o.state].includes(a.state)
  )
    fail('order/auction mismatch');
  const active = await tx.c.exclusive_commitments.findOne({
    listingId: o.listingId,
    status: 'Active',
  });
  if (
    open
      ? active?.currentContextId !== o.contextId
      : active?.currentContextId === o.contextId
  )
    fail('order commitment owner mismatch');
  const hold = await tx.c.wallet_accounts.findOne({ orderId: o._id });
  const held = hold ? await balanceOf(tx, hold._id) : 0;
  const payments = await tx.c.ledger_journals.countDocuments({
    orderId: o._id,
    type: 'OrderPayment',
  });
  // The hold leaves once: an Admin RefundBuyer decision or a Staff-received
  // return refunds it (Cancelled), or the settlement pays it out (Completed).
  const refunds = await tx.c.ledger_journals.countDocuments({
    orderId: o._id,
    type: 'OrderRefund',
  });
  const settlements = await tx.c.ledger_journals.countDocuments({
    orderId: o._id,
    type: 'OrderSettlement',
  });
  const refundDecisions = await tx.c.point_order_resolutions.countDocuments({
    orderId: o._id,
    decision: 'RefundBuyer',
  });
  // Refused return attempts change nothing; only an accepted one refunds.
  const returns = await tx.c.point_returns.countDocuments({
    orderId: o._id,
    outcome: 'Accepted',
  });
  const cancelled = o.state === 'Cancelled';
  const completed = o.state === 'Completed';
  if (
    held !== (o.paidAt && !cancelled && !completed ? o.buyerTotal : 0) ||
    payments !== (o.paidAt ? 1 : 0) ||
    refunds !== (cancelled ? 1 : 0) ||
    settlements !== (completed ? 1 : 0) ||
    refundDecisions + returns !== (cancelled ? 1 : 0) ||
    returns !== (o.returnedAt ? 1 : 0)
  )
    fail('order funding mismatch');
  // A collection window without the buyer's acceptance was opened by an
  // Admin ResumeCollection decision; nothing else may skip the acceptance.
  if (
    o.collectionOpenedAt &&
    !o.acceptedAt &&
    !(await tx.c.point_order_resolutions.findOne({
      orderId: o._id,
      decision: 'ResumeCollection',
    }))
  )
    fail('collection opened without acceptance or Admin decision');
  // Claims come from the buyer inside the inspection window; each one is
  // either decided or the single open claim (FR-D01).
  const claims = await tx.c.point_order_claims
    .find({ orderId: o._id })
    .toArray();
  const claimDecisions = await tx.c.point_order_resolutions.countDocuments({
    orderId: o._id,
    openReason: 'InspectionClaim',
  });
  const openClaim =
    o.state === 'ResolutionPending' && o.resolutionReason === 'InspectionClaim';
  if (
    claims.length !== claimDecisions + (openClaim ? 1 : 0) ||
    claims.some(
      (c) =>
        c.claimantId !== o.buyerId ||
        !o.collectedAt ||
        c.claimedAt < o.collectedAt ||
        c.claimedAt >= o.inspectionDeadline!,
    )
  )
    fail('order claim mismatch');
  // Custody leaves the point exactly once, with the handover that set
  // collectedAt; at most one live collection code exists per Order.
  const handovers = await tx.c.point_handovers
    .find({ orderId: o._id })
    .toArray();
  if (
    handovers.length !== (o.collectedAt ? 1 : 0) ||
    (handovers[0] &&
      (handovers[0].handedOverAt.getTime() !== o.collectedAt!.getTime() ||
        handovers[0].recipientId !== o.buyerId ||
        handovers[0].pointId !== o.pointId))
  )
    fail('order handover mismatch');
  const live = await tx.c.collection_codes.countDocuments({
    orderId: o._id,
    live: true,
  });
  if (live > (o.state === 'ReadyForCollection' ? 1 : 0))
    fail('collection code outside the collection window');
  tx.check(`auction-intake:${o.intakeId}`, () => checkIntake(tx, o.intakeId));
}
