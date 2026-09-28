import { Injectable } from '@nestjs/common';
import { Prisma, type TopupIntent } from '../../generated/prisma/client.js';
import type { Tx } from '../commands/command.service.js';
import { DomainError, invalidState } from '../commands/domain-error.js';

export const CLEARING_ID = '00000000-0000-4000-8000-000000000002';
@Injectable()
export class LedgerService {
  async reconcile(tx: Tx) {
    // Caller uses one RepeatableRead snapshot. Constraint functions also validate
    // business sources; equal global debit/credit alone is not a reconciliation.
    await tx.$queryRaw`SELECT latlai_check_journal(id)::text FROM ledger_journals`;
    await tx.$queryRaw`SELECT latlai_check_topup(id)::text FROM topup_intents`;
    await tx.$queryRaw`SELECT latlai_check_order(id)::text FROM direct_orders`;
    const [row] = await tx.$queryRaw<
      { debit: bigint; credit: bigint; available: bigint; held: bigint }[]
    >`
      SELECT COALESCE(sum(e.debit),0)::bigint AS debit, COALESCE(sum(e.credit),0)::bigint AS credit,
        COALESCE(sum(CASE WHEN a.purpose='UserAvailable' THEN e.debit-e.credit ELSE 0 END),0)::bigint AS available,
        COALESCE(sum(CASE WHEN a.purpose='OrderHold' THEN e.debit-e.credit ELSE 0 END),0)::bigint AS held
      FROM ledger_entries e JOIN wallet_accounts a ON a.id=e.account_id`;
    const sourceRemaining = await this.balance(tx, CLEARING_ID);
    if (
      row.debit !== row.credit ||
      sourceRemaining + Number(row.available) + Number(row.held) !== 100000000
    )
      throw new Error('Simulated capital conservation mismatch');
    return {
      demoOnly: true,
      balanced: row.debit === row.credit,
      totalDebit: Number(row.debit),
      totalCredit: Number(row.credit),
      memberAvailable: Number(row.available),
      transactionHeld: Number(row.held),
      sourceRemaining,
      journals: await tx.ledgerJournal.count(),
      topups: await tx.topupIntent.count(),
    };
  }
  async balance(tx: Tx, accountId: string) {
    const [row] = await tx.$queryRaw<
      { amount: bigint }[]
    >`SELECT COALESCE(sum(debit-credit),0)::bigint AS amount FROM ledger_entries WHERE account_id=${accountId}::uuid`;
    return Number(row.amount);
  }
  async available(tx: Tx, ownerId: string) {
    const account = await tx.walletAccount.findUnique({ where: { ownerId } });
    return account ? this.balance(tx, account.id) : 0;
  }
  async held(tx: Tx, buyerId: string) {
    const [row] = await tx.$queryRaw<{ amount: bigint }[]>`
      SELECT COALESCE(sum(e.debit-e.credit),0)::bigint AS amount FROM ledger_entries e
      JOIN wallet_accounts a ON a.id=e.account_id JOIN direct_orders o ON o.id=a.order_id
      WHERE a.purpose='OrderHold' AND o.buyer_id=${buyerId}::uuid`;
    return Number(row.amount);
  }
  async orderFunds(tx: Tx, orderId: string) {
    const account = await tx.walletAccount.findUnique({ where: { orderId } });
    const refund = await tx.ledgerJournal.findUnique({
      where: { orderId_type: { orderId, type: 'OrderRefund' } },
      include: { entries: true },
    });
    return {
      held: account ? await this.balance(tx, account.id) : 0,
      refunded: refund
        ? Number(refund.entries.find((e) => e.debit > 0n)!.debit)
        : 0,
    };
  }
  // Caller locks participants and the Order first. A hold account has a typed Order
  // owner, never a second available account or a mutable balance column.
  async lockOrder(tx: Tx, buyerId: string, orderId: string, create: boolean) {
    const available = create
      ? await tx.walletAccount.upsert({
          where: { ownerId: buyerId },
          update: {},
          create: { ownerId: buyerId, purpose: 'UserAvailable' },
        })
      : await tx.walletAccount.findUniqueOrThrow({
          where: { ownerId: buyerId },
        });
    const hold = create
      ? await tx.walletAccount.upsert({
          where: { orderId },
          update: {},
          create: { orderId, purpose: 'OrderHold' },
        })
      : await tx.walletAccount.findUniqueOrThrow({ where: { orderId } });
    const ids = [available.id, hold.id].sort();
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM wallet_accounts WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`,
    );
    return { available: available.id, hold: hold.id };
  }
  async postOrder(
    tx: Tx,
    orderId: string,
    receiptId: string,
    accounts: { available: string; hold: string },
    amount: number,
    now: Date,
    refund = false,
  ) {
    const from = refund ? accounts.hold : accounts.available,
      to = refund ? accounts.available : accounts.hold;
    if ((await this.balance(tx, from)) < amount) {
      if (refund) throw invalidState();
      throw new DomainError(
        409,
        'InvalidState',
        'Số dư khả dụng không đủ để thanh toán toàn bộ đơn. Bạn có thể nạp riêng; hạn thanh toán không thay đổi.',
      );
    }
    return tx.ledgerJournal.create({
      data: {
        type: refund ? 'OrderRefund' : 'OrderPayment',
        orderId,
        receiptId,
        postedAt: now,
        entries: {
          create: [
            { accountId: from, debit: 0n, credit: BigInt(amount) },
            { accountId: to, debit: BigInt(amount), credit: 0n },
          ],
        },
      },
    });
  }
  // Caller owns participant and intent locks; this never opens a nested transaction.
  async lockFunding(tx: Tx, ownerId: string) {
    const account = await tx.walletAccount.upsert({
      where: { ownerId },
      update: {},
      create: { ownerId, purpose: 'UserAvailable' },
    });
    const ids = [CLEARING_ID, account.id].sort();
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM wallet_accounts WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`,
    );
    return account.id;
  }
  async postTopup(
    tx: Tx,
    intent: TopupIntent,
    accountId: string,
    eventId: string,
    now: Date,
  ) {
    if ((await this.balance(tx, CLEARING_ID)) < intent.amount)
      throw new DomainError(
        503,
        'UNAVAILABLE',
        'Nguồn tiền mô phỏng không đủ; sự kiện chưa được ghi nhận. Cần đối soát nguồn trước khi thử lại.',
      );
    return tx.ledgerJournal.create({
      data: {
        type: 'Topup',
        topupId: intent.id,
        eventId,
        postedAt: now,
        entries: {
          create: [
            {
              accountId: CLEARING_ID,
              debit: 0n,
              credit: BigInt(intent.amount),
            },
            { accountId, debit: BigInt(intent.amount), credit: 0n },
          ],
        },
      },
    });
  }
}
