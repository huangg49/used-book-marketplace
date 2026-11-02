import type { DirectOrder } from "../services/orders";

type ReviewOrder = Pick<
  DirectOrder,
  | "state"
  | "preparation"
  | "carrierReview"
  | "deliveryReview"
  | "deliveredAt"
  | "inspectionDeadline"
  | "moneyHeld"
>;

export function directDeliveryGuidance(order: ReviewOrder) {
  const funds =
    order.moneyHeld > 0
      ? "Khoản thanh toán vẫn đang được giữ trong giao dịch."
      : "Xem chi tiết thanh toán để kiểm tra số tiền đang được giữ.";
  if (order.state === "ResolutionPending") {
    if (order.deliveryReview)
      return {
        title: "Đang xác minh giao hàng quá hạn",
        message: `Đã quá hạn giao hàng, chưa có xác nhận người mua nhận sách. ${funds} Trao đổi trong hội thoại của đơn để đối chiếu với người bán; chờ kết quả xác minh giao nhận.`,
        dateLabel: "Hạn giao hàng đã ghi nhận",
        date: order.deliveryReview.deliveryDeadline,
        report: order.deliveryReview.buyerReport
          ? "Đã ghi nhận báo chưa nhận sách của người mua."
          : null,
      };
    if (order.carrierReview || order.preparation?.pickupReview)
      return {
        title: "Đang xác minh bàn giao vận chuyển",
        message: `${
          order.carrierReview?.reason !== "ConflictingPickup"
            ? "Đã quá hạn bàn giao sách cho đơn vị vận chuyển."
            : "Thông tin bàn giao vận chuyển có mâu thuẫn cần đối chiếu."
        } Chưa có đủ xác nhận sách đã đến người mua. ${funds} Trao đổi trong hội thoại của đơn và chờ kết quả xác minh bàn giao.`,
        dateLabel: order.preparation?.pickupReview
          ? "Hạn bàn giao đã ghi nhận"
          : "Mở xác minh lúc",
        date: order.preparation?.pickupReview
          ? order.preparation.pickupDeadline
          : order.carrierReview!.openedAt,
        report: null,
      };
    return {
      title: "Đang xác minh giao nhận",
      message: `Chưa đủ thông tin để kết luận sách đã được giao. ${funds} Trao đổi trong hội thoại của đơn và tải lại để theo dõi kết quả xác minh.`,
      dateLabel: null,
      date: null,
      report: null,
    };
  }
  if (order.state === "Inspection")
    return {
      title: "Đã ghi nhận giao sách, chờ xử lý tiếp",
      message: `Thông tin giao sách đã được hệ thống ghi nhận; chưa phải kết quả giải quyết khiếu nại hoặc hoàn tất giao dịch. ${funds} Nếu có vấn đề, trao đổi trong hội thoại của đơn. Đơn chưa tự động giải ngân khi hết hạn kiểm tra.`,
      dateLabel: order.inspectionDeadline
        ? "Hạn kiểm tra đã ghi nhận"
        : "Ghi nhận giao sách lúc",
      date: order.inspectionDeadline ?? order.deliveredAt,
      report: null,
    };
  return null;
}
