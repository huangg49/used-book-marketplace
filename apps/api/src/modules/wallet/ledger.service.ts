import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  ExchangeDoc,
  LedgerJournalDoc,
  TopupIntentDoc,
  WalletAccountDoc,
} from '../../database/mongo/documents.js';
import {
  CAPITAL_ACCOUNT_ID,
  CLEARING_ACCOUNT_ID,
  LEDGER_SEQUENCE_COUNTER,
  OPENING_CAPITAL,
  OPENING_JOURNAL_ID,
} from '../../database/mongo/migrations/0002-reference-data.js';
import { PLATFORM_COMMISSION_ACCOUNT_ID } from '../../database/mongo/migrations/auction-constants.js';
import type { Tx } from '../../database/mongo/transaction.js';
import { DomainError, invalidState } from '../commands/domain-error.js';
import { checkOrder } from '../orders/order-invariants.js';
import { checkPointOrder } from '../auctions/point-order-invariants.js';

export const CLEARING_ID = CLEARING_ACCOUNT_ID;

// Balance is always derived from immutable entries (never a stored column).
export async function balanceOf(tx: Tx, accountId: string) {
  const [row] = await tx.c.ledger_entries
    .aggregate<{ amount: number }>([
      { $match: { accountId } },
      {
        $group: {
          _id: null,
          amount: { $sum: { $subtract: ['$debit', '$credit'] } },
        },
      },
    ])
    .toArray();
  return row?.amount ?? 0;
}

