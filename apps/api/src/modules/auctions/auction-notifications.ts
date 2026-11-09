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
type Kind = Extract<MemberNotificationDoc['kind'], `Auction${string}`>;

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
// ADR 0079: one sentence on why a cancelled auction ended; an Admin's own
// reason is quoted (it is public moderation text, never private data).
function cancelCause(a: AuctionDoc, seller: boolean) {
  const reason = (a.cancelReason ?? '').slice(0, 160);
  switch (a.closeReason) {
    case 'RegistrationExpired':
      return a.opensAt
        ? `không đủ ${a.minBidders ?? 4} người đăng ký trong 24 giờ sau giờ mở nên đã bị hủy.`
        : `không đủ ${a.minBidders ?? 4} người đăng ký trước giờ mở nên đã bị hủy.`;
    case 'SellerClosed':
      return seller
        ? 'đã được bạn đóng trước giờ mở.'
        : 'đã được người bán đóng trước giờ mở.';
    case 'HoldExpired':
      return 'tạm dừng quá 48 giờ mà chưa được xử lý nên đã tự hủy.';
    case 'Reported':
      return `đã bị quản trị viên đóng sau khi xem xét báo cáo: “${reason}”.`;
    default:
      return 'đã bị quản trị viên hủy.';
  }
}
type Message = (c: { title: string; point: string }, a: AuctionDoc) => Text;

// ADR 0075: hold/release rows go to one holder and carry the moved amount,
// so they are written by notifyAuctionFunds; the shared map stays silent.
const silent = { default: () => ({ title: '', body: '' }), seller: () => ({ title: '', body: '' }) };
const MESSAGES: Record<Kind, Record<'default' | 'seller', Message>> = {
  AuctionFundsHeld: silent,
  AuctionFundsReleased: silent,
  // ADR 0077: registration gate and deposit outcomes.
  AuctionBiddingStarted: {
    default: (c, a) => ({
      title: 'Phiên đấu giá đã mở trả giá',
      body: `${c.title} đã đủ ${a.minBidders ?? 2} người đăng ký. Bạn trả giá được từ ${when(a.startAt)} đến ${when(a.endAt)}.`,
    }),
    seller: (c, a) => ({
      title: 'Phiên của bạn đã đủ người đăng ký',
      body: `${c.title} đã có ${a.registeredCount} người đăng ký; người mua bắt đầu trả giá được.`,
    }),
  },
  AuctionNotEnoughBidders: {
    default: (c, a) => ({
      title: 'Phiên đấu giá không đủ người tham gia',
      body: `${c.title} kết thúc mà chưa đủ ${a.minBidders ?? 2} người đăng ký hoặc chưa có hai người trả giá, nên không bán. Tiền cọc của bạn đã về lại ví.`,
    }),
    seller: (c) => ({
      title: 'Phiên đấu giá không đủ người tham gia',
      body: `${c.title} không đủ người tham gia nên không bán. Sách được trả lại cho bạn tại ${c.point}.`,
    }),
  },
  AuctionDepositForfeited: {
    default: (c, a) => ({
      title: 'Tiền cọc không được hoàn',
      body: `${c.title}: bạn không thanh toán đúng hạn nên tiền cọc ${vnd(a.depositAmount)} được chuyển cho nền tảng theo quy định phiên. Phần tiền giữ còn lại đã về ví.`,
    }),
    seller: () => ({ title: '', body: '' }),
  },
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
    // ADR 0043: Buy Now opens a 60-second window; legacy rows had an Order.
    seller: (c, a) =>
      // ADR 0074: Instant ends at the Buy Now moment; the close follows.
      a.buyNowAt && a.buyNowMode === 'Instant'
        ? {
            title: 'Sách của bạn đã được mua ngay',
            body: `${c.title} với giá ${vnd(a.currentPrice)}. Phiên kết thúc ngay; hệ thống đang chốt đơn cho người mua.`,
          }
        : a.buyNowAt
        ? {
            title: 'Có người chọn mua ngay sách của bạn',
            body: `${c.title} với giá ${vnd(a.currentPrice)}. Người khác còn đến ${when(a.endAt)} để trả cao hơn; sau đó người dẫn đầu thắng phiên.`,
          }
        : {
            title: 'Sách của bạn đã được mua ngay',
            body: `${c.title} với giá ${vnd(a.finalPrice)}. Đang chờ người mua thanh toán trước ${when(a.paymentDeadline)}.`,
          },
  },
  AuctionUnsold: {
    default: () => ({ title: '', body: '' }),
    seller: (c) => ({
      title: 'Phiên đấu giá không có người trả giá',
      body: `${c.title} kết thúc không có lượt trả giá. Sách được trả lại cho bạn tại ${c.point}.`,
    }),
  },
  // ADR 0079: the wording follows why the auction was cancelled.
  AuctionCancelled: {
    default: (c, a) => ({
      title: 'Phiên đấu giá đã bị hủy',
      body: `${c.title} ${cancelCause(a, false)} Lượt trả giá và đăng ký của bạn hết hiệu lực; tiền cọc và khoản giữ (nếu có) được trả lại ví.`,
    }),
    seller: (c, a) => ({
      title: 'Phiên đấu giá đã bị hủy',
      body: `${c.title} ${cancelCause(a, true)} Sách được trả lại cho bạn tại ${c.point}.`,
    }),
  },
  AuctionRescheduled: {
    default: (c, a) => ({
      title: 'Phiên đấu giá đổi giờ mở',
      // ADR 0081: until the minimum is reached startAt is the deadline.
      body:
        a.opensAt && a.biddingOpenedAt === null
          ? `${c.title} nay mở lúc ${when(a.opensAt)} nếu đủ ${a.minBidders ?? 4} người đăng ký; chưa đủ thì chờ thêm tới ${when(a.startAt)} rồi hủy. Bạn có thể rút đăng ký trước khi phiên đủ người.`
          : `${c.title} nay mở lúc ${when(a.startAt)} và kết thúc ${when(a.endAt)}. Bạn có thể rút đăng ký trước khi phiên đủ người.`,
    }),
    seller: () => ({ title: '', body: '' }),
  },
  // ADR 0080: the deadlines did not move while it was paused.
  AuctionResumed: {
    default: (c, a) => ({
      title: 'Phiên đấu giá tiếp tục',
      body: `${c.title} tiếp tục sau khi quản trị viên xem xét. Lượt trả giá, đăng ký và tiền cọc được giữ nguyên; phiên vẫn kết thúc lúc ${when(a.endAt)}.`,
    }),
    seller: (c, a) => ({
      title: 'Phiên đấu giá tiếp tục',
      body: `${c.title} tiếp tục sau khi quản trị viên xem xét; phiên vẫn kết thúc lúc ${when(a.endAt)}.`,
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
const NOTIFICATION_BODY_MAX = 400;
export function withNote(body: string, note?: string) {
  const clean = note?.replace(/\s+/g, ' ').trim();
  if (!clean) return body.slice(0, NOTIFICATION_BODY_MAX);
  const lead = `${body} Lời nhắn của quản trị viên: “`;
  const room = NOTIFICATION_BODY_MAX - lead.length - 1;
  if (room < 10) return body.slice(0, NOTIFICATION_BODY_MAX);
  const quoted = [...clean].length > room ? `${[...clean].slice(0, room - 1).join('')}…` : clean;
  return `${lead}${quoted}”`;
}
export async function notifyAuction(
  tx: Tx,
  a: AuctionDoc,
  kind: Kind,
  recipients: (string | null | undefined)[],
  now: Date,
  // ADR 0083: an Admin's note for the members (the resume reason), appended
  // after the standard text and shortened to fit the 400-character body.
  note?: string,
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
      body: withNote(text.body, note),
      targetType: 'Auction',
      targetId: a._id,
      dedupeKey: `${kind}:${a._id}:${a.version}:${userId}`,
      createdAt: now,
      readAt: null,
    });
  }
  if (rows.length) await tx.c.member_notifications.insertMany(rows);
}

