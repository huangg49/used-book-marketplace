import type { components } from "@used-books/api-contract";
import { z } from "zod";

const money = z.number().int().min(0).max(100_000_000);
const demo = {
  demoOnly: z.literal(true),
  label: z.literal("Mô phỏng đồ án"),
  currency: z.literal("VND"),
};

export const walletSummary = z.object({
  ...demo,
  available: money,
  transactionHeld: money,
  withdrawalHeld: z.literal(0),
  total: money,
  serverTime: z.iso.datetime({ offset: true }),
  topupEnabled: z.boolean(),
  paymentsEnabled: z.boolean(),
  withdrawalsEnabled: z.literal(false),
}) satisfies z.ZodType<components["schemas"]["WalletSummary"]>;

export const walletHistoryItem = z.object({
  ...demo,
  journalId: z.uuid(),
  topupId: z.uuid().nullable(),
  orderId: z.uuid().nullable(),
  type: z.enum(["Topup", "OrderPayment", "OrderRefund", "OrderSettlement"]),
  amount: z.number().int().min(-100_000_000).max(100_000_000),
  balanceAfter: money,
  postedAt: z.iso.datetime({ offset: true }),
}) satisfies z.ZodType<components["schemas"]["WalletHistoryItem"]>;

export const walletHistoryPage = z.object({
  items: z.array(walletHistoryItem).max(100),
  nextCursor: z.uuid().nullable(),
}) satisfies z.ZodType<components["schemas"]["WalletHistoryPage"]>;

export type WalletSummary = z.infer<typeof walletSummary>;
export type WalletHistoryItem = z.infer<typeof walletHistoryItem>;