// Commit-time replacement for latlai_check_journal and
// latlai_check_funding_journal_v1 (deferred constraint triggers).
export async function checkJournal(tx: Tx, journalId: string) {
  const j = await tx.c.ledger_journals.findOne({ _id: journalId });
  if (!j) throw new Error('Journal missing');
  const entries = await tx.c.ledger_entries.find({ journalId }).toArray();
  if (
    entries.length !== (j.type === 'OrderSettlement' ? 3 : 2) ||
    entries.reduce((sum, e) => sum + e.debit - e.credit, 0) !== 0
  )
    throw new Error('Journal must have two balanced entries');
  const accounts = await tx.c.wallet_accounts
    .find({ _id: { $in: entries.map((e) => e.accountId) } })
    .toArray();
  if (accounts.length !== entries.length)
    throw new Error('Ledger entry references a missing account');
  const account = (id: string) => accounts.find((a) => a._id === id);
  if (j.type === 'OpeningCapital') {
    if (
      j._id !== OPENING_JOURNAL_ID ||
      !entries.some(
        (e) =>
          e.accountId === CAPITAL_ACCOUNT_ID && e.credit === OPENING_CAPITAL,
      ) ||
      !entries.some(
        (e) =>
          e.accountId === CLEARING_ACCOUNT_ID && e.debit === OPENING_CAPITAL,
      )
    )
      throw new Error('Invalid finite simulator capital');
  } else if (j.type === 'Topup') {
    const t = await tx.c.topup_intents.findOne({ _id: j.topupId! });
    const e = await tx.c.simulated_payment_events.findOne({ _id: j.eventId! });
    if (
      !t ||
      !e ||
      !['Succeeded', 'ReviewRequired'].includes(t.state) ||
      e.intentId !== t._id ||
      e.recipientId !== t.ownerId ||
      e.amount !== t.amount ||
      e.currency !== t.currency ||
      e.outcome !== 'Succeeded' ||
      e.disposition !== 'Applied' ||
      e.receivedAt.getTime() !== j.postedAt.getTime() ||
      !entries.some(
        (x) =>
          account(x.accountId)?.ownerId === t.ownerId &&
          account(x.accountId)?.purpose === 'UserAvailable' &&
          x.debit === t.amount,
      ) ||
      !entries.some(
        (x) => x.accountId === CLEARING_ACCOUNT_ID && x.credit === t.amount,
      )
    )
      throw new Error('Topup journal source mismatch');
  } else if (j.type === 'OrderSettlement') {
    // ViaPoint completion (migration 0012): the whole hold leaves once, the
    // seller receives P − C and the platform C plus the outbound leg fee.
    const p = await tx.c.point_orders.findOne({ _id: j.orderId! });
    const ex = p
      ? null
      : await tx.c.exchanges.findOne({
          $or: [
            { initiatorOrderId: j.orderId! },
            { recipientOrderId: j.orderId! },
          ],
        });
    if (p) {
      if (
        p.state !== 'Completed' ||
        !entries.some(
          (x) =>
            account(x.accountId)?.orderId === p._id &&
            account(x.accountId)?.purpose === 'OrderHold' &&
            x.credit === p.buyerTotal,
        ) ||
        !entries.some(
          (x) =>
            account(x.accountId)?.ownerId === p.sellerId &&
            account(x.accountId)?.purpose === 'UserAvailable' &&
            x.debit === p.sellerProceeds,
        ) ||
        !entries.some(
          (x) =>
            x.accountId === PLATFORM_COMMISSION_ACCOUNT_ID &&
            x.debit === p.commission + p.outboundFee,
        )
      )
        throw new Error('Settlement journal source mismatch');
      tx.check(`point-order:${p._id}`, () => checkPointOrder(tx, p._id));
    } else if (ex) {
      const isInit = ex.initiatorOrderId === j.orderId;
      const payerId = isInit ? ex.initiatorId : ex.recipientId;
      const receiverId = isInit ? ex.recipientId : ex.initiatorId;
      const deposit = isInit ? ex.initiatorDeposit : ex.recipientDeposit;
      const totalHeld = deposit + ex.diffAmount;
      if (
        ex.status !== 'Completed' ||
        ex.diffPayerId !== payerId ||
        !entries.some(
          (x) =>
            account(x.accountId)?.orderId === j.orderId &&
            account(x.accountId)?.purpose === 'OrderHold' &&
            x.credit === totalHeld,
        ) ||
        !entries.some(
          (x) =>
            account(x.accountId)?.ownerId === payerId &&
            account(x.accountId)?.purpose === 'UserAvailable' &&
            x.debit === deposit,
        ) ||
        !entries.some(
          (x) =>
            account(x.accountId)?.ownerId === receiverId &&
            account(x.accountId)?.purpose === 'UserAvailable' &&
            x.debit === ex.diffAmount,
        )
      )
        throw new Error('Settlement journal source mismatch');
      tx.check(`exchange:${ex._id}`, () => checkExchange(tx, ex._id));
    } else {
      throw new Error('Settlement journal source mismatch');
    }
  } else {
    // An Order is a DirectDelivery Order (frozen quote) or a ViaPoint Order
    // formed by an auction (migration 0009); both freeze buyerTotal.
    const o = await tx.c.direct_orders.findOne({ _id: j.orderId! });
    const q = o && (await tx.c.sale_quotes.findOne({ _id: o.quoteId }));
    const p = o ? null : await tx.c.point_orders.findOne({ _id: j.orderId! });
    const ex =
      o || p
        ? null
        : await tx.c.exchanges.findOne({
            $or: [
              { initiatorOrderId: j.orderId! },
              { recipientOrderId: j.orderId! },
            ],
          });
    let buyerId: string | undefined;
    let total: number | undefined;
    if (o) {
      buyerId = o.buyerId;
      total = q?.buyerTotal;
    } else if (p) {
      buyerId = p.buyerId;
      total = p.buyerTotal;
    } else if (ex) {
      const isInit = ex.initiatorOrderId === j.orderId;
      buyerId = isInit ? ex.initiatorId : ex.recipientId;
      const deposit = isInit ? ex.initiatorDeposit : ex.recipientDeposit;
      const diff = ex.diffPayerId === buyerId ? ex.diffAmount : 0;
      if (j.type === 'OrderPayment') {
        total = deposit + diff;
      } else {
        total = ex.status === 'Completed' ? deposit : deposit + diff;
      }
    }
    const payment = j.type === 'OrderPayment';
    if (
      !buyerId ||
      total === undefined ||
      (p && !payment && !(await refundDecided(tx, p._id, j._id))) ||
      !entries.some(
        (x) =>
          account(x.accountId)?.ownerId === buyerId &&
          account(x.accountId)?.purpose === 'UserAvailable' &&
          (payment ? x.credit : x.debit) === total,
      ) ||
      !entries.some(
        (x) =>
          account(x.accountId)?.orderId === j.orderId &&
          account(x.accountId)?.purpose === 'OrderHold' &&
          (payment ? x.debit : x.credit) === total,
      )
    )
      throw new Error('Order journal source mismatch');
    if (o) tx.check(`order:${o._id}`, () => checkOrder(tx, o._id));
    else if (p) tx.check(`point-order:${p._id}`, () => checkPointOrder(tx, p._id));
    else if (ex) tx.check(`exchange:${ex._id}`, () => checkExchange(tx, ex._id));
  }
  for (const e of entries)
    if (
      account(e.accountId)?.purpose !== 'SimulatorCapital' &&
      (await balanceOf(tx, e.accountId)) < 0
    )
      throw new Error('Wallet balance cannot be negative');
}