export type FundsReason =
  | 'Leading'
  | 'Outbid'
  | 'Closed'
  | 'Cancelled'
  | 'Expired'
  // ADR 0077
  | 'Registered'
  | 'Withdrawn'
  | 'NotEnoughBidders'
  | 'NotWon';
const RELEASE_REASON: Record<Exclude<FundsReason, 'Leading' | 'Registered'>, string> = {
  Withdrawn: 'Bạn đã rút đăng ký nên tiền cọc được trả lại ví.',
  NotEnoughBidders: 'Phiên không đủ người tham gia nên tiền cọc và khoản giữ được trả lại ví.',
  Outbid: 'Bạn đã bị vượt giá nên khoản giữ được trả lại ví.',
  Closed: 'Phiên đã chốt; phần giữ vượt giá chốt được trả lại ví.',
  NotWon: 'Phiên đã kết thúc và bạn không thắng nên tiền cọc và khoản giữ được trả lại ví.',
  Cancelled: 'Phiên đã bị hủy nên khoản giữ được trả lại ví.',
  Expired: 'Đơn không được thanh toán đúng hạn nên khoản giữ được trả lại ví.',
};
/**
 * ADR 0075: tells one holder that their wallet hold for this auction moved.
 * `delta` is the signed change; only the holder ever sees the amount.
 */
export async function notifyAuctionFunds(
  tx: Tx,
  a: AuctionDoc,
  holderId: string,
  delta: number,
  reason: FundsReason,
  now: Date,
) {
  if (delta === 0) return;
  const c = await context(tx, a);
  const kind: Kind = delta > 0 ? 'AuctionFundsHeld' : 'AuctionFundsReleased';
  const text =
    delta > 0 && reason === 'Registered'
      ? {
          title: 'Đã giữ tiền cọc đăng ký đấu giá',
          body: `${c.title}: đã giữ ${vnd(delta)} tiền cọc. Tiền cọc được hoàn khi bạn không thắng hoặc phiên không đủ người; nếu thắng mà không thanh toán đúng hạn, tiền cọc không được hoàn.`,
        }
      : delta > 0
      ? {
          title: 'Ví đã giữ tiền cho lượt trả giá',
          body: `${c.title}: đã giữ thêm ${vnd(delta)} khỏi số dư khả dụng trong lúc bạn dẫn giá. Nếu bị vượt giá hoặc phiên bị hủy, tiền được trả lại ví.`,
        }
      : {
          title: 'Đã trả lại tiền giữ vào ví',
          body: `${c.title}: ${vnd(-delta)} đã về số dư khả dụng. ${RELEASE_REASON[reason as keyof typeof RELEASE_REASON] ?? ''}`.trim(),
        };
  await tx.c.member_notifications.insertOne({
    _id: randomUUID(),
    userId: holderId,
    kind,
    title: text.title,
    body: text.body.slice(0, 400),
    targetType: 'Auction',
    targetId: a._id,
    dedupeKey: `${kind}:${a._id}:${a.version}:${holderId}`,
    createdAt: now,
    readAt: null,
  });
}
