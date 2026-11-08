import { useQuery } from "@tanstack/react-query";
import { ApiError, type SessionClient } from "../../core/api/session-client";
import { formatVnd } from "../../core/ui/format";
import {
  auctionReceipt,
  codeIssued,
  myAuctionPage,
  participation,
  pointOrder,
  publicAuction,
  publicAuctionList,
  type Participation,
  type PublicAuctionList,
  type PublicAuctionSummary,
} from "./contracts";

export const AUCTIONS_QUERY_KEY = ["public-auctions"] as const;
// ADR 0067: no business ceiling on auction prices, only the exact-integer limit.
// ADR 0068: bid steps a Seller may choose before the auction opens.
export const AUCTION_STEPS = [10_000, 20_000, 50_000, 100_000] as const;
// A Seller may also enter their own step: a multiple of 1.000đ in this range.
export const AUCTION_STEP_MIN = 1_000;
export const AUCTION_STEP_MAX = 10_000_000;
export const AUCTION_STEP_UNIT = 1_000;
export type AuctionStep = number;

export function auctionStepError(step: number | null): string | undefined {
  if (!step) return "Nhập bước giá.";
  if (step < AUCTION_STEP_MIN || step > AUCTION_STEP_MAX)
    return "Bước giá từ 1.000đ đến 10.000.000đ.";
  if (step % AUCTION_STEP_UNIT !== 0) return "Bước giá phải là bội số của 1.000đ.";
  return undefined;
}

export const AUCTION_MAX_PRICE = Number.MAX_SAFE_INTEGER;
export const EVIDENCE_MIN_LENGTH = 20;

export function usePublicAuctions(client: SessionClient, enabled = true) {
  return useQuery<PublicAuctionList, Error>({
    queryKey: AUCTIONS_QUERY_KEY,
    queryFn: () => client.request("/auctions", publicAuctionList),
    staleTime: 10_000,
    refetchInterval: 15_000,
    enabled,
  });
}

export const UPCOMING_AUCTIONS_QUERY_KEY = ["auctions", "upcoming"] as const;

export function useUpcomingAuctions(client: SessionClient, enabled = true) {
  return useQuery<PublicAuctionList, Error>({
    queryKey: UPCOMING_AUCTIONS_QUERY_KEY,
    queryFn: () => client.publicRequest("/auctions?phase=upcoming", publicAuctionList),
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled,
  });
}

export type AuctionCondition = "LikeNew" | "Good" | "Fair" | "Worn";
export const AUCTION_CONDITIONS: AuctionCondition[] = ["LikeNew", "Good", "Fair", "Worn"];

export const AUCTION_PRICE_RANGES = {
  lt100: { label: "Dưới 100.000 ₫", min: 0, max: 99_999 },
  "100-300": { label: "100.000–300.000 ₫", min: 100_000, max: 300_000 },
  "300-1m": { label: "300.000 ₫–1 triệu", min: 300_001, max: 1_000_000 },
  gt1m: { label: "Trên 1 triệu", min: 1_000_001, max: Number.POSITIVE_INFINITY },
} as const;
export type AuctionPriceRange = keyof typeof AUCTION_PRICE_RANGES;

export const AUCTION_ENDING = {
  "1h": { label: "Trong 1 giờ", ms: 3_600_000 },
  "6h": { label: "Trong 6 giờ", ms: 6 * 3_600_000 },
  "24h": { label: "Trong 24 giờ", ms: 24 * 3_600_000 },
} as const;
export type AuctionEnding = keyof typeof AUCTION_ENDING;

export interface AuctionFilters {
  q: string;
  point: string;
  buyNow: boolean;
  noBids: boolean;
  conditions: AuctionCondition[];
  price: AuctionPriceRange | "";
  ending: AuctionEnding | "";
}

export const DEFAULT_AUCTION_FILTERS: AuctionFilters = {
  q: "",
  point: "",
  buyNow: false,
  noBids: false,
  conditions: [],
  price: "",
  ending: "",
};