// A ViaPoint Order refund must be the journal named by an Admin RefundBuyer
// decision (migration 0011) or by the Staff record of a required return
// (migration 0012), on a cancelled Order.
async function refundDecided(tx: Tx, orderId: string, journalId: string) {
  const order = await tx.c.point_orders.findOne({ _id: orderId });
  const decision = await tx.c.point_order_resolutions.findOne({
    orderId,
    decision: 'RefundBuyer',
    journalId,
  });
  const returned = await tx.c.point_returns.findOne({ orderId, journalId });
  const required = await tx.c.point_order_resolutions.findOne({
    orderId,
    decision: 'RequireReturn',
  });
  return (
    order?.state === 'Cancelled' && (!!decision || (!!returned && !!required))
  );
}

@Injectable()
export class LedgerService {
  // Read-only reconciliation inside one snapshot transaction: every journal,
  // topup and order is checked by the commit-time rules, and simulated
  // capital must be conserved. Equal global debit/credit alone is not enough.
  async reconcile(tx: Tx) {
    // Walk references in both directions. Starting only from journals misses
    // orphan entries that still affect balances, even when the global totals
    // balance. Do this before $unwind can silently discard a missing account.
    for (const [field, target, message] of [
      [
        'journalId',
        'ledger_journals',
        'Ledger entry references a missing journal',
      ],
      [
        'accountId',
        'wallet_accounts',
        'Ledger entry references a missing account',
      ],
    ] as const) {
      const missing = await tx.c.ledger_entries
        .aggregate([
          {
            $lookup: {
              from: target,
              localField: field,
              foreignField: '_id',
              as: 'reference',
            },
          },
          { $match: { reference: { $size: 0 } } },
          { $limit: 1 },
          { $project: { _id: 1 } },
        ])
        .toArray();
      if (missing.length) throw new Error(message);
    }
    // Unused accounts also need real owners; a journal traversal never sees them.
    for (const [purpose, field, target, message] of [
      [
        'UserAvailable',
        'ownerId',
        'users',
        'Wallet account references a missing owner',
      ],
    ] as const) {
      const missing = await tx.c.wallet_accounts
        .aggregate([
          { $match: { purpose } },
          {
            $lookup: {
              from: target,
              localField: field,
              foreignField: '_id',
              as: 'reference',
            },
          },
          { $match: { reference: { $size: 0 } } },
          { $limit: 1 },
          { $project: { _id: 1 } },
        ])
        .toArray();
      if (missing.length) throw new Error(message);
    }
    // An Order hold references a DirectDelivery, a ViaPoint Order, or an Exchange.
    const orphanHold = await tx.c.wallet_accounts
      .aggregate([
        { $match: { purpose: 'OrderHold' } },
        {
          $lookup: {
            from: 'direct_orders',
            localField: 'orderId',
            foreignField: '_id',
            as: 'direct',
          },
        },
        {
          $lookup: {
            from: 'point_orders',
            localField: 'orderId',
            foreignField: '_id',
            as: 'point',
          },
        },
        {
          $lookup: {
            from: 'exchanges',
            let: { oid: '$orderId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $or: [
                      { $eq: ['$initiatorOrderId', '$$oid'] },
                      { $eq: ['$recipientOrderId', '$$oid'] },
                    ],
                  },
                },
              },
            ],
            as: 'exchange',
          },
        },
        {
          $match: {
            direct: { $size: 0 },
            point: { $size: 0 },
            exchange: { $size: 0 },
          },
        },
        { $limit: 1 },
        { $project: { _id: 1 } },
      ])
      .toArray();
    if (orphanHold.length)
      throw new Error('Wallet account references a missing Order');
    if (!(await tx.c.ledger_journals.findOne({ _id: OPENING_JOURNAL_ID })))
      throw new Error('Opening capital journal missing');
    for (const j of await tx.c.ledger_journals.find({}).toArray())
      await checkJournal(tx, j._id);
    for (const t of await tx.c.topup_intents.find({}).toArray())
      await checkTopupRecord(tx, t._id);
    for (const o of await tx.c.direct_orders.find({}).toArray())
      await checkOrder(tx, o._id);
    for (const o of await tx.c.point_orders.find({}).toArray())
      await checkPointOrder(tx, o._id);
    const [row] = await tx.c.ledger_entries
      .aggregate<{
        debit: number;
        credit: number;
        available: number;
        held: number;
      }>([
        {
          $lookup: {
            from: 'wallet_accounts',
            localField: 'accountId',
            foreignField: '_id',
            as: 'a',
          },
        },
        { $unwind: '$a' },
        {
          $group: {
            _id: null,
            debit: { $sum: '$debit' },
            credit: { $sum: '$credit' },
            available: {
              $sum: {
                $cond: [
                  { $eq: ['$a.purpose', 'UserAvailable'] },
                  { $subtract: ['$debit', '$credit'] },
                  0,
                ],
              },
            },
            held: {
              $sum: {
                $cond: [
                  { $eq: ['$a.purpose', 'OrderHold'] },
                  { $subtract: ['$debit', '$credit'] },
                  0,
                ],
              },
            },
          },
        },
      ])
      .toArray();
    const sourceRemaining = await balanceOf(tx, CLEARING_ID);
    // Settled platform fees stay inside the simulated capital.
    const platformCommission = await balanceOf(
      tx,
      PLATFORM_COMMISSION_ACCOUNT_ID,
    );
    if (
      row.debit !== row.credit ||
      sourceRemaining + row.available + row.held + platformCommission !==
        OPENING_CAPITAL
    )
      throw new Error('Simulated capital conservation mismatch');
    return {
      demoOnly: true,
      balanced: row.debit === row.credit,
      totalDebit: row.debit,
      totalCredit: row.credit,
      memberAvailable: row.available,
      transactionHeld: row.held,
      platformCommission,
      sourceRemaining,
      journals: await tx.c.ledger_journals.countDocuments(),
      topups: await tx.c.topup_intents.countDocuments(),
    };
  }
  balance(tx: Tx, accountId: string) {
    return balanceOf(tx, accountId);
  }
  async available(tx: Tx, ownerId: string) {
    const account = await tx.c.wallet_accounts.findOne({ ownerId });
    return account ? balanceOf(tx, account._id) : 0;
  }
  // Holds of the buyer's DirectDelivery and ViaPoint (auction) Orders.
  async held(tx: Tx, buyerId: string) {
    return (
      (await this.heldIn(tx, 'direct_orders', buyerId)) +
      (await this.heldIn(tx, 'point_orders', buyerId))
    );
  }
  private async heldIn(
    tx: Tx,
    orders: 'direct_orders' | 'point_orders',
    buyerId: string,
  ) {
    const [row] = await tx.c[orders]
      .aggregate<{ amount: number }>([
        { $match: { buyerId } },
        {
          $lookup: {
            from: 'wallet_accounts',
            localField: '_id',
            foreignField: 'orderId',
            as: 'a',
          },
        },
        { $unwind: '$a' },
        { $match: { 'a.purpose': 'OrderHold' } },
        {
          $lookup: {
            from: 'ledger_entries',
            localField: 'a._id',
            foreignField: 'accountId',
            as: 'e',
          },
        },
        { $unwind: '$e' },
        {
          $group: {
            _id: null,
            amount: { $sum: { $subtract: ['$e.debit', '$e.credit'] } },
          },
        },
      ])
      .toArray();
    return row?.amount ?? 0;
  }
  async orderFunds(tx: Tx, orderId: string) {
    const account = await tx.c.wallet_accounts.findOne({ orderId });
    const refund = await tx.c.ledger_journals.findOne({
      orderId,
      type: 'OrderRefund',
    });
    const refundEntry = refund
      ? await tx.c.ledger_entries.findOne({
          journalId: refund._id,
          debit: { $gt: 0 },
        })
      : null;
    return {
      held: account ? await balanceOf(tx, account._id) : 0,
      refunded: refundEntry?.debit ?? 0,
    };
  }
  // Accounts are append-only: created once when absent. Callers hold the
  // owning user's lock, so two creators of the same account never race.
  private async account(
    tx: Tx,
    key: { ownerId: string } | { orderId: string },
  ): Promise<WalletAccountDoc> {
    const existing = await tx.c.wallet_accounts.findOne(key);
    if (existing) return existing;
    const account: WalletAccountDoc = {
      _id: randomUUID(),
      ownerId: 'ownerId' in key ? key.ownerId : null,
      orderId: 'orderId' in key ? key.orderId : null,
      purpose: 'ownerId' in key ? 'UserAvailable' : 'OrderHold',
      currency: 'VND',
    };
    await tx.c.wallet_accounts.insertOne(account);
    return account;
  }
  // The ledger_entry_lock equivalent: every posting locks its accounts first,
  // in id order, before reading balances.
  async lockAccounts(tx: Tx, ids: string[]) {
    for (const id of [...new Set(ids)].sort())
      await tx.c.account_locks.updateOne(
        { _id: id },
        { $inc: { lockSeq: 1 } },
        { upsert: true },
      );
  }
  // Caller locks participants and the Order first. A hold account has a typed Order
  // owner, never a second available account or a mutable balance column.
  async lockOrder(tx: Tx, buyerId: string, orderId: string, create: boolean) {
    const find = async (key: { ownerId: string } | { orderId: string }) => {
      if (create) return this.account(tx, key);
      const found = await tx.c.wallet_accounts.findOne(key);
      if (!found) throw new Error('Wallet account missing');
      return found;
    };
    const available = await find({ ownerId: buyerId });
    const hold = await find({ orderId });
    await this.lockAccounts(tx, [available._id, hold._id]);
    return { available: available._id, hold: hold._id };
  }
  private async journal(
    tx: Tx,
    fields: Omit<LedgerJournalDoc, '_id' | 'sequence'>,
    from: string,
    to: string,
    amount: number,
  ) {
    // Posting order: accounts are locked, so the counter order is commit order.
    const counter = await tx.c.counters.findOneAndUpdate(
      { _id: LEDGER_SEQUENCE_COUNTER },
      { $inc: { value: 1 } },
      { returnDocument: 'after' },
    );
    const journal: LedgerJournalDoc = {
      _id: randomUUID(),
      sequence: counter!.value,
      ...fields,
    };
    await tx.c.ledger_journals.insertOne(journal);
    await tx.c.ledger_entries.insertMany([
      {
        _id: `${journal._id}:${from}`,
        journalId: journal._id,
        accountId: from,
        debit: 0,
        credit: amount,
      },
      {
        _id: `${journal._id}:${to}`,
        journalId: journal._id,
        accountId: to,
        debit: amount,
        credit: 0,
      },
    ]);
    tx.check(`journal:${journal._id}`, () => checkJournal(tx, journal._id));
    return journal;
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
    return this.journal(
      tx,
      {
        type: refund ? 'OrderRefund' : 'OrderPayment',
        topupId: null,
        eventId: null,
        orderId,
        receiptId,
        postedAt: now,
      },
      from,
      to,
      amount,
    );
  }
  // ViaPoint completion: caller holds the buyer, seller and Order locks. The
  // seller's available account is created when absent (seller lock held).
  async settlePointOrder(
    tx: Tx,
    order: {
      _id: string;
      sellerId: string;
      buyerTotal: number;
      sellerProceeds: number;
    },
    receiptId: string,
    now: Date,
  ) {
    const hold = await tx.c.wallet_accounts.findOne({ orderId: order._id });
    if (!hold) throw new Error('Wallet account missing');
    const seller = await this.account(tx, { ownerId: order.sellerId });
    await this.lockAccounts(tx, [
      hold._id,
      seller._id,
      PLATFORM_COMMISSION_ACCOUNT_ID,
    ]);
    if ((await this.balance(tx, hold._id)) !== order.buyerTotal)
      throw invalidState();
    const counter = await tx.c.counters.findOneAndUpdate(
      { _id: LEDGER_SEQUENCE_COUNTER },
      { $inc: { value: 1 } },
      { returnDocument: 'after' },
    );
    const journal: LedgerJournalDoc = {
      _id: randomUUID(),
      sequence: counter!.value,
      type: 'OrderSettlement',
      topupId: null,
      eventId: null,
      orderId: order._id,
      receiptId,
      postedAt: now,
    };
    const platform = order.buyerTotal - order.sellerProceeds;
    await tx.c.ledger_journals.insertOne(journal);
    await tx.c.ledger_entries.insertMany([
      {
        _id: `${journal._id}:${hold._id}`,
        journalId: journal._id,
        accountId: hold._id,
        debit: 0,
        credit: order.buyerTotal,
      },
      {
        _id: `${journal._id}:${seller._id}`,
        journalId: journal._id,
        accountId: seller._id,
        debit: order.sellerProceeds,
        credit: 0,
      },
      {
        _id: `${journal._id}:${PLATFORM_COMMISSION_ACCOUNT_ID}`,
        journalId: journal._id,
        accountId: PLATFORM_COMMISSION_ACCOUNT_ID,
        debit: platform,
        credit: 0,
      },
    ]);
    tx.check(`journal:${journal._id}`, () => checkJournal(tx, journal._id));
    return journal;
  }
  // Caller owns participant and intent locks; this never opens a nested transaction.
  async lockFunding(tx: Tx, ownerId: string) {
    const account = await this.account(tx, { ownerId });
    await this.lockAccounts(tx, [CLEARING_ID, account._id]);
    return account._id;
  }
  async postTopup(
    tx: Tx,
    intent: TopupIntentDoc,
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
    return this.journal(
      tx,
      {
        type: 'Topup',
        topupId: intent._id,
        eventId,
        orderId: null,
        receiptId: null,
        postedAt: now,
      },
      CLEARING_ID,
      accountId,
      intent.amount,
    );
  }
  async settleExchange(
    tx: Tx,
    exchange: ExchangeDoc,
    now: Date,
  ) {
    if (exchange.diffAmount === 0) {
      if (exchange.initiatorDeposit > 0) {
        const initAccounts = await this.lockOrder(
          tx,
          exchange.initiatorId,
          exchange.initiatorOrderId,
          false,
        );
        await this.postOrder(
          tx,
          exchange.initiatorOrderId,
          randomUUID(),
          initAccounts,
          exchange.initiatorDeposit,
          now,
          true,
        );
      }
      if (exchange.recipientDeposit > 0) {
        const recAccounts = await this.lockOrder(
          tx,
          exchange.recipientId,
          exchange.recipientOrderId,
          false,
        );
        await this.postOrder(
          tx,
          exchange.recipientOrderId,
          randomUUID(),
          recAccounts,
          exchange.recipientDeposit,
          now,
          true,
        );
      }
    } else {
      const isInitDiff = exchange.diffPayerId === exchange.initiatorId;
      const payerId = isInitDiff
        ? exchange.initiatorId
        : exchange.recipientId;
      const payerOrderId = isInitDiff
        ? exchange.initiatorOrderId
        : exchange.recipientOrderId;
      const payerDeposit = isInitDiff
        ? exchange.initiatorDeposit
        : exchange.recipientDeposit;

      const receiverId = isInitDiff
        ? exchange.recipientId
        : exchange.initiatorId;
      const receiverOrderId = isInitDiff
        ? exchange.recipientOrderId
        : exchange.initiatorOrderId;
      const receiverDeposit = isInitDiff
        ? exchange.recipientDeposit
        : exchange.initiatorDeposit;

      if (receiverDeposit > 0) {
        const receiverAccounts = await this.lockOrder(
          tx,
          receiverId,
          receiverOrderId,
          false,
        );
        await this.postOrder(
          tx,
          receiverOrderId,
          randomUUID(),
          receiverAccounts,
          receiverDeposit,
          now,
          true,
        );
      }

      const payerHold = await tx.c.wallet_accounts.findOne({
        orderId: payerOrderId,
        purpose: 'OrderHold',
      });
      if (!payerHold) throw new Error('Payer wallet hold missing');
      const payerAvail = await this.account(tx, { ownerId: payerId });
      const receiverAvail = await this.account(tx, { ownerId: receiverId });

      await this.lockAccounts(tx, [
        payerHold._id,
        payerAvail._id,
        receiverAvail._id,
      ]);
      const totalHeld = payerDeposit + exchange.diffAmount;
      if ((await this.balance(tx, payerHold._id)) !== totalHeld)
        throw invalidState();

      const counter = await tx.c.counters.findOneAndUpdate(
        { _id: LEDGER_SEQUENCE_COUNTER },
        { $inc: { value: 1 } },
        { returnDocument: 'after' },
      );
      const journal: LedgerJournalDoc = {
        _id: randomUUID(),
        sequence: counter!.value,
        type: 'OrderSettlement',
        topupId: null,
        eventId: null,
        orderId: payerOrderId,
        receiptId: randomUUID(),
        postedAt: now,
      };
      await tx.c.ledger_journals.insertOne(journal);
      await tx.c.ledger_entries.insertMany([
        {
          _id: `${journal._id}:${payerHold._id}`,
          journalId: journal._id,
          accountId: payerHold._id,
          debit: 0,
          credit: totalHeld,
        },
        {
          _id: `${journal._id}:${payerAvail._id}`,
          journalId: journal._id,
          accountId: payerAvail._id,
          debit: payerDeposit,
          credit: 0,
        },
        {
          _id: `${journal._id}:${receiverAvail._id}`,
          journalId: journal._id,
          accountId: receiverAvail._id,
          debit: exchange.diffAmount,
          credit: 0,
        },
      ]);
      tx.check(`journal:${journal._id}`, () =>
        checkJournal(tx, journal._id),
      );
    }
  }
  async refundExchange(
    tx: Tx,
    exchange: ExchangeDoc,
    now: Date,
  ) {
    if (exchange.initiatorFundedAt) {
      const isInitDiff = exchange.diffPayerId === exchange.initiatorId;
      const amount =
        exchange.initiatorDeposit + (isInitDiff ? exchange.diffAmount : 0);
      if (amount > 0) {
        const accounts = await this.lockOrder(
          tx,
          exchange.initiatorId,
          exchange.initiatorOrderId,
          false,
        );
        await this.postOrder(
          tx,
          exchange.initiatorOrderId,
          randomUUID(),
          accounts,
          amount,
          now,
          true,
        );
      }
    }
    if (exchange.recipientFundedAt) {
      const isRecDiff = exchange.diffPayerId === exchange.recipientId;
      const amount =
        exchange.recipientDeposit + (isRecDiff ? exchange.diffAmount : 0);
      if (amount > 0) {
        const accounts = await this.lockOrder(
          tx,
          exchange.recipientId,
          exchange.recipientOrderId,
          false,
        );
        await this.postOrder(
          tx,
          exchange.recipientOrderId,
          randomUUID(),
          accounts,
          amount,
          now,
          true,
        );
      }
    }
  }
}

