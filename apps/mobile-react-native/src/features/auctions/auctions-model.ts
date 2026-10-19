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
export const AUCTION_MAX_PRICE = 1_000_000;
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
  if (amount > AUCTION_MAX_PRICE)
    return `Tối đa ${formatVnd(AUCTION_MAX_PRICE)}.`;
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
// FR-AU04: equal commitments rank by who reached the level first, so an equal
// level that does not lead is a tie lost on order, not a higher rival amount.
export function standingOf(
  auction: PublicAuctionSummary,
  me: Participation | null,
): Standing | null {
  if (!me || me.ownLevel === null) return null;
  if (me.leading) return "lead";
  return me.ownLevel === auction.currentPrice ? "tied" : "outbid";
}

export function isOpen(auction: PublicAuctionSummary, now: number) {
  return auction.state === "Active" && now < Date.parse(auction.endAt);
}
export function formatRemaining(ms: number) {
  if (ms <= 0) return "Đã hết giờ";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h} giờ ${m} phút` : `${m}:${sec}`;
}

export type AuctionCommandKind = "Manual" | "Auto" | "Disable" | "BuyNow";
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
export function receiptMessage(
  kind: AuctionCommandKind,
  amount: number,
  receipt: { currentPrice: number | null; leading: boolean | null },
) {
  const price = receipt.currentPrice !== null ? formatVnd(receipt.currentPrice) : "";
  if (kind === "BuyNow")
    return "Bạn đang dẫn với giá mua ngay. Người khác còn 60 giây để trả cao hơn; nếu không ai vượt, bạn thắng phiên.";
  if (kind === "Disable") return "Đã tắt đặt giá tự động.";
  if (receipt.leading) return `Bạn đang dẫn giá ở ${price}.`;
  if (receipt.currentPrice === amount)
    return `Đã ghi nhận ${price}, nhưng một người khác đã cam kết mức này trước bạn nên vẫn dẫn giá.`;
  return `Đã ghi nhận, nhưng một mức tự động khác cao hơn. Giá hiện tại ${price}.`;
}

// Caller-owned auction activity, newest first, keyset pages bound to the view.
export type MyAuctionView = "all" | "active" | "payment" | "selling";
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
// Frozen like auction commands: a retry after an unknown outcome resends this.
export function createOrderCommand(
  orderId: string,
  step: OrderStep,
  expectedVersion: number,
  key: string,
  text?: string,
): OrderCommand {
  const body: Record<string, unknown> = { expectedVersion };
  if (step === "reject-report") body.reason = text;
  if (step === "claim") body.description = text;
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
    errors.startPrice = "Giá khởi điểm từ 10.000đ đến 1.000.000đ.";
  else if (buyNowPrice !== null) {
    if (buyNowPrice <= startPrice || buyNowPrice > AUCTION_MAX_PRICE)
      errors.buyNowPrice = "Giá mua ngay phải lớn hơn giá khởi điểm và không quá 1.000.000đ.";
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
// FR-AU01/ADR 0041: only the seller's own approved, visible, still-available
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
