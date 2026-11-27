import type { ReactNode } from "react";
import type { PurchaseConversation } from "../../services/purchase-conversations";
import type { Exchange } from "../../services/exchange";
import { auctionPhase, type MyAuctionItem } from "../../services/auctions";
import { formatVnd } from "../../lib/routes";

/**
 * Status, roles and the "next step" line for every card in the /chat hub,
 * all read from fields the API already returns. One place, so the inbox and
 * the hub tabs say the same thing about the same transaction.
 */
export type StatusTone = "attention" | "progress" | "complete" | "closed";
export type StatusInfo = { label: string; tone: StatusTone };
export type Fact = { label: string; value: ReactNode };

export function shortDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}
export function dateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
/** Day + time without the year, for deadlines inside a card. */
export function shortDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(value));
}

// ─── Conversations (buy now / exchange intent) ────────────────────────────────

/**
 * The room stores the listing owner as "seller" even for a swap, so roles are
 * worded by mode: buyer/seller for a sale, owner/requester for an exchange.
 */
export function conversationRoles(room: PurchaseConversation, userId: string) {
  const exchange = room.terms?.mode === "Exchange";
  const buyer = room.buyer.id === userId;
  return {
    exchange,
    partner: buyer ? room.seller : room.buyer,
    mine: exchange ? (buyer ? "Bạn muốn đổi" : "Sách của bạn") : buyer ? "Bạn mua" : "Bạn bán",
    theirs: exchange ? (buyer ? "Chủ sách" : "Người muốn đổi") : buyer ? "Người bán" : "Người mua",
  };
}

export function conversationStatus(room: PurchaseConversation, userId: string): StatusInfo {
  const pending = room.terms?.pendingProposal;
  if (pending)
    return pending.proposedById === userId
      ? { label: "Chờ đối tác phản hồi", tone: "progress" }
      : { label: "Cần bạn phản hồi", tone: "attention" };
  if (room.status === "OrderCreated") return { label: "Đã tạo đơn", tone: "complete" };
  if (room.status === "Expired") return { label: "Hết hạn", tone: "closed" };
  if (room.status === "Cancelled") return { label: "Đã đóng", tone: "closed" };
  if (room.terms?.mode === "Exchange") return { label: "Đang bàn đổi sách", tone: "progress" };
  return room.terms?.agreedPrice != null
    ? { label: "Đã thống nhất giá", tone: "progress" }
    : { label: "Đang thương lượng", tone: "progress" };
}

/** The one line that tells the member what happens next. */
export function conversationNext(room: PurchaseConversation, userId: string): ReactNode {
  const pending = room.terms?.pendingProposal;
  const price = (amount: number | null | undefined) => (amount != null ? <> <b>{formatVnd(amount)}</b></> : null);
  if (pending) {
    const what = pending.kind === "Mode"
      ? <> chuyển sang <b>{pending.mode === "Exchange" ? "đổi sách" : "thương lượng mua"}</b></>
      : <> giá{price(pending.amount)}</>;
    return pending.proposedById === userId
      ? <>Bạn đã đề nghị{what}; chờ đối tác phản hồi.</>
      : <><b>Đối tác đề nghị</b>{what}; đang chờ bạn.</>;
  }
  if (room.status === "OrderCreated") return <>Đã tạo đơn; theo dõi giao nhận ở <b>Đơn hàng</b>.</>;
  if (room.status === "Expired") return <>Hội thoại đã hết hạn; tin nhắn cũ vẫn xem được.</>;
  if (room.status === "Cancelled") return <>Hội thoại đã đóng.</>;
  if (room.terms?.mode === "Exchange") return <>Nhắn tin rồi <b>gửi đề nghị đổi</b>; phiếu đổi sách tạo khi hai bên đồng ý.</>;
  if (room.terms?.agreedPrice != null) return <>Đã thống nhất{price(room.terms.agreedPrice)}.</>;
  return <>Nhắn tin để hỏi về sách và <b>thống nhất giá</b>.</>;
}

