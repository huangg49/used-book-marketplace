import type { Document } from 'mongodb';
import type { Tx } from '../../database/mongo/transaction.js';
import { regexLiteral } from '../commands/mongo-page.service.js';
import type { Wire } from '../commands/domain-error.js';

export const historyLabels: Record<Wire['FinanceHoldHistoryKind'], string> = {
  AuctionRelease: 'Hoàn cọc đấu giá',
  AuctionForfeit: 'Tịch thu cọc đấu giá',
  OrderRefund: 'Hoàn cọc / tiền đơn',
  WithdrawalRefund: 'Hoàn lệnh rút tiền',
  ExchangeCompensation: 'Chuyển tiền xử lý đổi sách',
};
export const lockLabels: Record<Wire['FinanceHoldKind'], string> = {
  Exchange: 'Cọc trao đổi',
  AuctionBid: 'Cọc đấu giá',
  DirectOrder: 'Đơn mua trực tiếp',
  PointOrder: 'Đơn đấu giá tại điểm',
  Withdrawal: 'Tạm giữ rút tiền',
};
const transferLabels: Record<Wire['FinanceTransferKind'], string> = {
  Topup: 'Nạp tiền vào ví',
  WithdrawalPayout: 'Rút tiền hoàn tất',
};

type JournalKind = Wire['FinanceHoldHistoryKind'] | Wire['FinanceHoldKind'] | Wire['FinanceTransferKind'];
type Report = 'history' | 'locks' | 'transfers';
type Branch = { when: Document; kind: JournalKind; amount: Document; userId: Document; referenceId: Document; detail: string };
type JournalItem<K> = {
  journalId: string;
  kind: K;
  kindLabel: string;
  userId: string | null;
  userName: string;
  userEmail: string | null;
  amount: number;
  referenceId: string | null;
  detail: string;
  postedAt: string;
};

const types: Record<Report, string[]> = {
  history: ['AuctionBidRelease', 'AuctionDepositForfeit', 'OrderRefund', 'WithdrawalRefund', 'ExchangeReturnRefund', 'ExchangeNonReturnCompensation'],
  locks: ['AuctionBidHold', 'OrderPayment', 'WithdrawalHold'],
  transfers: ['Topup', 'WithdrawalPayout'],
};
const typeIs = (type: string) => ({ $eq: ['$type', type] });
const lookup = (from: string, localField: string, foreignField: string, as: string, fields: Document = { _id: 1 }): Document => ({
  $lookup: { from, localField, foreignField, as, pipeline: [{ $project: fields }] },
});
const first = (path: string) => ({ $arrayElemAt: [path, 0] });
const coalesce = (...values: string[]) => ({ $ifNull: [...values, null] });
const amount = (...values: string[]) => ({ $ifNull: [...values, 0] });

function entry(side: 'credit' | 'debit', ...purposes: string[]) {
  return { $arrayElemAt: [{
    $filter: {
      input: '$entries',
      as: 'e',
      cond: { $and: [{ $in: ['$$e.account.purpose', purposes] }, { $gt: ['$$e.' + side, 0] }] },
    },
  }, 0] };
}

function branch(when: Document, kind: JournalKind, money: Document, userId: Document, referenceId: Document, detail: string): Branch {
  return { when, kind, amount: money, userId, referenceId, detail };
}

const orderRef = coalesce('$orderId', '$hold.account.orderId');
const withdrawRef = coalesce('$withdrawalId', '$hold.account.withdrawalId');
const auctionRef = coalesce('$auctionId', '$hold.account.auctionId');
const creditToWallet = amount('$wallet.debit', '$hold.credit');
const walletOwner = coalesce('$wallet.account.ownerId');
const locked = amount('$hold.debit', '$wallet.credit');
const lockOwner = coalesce('$wallet.account.ownerId', '$hold.account.holderId');

