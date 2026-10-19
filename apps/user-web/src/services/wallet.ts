import { z } from "zod";
import { session } from "../lib/session";

const money = z.number().int().min(0).max(100_000_000);
export const walletSummarySchema = z.object({
  demoOnly: z.literal(true),
  label: z.literal("Mô phỏng đồ án"),
  currency: z.literal("VND"),
  available: money,
  transactionHeld: money,
  withdrawalHeld: z.literal(0),
  total: money,
  serverTime: z.iso.datetime({ offset: true }),
  topupEnabled: z.boolean(),
  paymentsEnabled: z.boolean(),
  withdrawalsEnabled: z.literal(false),
  listingSubmissionFee: money.optional(),
  atomicCheckout: z.boolean().optional(),
  vnpayEnabled: z.boolean().optional(),
});

export function getWalletSummary() {
  return session.request("/me/wallet", walletSummarySchema);
}
export const walletHistoryLabels = {
  Topup: "Nạp tiền",
  OrderPayment: "Thanh toán đơn hàng",
  OrderRefund: "Hoàn tiền đơn hàng",
  OrderSettlement: "Nhận tiền bán sách",
  ListingFeeCharge: "Phí đăng bài trước đây",
  ListingFeeRefund: "Hoàn phí đăng bài",
  ListingFeeSettlement: "Quyết toán phí đăng bài",
} as const;
export type WalletHistoryType = keyof typeof walletHistoryLabels;
const walletHistoryItemSchema = z.object({
  journalId: z.uuid(),
  topupId: z.uuid().nullable(),
  orderId: z.uuid().nullable(),
  type: z.enum(
    Object.keys(walletHistoryLabels) as [
      WalletHistoryType,
      ...WalletHistoryType[],
    ],
  ),
  amount: z.number().int().min(-100_000_000).max(100_000_000),
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
  options: { type?: WalletHistoryType; cursor?: string } = {},
) {
  const params = new URLSearchParams({ limit: "20" });
  if (options.type) params.set("type", options.type);
  if (options.cursor) params.set("cursor", options.cursor);
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
