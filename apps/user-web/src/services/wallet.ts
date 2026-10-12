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
});

export function getWalletSummary() {
  return session.request("/me/wallet", walletSummarySchema);
}
