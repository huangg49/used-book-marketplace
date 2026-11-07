import type { DirectOrder } from "../services/orders";
import type { ExchangeDetail } from "./mock/exchangeDetail";

/** Presentational phase only. Never grants command permissions or derives money. */
export function orderStage(
  o: Pick<DirectOrder, "state" | "role" | "canConfirmReceipt">,
  registered: boolean,
) {
  const buyer = o.role === "Buyer";
  switch (o.state) {
    case "AwaitingPayment":
      return {
        title: buyer ? "Thanh toán đơn sách" : "Chờ người mua thanh toán",
        who: buyer
          ? "Kiểm tra tổng thanh toán và hạn trước khi xác nhận."
          : "Người mua cần hoàn tất thanh toán trong thời hạn của đơn.",
      };
    case "PendingSellerConfirmation":
      return {
        title: buyer
          ? "Chờ người bán xác nhận"
          : "Xác nhận đơn và chuẩn bị sách",
        who: buyer
          ? "Người bán cần phản hồi đơn này."
          : "Kiểm tra nghĩa vụ giao sách trước khi xác nhận hoặc từ chối.",
      };
    case "Preparing":
      return {
        title: registered
          ? "Chờ bàn giao vận chuyển"
          : buyer
            ? "Người bán đang chuẩn bị sách"
            : "Chuẩn bị và gửi sách",
        who: registered
          ? "Đã có vận đơn; vẫn cần xác nhận bàn giao từ đơn vị vận chuyển."
          : buyer
            ? "Bạn chưa cần thao tác. Theo dõi cập nhật của người bán."
            : "Lưu ảnh đóng gói, sau đó đăng ký vận đơn trước hạn bàn giao.",
      };
    case "InTransit":
      return {
        title: "Sách đang được vận chuyển",
        who: o.canConfirmReceipt
          ? "Chỉ xác nhận nhận sách khi kiện hàng thực sự đến tay bạn."
          : "Theo dõi các mốc giao nhận đã được hệ thống ghi nhận.",
      };
    case "Inspection":
      return {
        title: "Kiểm tra sách sau khi nhận",
        who: "Xem hạn kiểm tra và quyền đánh giá hiện tại. Tiền tiếp tục được giữ theo quy trình.",
      };
    case "ResolutionPending":
      return {
        title: "Giao nhận đang cần xác minh",
        who: "Xem nội dung cần xử lý bên dưới. Tin nhắn không thay thế báo cáo hoặc kết luận xử lý.",
      };
    case "Completed":
      return {
        title: "Giao dịch đã hoàn tất",
        who: "Xem kết quả thanh toán và đánh giá theo quyền hiện có.",
      };
    case "SettlementPending":
      return {
        title: "Đang xử lý khoản thanh toán",
        who: "Theo dõi kết quả từ máy chủ; không tạo thêm thanh toán để thử lại.",
      };
    case "PaymentExpired":
      return {
        title: "Đã hết hạn thanh toán",
        who: "Xem kết quả của đơn; thao tác cũ không còn dùng để giữ sách.",
      };
    case "Cancelled":
      return {
        title: "Đơn đã hủy",
        who: "Thông tin và lịch sử đơn vẫn được giữ để đối chiếu.",
      };
    default:
      return {
        title: "Theo dõi đơn hàng",
        who: "Kiểm tra trạng thái mới nhất trước khi thao tác.",
      };
  }
}

export function exchangeStage(
  d: Pick<
    ExchangeDetail,
    "status" | "viewerFundedAt" | "viewerShipping" | "canViewerAccept"
  >,
) {
  switch (d.status) {
    case "PENDING":
      return d.canViewerAccept
        ? "Đề nghị đang chờ bạn phản hồi"
        : "Chờ đối tác phản hồi đề nghị";
    case "FUNDING":
      return d.viewerFundedAt
        ? "Chờ đối tác đặt cọc"
        : "Đặt cọc để tiếp tục trao đổi";
    case "WAITING_YOU_SEND":
      return d.viewerShipping.sentAt
        ? "Chờ đối tác gửi sách"
        : "Chuẩn bị và gửi sách";
    case "DELIVERING":
    case "WAITING_YOU_CONFIRM":
      return d.viewerShipping.receivedAt
        ? "Bạn đã nhận sách, chờ đối tác"
        : "Theo dõi và nhận sách";
    case "INSPECTING":
      return "Kiểm tra sách sau khi nhận";
    case "RESOLUTION_PENDING":
      return "Trao đổi đang cần xử lý sự cố";
    case "COMPLETED":
    case "NEED_REVIEW":
      return "Trao đổi đã hoàn tất";
    case "EXPIRED":
      return "Đề nghị đã hết hạn";
    case "REJECTED":
      return "Đề nghị đã bị từ chối";
    case "CANCELLED":
      return "Trao đổi đã hủy";
    default:
      return "Theo dõi trao đổi";
  }
}
