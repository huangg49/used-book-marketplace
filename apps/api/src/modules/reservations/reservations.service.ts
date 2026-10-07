import {
  intakeContext,
  orderContext,
  pointOrderContext,
} from './workflow-context.js';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Tx } from '../../database/mongo/transaction.js';
import { conflict, invalidState } from '../commands/domain-error.js';
import { balanceOf } from '../wallet/ledger.service.js';

// The only writer of exclusive commitments. The partial unique index
// (status Active per listing) is the database backstop; checkOrder/checkListing
// verify the commitment/listing projection at commit.
@Injectable()
export class ReservationsService {
  async acquire(
    tx: Tx,
    contextId: string,
    listingId: string,
    now: Date,
    receiptId: string,
  ) {
    const context = orderContext(
      await tx.c.workflow_contexts.findOne({ _id: contextId }),
    );
    const order = context
      ? await tx.c.direct_orders.findOne({ _id: context.orderId })
      : null;
    const items = await tx.c.workflow_items.find({ contextId }).toArray();
    if (
      !context ||
      context.kind !== 'Order' ||
      context.ownershipPhase !== 'Holding' ||
      order?.state !== 'AwaitingPayment' ||
      items.length !== 1 ||
      items[0].listingId !== listingId
    )
      throw invalidState();
    if (
      await tx.c.exclusive_commitments.countDocuments({
        listingId,
        status: 'Active',
      })
    )
      throw conflict();
    const commitment = {
      _id: randomUUID(),
      listingId,
      currentContextId: contextId,
      version: 1,
      status: 'Active' as const,
      acquiredAt: now,
      endedAt: null,
      reason: null,
      lockSeq: 0,
    };
    await tx.c.exclusive_commitments.insertOne(commitment);
    await tx.c.commitment_events.insertOne({
      _id: randomUUID(),
      commitmentId: commitment._id,
      sequence: 1,
      kind: 'Acquired',
      beforeVersion: 0,
      afterVersion: 1,
      receiptId,
      occurredAt: now,
    });
    return commitment;
  }
  // Auction intake (migration 0008): the same unique Active commitment, owned
  // by an AuctionIntake context from intake creation until reclaim.
  async acquireForIntake(
    tx: Tx,
    contextId: string,
    listingId: string,
    now: Date,
    receiptId: string,
  ) {
    const context = intakeContext(
      await tx.c.workflow_contexts.findOne({ _id: contextId }),
    );
    const intake = context
      ? await tx.c.auction_intakes.findOne({ _id: context.auctionIntakeId })
      : null;
    const items = await tx.c.workflow_items.find({ contextId }).toArray();
    if (
      !context ||
      context.ownershipPhase !== 'Holding' ||
      intake?.state !== 'AwaitingDropoff' ||
      intake.listingId !== listingId ||
      items.length !== 1 ||
      items[0].listingId !== listingId
    )
      throw invalidState();
    if (
      await tx.c.exclusive_commitments.countDocuments({
        listingId,
        status: 'Active',
      })
    )
      throw conflict();
    const commitment = {
      _id: randomUUID(),
      listingId,
      currentContextId: contextId,
      version: 1,
      status: 'Active' as const,
      acquiredAt: now,
      endedAt: null,
      reason: null,
      lockSeq: 0,
    };
    await tx.c.exclusive_commitments.insertOne(commitment);
    await tx.c.commitment_events.insertOne({
      _id: randomUUID(),
      commitmentId: commitment._id,
      sequence: 1,
      kind: 'Acquired',
      beforeVersion: 0,
      afterVersion: 1,
      receiptId,
      occurredAt: now,
    });
    return commitment;
  }
  // Only before drop-off (Cancelled) or after the seller collected the book
  // back (Reclaimed); never while the book is at the point or auctioned.
  async closeIntake(
    tx: Tx,
    contextId: string,
    reason: 'Cancelled' | 'Reclaimed',
    now: Date,
    receiptId: string,
  ) {
    const context = intakeContext(
      await tx.c.workflow_contexts.findOne({ _id: contextId }),
    );
    const intake = context
      ? await tx.c.auction_intakes.findOne({ _id: context.auctionIntakeId })
      : null;
    if (
      !context ||
      context.ownershipPhase !== 'Holding' ||
      !intake ||
      (reason === 'Cancelled'
        ? intake.state !== 'AwaitingDropoff'
        : intake.state !== 'ReclaimRequired')
    )
      throw invalidState();
    const c = await tx.c.exclusive_commitments.findOne({
      currentContextId: contextId,
      status: 'Active',
    });
    if (!c) throw conflict();
    return this.release(
      tx,
      contextId,
      c._id,
      c.version,
      reason,
      now,
      receiptId,
    );
  }
  // Moves the Active commitment between an auction intake and the ViaPoint
  // Order it formed (migration 0009), never through Released: no other
  // checkout can take the book in between. Typed callers only.
  async transfer(
    tx: Tx,
    fromContextId: string,
    toContextId: string,
    listingId: string,
    now: Date,
    receiptId: string,
  ) {
    const found = await tx.c.exclusive_commitments.findOne({
      listingId,
      currentContextId: fromContextId,
      status: 'Active',
    });
    if (!found) throw conflict();
    await tx.lock('exclusive_commitments', [found._id]);
    const target = await tx.c.workflow_contexts.findOne({ _id: toContextId });
    const items = await tx.c.workflow_items
      .find({ contextId: toContextId })
      .toArray();
    if (
      !target ||
      target.ownershipPhase !== 'Holding' ||
      items.length !== 1 ||
      items[0].listingId !== listingId
    )
      throw invalidState();
    const next = await tx.c.exclusive_commitments.findOneAndUpdate(
      {
        _id: found._id,
        status: 'Active',
        version: found.version,
        currentContextId: fromContextId,
      },
      { $set: { currentContextId: toContextId }, $inc: { version: 1 } },
      { returnDocument: 'after' },
    );
    if (!next) throw conflict();
    await tx.c.commitment_events.insertOne({
      _id: randomUUID(),
      commitmentId: found._id,
      sequence: next.version,
      kind: 'Transferred',
      beforeVersion: found.version,
      afterVersion: next.version,
      receiptId,
      occurredAt: now,
    });
    return next;
  }
  async closeUnpaid(
    tx: Tx,
    contextId: string,
    commitmentId: string,
    expectedVersion: number,
    reason: 'Cancelled' | 'PaymentExpired',
    now: Date,
    receiptId: string,
  ) {
    const context = orderContext(
      await tx.c.workflow_contexts.findOne({ _id: contextId }),
    );
    const order = context
      ? await tx.c.direct_orders.findOne({ _id: context.orderId })
      : null;
    if (
      !context ||
      context.kind !== 'Order' ||
      context.ownershipPhase !== 'Holding' ||
      order?.state !== 'AwaitingPayment'
    )
      throw invalidState();
    return this.release(
      tx,
      contextId,
      commitmentId,
      expectedVersion,
      reason,
      now,
      receiptId,
    );
  }
  async closeRefunded(
    tx: Tx,
    contextId: string,
    commitmentId: string,
    expectedVersion: number,
    now: Date,
    receiptId: string,
  ) {
    const context = orderContext(
      await tx.c.workflow_contexts.findOne({ _id: contextId }),
    );
    const order = context
      ? await tx.c.direct_orders.findOne({ _id: context.orderId })
      : null;
    const refund = order
      ? await tx.c.ledger_journals.findOne({
          orderId: order._id,
          type: 'OrderRefund',
        })
      : null;
    const hold = order
      ? await tx.c.wallet_accounts.findOne({ orderId: order._id })
      : null;
    if (
      !context ||
      !order ||
      context.kind !== 'Order' ||
      context.ownershipPhase !== 'Holding' ||
      order.state !== 'SettlementPending' ||
      !order.paidAt ||
      !order.cancellationRequestedAt ||
      !refund ||
      !hold
    )
      throw invalidState();
    if ((await balanceOf(tx, hold._id)) !== 0) throw invalidState();
    // This slice has no acceptance/dispatch transition. A future custody workflow
    // must extend this server-side closure policy before releasing other stages.
    return this.release(
      tx,
      contextId,
      commitmentId,
      expectedVersion,
      'Cancelled',
      now,
      receiptId,
    );
  }
  // A settled ViaPoint Order (migration 0012): the book stays with the buyer,
  // so the commitment ends Completed, never back to Available. Only after the
  // whole hold left through the settlement journal.
  async closeCompleted(
    tx: Tx,
    contextId: string,
    now: Date,
    receiptId: string,
  ) {
    const context = pointOrderContext(
      await tx.c.workflow_contexts.findOne({ _id: contextId }),
    );
    const order = context
      ? await tx.c.point_orders.findOne({ _id: context.orderId })
      : null;
    const settled = order
      ? await tx.c.ledger_journals.findOne({
          orderId: order._id,
          type: 'OrderSettlement',
        })
      : null;
    const hold = order
      ? await tx.c.wallet_accounts.findOne({ orderId: order._id })
      : null;
    if (
      !context ||
      !order ||
      context.ownershipPhase !== 'Holding' ||
      order.state !== 'Inspection' ||
      !order.collectedAt ||
      !settled ||
      !hold ||
      (await balanceOf(tx, hold._id)) !== 0
    )
      throw invalidState();
    const c = await tx.c.exclusive_commitments.findOne({
      currentContextId: contextId,
      status: 'Active',
    });
    if (!c) throw conflict();
    return this.release(
      tx,
      contextId,
      c._id,
      c.version,
      'Completed',
      now,
      receiptId,
    );
  }
  private async release(
    tx: Tx,
    contextId: string,
    commitmentId: string,
    expectedVersion: number,
    reason: 'Cancelled' | 'PaymentExpired' | 'Reclaimed' | 'Completed',
    now: Date,
    receiptId: string,
  ) {
    await tx.lock('exclusive_commitments', [commitmentId]);
    const c = await tx.c.exclusive_commitments.findOne({ _id: commitmentId });
    if (
      !c ||
      c.currentContextId !== contextId ||
      c.version !== expectedVersion ||
      c.status !== 'Active'
    )
      throw conflict();
    // Only the typed unpaid/refunded policies above may enter this projection
    // writer; a client cannot supply a safety flag or request a generic release.
    const next = await tx.c.exclusive_commitments.findOneAndUpdate(
      { _id: c._id, status: 'Active', version: c.version },
      {
        $set: { status: 'Released', endedAt: now, reason },
        $inc: { version: 1 },
      },
      { returnDocument: 'after' },
    );
    await tx.c.commitment_events.insertOne({
      _id: randomUUID(),
      commitmentId: c._id,
      sequence: next!.version,
      kind: 'Released',
      beforeVersion: c.version,
      afterVersion: next!.version,
      receiptId,
      occurredAt: now,
    });
    return next!;
  }
}
