import type { CurrentUser } from "@used-books/session-client";
import { canEnterWorkspace, canOperatePoint, canResolve, canReview, canReviewCatalog, canSimulate } from "../../core/session";

export type NavigationIcon = "dashboard" | "books" | "catalog" | "intake" | "collection" | "incident" | "resolution" | "auction" | "overdue" | "point" | "users" | "carrier";
export type NavigationItem = { label: string; to: string; icon: NavigationIcon };
export type NavigationGroup = { id: string; label: string; items: NavigationItem[] };

// Presentation only. Route/service permission checks remain the authority.
export function navigationGroups(user: CurrentUser | undefined): NavigationGroup[] {
  if (!user || !canEnterWorkspace(user)) return [];
  const groups: NavigationGroup[] = [{ id: "workspace", label: "Không gian làm việc", items: [
    { label: "Dashboard", to: "/dashboard", icon: "dashboard" },
  ] }];
  if (canReview(user)) {
    const items: NavigationItem[] = [{ label: "Bài đăng sách", to: "/review/listings", icon: "books" }];
    if (canReviewCatalog(user)) items.push({ label: "Đầu sách", to: "/review/catalog-requests", icon: "catalog" });
    groups.push({ id: "review", label: "Kiểm duyệt", items });
  }
  if (canOperatePoint(user) || canResolve(user)) {
    const items: NavigationItem[] = [];
    if (canOperatePoint(user)) items.push(
      { label: "Nhận sách đấu giá", to: "/operations/intakes", icon: "intake" },
      { label: "Giao sách", to: "/operations/collections", icon: "collection" },
    );
    items.push({ label: "Sự cố tại điểm", to: "/operations/incidents", icon: "incident" });
    if (canResolve(user)) items.push(
      { label: "Xử lý đơn tại điểm", to: "/operations/resolutions", icon: "resolution" },
      { label: "Phiên đấu giá", to: "/operations/auctions", icon: "auction" },
      { label: "Việc quá hạn", to: "/operations/escalations", icon: "overdue" },
      { label: "Điểm giao nhận", to: "/operations/points", icon: "point" },
    );
    groups.push({ id: "operations", label: "Điểm & đấu giá", items });
  }
  if (canReviewCatalog(user)) groups.push({ id: "management", label: "Quản lý", items: [
    { label: "Quản lý người dùng", to: "/users", icon: "users" },
  ] });
  if (canSimulate(user)) groups.push({ id: "simulation", label: "Mô phỏng", items: [
    { label: "Hãng vận chuyển", to: "/simulator/deliveries", icon: "carrier" },
    { label: "Lấy hàng trực tiếp", to: "/simulator/events/pickups", icon: "intake" },
    { label: "Giao hàng trực tiếp", to: "/simulator/events/deliveries", icon: "carrier" },
    { label: "Nạp tiền mô phỏng", to: "/simulator/events/topups", icon: "resolution" },
  ] });
  return groups;
}

export function workspaceRole(user: CurrentUser | undefined) {
  if (!user) return "Chờ xác minh quyền";
  if (user.status !== "ACTIVE") return "Quyền truy cập bị giới hạn";
  const roles = [
    user.roles.includes("ADMIN") ? "Quản trị viên" : undefined,
    user.roles.includes("STAFF") ? "Nhân viên" : undefined,
    user.roles.includes("TEST_OPERATOR") ? "Vận hành thử" : undefined,
  ].filter(Boolean);
  return roles.join(" · ") || "Chưa có quyền vận hành";
}
