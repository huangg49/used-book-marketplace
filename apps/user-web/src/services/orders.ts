import { z } from "zod";
import { session } from "../lib/session";

const paymentOrderSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["Buyer", "Seller"]),
  version: z.number().int(),
  state: z.string(),
  paymentDeadline: z.string(),
  paymentEnabled: z.boolean(),
  amounts: z.object({
    bookPrice: z.number().int(),
    shippingFee: z.number().int(),
    buyerTotal: z.number().int(),
  }),
});

const orderReceiptSchema = z.object({
  id: z.string().uuid(),
  entityType: z.literal("Order"),
  entityId: z.string().uuid(),
  contextId: z.string().uuid(),
  version: z.number().int(),
  state: z.string(),
  paymentDeadline: z.string(),
  serverTime: z.string(),
  affectedListings: z.array(
    z.object({ id: z.string().uuid(), version: z.number().int() }),
  ),
});

export type PaymentOrder = z.infer<typeof paymentOrderSchema>;

export function getOrderForPayment(orderId: string) {
  return session.request(`/me/orders/${orderId}`, paymentOrderSchema);
}

export function payOrder(orderId: string, expectedVersion: number, key: string) {
  return session.request(`/orders/${orderId}/pay`, orderReceiptSchema, {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify({ expectedVersion }),
  });
}