// Commit-time replacement for latlai_check_topup.
export async function checkTopupRecord(tx: Tx, topupId: string) {
  const t = await tx.c.topup_intents.findOne({ _id: topupId });
  if (!t) throw new Error('Topup missing');
  const journal = await tx.c.ledger_journals.findOne({ topupId });
  const events = await tx.c.simulated_payment_events
    .find({ intentId: topupId })
    .toArray();
  const chain = async (receiptId: string) => {
    const r = await tx.c.mutation_receipts.findOne({ _id: receiptId });
    const a = r && (await tx.c.audit_events.findOne({ receiptId }));
    const o = a && (await tx.c.outbox_events.findOne({ auditId: a._id }));
    return { r, a, o };
  };
  const creation = await tx.c.mutation_receipts.findOne({
    topupId,
    operation: 'createTopupIntent',
    actorId: t.ownerId,
    resultVersion: 1,
  });
  const created = creation ? await chain(creation._id) : null;
  let bad =
    (t.state === 'Succeeded' && !journal) ||
    (['Pending', 'Processing', 'Failed'].includes(t.state) && !!journal) ||
    t.version !== 1 + events.length ||
    !created?.o ||
    created.a?.topupId !== topupId;
  for (const e of events) {
    const { r, a, o } = await chain(e.receiptId);
    if (
      r?.topupId !== topupId ||
      r.operation !== 'emitSimulatedTopupEvent' ||
      a?.topupId !== topupId ||
      !o
    )
      bad = true;
    if (
      e.disposition !== 'ReviewRequired' &&
      (e.recipientId !== t.ownerId ||
        e.amount !== t.amount ||
        e.currency !== t.currency ||
        e.occurredAt < t.createdAt ||
        e.occurredAt.getTime() > e.receivedAt.getTime() + 300_000)
    )
      bad = true;
  }
  if (
    events.some((e) => e.disposition === 'ReviewRequired') &&
    t.state !== 'ReviewRequired'
  )
    bad = true;
  if (bad) throw new Error('Topup event/ledger/receipt mismatch');
}

export async function checkExchange(tx: Tx, exchangeId: string) {
  const ex = await tx.c.exchanges.findOne({ _id: exchangeId });
  if (!ex) throw new Error('Exchange missing');
  if (ex.status === 'Completed') {
    if (!ex.initiatorReceivedAt || !ex.recipientReceivedAt) {
      throw new Error('Exchange completed without both receipts');
    }
    const initHold = await tx.c.wallet_accounts.findOne({
      orderId: ex.initiatorOrderId,
      purpose: 'OrderHold',
    });
    const recHold = await tx.c.wallet_accounts.findOne({
      orderId: ex.recipientOrderId,
      purpose: 'OrderHold',
    });
    if (initHold && (await balanceOf(tx, initHold._id)) !== 0) {
      throw new Error('Initiator exchange hold not released on completion');
    }
    if (recHold && (await balanceOf(tx, recHold._id)) !== 0) {
      throw new Error('Recipient exchange hold not released on completion');
    }
  }
}

