import { z } from "zod";
import type { SessionClient } from "../../core/api/session-client";
import {
  conversationEventSchema,
  orderReceiptSchema,
  purchaseConversationSchema,
  purchaseMessageSchema,
  receiptSchema,
  type ConversationEvent,
  type PurchaseConversation,
  type TermsProposalBody,
  type TermsResponseBody,
} from "./contracts";

export const statusLabels: Record<string, string> = {
  Active: "Đang thương lượng",
  Expired: "Đã hết hạn",
  Cancelled: "Đã hủy",
  OrderCreated: "Đã tạo đơn",
};

export function formatDateTimeVi(isoString: string | null | undefined): string {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "";
  }
}

export function formatMessageTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function startPurchaseConversation(
  client: SessionClient,
  listingId: string,
  expectedVersion: number,
  key: string = crypto.randomUUID(),
  intent?: "Negotiation" | "Exchange",
) {
  return client.request(
    `/listings/${listingId}/purchase-conversations`,
    receiptSchema,
    {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({ expectedVersion, ...(intent ? { intent } : {}) }),
    },
  );
}

export function getPurchaseConversations(client: SessionClient) {
  return client.request(
    "/me/purchase-conversations",
    z.array(purchaseConversationSchema),
  );
}

export function getPurchaseConversation(client: SessionClient, id: string) {
  return client.request(
    `/me/purchase-conversations/${id}`,
    purchaseConversationSchema,
  );
}

export function getPurchaseMessages(client: SessionClient, conversationId: string) {
  return client.request(
    `/me/purchase-conversations/${conversationId}/messages`,
    z.array(purchaseMessageSchema),
  );
}

export function getConversationEvents(client: SessionClient, conversationId: string) {
  return client.request(
    `/me/purchase-conversations/${conversationId}/events`,
    z.array(conversationEventSchema),
  );
}

export function changeConversationTerms(
  client: SessionClient,
  id: string,
  body: TermsProposalBody | TermsResponseBody,
  key: string = crypto.randomUUID(),
) {
  return client.request(
    `/me/purchase-conversations/${id}/terms${"proposalId" in body ? "/respond" : ""}`,
    receiptSchema,
    {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(body),
    },
  );
}

export function createSellerOrder(
  client: SessionClient,
  body: {
    conversationId: string;
    expectedVersion: number;
    agreedBookPrice: number;
  },
  key: string = crypto.randomUUID(),
) {
  return client.request("/orders", orderReceiptSchema, {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}

export function purchaseChatGuidance(
  room: PurchaseConversation,
  userId: string,
  fulfillment: boolean | undefined,
  now = Date.now(),
) {
  const buyer = room.buyer.id === userId;
  if (room.status === "OrderCreated") {
    return {
      phase: 2,
      title: "Đơn hàng đã được tạo",
      description:
        "Xem thanh toán và tiến độ giao nhận trong đơn hàng. Lịch sử trò chuyện được giữ lại ở đây.",
      action: room.orderId ? ("order" as const) : undefined,
      actionLabel: "Xem đơn hàng",
    };
  }
  if (
    room.status !== "Active" ||
    (room.expiresAt && Date.parse(room.expiresAt) <= now)
  ) {
    return {
      phase: undefined,
      title:
        room.status === "Cancelled"
          ? "Cuộc trao đổi đã hủy"
          : "Cuộc trao đổi đã hết hạn",
      description:
        "Bạn vẫn có thể đọc lịch sử. Tìm sách khác để bắt đầu một cuộc trao đổi mới.",
      action: undefined,
      actionLabel: undefined,
    };
  }
  const quoteCurrent = Boolean(
    room.hasQuote &&
      room.quotePreview &&
      Date.parse(room.quotePreview.expiresAt) > now,
  );
  if (quoteCurrent) {
    return {
      phase: 1,
      title: buyer
        ? "Đã gửi thông tin nhận sách"
        : "Người mua đã gửi thông tin nhận sách",
      description: buyer
        ? "Hai bên có thể trao đổi thêm. Người bán sẽ tạo đơn khi thống nhất giá."
        : "Kiểm tra địa chỉ, phí giao hàng và nhập giá đã thống nhất để tạo đơn.",
      action: buyer ? ("address" as const) : ("create-order" as const),
      actionLabel: buyer ? "Xem lại thông tin nhận sách" : "Kiểm tra và tạo đơn",
    };
  }
  if (fulfillment === false) {
    return {
      phase: 0,
      title: "Cần bổ sung nơi gửi sách",
      description: buyer
        ? "Người bán cần bổ sung thông tin giao hàng trước khi tạo đơn. Bạn vẫn có thể hỏi thêm về cuốn sách."
        : "Bổ sung nơi gửi trong bài đăng để người mua có thể gửi thông tin nhận sách. Bạn vẫn có thể trò chuyện ở đây.",
      action: undefined,
      actionLabel: undefined,
    };
  }
  return {
    phase: room.hasQuote ? 1 : 0,
    title: room.hasQuote
      ? "Cần gửi lại thông tin nhận sách"
      : "Trao đổi trước khi chốt mua",
    description: room.hasQuote
      ? buyer
        ? "Phí giao hàng hoặc địa chỉ trước đó cần được cập nhật. Gửi lại thông tin để người bán tạo đơn."
        : "Thông tin nhận sách trước đó không còn dùng để tạo đơn. Nhắn người mua gửi lại địa chỉ và phí giao hàng."
      : buyer
        ? "Hỏi về tình trạng sách và thống nhất giá. Khi muốn mua, gửi thông tin nhận sách."
        : "Trả lời câu hỏi và thống nhất giá với người mua. Sau khi họ gửi thông tin nhận sách, bạn có thể tạo đơn.",
    action: buyer && fulfillment ? ("address" as const) : undefined,
    actionLabel: "Gửi thông tin nhận sách",
  };
}

export function eventSummaryText(event: ConversationEvent): string {
  if (event.kind === "PriceProposed")
    return `đề nghị giá ${new Intl.NumberFormat("vi-VN").format(event.amount ?? 0)} ₫`;
  if (event.kind === "PriceAccepted")
    return `chấp nhận giá ${new Intl.NumberFormat("vi-VN").format(event.amount ?? 0)} ₫`;
  if (event.kind === "ModeProposed")
    return `đề nghị chuyển sang ${event.mode === "Exchange" ? "đổi sách" : "thương lượng mua"}`;
  if (event.kind === "ModeAccepted")
    return `chấp nhận ${event.mode === "Exchange" ? "đổi sách" : "thương lượng mua"}`;
  if (event.kind === "ProposalDeclined") return "không tiếp tục đề nghị trước";
  return "gửi đề nghị đổi sách; chi tiết hiện trên phiếu thỏa thuận";
}
