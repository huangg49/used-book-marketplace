import { z } from "zod";
import { ApiError } from "@used-books/session-client";

export const quoteSchema = z.object({
  id: z.string().uuid(),
  version: z.literal(1),
  listingVersion: z.number(),
  listingRevisionId: z.string().uuid(),
  expiresAt: z.string(),
  amounts: z.object({
    bookPrice: z.number().int(),
    shippingFee: z.number().int(),
    buyerTotal: z.number().int(),
  }),
});
export type Quote = z.infer<typeof quoteSchema>;

export const orderReceiptSchema = z.object({
  id: z.string().uuid(),
  entityType: z.literal("Order"),
  entityId: z.string().uuid(),
  contextId: z.string().uuid(),
  version: z.number().int(),
  state: z.string(),
  paymentDeadline: z.string(),
  serverTime: z.string(),
});
export type OrderReceipt = z.infer<typeof orderReceiptSchema>;

export const orderDetailsSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["Buyer", "Seller"]),
  version: z.number().int(),
  state: z.string(),
  paymentDeadline: z.string(),
  paymentEnabled: z.boolean(),
  purchaseMode: z.enum(["BuyNow", "Negotiated"]).optional(),
  amounts: z.object({
    bookPrice: z.number().int(),
    shippingFee: z.number().int(),
    buyerTotal: z.number().int(),
  }),
  moneyHeld: z.number().int().optional(),
  paidAt: z.string().nullable().optional(),
  canCancel: z.boolean().optional(),
});
export type OrderDetails = z.infer<typeof orderDetailsSchema>;

export type BuyNowInput = {
  quoteId: string;
  expectedQuoteVersion: number;
  expectedListingVersion: number;
  expectedListingRevisionId: string;
};

export const orderListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().optional(),
  listingId: z.string().uuid().optional(),
  purchaseMode: z.enum(["Negotiated", "BuyNow"]).optional(),
  version: z.number().int(),
  state: z.string(),
  role: z.enum(["Buyer", "Seller"]),
  createdAt: z.string(),
  paymentDeadline: z.string().optional(),
  closedAt: z.string().nullable().optional(),
});
export type OrderListItem = z.infer<typeof orderListItemSchema>;

export const ordersPageSchema = z.object({
  items: z.array(orderListItemSchema),
  nextCursor: z.string().nullable().optional(),
  serverTime: z.string().optional(),
});
export type OrdersPage = z.infer<typeof ordersPageSchema>;

export const ORDER_STATE_CONFIG: Record<
  string,
  { label: string; tone: "warning" | "info" | "success" | "neutral" | "danger" }
> = {
  AwaitingPayment: { label: "Chờ thanh toán", tone: "warning" },
  PendingSellerConfirmation: { label: "Chờ người bán xác nhận", tone: "warning" },
  Preparing: { label: "Người bán chuẩn bị sách", tone: "warning" },
  InTransit: { label: "Đang giao hàng", tone: "info" },
  Inspection: { label: "Đang kiểm định sách", tone: "info" },
  ResolutionPending: { label: "Đang xác minh", tone: "warning" },
  SettlementPending: { label: "Chờ đối soát", tone: "info" },
  Completed: { label: "Giao dịch thành công", tone: "success" },
  Cancelled: { label: "Đã hủy đơn", tone: "neutral" },
  PaymentExpired: { label: "Quá hạn thanh toán", tone: "danger" },
};

export function buyNowError(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.status === 401) return "Vui lòng đăng nhập lại để tiếp tục.";
    if (cause.status === 403) return "Tài khoản chưa đủ điều kiện đặt mua (cần kích hoạt hoặc xác minh).";
    if (cause.status === 404) return "Bản sách hoặc địa chỉ nhận không còn tồn tại.";
    if (cause.status === 409) return "Bản sách đã có người đặt mua hoặc đang được giữ chỗ giao dịch.";
    if (cause.status === 422) return "Khu vực giao nhận không hợp lệ hoặc thông tin không đủ điều kiện.";
    if (cause.status === 429) return "Hệ thống đang bận. Vui lòng thử lại sau giây lát.";
  }
  if (cause instanceof Error && cause.message) return cause.message;
  return "Không thể hoàn tất giao dịch. Vui lòng kiểm tra lại.";
}

