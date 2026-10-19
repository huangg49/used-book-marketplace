import type { ExchangeDetail } from "./mock/exchangeDetail";

export function exchangeChatGuidance(detail: ExchangeDetail) {
  switch (detail.status) {
    case "PENDING":
      return detail.canViewerAccept
        ? "Đề nghị đang chờ bạn phản hồi. Xem sách và điều khoản trước khi chấp nhận hoặc đề xuất lại."
        : "Đang chờ đối tác phản hồi đề nghị. Bạn có thể hỏi thêm về các cuốn sách tại đây.";
    case "FUNDING":
      return detail.viewerFundedAt
        ? "Bạn đã đặt cọc. Đang chờ đối tác hoàn tất khoản cọc của họ."
        : "Đề nghị đã được chấp nhận. Kiểm tra khoản cọc và tiền bù tại phần Hành động của bạn.";
    case "WAITING_YOU_SEND":
      return detail.viewerShipping.sentAt
        ? "Bạn đã xác nhận gửi sách. Theo dõi chiều giao nhận của đối tác trong giao dịch."
        : "Hai bên đã đặt cọc. Chuẩn bị sách và thực hiện bước gửi trong phần Hành động của bạn.";
    case "DELIVERING":
    case "WAITING_YOU_CONFIRM":
      return "Trao đổi việc giao nhận tại đây. Chỉ xác nhận nhận sách trong giao dịch khi bạn thực sự đã nhận được.";
    case "INSPECTING":
      return "Hai bên đang kiểm tra sách. Xem thời hạn và báo sự cố trong giao dịch nếu cần; tin nhắn không thay cho thao tác khiếu nại.";
    case "RESOLUTION_PENDING":
      return "Giao dịch đang cần xử lý. Bạn có thể trao đổi thêm; tin nhắn không tự thay đổi quyết định hoặc giải phóng tiền cọc.";
    default:
      return "Cuộc trao đổi đã kết thúc. Bạn có thể đọc lại lịch sử và thông tin sách ở đây.";
  }
}