export function conversationFacts(room: PurchaseConversation): Fact[] {
  const agreed = room.terms?.agreedPrice;
  return [
    room.terms?.mode === "Exchange"
      ? { label: "Hình thức", value: "Đổi sách" }
      : { label: "Giá thống nhất", value: agreed != null ? formatVnd(agreed) : "Chưa có" },
    room.status === "Active" && room.expiresAt
      ? { label: "Mở đến", value: shortDateTime(room.expiresAt) }
      : room.status === "OrderCreated"
        ? { label: "Đơn hàng", value: "Đã tạo" }
        : room.closedAt ?? room.expiresAt
          ? { label: "Đóng lúc", value: shortDateTime((room.closedAt ?? room.expiresAt)!) }
          : { label: "Trạng thái", value: "Đã đóng" },
  ];
}

// ─── Exchanges ────────────────────────────────────────────────────────────────

export function exchangeStatus(exchange: Exchange, userId: string): StatusInfo {
  switch (exchange.status) {
    case "Proposed": {
      if (exchange.proposalExpiresAt && Date.parse(exchange.proposalExpiresAt) <= Date.now())
        return { label: "Đề nghị đã hết hạn", tone: "closed" };
      return (exchange.lastProposedById ?? exchange.initiatorId) !== userId
        ? { label: "Cần bạn phản hồi", tone: "attention" }
        : { label: "Chờ đối tác phản hồi", tone: "progress" };
    }
    case "AcceptedAwaitingFunding":
      return { label: "Chờ đặt cọc", tone: "attention" };
    case "Preparing":
      return { label: "Chuẩn bị gửi sách", tone: "progress" };
    case "InTransit":
      return { label: "Đang giao nhận", tone: "progress" };
    case "Delivered":
      return exchange.initiatorReceivedAt && exchange.recipientReceivedAt
        ? { label: "Đang kiểm tra sách", tone: "progress" }
        : { label: "Chờ xác nhận đã nhận", tone: "progress" };
    case "Completed":
      return { label: "Hoàn tất", tone: "complete" };
    case "ResolutionPending":
      return { label: "Đang giải quyết sự cố", tone: "attention" };
    case "Cancelled":
      if (exchange.cancelReason === "CancelledByUser" && exchange.rejectionReason)
        return { label: "Đề nghị bị từ chối", tone: "closed" };
      return exchange.cancelReason === "FundingExpired" ||
        exchange.cancelReason === "ProposalExpired" ||
        exchange.cancelReason === "ShippingExpired"
        ? { label: "Hết hạn xử lý", tone: "closed" }
        : { label: "Đã hủy", tone: "closed" };
  }
}

export function exchangeNext(exchange: Exchange): ReactNode {
  const at = (label: string, value?: string | null) => (value ? <>{label} <b>{shortDateTime(value)}</b></> : null);
  switch (exchange.status) {
    case "Proposed": return at("Hạn phản hồi đề nghị", exchange.proposalExpiresAt) ?? <>Đề nghị đổi đang chờ phản hồi.</>;
    case "AcceptedAwaitingFunding": return at("Đặt cọc trước", exchange.fundingDeadline) ?? <>Hai bên đặt cọc để bắt đầu giao nhận.</>;
    case "Preparing": return at("Gửi sách trước", exchange.shippingDeadline) ?? <>Chuẩn bị và gửi sách của bạn.</>;
    case "InTransit": return <>Sách đang trên đường <b>giao nhận hai chiều</b>.</>;
    case "Delivered": return at("Kiểm tra sách trước", exchange.inspectionDeadline) ?? <>Xác nhận đã nhận và kiểm tra sách.</>;
    case "Completed": return <>Hai bên đã nhận sách; giao dịch <b>hoàn tất</b>.</>;
    case "ResolutionPending": return <>Đang giải quyết sự cố; xem chi tiết trong phiếu.</>;
    case "Cancelled": return <>Giao dịch đã đóng; chi tiết khoản cọc nằm trong phiếu.</>;
  }
}

/** Titles of the books on one side of the exchange, from the frozen agreement. */
function sideTitles(exchange: Exchange, side: "initiator" | "recipient") {
  const books = side === "initiator" ? exchange.agreement?.initiatorBooks ?? [] : exchange.agreement ? [exchange.agreement.recipientBook] : [];
  return books.map((book) => book.book.title).filter(Boolean).join(", ");
}

