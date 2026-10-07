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
  Cancelled: ['Sold'],
  PaymentExpired: ['PaymentExpired'],
};

export async function checkPointOrder(tx: Tx, orderId: string) {
  const o = await tx.c.point_orders.findOne({ _id: orderId });
  if (!o) return;
  const open = o.state !== 'PaymentExpired' && o.state !== 'Cancelled';
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
  // Only an Admin RefundBuyer decision returns the hold, and only once.
  const refunds = await tx.c.ledger_journals.countDocuments({
    orderId: o._id,
    type: 'OrderRefund',
  });
  const refundDecisions = await tx.c.point_order_resolutions.countDocuments({
    orderId: o._id,
    decision: 'RefundBuyer',
  });
  const cancelled = o.state === 'Cancelled';
  if (
    held !== (o.paidAt && !cancelled ? o.buyerTotal : 0) ||
    payments !== (o.paidAt ? 1 : 0) ||
    refunds !== (cancelled ? 1 : 0) ||
    refundDecisions !== (cancelled ? 1 : 0)
  )
    fail('order funding mismatch');
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
