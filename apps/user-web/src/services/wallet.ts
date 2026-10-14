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
const topupSchema = z.object({
  id: z.uuid(),
  amount: money,
  state: z.enum([
    "Pending",
    "Processing",
    "Succeeded",
    "Failed",
    "ReviewRequired",
  ]),
  credited: z.boolean(),
  updatedAt: z.string(),
});
export function getTopup(id: string) {
  return session.request(`/me/topups/${encodeURIComponent(id)}`, topupSchema);
}
export function queryVNPayTopup(id: string) {
  return session.request(`/me/topups/${encodeURIComponent(id)}/vnpay-query`, topupSchema, {
    method: 'POST',
    headers: { 'Idempotency-Key': id },
  });
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
      expiresAt: z.string(),
    }),
    {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({ amount }),
    },
  );
}
