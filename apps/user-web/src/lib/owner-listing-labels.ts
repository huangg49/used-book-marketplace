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

// Only approved, visible, still-available Sale listings can enter an auction
// (FR-AU01); the server rechecks under the listing lock.
export function auctionEligible(item: MyListing) {
  return (
    isPublicOwnerListing(item) &&
    item.state.trade === "Available" &&
    item.currentRevision.content.mode === "Sale"
  );
}