function reportBranches(report: Report): Branch[] {
  if (report === 'history') return [
    branch(typeIs('AuctionBidRelease'), 'AuctionRelease', creditToWallet,
      coalesce('$wallet.account.ownerId', '$hold.account.holderId'), auctionRef, 'Trả cọc đấu giá về ví khả dụng'),
    branch(typeIs('AuctionDepositForfeit'), 'AuctionForfeit',
      amount('$platform.debit', '$forfeitSource.credit'),
      coalesce('$forfeitSource.account.holderId', '$forfeitSource.account.ownerId'), auctionRef,
      'Tịch thu cọc do người thắng quá hạn thanh toán (50% người bán · 50% nền tảng)'),
    branch(typeIs('WithdrawalRefund'), 'WithdrawalRefund', creditToWallet, walletOwner, withdrawRef,
      'Hoàn tiền lệnh rút bị từ chối / thất bại về ví khả dụng'),
    branch(typeIs('ExchangeReturnRefund'), 'OrderRefund', creditToWallet, walletOwner,
      coalesce('$exchangeId', '$orderRef'), 'Hoàn cọc đổi sách về ví sau xử lý tranh chấp'),
    branch(typeIs('ExchangeNonReturnCompensation'), 'ExchangeCompensation', creditToWallet,
      walletOwner, coalesce('$exchangeId', '$orderRef'), 'Bồi thường hoặc chuyển tiền bù theo phán quyết đổi sách'),
    branch(typeIs('OrderRefund'), 'OrderRefund', creditToWallet, walletOwner,
      coalesce('$orderRef'), 'Hoàn tiền đơn hàng / cọc trao đổi về ví khả dụng'),
  ];
  if (report === 'locks') return [
    branch(typeIs('AuctionBidHold'), 'AuctionBid', locked, lockOwner, auctionRef,
      'Tạm giữ tiền cọc khi tham gia / đặt giá phiên đấu giá'),
    branch(typeIs('WithdrawalHold'), 'Withdrawal', locked, lockOwner, withdrawRef,
      'Tạm giữ số dư khi yêu cầu rút tiền chờ duyệt'),
    branch({ $ne: ['$exchangeId', null] }, 'Exchange', locked, lockOwner,
      coalesce('$exchangeId'), 'Tạm giữ tiền cọc đảm bảo giao dịch trao đổi sách'),
    branch({ $gt: [{ $size: '$pointOrder' }, 0] }, 'PointOrder', locked, lockOwner,
      coalesce('$orderRef'), 'Tạm giữ tiền thanh toán đơn thắng đấu giá giao tại điểm'),
    branch({ $gt: [{ $size: '$directOrder' }, 0] }, 'DirectOrder', locked, lockOwner,
      coalesce('$orderRef'), 'Tạm giữ tiền thanh toán đơn mua trực tiếp chờ tất toán'),
    branch(typeIs('OrderPayment'), 'DirectOrder', locked, lockOwner,
      coalesce('$orderRef'), 'Tạm giữ tiền thanh toán đơn hàng trên sổ cái'),
  ];
  return [
    branch(typeIs('Topup'), 'Topup', amount('$wallet.debit'), walletOwner,
      coalesce('$topupId', '$_id'), 'Nạp tiền thành công vào ví khả dụng thành viên'),
    branch(typeIs('WithdrawalPayout'), 'WithdrawalPayout', amount('$hold.credit', '$clearing.debit'),
      coalesce('$withdrawalOwner'), coalesce('$withdrawRef', '$_id'),
      'Đã chi trả lệnh rút tiền ra khỏi hệ thống'),
  ];
}

