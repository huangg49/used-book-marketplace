import { randomUUID } from 'node:crypto';
import type {
  AuctionDoc,
  MemberNotificationDoc,
} from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import { nextMinimumBid } from './auction-engine.js';

// FR-N03/N04 inbox rows for auction events, written inside the caller's
// transaction so they exist exactly when the event committed. The text holds
// public prices, states and deadlines only — never a private Auto ceiling,
// another member's identity, a collection code or an address.
type Kind = MemberNotificationDoc['kind'];

const vnd = (amount: number | null) =>
  amount === null ? '—' : `${amount.toLocaleString('vi-VN')}đ`;
const when = (at: Date | null) =>
  at
    ? at.toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
      })
    : '—';

async function context(tx: Tx, a: AuctionDoc) {
  const item = await tx.c.workflow_items.findOne({
    _id: `${a.contextId}:${a.listingId}`,
  });
  const point = await tx.c.handover_points.findOne({ _id: a.pointId });
  const raw = String((item?.snapshot as { title?: string })?.title ?? 'Sách');
  return {
    title: `“${raw.length > 120 ? `${raw.slice(0, 117)}…` : raw}”`,
    point: point?.name ?? 'điểm giao nhận',
  };
}

type Text = { title: string; body: string };
type Message = (c: { title: string; point: string }, a: AuctionDoc) => Text;

const MESSAGES: Record<Kind, Record<'default' | 'seller', Message>> = {
  AuctionOutbid: {
    default: (c, a) => {
      const next = nextMinimumBid(a);
      return {
        title: 'Bạn đã bị vượt giá',
        body: `${c.title}: giá hiện tại ${vnd(a.currentPrice)}. ${next === null ? 'Phiên đã đạt giá tối đa.' : `Trả từ ${vnd(next)} để dẫn lại.`}`,
      };
    },
    seller: () => ({ title: '', body: '' }),
  },
  AuctionWon: {
    default: (c, a) => ({
      title: 'Bạn đã thắng phiên đấu giá',
      body: `${c.title} với giá ${vnd(a.finalPrice)}. Thanh toán từ ví trước ${when(a.paymentDeadline)} để nhận sách tại ${c.point}.`,
    }),
    seller: () => ({ title: '', body: '' }),
  },
  AuctionSold: {
    default: () => ({ title: '', body: '' }),
    seller: (c, a) => ({
      title: 'Phiên đấu giá đã kết thúc',
      body: `${c.title} chốt giá ${vnd(a.finalPrice)}. Đang chờ người thắng thanh toán trước ${when(a.paymentDeadline)}.`,
    }),
  },
  AuctionBoughtNow: {
    default: () => ({ title: '', body: '' }),
    seller: (c, a) => ({
      title: 'Sách của bạn đã được mua ngay',
      body: `${c.title} với giá ${vnd(a.finalPrice)}. Đang chờ người mua thanh toán trước ${when(a.paymentDeadline)}.`,
    }),
  },
  AuctionUnsold: {
    default: () => ({ title: '', body: '' }),
    seller: (c) => ({
      title: 'Phiên đấu giá không có người trả giá',
      body: `${c.title} kết thúc không có lượt trả giá. Sách được trả lại cho bạn tại ${c.point}.`,
    }),
  },
  AuctionCancelled: {
    default: (c) => ({
      title: 'Phiên đấu giá đã bị hủy',
      body: `${c.title} đã bị quản trị viên hủy. Lượt trả giá của bạn hết hiệu lực; không có khoản tiền nào bị giữ.`,
    }),
    seller: (c) => ({
      title: 'Phiên đấu giá đã bị hủy',
      body: `${c.title} đã bị quản trị viên hủy. Sách được trả lại cho bạn tại ${c.point}.`,
    }),
  },
  AuctionOnHold: {
    default: (c) => ({
      title: 'Phiên đấu giá tạm dừng',
      body: `${c.title} tạm dừng để quản trị viên xem xét. Lượt trả giá không bị xóa và chưa có người thắng.`,
    }),
    seller: (c) => ({
      title: 'Phiên đấu giá tạm dừng',
      body: `${c.title} tạm dừng để quản trị viên xem xét; phiên không nhận thêm giá.`,
    }),
  },
  AuctionPaymentExpired: {
    default: (c) => ({
      title: 'Đã quá hạn thanh toán',
      body: `${c.title}: hạn thanh toán đã qua. Sách được trả lại người bán và lượt không thanh toán đã được ghi nhận.`,
    }),
    seller: (c) => ({
      title: 'Người thắng không thanh toán',
      body: `${c.title}: người thắng không thanh toán đúng hạn. Sách được trả lại cho bạn tại ${c.point}.`,
    }),
  },
  AuctionPaid: {
    default: () => ({ title: '', body: '' }),
    seller: (c, a) => ({
      title: 'Người thắng đã thanh toán',
      body: `${c.title}: ${vnd(a.finalPrice)} được giữ đến khi người mua nhận sách tại ${c.point}.`,
    }),
  },
};

/**
 * Writes one row per recipient for an auction event. `a` is the auction after
 * the change: its version makes the dedupe key unique per event, so a retried
 * transaction cannot notify twice. The seller gets the seller wording.
 */
export async function notifyAuction(
  tx: Tx,
  a: AuctionDoc,
  kind: Kind,
  recipients: (string | null | undefined)[],
  now: Date,
) {
  const users = [...new Set(recipients.filter((u): u is string => !!u))];
  if (!users.length) return;
  const c = await context(tx, a);
  const rows: MemberNotificationDoc[] = [];
  for (const userId of users) {
    const text = MESSAGES[kind][userId === a.sellerId ? 'seller' : 'default'](
      c,
      a,
    );
    if (!text.title) continue;
    rows.push({
      _id: randomUUID(),
      userId,
      kind,
      title: text.title,
      body: text.body.slice(0, 400),
      targetType: 'Auction',
      targetId: a._id,
      dedupeKey: `${kind}:${a._id}:${a.version}:${userId}`,
      createdAt: now,
      readAt: null,
    });
  }
  if (rows.length) await tx.c.member_notifications.insertMany(rows);
}
