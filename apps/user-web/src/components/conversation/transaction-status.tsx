import type { ReactNode } from "react";
import type { PurchaseConversation } from "../../services/purchase-conversations";
import type { Exchange } from "../../services/exchange";
import { auctionPhase, type MyAuctionItem } from "../../services/auctions";
import { Clock3, Users, Wallet, type LucideIcon } from "lucide-react";
import { formatVnd } from "../../lib/routes";
import card from "./TransactionCard.module.css";

/**
 * Status, roles, the next step and the key figures for every card in the
 * /chat hub, all read from fields the API already returns. One place, so the
 * inbox and the hub tabs say the same thing about the same transaction.
 * Labels are short on purpose: a card shows one status, one key figure and
 * one next step, nothing repeated.
 */
export type StatusTone = "attention" | "progress" | "complete" | "closed";
export type StatusInfo = { label: string; tone: StatusTone };
export type Fact = { label: string; value: ReactNode; icon?: LucideIcon; /** Not an amount: show as plain text. */ muted?: boolean };
/** The card's key figure (under the book) and one small fact (in the footer). */
export type Stats = { main?: Fact; side?: Fact };

export function shortDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}
export function dateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
/** Day and month only, for the card footer (the full date is in its title). */
export function dayMonth(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(new Date(value));
}
/** Time + day without the year, for deadlines inside a card. */
export function shortDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(value));
}
/** A highlighted time inside a card sentence. */
function stamp(value: string) {
  return <time className={card.stamp} dateTime={value}>{shortDateTime(value)}</time>;
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
      ? { label: "Chờ phản hồi", tone: "progress" }
      : { label: "Cần bạn phản hồi", tone: "attention" };
  if (room.status === "OrderCreated") return { label: "Đã tạo đơn", tone: "complete" };
  if (room.status === "Expired") return { label: "Hết hạn", tone: "closed" };
  if (room.status === "Cancelled") return { label: "Đã đóng", tone: "closed" };
  if (room.terms?.mode === "Exchange") return { label: "Đang bàn đổi", tone: "progress" };
  return room.terms?.agreedPrice != null
    ? { label: "Đã chốt giá", tone: "progress" }
    : { label: "Đang thương lượng", tone: "progress" };
}

/** One short line: what happens next. The figures are in the stats row. */
export function conversationNext(room: PurchaseConversation, userId: string): ReactNode {
  const pending = room.terms?.pendingProposal;
  if (pending) {
    const mode = pending.kind === "Mode";
    return pending.proposedById === userId
      ? mode ? "Chờ đối tác đồng ý đổi hình thức." : "Chờ đối tác trả lời đề nghị giá."
      : mode ? "Đối tác muốn đổi hình thức, hãy trả lời." : "Đối tác vừa đề nghị giá, hãy trả lời.";
  }
  if (room.status === "OrderCreated") return "Theo dõi giao nhận ở Đơn hàng.";
  if (room.status === "Expired") return "Đã hết hạn, vẫn xem được tin cũ.";
  if (room.status === "Cancelled") return "Hội thoại đã đóng.";
  if (room.terms?.mode === "Exchange") return "Gửi đề nghị đổi để tạo phiếu.";
  if (room.terms?.agreedPrice != null) return "Giá đã chốt, tiếp tục trong hội thoại.";
  return "Nhắn tin để thống nhất giá.";
}

/** Key figure: the offer, the agreed price or the listed price. */
export function conversationStats(room: PurchaseConversation, listedPrice?: number | null): Stats {
  const pending = room.terms?.pendingProposal;
  const agreed = room.terms?.agreedPrice;
  // A swap conversation has no price to show: the kind already says "Đổi sách".
  const main: Fact | undefined =
    pending?.kind === "Price" && pending.amount != null ? { label: "giá đề nghị", value: formatVnd(pending.amount) }
      : agreed != null ? { label: "giá đã chốt", value: formatVnd(agreed) }
        : room.terms?.mode === "Exchange" ? undefined
          : listedPrice != null ? { label: "giá niêm yết", value: formatVnd(listedPrice) }
            : { label: "giá", value: "Chưa chốt giá", muted: true };
  const side: Fact | undefined =
    room.status === "Active" && room.expiresAt ? { label: "Mở đến", value: shortDateTime(room.expiresAt), icon: Clock3 }
      : room.closedAt ? { label: "Đóng lúc", value: shortDateTime(room.closedAt), icon: Clock3 }
        : undefined;
  return { main, side };
}

// ─── Exchanges ────────────────────────────────────────────────────────────────

export function exchangeStatus(exchange: Exchange, userId: string): StatusInfo {
  switch (exchange.status) {
    case "Proposed": {
      if (exchange.proposalExpiresAt && Date.parse(exchange.proposalExpiresAt) <= Date.now())
        return { label: "Đề nghị hết hạn", tone: "closed" };
      return (exchange.lastProposedById ?? exchange.initiatorId) !== userId
        ? { label: "Cần bạn phản hồi", tone: "attention" }
        : { label: "Chờ phản hồi", tone: "progress" };
    }
    case "AcceptedAwaitingFunding":
      return { label: "Chờ đặt cọc", tone: "attention" };
    case "Preparing":
      return { label: "Chuẩn bị gửi", tone: "progress" };
    case "InTransit":
      return { label: "Đang giao nhận", tone: "progress" };
    case "Delivered":
      return exchange.initiatorReceivedAt && exchange.recipientReceivedAt
        ? { label: "Đang kiểm tra", tone: "progress" }
        : { label: "Chờ xác nhận nhận", tone: "progress" };
    case "Completed":
      return { label: "Hoàn tất", tone: "complete" };
    case "ResolutionPending":
      return { label: "Đang xử lý sự cố", tone: "attention" };
    case "Cancelled":
      if (exchange.cancelReason === "CancelledByUser" && exchange.rejectionReason)
        return { label: "Bị từ chối", tone: "closed" };
      return exchange.cancelReason === "FundingExpired" ||
        exchange.cancelReason === "ProposalExpired" ||
        exchange.cancelReason === "ShippingExpired"
        ? { label: "Hết hạn", tone: "closed" }
        : { label: "Đã hủy", tone: "closed" };
  }
}

