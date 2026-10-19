import type { PurchaseConversation } from "../services/purchase-conversations";

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
      description: "Xem thanh toán và tiến độ giao nhận trong đơn hàng. Lịch sử trò chuyện được giữ lại ở đây.",
      action: room.orderId ? "order" : undefined,
      actionLabel: "Xem đơn hàng",
    } as const;
  }
  if (room.status !== "Active" || (room.expiresAt && Date.parse(room.expiresAt) <= now)) {
    return {
      phase: undefined,
      title: room.status === "Cancelled" ? "Cuộc trao đổi đã hủy" : "Cuộc trao đổi đã hết hạn",
      description: "Bạn vẫn có thể đọc lịch sử. Tìm sách khác để bắt đầu một cuộc trao đổi mới.",
      action: undefined,
      actionLabel: undefined,
    } as const;
  }
  const quoteCurrent = Boolean(room.hasQuote && room.quotePreview && Date.parse(room.quotePreview.expiresAt) > now);
  if (quoteCurrent) {
    return {
      phase: 1,
      title: buyer ? "Đã gửi thông tin nhận sách" : "Người mua đã gửi thông tin nhận sách",
      description: buyer
        ? "Hai bên có thể trao đổi thêm. Người bán sẽ tạo đơn khi thống nhất giá."
        : "Kiểm tra địa chỉ, phí giao hàng và nhập giá đã thống nhất để tạo đơn.",
      action: buyer ? "address" : "create-order",
      actionLabel: buyer ? "Xem lại thông tin nhận sách" : "Kiểm tra và tạo đơn",
    } as const;
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
    } as const;
  }
  return {
    phase: room.hasQuote ? 1 : 0,
    title: room.hasQuote ? "Cần gửi lại thông tin nhận sách" : "Trao đổi trước khi chốt mua",
    description: room.hasQuote
      ? buyer
        ? "Phí giao hàng hoặc địa chỉ trước đó cần được cập nhật. Gửi lại thông tin để người bán tạo đơn."
        : "Thông tin nhận sách trước đó không còn dùng để tạo đơn. Nhắn người mua gửi lại địa chỉ và phí giao hàng."
      : buyer
        ? "Hỏi về tình trạng sách và thống nhất giá. Khi muốn mua, gửi thông tin nhận sách."
        : "Trả lời câu hỏi và thống nhất giá với người mua. Sau khi họ gửi thông tin nhận sách, bạn có thể tạo đơn.",
    action: buyer && fulfillment ? "address" : undefined,
    actionLabel: "Gửi thông tin nhận sách",
  } as const;
}
