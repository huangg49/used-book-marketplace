import { withdrawalStateSchema, type WalletHistoryFilters } from "@used-books/session-client";
import { z } from "zod";
import { session } from "../lib/session";

const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const walletSummarySchema = z.object({
  demoOnly: z.literal(true),
  label: z.literal("Mô phỏng đồ án"),
  currency: z.literal("VND"),
  available: money,
  transactionHeld: money,
  withdrawalHeld: money,
  // ADR 0075: leading/won-unpaid auction holds; absent on older servers.
  auctionHeld: money.optional(),
  total: money,
  serverTime: z.iso.datetime({ offset: true }),
  topupEnabled: z.boolean(),
  paymentsEnabled: z.boolean(),
  withdrawalsEnabled: z.boolean(),
  listingSubmissionFee: money.optional(),
  atomicCheckout: z.boolean().optional(),
  vnpayEnabled: z.boolean().optional(),
});

export function getWalletSummary() {
  return session.request("/me/wallet", walletSummarySchema);
}
export const walletHistoryLabels = {
  Topup: "Nạp tiền",
  WithdrawalHold: "Rút tiền",
  WithdrawalRefund: "Rút tiền · Hoàn khoản giữ",
  OrderPayment: "Thanh toán đơn hàng",
  OrderRefund: "Hoàn tiền đơn hàng",
  OrderSettlement: "Nhận tiền bán sách",
  ListingFeeCharge: "Phí đăng bài trước đây",
  ListingFeeRefund: "Hoàn phí đăng bài",
  ListingFeeSettlement: "Quyết toán phí đăng bài",
  // ADR 0075/0087: auction holds, their releases and a seller's deposit share.
  AuctionBidHold: "Đấu giá · Giữ tiền",
  AuctionBidRelease: "Đấu giá · Trả lại tiền giữ",
  AuctionDepositSellerShare: "Đấu giá · Nhận một phần tiền cọc",
} as const;
export type WalletHistoryType = keyof typeof walletHistoryLabels;
const walletHistoryItemSchema = z.object({
  journalId: z.uuid(),
  withdrawalId: z.uuid().nullable().optional(),
  withdrawalState: withdrawalStateSchema.nullable().optional(),
  topupId: z.uuid().nullable(),
  orderId: z.uuid().nullable(),
  type: z.enum(
    Object.keys(walletHistoryLabels) as [
      WalletHistoryType,
      ...WalletHistoryType[],
    ],
  ),
  amount: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  balanceAfter: money,
  postedAt: z.iso.datetime({ offset: true }),
  demoOnly: z.literal(true),
  label: z.literal("Mô phỏng đồ án"),
  currency: z.literal("VND"),
});
export const walletHistoryPageSchema = z.object({
  items: z.array(walletHistoryItemSchema),
  nextCursor: z.uuid().nullable(),
});
export function getWalletHistory(
  options: WalletHistoryFilters & { type?: WalletHistoryType; cursor?: string } = {},
) {
  const params = new URLSearchParams({ limit: "20" });
  if (options.type) params.set("type", options.type);
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.from) params.set("from", options.from);
  if (options.to) params.set("to", options.to);
  if (options.reference) params.set("reference", options.reference);
  return session.request(
    `/me/wallet/history?${params}`,
    walletHistoryPageSchema,
  );
}
const topupSchema = z.object({
  id: z.uuid(),
  amount: money,
  state: z.enum([
    "Pending",
    "Processing",
    "Succeeded",
    "Failed",
    "Cancelled",
    "ReviewRequired",
  ]),
  credited: z.boolean(),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
  serverTime: z.iso.datetime({ offset: true }),
  updatedAt: z.string(),
});
export function getTopup(id: string) {
  return session.request(`/me/topups/${encodeURIComponent(id)}`, topupSchema);
}
export function queryVNPayTopup(id: string) {
  return session.request(
    `/me/topups/${encodeURIComponent(id)}/vnpay-query`,
    topupSchema,
    {
      method: "POST",
      headers: { "Idempotency-Key": id },
    },
  );
}
export function getTopups() {
  return session.request(
    "/me/topups?limit=10",
    z.object({
      items: z.array(topupSchema),
      nextCursor: z.string().nullable(),
    }),
  );
}
export function createVNPayTopup(amount: number, key: string) {
  return session.request(
    "/me/topups/vnpay",
    z.object({
      entityId: z.uuid(),
      paymentUrl: z.url(),
      expiresAt: z.iso.datetime({ offset: true }),
      serverTime: z.iso.datetime({ offset: true }),
    }),
    {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({ amount }),
    },
  );
}
