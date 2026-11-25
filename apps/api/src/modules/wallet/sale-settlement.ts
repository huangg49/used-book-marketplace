import { randomUUID } from 'node:crypto';
import type { Tx } from '../../database/mongo/transaction.js';
import type { Wire } from '../commands/domain-error.js';
import { amountsFromAgreement } from '../orders/order-amounts.js';
import { signalMemberInbox } from '../commands/member-inbox-signal.js';

type Receipt = Wire['SaleSettlementReceipt'];
export type SaleSettlementOrder = Pick<Receipt, 'bookPrice' | 'commissionBps' | 'commission'> & {
  _id: string;
  sellerId: string;
  buyerTotal: number;
  sellerProceeds: number;
};

const numberFormat = new Intl.NumberFormat('vi-VN');
const vnd = (amount: number) => `${numberFormat.format(amount)}đ`;

function saleReceipt(
  amounts: Pick<Receipt, 'bookPrice' | 'commissionBps' | 'commission'>,
  shippingReimbursement: number,
  creditedAmount: number,
): Receipt {
  const { bookPrice, commissionBps, commission } = amounts;
  return { bookPrice, commissionBps, commission, shippingReimbursement, creditedAmount };
}

export async function notifySaleSettlement(tx: Tx, order: SaleSettlementOrder, now: Date) {
  const reference = `#ĐƠN-${order._id.slice(0, 6).toUpperCase()}`;
  const rate = numberFormat.format(order.commissionBps / 100);
  const shipping = order.sellerProceeds - (order.bookPrice - order.commission);
  const shippingNote = shipping > 0 ? ` Hoàn ứng phí giao ${vnd(shipping)}.` : '';
  await tx.c.member_notifications.insertOne({
    _id: randomUUID(),
    userId: order.sellerId,
    kind: 'OrderSaleSettled',
    title: `Đã nhận ${vnd(order.sellerProceeds)} tiền bán sách`,
    body: `${reference} · Tiền sách ${vnd(order.bookPrice)}. Phí dịch vụ ${rate}% đã trừ ${vnd(order.commission)}.${shippingNote} Mở Ví để xem biên nhận.`,
    targetType: 'Order',
    targetId: order._id,
    dedupeKey: `sale-settled:${order._id}:${order.sellerId}`,
    createdAt: now,
    readAt: null,
  });
  signalMemberInbox(tx, [order.sellerId]);
}

export async function saleSettlementReceipts(tx: Tx, sellerId: string, ids: string[]) {
  const receipts = new Map<string, Receipt>();
  if (!ids.length) return receipts;

  const pointOrders = await tx.c.point_orders.find({ _id: { $in: ids }, sellerId, state: 'Completed' }).toArray();
  for (const order of pointOrders) {
    receipts.set(order._id, saleReceipt(order, 0, order.sellerProceeds));
  }
  const directOrders = await tx.c.direct_orders.find({ _id: { $in: ids }, sellerId, state: 'Completed' }).toArray();
  if (!directOrders.length) return receipts;

  const contexts = await tx.c.workflow_contexts.find({ kind: 'Order', orderId: { $in: directOrders.map(order => order._id) } }).toArray();
  const agreements = new Map((await tx.c.agreement_snapshots.find({ _id: { $in: contexts.map(context => context._id) } }).toArray())
    .map(agreement => [agreement._id, amountsFromAgreement(agreement)]));
  const byOrder = new Map(contexts.map(context => [context.orderId, agreements.get(context._id)]));
  const legacyIds = directOrders.filter(order => !byOrder.get(order._id)).map(order => order.quoteId);
  const quotes = new Map((legacyIds.length
    ? await tx.c.sale_quotes.find({ _id: { $in: legacyIds }, sellerId }).toArray()
    : []).map(quote => [quote._id, quote]));

  for (const order of directOrders) {
    const agreed = byOrder.get(order._id);
    const quote = quotes.get(order.quoteId);
    if (agreed) {
      receipts.set(order._id, saleReceipt(agreed, agreed.shippingFee, agreed.sellerProceedsOnCompletion));
    } else if (quote) {
      receipts.set(order._id, saleReceipt(quote, quote.shippingFee, quote.sellerProceeds));
    }
  }
  return receipts;
}
