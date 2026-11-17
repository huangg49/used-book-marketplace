import { withdrawalStateSchema } from "@used-books/session-client";
import type { components } from "@used-books/api-contract";
import { z } from "zod";

const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const demo = {
  demoOnly: z.literal(true),
  label: z.literal("Mô phỏng đồ án"),
  currency: z.literal("VND"),
};

export const walletSummary = z.object({
  ...demo,
  available: money,
  transactionHeld: money,
  withdrawalHeld: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  // ADR 0075: leading/won-unpaid auction holds; absent on older servers.
  auctionHeld: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  total: money,
  serverTime: z.iso.datetime({ offset: true }),
  topupEnabled: z.boolean(),
  paymentsEnabled: z.boolean(),
  withdrawalsEnabled: z.boolean(),
  listingSubmissionFee: money.optional(),
  atomicCheckout: z.boolean().optional(),
  vnpayEnabled: z.boolean().optional(),
}) satisfies z.ZodType<components["schemas"]["WalletSummary"]>;

export const walletHistoryItem = z.object({
  ...demo,
  journalId: z.uuid(),
  withdrawalId: z.uuid().nullable().optional(),
  withdrawalState: withdrawalStateSchema.nullable().optional(),
  topupId: z.uuid().nullable(),
  orderId: z.uuid().nullable(),
  type: z.enum([
    "Topup",
    "OrderPayment",
    "OrderRefund",
    "OrderSettlement",
    "ListingFeeCharge",
    "ListingFeeRefund",
    "ListingFeeSettlement",
    "WithdrawalHold",
    "WithdrawalRefund",
    // ADR 0075/0087: auction holds, releases and a seller's deposit share.
    "AuctionBidHold",
    "AuctionBidRelease",
    "AuctionDepositSellerShare",
    "ExchangeReturnRefund",
    "ExchangeNonReturnCompensation",
  ]),
  amount: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  balanceAfter: money,
  postedAt: z.iso.datetime({ offset: true }),
}) satisfies z.ZodType<components["schemas"]["WalletHistoryItem"]>;

export const walletHistoryPage = z.object({
  items: z.array(walletHistoryItem).max(100),
  nextCursor: z.uuid().nullable(),
}) satisfies z.ZodType<components["schemas"]["WalletHistoryPage"]>;

export const topupState = z.enum([
  "Pending",
  "Processing",
  "Succeeded",
  "Failed",
  "Cancelled",
  "ReviewRequired",
]);

export const topupIntent = z.object({
  ...demo,
  id: z.uuid(),
  version: z.number().int(),
  amount: money,
  state: topupState,
  credited: z.boolean(),
  journalId: z.uuid().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
  serverTime: z.iso.datetime({ offset: true }),
}) satisfies z.ZodType<components["schemas"]["TopupIntent"]>;

export const topupPage = z.object({
  items: z.array(topupIntent),
  nextCursor: z.uuid().nullable(),
}) satisfies z.ZodType<components["schemas"]["TopupPage"]>;

export const createVNPayTopupReceipt = z.object({
  entityId: z.uuid(),
  paymentUrl: z.url(),
  expiresAt: z.string(),
});

export type WalletSummary = z.infer<typeof walletSummary>;
export type WalletHistoryItem = z.infer<typeof walletHistoryItem>;
export type TopupIntent = z.infer<typeof topupIntent>;
export type TopupState = z.infer<typeof topupState>;
export type CreateVNPayTopupReceipt = z.infer<typeof createVNPayTopupReceipt>;