export function exchangeFacts(exchange: Exchange, userId: string): Fact[] {
  const mine = sideTitles(exchange, exchange.initiatorId === userId ? "initiator" : "recipient");
  const deposit = exchange.initiatorId === userId ? exchange.initiatorDeposit : exchange.recipientDeposit;
  return [
    { label: "Bạn đưa", value: mine || "Chưa có bản chụp" },
    { label: "Tiền bù", value: exchange.diffAmount > 0 ? formatVnd(exchange.diffAmount) : "Không" },
    { label: "Cọc của bạn", value: formatVnd(deposit) },
  ];
}

export function exchangePartner(exchange: Exchange, userId: string) {
  return (
    (exchange.initiatorId === userId
      ? exchange.agreement?.recipientBook.ownerDisplayName
      : exchange.agreement?.initiatorBooks[0]?.ownerDisplayName) ?? "Đối tác trao đổi"
  );
}

// ─── Auctions ─────────────────────────────────────────────────────────────────

const AUCTION_STATE_LABEL: Record<string, string> = {
  BuyNowPending: "Chờ thanh toán mua ngay",
  AwaitingWinnerPayment: "Chờ người thắng thanh toán",
  Sold: "Đã bán",
  Unsold: "Kết thúc, chưa có người trả giá",
  OnHold: "Phiên tạm dừng",
  Cancelled: "Phiên đã hủy",
  PaymentExpired: "Đã quá hạn thanh toán",
  SecondChanceOffered: "Đang mời người trả giá cao thứ hai",
};

/** Auctions the member sells or bids on, with the phase from the server clock. */
export function auctionStatus(item: MyAuctionItem, serverTime: string): StatusInfo {
  const auction = item.auction;
  if (item.needsPayment) return { label: "Cần thanh toán", tone: "attention" };
  const phase = auctionPhase(auction, serverTime);
  if (phase === "Scheduled")
    return auction.openMode != null && auction.state === "Active"
      ? { label: "Chờ đủ người đăng ký", tone: "progress" }
      : { label: "Hẹn mở", tone: "progress" };
  if (phase === "Live") {
    if (item.role === "Seller") return { label: "Phiên của bạn đang mở", tone: "progress" };
    if (item.leading) return { label: "Bạn đang dẫn giá", tone: "progress" };
    return auction.bidderCount > 0
      ? { label: "Bạn đã bị vượt giá", tone: "attention" }
      : { label: "Chưa có người trả giá", tone: "progress" };
  }
  if (item.won && auction.state === "Sold") return { label: "Bạn đã thắng phiên", tone: "complete" };
  if (item.role === "Seller" && auction.state === "Sold") return { label: "Đã bán", tone: "complete" };
  return {
    label: AUCTION_STATE_LABEL[auction.state] ?? "Đã kết thúc",
    tone: auction.state === "Unsold" || auction.state === "Cancelled" ? "closed" : "complete",
  };
}

export function auctionNext(item: MyAuctionItem, serverTime: string): ReactNode {
  const auction = item.auction;
  if (item.needsPayment && item.paymentDeadline) return <>Thanh toán trước <b>{shortDateTime(item.paymentDeadline)}</b>.</>;
  const phase = auctionPhase(auction, serverTime);
  if (phase === "Scheduled") return <>Phiên mở lúc <b>{shortDateTime(auction.startAt)}</b>.</>;
  if (phase === "Live") {
    const end = <b>{shortDateTime(auction.endAt)}</b>;
    if (item.role === "Seller") return <>Phiên kết thúc lúc {end}.</>;
    if (item.leading) return <>Bạn đang dẫn; phiên kết thúc lúc {end}.</>;
    return auction.bidderCount > 0
      ? <>Có người trả cao hơn; <b>trả giá mới</b> trước {end}.</>
      : <>Chưa ai trả giá; phiên kết thúc lúc {end}.</>;
  }
  return <>Phiên đã kết thúc lúc {shortDateTime(auction.endAt)}.</>;
}

export function auctionFacts(item: MyAuctionItem): Fact[] {
  const auction = item.auction;
  return [
    { label: "Bước giá", value: formatVnd(auction.step) },
    { label: "Người trả giá", value: auction.bidderCount },
    { label: "Mua ngay", value: auction.buyNowPrice != null ? formatVnd(auction.buyNowPrice) : "Không" },
  ];
}