export const activeFilterCount = (f: AuctionFilters) =>
  [f.point, f.buyNow, f.noBids, f.conditions.length > 0, f.price, f.ending].filter(Boolean).length;

export function foldSearchText(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();
}

export function matchesAuctionFilters(
  a: PublicAuctionSummary,
  f: AuctionFilters,
  now: number,
) {
  const price = a.currentPrice ?? a.startPrice;
  if (f.q.trim()) {
    const haystack = foldSearchText([a.title, ...(a.book?.authors ?? [])].join(" "));
    const words = foldSearchText(f.q).split(/\s+/).filter(Boolean);
    if (!words.every((word) => haystack.includes(word))) return false;
  }
  if (f.point && a.pointName !== f.point) return false;
  if (f.buyNow && a.buyNowPrice === null) return false;
  if (f.noBids && a.bidderCount > 0) return false;
  if (f.conditions.length && !(a.book && f.conditions.includes(a.book.condition as AuctionCondition))) return false;
  if (f.price) {
    const range = AUCTION_PRICE_RANGES[f.price];
    if (price < range.min || price > range.max) return false;
  }
  if (f.ending && Date.parse(a.endAt) - now > AUCTION_ENDING[f.ending].ms) return false;
  return true;
}
export const auctionKey = (id: string) => ["auction", id] as const;
export const participationKey = (id: string, userId: string) =>
  ["auction-participation", id, userId] as const;
