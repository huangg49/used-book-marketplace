import type { Tx } from '../../database/mongo/transaction.js';
import { pointOrderContext } from '../reservations/workflow-context.js';
import { balanceOf } from '../wallet/ledger.service.js';
import { checkIntake } from './auction-invariants.js';

// Commit-time shape of a ViaPoint Order formed by an auction (migration 0009):
// context, frozen snapshot, auction outcome, commitment owner and Order hold.
const fail = (message: string): never => {
  throw new Error(`Point order invariant: ${message}`);
};
const AUCTION_STATE = {
  AwaitingPayment: ['BuyNowPending', 'AwaitingWinnerPayment'],
  Fulfilling: ['Sold'],
  PaymentExpired: ['PaymentExpired'],
} as const;

export async function checkPointOrder(tx: Tx, orderId: string) {
  const o = await tx.c.point_orders.findOne({ _id: orderId });
  if (!o) return;
  const open = o.state !== 'PaymentExpired';
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
    !(AUCTION_STATE[o.state] as readonly string[]).includes(a.state)
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
  if (
    held !== (o.state === 'Fulfilling' ? o.buyerTotal : 0) ||
    payments !== (o.paidAt ? 1 : 0)
  )
    fail('order funding mismatch');
  tx.check(`auction-intake:${o.intakeId}`, () => checkIntake(tx, o.intakeId));
}
