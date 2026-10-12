import type { MyListing } from "../services/my-listings";

export const moderationLabels = {
  Draft: "Bản nháp",
  PendingReview: "Chờ duyệt",
  Approved: "Đã duyệt",
  Rejected: "Bị từ chối",
};
export const visibilityLabels = {
  Visible: "Hiển thị",
  Hidden: "Đang ẩn",
  Removed: "Đã gỡ",
};
export const tradeLabels = {
  Available: "Sẵn sàng",
  Reserved: "Đang giữ",
  Sold: "Đã bán",
  Exchanged: "Đã đổi",
};
export function isPublicOwnerListing(item: MyListing) {
  return (
    item.state.moderation === "Approved" && item.state.visibility === "Visible"
  );
}
