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

export function payOrder(
  orderId: string,
  expectedVersion: number,
  key: string,
) {
  return session.request(`/orders/${orderId}/pay`, orderReceiptSchema, {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify({ expectedVersion }),
  });
}

export type BuyNowInput = {
  quoteId: string;
  expectedQuoteVersion: number;
  expectedListingVersion: number;
  expectedListingRevisionId: string;
};
export function createBuyNowOrder(body: BuyNowInput, key: string) {
  return session.request("/orders/buy-now", orderReceiptSchema, {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}
const contact = z.object({
  recipientName: z.string(),
  phone: z.string(),
  localityCode: z.string(),
  detail: z.string(),
});
const orderDetails = paymentOrderSchema.extend({
  conversationId: z.string().uuid().nullable(),
  purchaseMode: z.enum(["BuyNow", "Negotiated"]).optional(),
  serverTime: z.string(),
  createdAt: z.string(),
  paidAt: z.string().nullable(),
  moneyHeld: z.number(),
  canCancel: z.boolean(),
  shipmentRegistrationEnabled: z.boolean(),
  preparation: z
    .object({ acceptedAt: z.string(), pickupDeadline: z.string() })
    .nullable(),
  ownAddress: contact,
  shippingAddress: contact.nullable(),
  item: z.object({
    listingId: z.string().uuid(),
    metadata: z.object({ title: z.string() }),
    condition: z.string(),
    description: z.string(),
    coverNote: z.string(),
    pages: z.string(),
  }),
});
export type DirectOrder = z.infer<typeof orderDetails>;
export function getOrder(orderId: string) {
  return session.request(`/me/orders/${orderId}`, orderDetails);
}
export function openOrderConversation(orderId: string, key: string) {
  return session.request(
    `/orders/${orderId}/conversation`,
    z.object({ entityId: z.string().uuid() }),
    {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({}),
    },
  );
}
export function cancelOrder(
  orderId: string,
  expectedVersion: number,
  key: string,
) {
  return session.request(`/orders/${orderId}/cancel`, orderReceiptSchema, {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify({ expectedVersion }),
  });
}
export function listOrders(cursor?: string) {
  return session.request(
    `/me/orders?limit=20${cursor ? `&cursor=${cursor}` : ""}`,
    z.object({
      items: z.array(
        z.object({
          id: z.string().uuid(),
          title: z.string().optional(),
          listingId: z.string().uuid().optional(),
          version: z.number(),
          state: z.string(),
          role: z.enum(["Buyer", "Seller"]),
          createdAt: z.string(),
        }),
      ),
      nextCursor: z.string().nullable(),
    }),
  );
}
export const orderStates: Record<string, string> = {
  AwaitingPayment: "Chờ thanh toán",
  PendingSellerConfirmation: "Chờ người bán xác nhận",
  Preparing: "Người bán đang chuẩn bị gửi",
  InTransit: "Đang giao",
  ResolutionPending: "Đang xác minh giao nhận",
  PaymentExpired: "Hết hạn thanh toán",
  Cancelled: "Đã hủy",
  SettlementPending: "Đang xử lý hoàn tiền",
  Inspection: "Đang kiểm tra sách",
  Completed: "Hoàn tất",
};
export function orderTime(value: string) {
  return new Date(value).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "short",
    timeStyle: "short",
  });
}
