import type { Tx } from '../../database/mongo/transaction.js';
import { checkListing } from '../listings/listing-projection.js';
import { intakeContext } from '../reservations/workflow-context.js';
import { rank } from './auction-engine.js';

// Commit-time checks for auction writers (ADR 0027 deferred-constraint
// equivalent). They read the committed shape, not the command's intent.
const fail = (message: string): never => {
  throw new Error(`Auction invariant: ${message}`);
};

export async function checkIntake(tx: Tx, intakeId: string) {
  const i = await tx.c.auction_intakes.findOne({ _id: intakeId });
  if (!i) return;
  const closed = i.state === 'Cancelled' || i.state === 'Reclaimed';
  const c = intakeContext(
    await tx.c.workflow_contexts.findOne({ _id: i.contextId }),
  );
  if (
    !c ||
    c.auctionIntakeId !== i._id ||
    c.ownershipPhase !== (closed ? 'Closed' : 'Holding') ||
    c.version !== (closed ? 2 : 1)
  )
    fail('intake/context mismatch');
  const items = await tx.c.workflow_items
    .find({ contextId: i.contextId })
    .toArray();
  if (
    items.length !== 1 ||
    items[0].listingId !== i.listingId ||
    items[0].listingRevisionId !== i.listingRevisionId
  )
    fail('intake item mismatch');
  const slot = await tx.c.point_slots.findOne({ _id: i.slotId });
  if (
    !slot ||
    slot.contextId !== i.contextId ||
    slot.pointId !== i.pointId ||
    slot.listingId !== i.listingId ||
    slot.active === closed
  )
    fail('intake slot mismatch');
  const commitments = await tx.c.exclusive_commitments
    .find({ currentContextId: i.contextId })
    .toArray();
  const e = commitments[0];
  if (
    commitments.length !== 1 ||
    e.listingId !== i.listingId ||
    (closed
      ? e.status !== 'Released' ||
        e.reason !== (i.state === 'Cancelled' ? 'Cancelled' : 'Reclaimed')
      : e.status !== 'Active')
  )
    fail('intake commitment mismatch');
  if (i.auctionId) {
    const a = await tx.c.auctions.findOne({ _id: i.auctionId });
    if (!a || a.intakeId !== i._id || a.contextId !== i.contextId)
      fail('intake auction mismatch');
  }
  tx.check(`listing:${i.listingId}`, () => checkListing(tx, i.listingId));
}

export async function checkAuction(tx: Tx, auctionId: string) {
  const a = await tx.c.auctions.findOne({ _id: auctionId });
  if (!a) return;
  const bidders = await tx.c.auction_bidders
    .find({ auctionId: a._id })
    .toArray();
  const bids = await tx.c.auction_bids.countDocuments({ auctionId: a._id });
  if (bidders.length !== a.bidderCount || bids !== a.bidCount)
    fail('auction counters mismatch');
  const [top] = rank(bidders);
  if (
    (top?.bidderId ?? null) !== a.leaderId ||
    (top && a.currentPrice! > top.level) ||
    bidders.some(
      (b) => b.bidderId === a.sellerId || b.levelSequence >= a.nextSequence,
    )
  )
    fail('auction ranking mismatch');
  tx.check(`auction-intake:${a.intakeId}`, () => checkIntake(tx, a.intakeId));
}
