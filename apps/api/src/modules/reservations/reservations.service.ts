import { Injectable } from '@nestjs/common';
import type { Tx } from '../commands/command.service.js';
import { conflict, invalidState } from '../commands/domain-error.js';

@Injectable()
export class ReservationsService {
  async acquire(
    tx: Tx,
    contextId: string,
    listingId: string,
    now: Date,
    receiptId: string,
  ) {
    const context = await tx.workflowContext.findUniqueOrThrow({
      where: { id: contextId },
      include: { order: true, items: true },
    });
    if (
      context.kind !== 'Order' ||
      context.ownershipPhase !== 'Holding' ||
      context.order.state !== 'AwaitingPayment' ||
      context.items.length !== 1 ||
      context.items[0].listingId !== listingId
    )
      throw invalidState();
    if (
      await tx.exclusiveCommitment.count({
        where: { listingId, status: 'Active' },
      })
    )
      throw conflict();
    const c = await tx.exclusiveCommitment.create({
      data: {
        listingId,
        currentContextId: contextId,
        status: 'Active',
        acquiredAt: now,
      },
    });
    await tx.commitmentEvent.create({
      data: {
        commitmentId: c.id,
        sequence: 1,
        kind: 'Acquired',
        beforeVersion: 0,
        afterVersion: 1,
        receiptId,
        occurredAt: now,
      },
    });
    return c;
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
    const context = await tx.workflowContext.findUniqueOrThrow({
      where: { id: contextId },
      include: { order: true },
    });
    if (
      context.kind !== 'Order' ||
      context.ownershipPhase !== 'Holding' ||
      context.order.state !== 'AwaitingPayment'
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
    const context = await tx.workflowContext.findUniqueOrThrow({
      where: { id: contextId },
      include: { order: { include: { journals: true, holdAccount: true } } },
    });
    const order = context.order;
    if (
      context.kind !== 'Order' ||
      context.ownershipPhase !== 'Holding' ||
      order.state !== 'SettlementPending' ||
      !order.paidAt ||
      !order.cancellationRequestedAt ||
      !order.journals.some((j) => j.type === 'OrderRefund') ||
      !order.holdAccount
    )
      throw invalidState();
    const [balance] = await tx.$queryRaw<
      { amount: bigint }[]
    >`SELECT COALESCE(sum(debit-credit),0)::bigint AS amount FROM ledger_entries WHERE account_id=${order.holdAccount.id}::uuid`;
    if (balance.amount !== 0n) throw invalidState();
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
    await tx.$queryRaw`SELECT id FROM exclusive_commitments WHERE id=${commitmentId}::uuid FOR UPDATE`;
    const c = await tx.exclusiveCommitment.findUniqueOrThrow({
      where: { id: commitmentId },
    });
    if (
      c.currentContextId !== contextId ||
      c.version !== expectedVersion ||
      c.status !== 'Active'
    )
      throw conflict();
    // Only the typed unpaid/refunded policies above may enter this projection
    // writer; a client cannot supply a safety flag or request a generic release.
    const next = await tx.exclusiveCommitment.update({
      where: { id: c.id },
      data: {
        version: { increment: 1 },
        status: 'Released',
        endedAt: now,
        reason,
      },
    });
    await tx.commitmentEvent.create({
      data: {
        commitmentId: c.id,
        sequence: 2,
        kind: 'Released',
        beforeVersion: c.version,
        afterVersion: next.version,
        receiptId,
        occurredAt: now,
      },
    });
    return next;
  }
}