// Public read; polling keeps the price live while the screen is in front.
export const auctionOptions = (client: SessionClient, id: string) => ({
  queryKey: auctionKey(id),
  queryFn: () => client.publicRequest(`/auctions/${id}`, publicAuction),
});
// 404 means the member has not taken part yet: that is not an error state.
export const participationOptions = (
  client: SessionClient,
  id: string,
  userId: string,
) => ({
  queryKey: participationKey(id, userId),
  queryFn: async (): Promise<Participation | null> => {
    try {
      return await client.request(
        `/me/auctions/${id}/participation`,
        participation,
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },
});

/** Valid amounts sit on the start + n·step grid, between `floor` and the cap. */
export function amountError(
  amount: number | null,
  floor: number,
  start: number,
  step: number,
) {
  if (!amount) return "Nhập số tiền bạn muốn trả.";
  if (amount < floor) return `Tối thiểu ${formatVnd(floor)}.`;
  if (amount > AUCTION_MAX_PRICE) return "Số tiền vượt mức hệ thống hỗ trợ.";
  if ((amount - start) % step !== 0) {
    const up = start + Math.ceil((amount - start) / step) * step;
    return `Giá đi theo bước ${formatVnd(step)}. Thử ${formatVnd(Math.min(up, AUCTION_MAX_PRICE))}.`;
  }
  return null;
}
/** Quick picks from the minimum bid upwards, never above the cap. */
export function bidOptions(minimum: number, step: number, count = 3) {
  const values: number[] = [];
  for (let v = minimum; v <= AUCTION_MAX_PRICE && values.length < count; v += step)
    values.push(v);
  return values;
}
export function minimumBidOf(auction: PublicAuctionSummary) {
  return auction.minimumBid ?? AUCTION_MAX_PRICE + auction.step;
}
// A leader only raises a private ceiling; anyone else starts from the minimum bid.
export function autoFloor(
  auction: PublicAuctionSummary,
  me: Participation | null,
) {
  const minimum = minimumBidOf(auction);
  if (me?.ownLevel == null) return minimum;
  return Math.max(me.leading ? 0 : minimum, me.ownLevel + auction.step);
}

export type Standing = "lead" | "tied" | "outbid";
export const isSealedFormat = (auction: PublicAuctionSummary) =>
  auction.auctionType === "SealedFirst" || auction.auctionType === "SealedSecond";
// FR-AU04: equal commitments rank by who reached the level first, so an equal
// level that does not lead is a tie lost on order, not a higher rival amount.
export function standingOf(
  auction: PublicAuctionSummary,
  me: Participation | null,
): Standing | null {
  if (!me || me.ownLevel === null) return null;
  // ADR 0076: a running sealed auction reveals no standing.
  if (isSealedFormat(auction)) return null;
  if (me.leading) return "lead";
  return me.ownLevel === auction.currentPrice ? "tied" : "outbid";
}

// ADR 0047: a scheduled auction is Active but takes no bids before startAt.
export function isScheduled(auction: PublicAuctionSummary, now: number) {
  return auction.state === "Active" && now < Date.parse(auction.startAt);
}
export function isOpen(auction: PublicAuctionSummary, now: number) {
  return (
    auction.state === "Active" &&
    now >= Date.parse(auction.startAt) &&
    now < Date.parse(auction.endAt)
  );
}
// The seller edits the time only before the first bid and any Buy Now.
export function canReschedule(auction: PublicAuctionSummary, now: number) {
  return (
    (isScheduled(auction, now) || isOpen(auction, now)) &&
    auction.bidderCount === 0 &&
    !auction.buyNowAt &&
    auction.version != null &&
    (auction.scheduleRevision ?? 0) < AUCTION_MAX_SCHEDULE_EDITS
  );
}
export function formatRemaining(ms: number) {
  if (ms <= 0) return "Đã hết giờ";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h} giờ ${m} phút` : `${m}:${sec}`;
}

// ADR 0076: DutchAccept and Sealed for the other auction formats.
export type AuctionCommandKind = "Manual" | "Auto" | "Disable" | "BuyNow" | "DutchAccept" | "Sealed";
export type AuctionCommand = {
  kind: AuctionCommandKind;
  amount: number;
  path: string;
  method: "POST" | "PUT";
  body: string;
  key: string;
};
// The body and Idempotency-Key are frozen when the member confirms; a retry
// after an unknown outcome sends exactly this request again.
export function createAuctionCommand(
  auctionId: string,
  kind: AuctionCommandKind,
  amount: number,
  key: string,
): AuctionCommand {
  const base = `/auctions/${auctionId}`;
  const command = (path: string, method: "POST" | "PUT", body: object) => ({
    kind,
    amount,
    path,
    method,
    body: JSON.stringify(body),
    key,
  });
  switch (kind) {
    case "Manual":
      return command(`${base}/bids`, "POST", {
        amount,
        fulfillmentMethod: "SelfCollect",
      });
    case "Auto":
      return command(`${base}/auto-bid`, "PUT", {
        maxAmount: amount,
        fulfillmentMethod: "SelfCollect",
      });
    case "Disable":
      return command(`${base}/auto-bid/disable`, "POST", {});
    case "BuyNow":
      return command(`${base}/buy-now`, "POST", {
        fulfillmentMethod: "SelfCollect",
      });
    case "DutchAccept":
      return command(`${base}/dutch-accept`, "POST", {
        price: amount,
        fulfillmentMethod: "SelfCollect",
      });
    case "Sealed":
      return command(`${base}/sealed-bid`, "POST", {
        amount,
        fulfillmentMethod: "SelfCollect",
      });
  }
}
export function sendAuctionCommand(
  client: Pick<SessionClient, "request">,
  command: AuctionCommand,
) {
  return client.request(command.path, auctionReceipt, {
    method: command.method,
    body: command.body,
    headers: { "Idempotency-Key": command.key },
  });
}
/** True when the server may or may not have committed the command. */
export function outcomeUnknown(error: unknown) {
  return !(error instanceof ApiError) || error.status === 0 || error.status >= 500;
}
// Auction rule errors carry a specific Vietnamese message from the API.
export function auctionErrorText(error: unknown) {
  if (outcomeUnknown(error))
    return "Chưa rõ máy chủ đã ghi nhận thao tác hay chưa. Hãy thử lại đúng thao tác này.";
  const e = error as ApiError;
  if (e.status === 401) return "Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.";
  if (e.code === "IdempotencyConflict")
    return "Thao tác trước chưa hoàn tất. Hãy cập nhật trạng thái phiên.";
  return e.message || "Không thể thực hiện thao tác này. Hãy cập nhật trạng thái phiên.";
}
// ADR 0071: an early hint from the member's own available balance. The server
// also counts prices they lead at elsewhere and unpaid auction orders.
export function fundsShortfall(amount: number | null | undefined, available: number | null | undefined) {
  return available != null && amount != null && amount > available ? amount - available : 0;
}
export function fundsHint(amount: number | null | undefined, available: number | null | undefined) {
  if (available == null) return null;
  const short = fundsShortfall(amount, available);
  return short
    ? `Số dư khả dụng ${formatVnd(available)}, cần nạp thêm ${formatVnd(short)} cho mức này.`
    : `Số dư khả dụng ${formatVnd(available)}.`;
}

// ADR 0076: the auction formats a seller can choose.
export type AuctionFormat = "English" | "Dutch" | "SealedFirst" | "SealedSecond";
export const AUCTION_FORMATS: { value: AuctionFormat; label: string; hint: string }[] = [
  { value: "English", label: "Trả giá lên", hint: "Người mua trả giá tăng dần, có đặt giá tự động và có thể bật mua ngay." },
  { value: "Dutch", label: "Giá giảm dần", hint: "Giá bắt đầu cao, giảm một bước sau mỗi khoảng thời gian tới giá sàn. Người đầu tiên chấp nhận thắng ngay." },
  { value: "SealedFirst", label: "Kín · giá thứ nhất", hint: "Mỗi người gửi một giá kín, chỉ được nâng. Giá cao nhất thắng và trả đúng giá đã gửi." },
  { value: "SealedSecond", label: "Kín · giá thứ hai", hint: "Mỗi người gửi một giá kín. Giá cao nhất thắng nhưng trả bằng giá cao thứ hai." },
];

// ADR 0074: the seller's choice of what Buy Now does.
export type BuyNowMode = "Challenge" | "Instant";
export const BUY_NOW_MODES: { value: BuyNowMode; label: string; hint: string }[] = [
  { value: "Challenge", label: "Chờ thách đấu", hint: "Khi có người mua ngay, người khác còn 5 phút để trả cao hơn (60 giây nếu người bấm đang dẫn)." },
  { value: "Instant", label: "Kết thúc ngay", hint: "Người mua ngay thắng luôn và phiên kết thúc. Không ai trả được cao hơn giá mua ngay." },
];

// ADR 0070: the leader's Buy Now leaves others 60 seconds; anyone else's, 5 minutes.
export const buyNowWindow = (leading: boolean) => (leading ? "60 giây" : "5 phút");

export function receiptMessage(
  kind: AuctionCommandKind,
  amount: number,
  receipt: { currentPrice: number | null; leading: boolean | null },
  wasLeading = false,
  buyNowMode: BuyNowMode = "Challenge",
) {
  const price = receipt.currentPrice !== null ? formatVnd(receipt.currentPrice) : "";
  if (kind === "DutchAccept")
    return "Bạn đã thắng phiên. Hệ thống đang chốt đơn để bạn thanh toán từ ví.";
  if (kind === "Sealed")
    return `Đã ghi nhận giá kín ${formatVnd(amount)}. Kết quả công bố khi phiên kết thúc.`;
  if (kind === "BuyNow" && buyNowMode === "Instant")
    return "Bạn đã mua ngay. Phiên kết thúc; hệ thống đang chốt đơn để bạn thanh toán từ ví.";
  if (kind === "BuyNow")
    return `Bạn đang dẫn với giá mua ngay. Người khác còn ${buyNowWindow(wasLeading)} để trả cao hơn; nếu không ai vượt, bạn thắng phiên.`;
  if (kind === "Disable") return "Đã tắt đặt giá tự động.";
  if (receipt.leading) return `Bạn đang dẫn giá ở ${price}.`;
  if (receipt.currentPrice === amount)
    return `Đã ghi nhận ${price}, nhưng một người khác đã cam kết mức này trước bạn nên vẫn dẫn giá.`;
  return `Đã ghi nhận, nhưng một mức tự động khác cao hơn. Giá hiện tại ${price}.`;
}

// Caller-owned auction activity, newest first, keyset pages bound to the view.
export type MyAuctionView = "all" | "active" | "upcoming" | "payment" | "selling";
export const myAuctionsOptions = (
  client: SessionClient,
  userId: string,
  view: MyAuctionView,
) => ({
  queryKey: ["my-auctions", userId, view] as const,
  initialPageParam: "",
  queryFn: ({ pageParam }: { pageParam: string }) => {
    const params = new URLSearchParams({ limit: "12", view });
    if (pageParam) params.set("cursor", pageParam);
    return client.request(`/me/auctions?${params}`, myAuctionPage);
  },
  getNextPageParam: (page: { nextCursor: string | null }) =>
    page.nextCursor ?? undefined,
});
export const pointOrderKey = (id: string) => ["point-order", id] as const;
export const pointOrderOptions = (client: SessionClient, id: string) => ({
  queryKey: pointOrderKey(id),
  queryFn: () => client.request(`/me/point-orders/${id}`, pointOrder),
});

export type OrderStep =
  | "pay"
  | "accept-report"
  | "reject-report"
  | "collection-code"
  | "claim";
export type OrderCommand = {
  step: OrderStep;
  path: string;
  body: string;
  key: string;
};
// ADR 0044: delivery chosen at payment, with the fee the buyer saw.
export type DeliveryChoice = { addressId: string; addressVersion: number; fee: number };
// Frozen like auction commands: a retry after an unknown outcome resends this.
export function createOrderCommand(
  orderId: string,
  step: OrderStep,
  expectedVersion: number,
  key: string,
  text?: string,
  delivery?: DeliveryChoice,
): OrderCommand {
  const body: Record<string, unknown> = { expectedVersion };
  if (step === "reject-report") body.reason = text;
  if (step === "claim") body.description = text;
  if (step === "pay" && delivery) {
    body.fulfillmentMethod = "CarrierOutbound";
    body.destinationAddressId = delivery.addressId;
    body.expectedDestinationAddressVersion = delivery.addressVersion;
    body.expectedOutboundFee = delivery.fee;
  }
  return {
    step,
    path: `/point-orders/${orderId}/${step}`,
    body: JSON.stringify(body),
    key,
  };
}
export function sendOrderCommand(
  client: Pick<SessionClient, "request">,
  command: OrderCommand,
) {
  const init = {
    method: "POST",
    body: command.body,
    headers: { "Idempotency-Key": command.key },
  };
  return command.step === "collection-code"
    ? client.request(command.path, codeIssued, init)
    : client.request(command.path, auctionReceipt, init);
}
export const CLAIM_MIN_LENGTH = 30;
export const POINT_HOURS = "09:00–18:00";

export const AUCTION_MIN_PRICE = 10_000;
/** Client mirror of POL-39 for a new intake; the server stays authoritative. */
export function intakePriceErrors(
  startPrice: number | null,
  step: number,
  buyNowPrice: number | null,
) {
  const errors: { startPrice?: string; buyNowPrice?: string } = {};
  if (!startPrice) errors.startPrice = "Nhập giá khởi điểm.";
  else if (startPrice < AUCTION_MIN_PRICE || startPrice > AUCTION_MAX_PRICE)
    errors.startPrice = "Giá khởi điểm tối thiểu 10.000đ.";
  else if (buyNowPrice !== null) {
    if (buyNowPrice <= startPrice || buyNowPrice > AUCTION_MAX_PRICE)
      errors.buyNowPrice = "Giá mua ngay phải lớn hơn giá khởi điểm.";
    else if ((buyNowPrice - startPrice) % step !== 0) {
      const up = Math.min(
        startPrice + Math.ceil((buyNowPrice - startPrice) / step) * step,
        AUCTION_MAX_PRICE,
      );
      errors.buyNowPrice = `Giá mua ngay phải bằng giá khởi điểm cộng một số bước giá. Thử ${formatVnd(up)}.`;
    }
  }
  return errors;
}
// FR-AU01/ADR 0042: only the seller's own approved, visible, still-available
// Auction listings enter; the server rechecks under the listing lock.
export function auctionEligible(listing: {
  channel: string;
  state: { moderation: string; visibility: string; trade: string; deletedAt: string | null };
  currentRevision: { content: { mode: string | null } };
}) {
  return (
    listing.channel === "Auction" &&
    listing.state.moderation === "Approved" &&
    listing.state.visibility === "Visible" &&
    listing.state.trade === "Available" &&
    !listing.state.deletedAt &&
    listing.currentRevision.content.mode === "Sale"
  );
}
// The seller may withdraw before the session opens (and the server also
// allows it while no bid exists).
export const withdrawable = (state: string) =>
  state === "AwaitingDropoff" || state === "Received" || state === "Passed";

// ADR 0047 limits, mirrored for the sheet; the server stays authoritative.
const HOUR_MS = 3_600_000;
export const AUCTION_MAX_SCHEDULE_EDITS = 5;
export const AUCTION_MIN_LEAD_MS = 5 * 60_000;
export const AUCTION_SCHEDULE_HORIZON_MS = 7 * 24 * HOUR_MS;
export const AUCTION_MIN_REMAINING_MS = HOUR_MS;
// ADR 0069: lengths are whole seconds (1 hour to 7 days); the sheet offers presets.
export const DURATION_CHOICES = [1, 3, 6, 12, 24, 48, 72, 168].map((h) => h * 3600);
export function durationLabel(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const parts = [
    Math.floor(h / 24) && `${Math.floor(h / 24)} ngày`,
    h % 24 && `${h % 24} giờ`,
    Math.floor((seconds % 3600) / 60) && `${Math.floor((seconds % 3600) / 60)} phút`,
    seconds % 60 && `${seconds % 60} giây`,
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : "0 giây";
}

/**
 * Start choices for the schedule sheet: now, a few hours ahead, or 09:00 on the
 * next days. Every choice sits inside the 5-minute lead and 7-day horizon.
 */
export function startChoices(now: number) {
  const choices: { label: string; at: number | null }[] = [{ label: "Mở ngay", at: null }];
  for (const h of [1, 3, 6]) choices.push({ label: `Sau ${h} giờ`, at: now + h * HOUR_MS });
  for (const days of [1, 2, 3]) {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(9, 0, 0, 0);
    const label = days === 1 ? "9:00 ngày mai" : `9:00 ${d.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" })}`;
    choices.push({ label, at: d.getTime() });
  }
  return choices.filter(
    (c) => c.at === null || (c.at >= now + AUCTION_MIN_LEAD_MS && c.at <= now + AUCTION_SCHEDULE_HORIZON_MS),
  );
}
/** A live auction keeps its start; the new end must leave at least one hour. */
export function durationAllowed(seconds: number, startAt: number, now: number) {
  return startAt + seconds * 1000 >= now + AUCTION_MIN_REMAINING_MS;
}
export type ScheduleCommand = { path: string; body: string; key: string };
// Frozen on confirm like auction commands: a retry after an unknown outcome
// resends this exact request with the same Idempotency-Key.
export function createScheduleCommand(
  target: { kind: "publish"; intakeId: string } | { kind: "reschedule"; auctionId: string },
  body: { expectedVersion: number; startAt: string | null; durationSeconds: number },
  key: string,
): ScheduleCommand {
  return {
    path:
      target.kind === "publish"
        ? `/auction-intakes/${target.intakeId}/publish`
        : `/auctions/${target.auctionId}/schedule`,
    body: JSON.stringify(body),
    key,
  };
}
