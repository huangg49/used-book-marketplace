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
    const context = await tx.c.workflow_contexts.findOne({ _id: contextId });
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
  async closeUnpaid(
    tx: Tx,
    contextId: string,
    commitmentId: string,
    expectedVersion: number,
    reason: 'Cancelled' | 'PaymentExpired',
    now: Date,
    receiptId: string,
  ) {
    const context = await tx.c.workflow_contexts.findOne({ _id: contextId });
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
    const context = await tx.c.workflow_contexts.findOne({ _id: contextId });
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
  private async release(
    tx: Tx,
    contextId: string,
    commitmentId: string,
    expectedVersion: number,
    reason: 'Cancelled' | 'PaymentExpired',
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
      sequence: 2,
      kind: 'Released',
      beforeVersion: c.version,
      afterVersion: next!.version,
      receiptId,
      occurredAt: now,
    });
    return next!;
  }
}