function journalItemStages(report: Report): Document[] {
  const labels = { ...historyLabels, ...lockLabels, ...transferLabels };
  return [
    { $match: { type: { $in: types[report] } } },
    lookup('ledger_entries', '_id', 'journalId', 'lines', { accountId: 1, credit: 1, debit: 1 }),
    lookup('wallet_accounts', 'lines.accountId', '_id', 'accounts',
      { purpose: 1, ownerId: 1, holderId: 1, orderId: 1, auctionId: 1, withdrawalId: 1 }),
    { $set: { entries: { $map: { input: '$lines', as: 'line', in: {
      debit: '$$line.debit',
      credit: '$$line.credit',
      account: { $arrayElemAt: [{
        $filter: { input: '$accounts', as: 'account', cond: { $eq: ['$$account._id', '$$line.accountId'] } },
      }, 0] },
    } } } } },
    { $set: {
      wallet: entry(report === 'locks' ? 'credit' : 'debit', 'UserAvailable'),
      hold: entry(report === 'locks' ? 'debit' : 'credit', 'AuctionBidHold', 'OrderHold', 'WithdrawalHold'),
      ...(report === 'history' ? {
        platform: entry('debit', 'PlatformCommission'),
        forfeitSource: entry('credit', 'UserAvailable', 'AuctionBidHold'),
      } : {}),
      ...(report === 'transfers' ? { clearing: entry('debit', 'SimulatorClearing') } : {}),
    } },
    { $set: { orderRef, withdrawRef } },
    ...(report === 'transfers' ? [
      lookup('withdrawals', 'withdrawRef', '_id', 'withdrawal', { ownerId: 1 }),
      { $set: { withdrawalOwner: first('$withdrawal.ownerId') } },
    ] : [
      lookup('exchanges', 'orderRef', 'initiatorOrderId', 'initiated'),
      lookup('exchanges', 'orderRef', 'recipientOrderId', 'received'),
      { $set: { exchangeId: { $ifNull: [first('$initiated._id'), first('$received._id'), null] } } },
    ]),
    ...(report === 'locks' ? [
      lookup('point_orders', 'orderRef', '_id', 'pointOrder'),
      lookup('direct_orders', 'orderRef', '_id', 'directOrder'),
    ] : []),
    { $set: { item: { $switch: {
      branches: reportBranches(report).map(({ when, kind, ...fields }) => ({
        case: when,
        then: { ...fields, kind, kindLabel: labels[kind] },
      })),
      default: null,
    } } } },
    { $match: { 'item.amount': { $gt: 0 } } },
    { $project: {
      _id: 0,
      journalId: '$_id', sequence: 1, postedAt: 1, orderRef: 1, exchangeId: 1,
      kind: '$item.kind', kindLabel: '$item.kindLabel', userId: '$item.userId',
      amount: '$item.amount', referenceId: '$item.referenceId', detail: '$item.detail',
    } },
  ];
}

const userStages: Document[] = [
  lookup('users', 'userId', '_id', 'user', { displayName: 1, emailNormalized: 1 }),
  { $set: {
    userName: { $ifNull: [first('$user.displayName'), '$userId', 'Không xác định'] },
    userEmail: { $ifNull: [first('$user.emailNormalized'), null] },
  } },
  { $unset: 'user' },
];

export async function financeJournalPage<K extends JournalKind>(
  tx: Tx, report: Report, query: Record<string, string | number>,
) {
  const pageSize = 15 as const;
  const page = Math.max(1, Number(query.page ?? 1));
  const kind = String(query.kind ?? 'All');
  const search = String(query.q ?? '').trim().replace(/^#(?=[\da-f]{8,}(?:-|$))/i, '');
  const match: Document = {};
  if (kind !== 'All') match.kind = kind;
  if (search) {
    const term = { $regex: regexLiteral(search), $options: 'i' };
    match.$or = ['userName', 'userEmail', 'referenceId', 'journalId', 'kindLabel', 'detail', 'orderRef', 'exchangeId']
      .map((field) => ({ [field]: term }));
  }
  const filter: Document[] = search || kind !== 'All' ? [{ $match: match }] : [];
  const [result] = await tx.c.ledger_journals.aggregate<{
    summary: { _id: K; count: number; amount: number }[];
    count: { total: number }[];
    items: (Omit<JournalItem<K>, 'postedAt'> & { postedAt: Date })[];
  }>([
    ...journalItemStages(report),
    ...(search ? userStages : []),
    { $facet: {
      summary: [{ $group: { _id: '$kind', count: { $sum: 1 }, amount: { $sum: '$amount' } } }],
      count: [...filter, { $count: 'total' }],
      items: [
        ...filter,
        { $sort: { postedAt: -1, sequence: -1 } },
        { $skip: Math.min(Number.MAX_SAFE_INTEGER, (page - 1) * pageSize) },
        { $limit: pageSize },
        ...(search ? [] : userStages),
        { $unset: ['sequence', 'orderRef', 'exchangeId'] },
      ],
    } },
  ]).toArray();
  return {
    page,
    pageSize,
    totalItems: result?.count[0]?.total ?? 0,
    items: (result?.items ?? []).map((item) => ({ ...item, postedAt: item.postedAt.toISOString() })),
    summary: new Map((result?.summary ?? []).map(({ _id, ...totals }) => [_id, totals])),
  };
}