export function exchangeNext(exchange: Exchange): ReactNode {
  const by = (label: string, value?: string | null) => (value ? <>{label} {stamp(value)}</> : null);
  switch (exchange.status) {
    case "Proposed": return by("Trả lời trước", exchange.proposalExpiresAt) ?? "Đề nghị đổi đang chờ trả lời.";
    case "AcceptedAwaitingFunding": return by("Đặt cọc trước", exchange.fundingDeadline) ?? "Hai bên đặt cọc để bắt đầu.";
    case "Preparing": return by("Gửi sách trước", exchange.shippingDeadline) ?? "Chuẩn bị và gửi sách.";
    case "InTransit": return "Sách đang trên đường giao nhận.";
    case "Delivered": return by("Kiểm tra sách trước", exchange.inspectionDeadline) ?? "Xác nhận đã nhận sách.";
    case "Completed": return "Hai bên đã nhận sách.";
    case "ResolutionPending": return "Xem chi tiết sự cố trong phiếu.";
    case "Cancelled": return "Giao dịch đã đóng.";
  }
}

/** Key figure: the top-up; beside it, your deposit. */
export function exchangeStats(exchange: Exchange, userId: string): Stats {
  const deposit = exchange.initiatorId === userId ? exchange.initiatorDeposit : exchange.recipientDeposit;
  return {
    main: exchange.diffAmount > 0
      ? { label: "tiền bù", value: formatVnd(exchange.diffAmount) }
      : { label: "tiền bù", value: "Không bù tiền", muted: true },
    side: { label: "Cọc của bạn", value: formatVnd(deposit), icon: Wallet },
  };
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
  BuyNowPending: "Chờ thanh toán",
  AwaitingWinnerPayment: "Chờ thanh toán",
  Sold: "Đã bán",
  Unsold: "Không ai trả giá",
  OnHold: "Tạm dừng",
  Cancelled: "Đã hủy",
  PaymentExpired: "Quá hạn thanh toán",
  SecondChanceOffered: "Mời người thứ hai",
};

/** Auctions the member sells or bids on, with the phase from the server clock. */
export function auctionStatus(item: MyAuctionItem, serverTime: string): StatusInfo {
  const auction = item.auction;
  if (item.needsPayment) return { label: "Cần thanh toán", tone: "attention" };
  const phase = auctionPhase(auction, serverTime);
  if (phase === "Scheduled")
    return auction.openMode != null && auction.state === "Active"
      ? { label: "Chờ đủ người", tone: "progress" }
      : { label: "Hẹn mở", tone: "progress" };
  if (phase === "Live") {
    if (item.role === "Seller") return { label: "Đang mở", tone: "progress" };
    if (item.leading) return { label: "Bạn đang dẫn", tone: "progress" };
    return auction.bidderCount > 0
      ? { label: "Bị vượt giá", tone: "attention" }
      : { label: "Chưa ai trả giá", tone: "progress" };
  }
  if (item.won && auction.state === "Sold") return { label: "Bạn đã thắng", tone: "complete" };
  if (item.role === "Seller" && auction.state === "Sold") return { label: "Đã bán", tone: "complete" };
  return {
    label: AUCTION_STATE_LABEL[auction.state] ?? "Đã kết thúc",
    tone: auction.state === "Unsold" || auction.state === "Cancelled" ? "closed" : "complete",
  };
}

export function auctionNext(item: MyAuctionItem, serverTime: string): ReactNode {
  const auction = item.auction;
  if (item.needsPayment && item.paymentDeadline) return <>Thanh toán trước {stamp(item.paymentDeadline)}</>;
  const phase = auctionPhase(auction, serverTime);
  if (phase === "Scheduled") return <>Mở lúc {stamp(auction.startAt)}</>;
  if (phase === "Live") {
    const end = stamp(auction.endAt);
    if (item.role !== "Seller" && !item.leading && auction.bidderCount > 0) return <>Trả giá mới trước {end}</>;
    return <>Kết thúc lúc {end}</>;
  }
  return <>Đã kết thúc {stamp(auction.endAt)}</>;
}

/** Key figure: the price; beside it, how many people bid. */
export function auctionStats(item: MyAuctionItem): Stats {
  const auction = item.auction;
  const label = auction.currentPrice === null ? "giá khởi điểm" : auction.state === "Sold" ? "giá chốt" : "giá hiện tại";
  return {
    main: { label, value: formatVnd(auction.currentPrice ?? auction.startPrice) },
    side: { label: "Người trả giá", value: auction.bidderCount, icon: Users },
  };
}
