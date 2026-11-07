import type { CurrentUser } from "@used-books/session-client";
import { canEnterWorkspace, canOperatePoint, canResolve, canReview, canReviewCatalog, canSimulate } from "../../core/session";

export type NavigationIcon = "dashboard" | "statistics" | "books" | "catalog" | "intake" | "collection" | "incident" | "resolution" | "auction" | "overdue" | "point" | "users" | "carrier";
export type NavigationItem = { label: string; to: string; icon: NavigationIcon };
export type NavigationGroup = { id: string; label: string; items: NavigationItem[] };

// Presentation only. Route/service permission checks remain the authority.
export function navigationGroups(user: CurrentUser | undefined): NavigationGroup[] {
  if (!user || !canEnterWorkspace(user)) return [];
  const groups: NavigationGroup[] = [{ id: "workspace", label: "Không gian làm việc", items: [
    { label: "Dashboard", to: "/dashboard", icon: "dashboard" },
    ...(canReview(user)
      ? [{ label: "Thống kê", to: "/statistics", icon: "statistics" as const }]
      : []),
  ] }];

  // 1. Quản lý người dùng: Đưa lên vị trí ưu tiên cao, trực tiếp dưới Dashboard cho Quản trị viên
  if (canReviewCatalog(user)) {
    groups.push({
      id: "management",
      label: "Quản lý",
      items: [{ label: "Yêu cầu rút tiền", to: "/withdrawals", icon: "resolution" }, { label: "Quản lý người dùng", to: "/users", icon: "users" }, { label: "Trung tâm xử lý", to: "/support", icon: "resolution" }],
    });
  }

  // 2. Kiểm duyệt: Xếp tuần tự theo chu trình Đầu sách -> Bài đăng sách -> Đánh giá -> Khiếu nại
  if (canReview(user)) {
    const items: NavigationItem[] = [];
    if (canReviewCatalog(user)) {
      items.push({ label: "Đầu sách", to: "/review/catalog-requests", icon: "catalog" });
    }
    items.push(
      { label: "Bài đăng sách", to: "/review/listings", icon: "books" },
      { label: "Hậu kiểm AI", to: "/ai-review-checks", icon: "overdue" },
      { label: "Đánh giá giao dịch", to: "/transaction-reviews", icon: "books" },
      { label: "Khiếu nại trao đổi", to: "/operations/exchange-disputes", icon: "resolution" },
    );
    groups.push({ id: "review", label: "Kiểm duyệt", items });
  }

  // 3. Điểm & đấu giá: Xếp tuần tự từ Thiết lập trạm -> Phiên đấu giá -> Nhận sách -> Giao sách -> Xử lý đơn/sự cố/quá hạn
  if (canOperatePoint(user) || canResolve(user)) {
    const items: NavigationItem[] = [];
    if (canResolve(user)) {
      items.push(
        { label: "Điểm giao nhận", to: "/operations/points", icon: "point" },
        { label: "Phiên đấu giá", to: "/operations/auctions", icon: "auction" },
      );
    }
    if (canOperatePoint(user)) {
      items.push(
        { label: "Nhận sách đấu giá", to: "/operations/intakes", icon: "intake" },
        { label: "Giao sách", to: "/operations/collections", icon: "collection" },
      );
    }
    if (canResolve(user)) {
      items.push(
        { label: "Xử lý đơn tại điểm", to: "/operations/resolutions", icon: "resolution" },
      );
    }
    items.push({ label: "Sự cố tại điểm", to: "/operations/incidents", icon: "incident" });
    if (canResolve(user)) {
      items.push(
        { label: "Việc quá hạn", to: "/operations/escalations", icon: "overdue" },
      );
    }
    groups.push({ id: "operations", label: "Điểm & đấu giá", items });
  }

  // 4. Mô phỏng (dành cho Test Operator)
  if (canSimulate(user)) {
    groups.push({
      id: "simulation",
      label: "Mô phỏng",
      items: [
        { label: "Hãng vận chuyển", to: "/simulator/deliveries", icon: "carrier" },
        { label: "Lấy hàng trực tiếp", to: "/simulator/events/pickups", icon: "intake" },
        { label: "Giao hàng trực tiếp", to: "/simulator/events/deliveries", icon: "carrier" },
        { label: "Nạp tiền mô phỏng", to: "/simulator/events/topups", icon: "resolution" },
      ],
    });
  }

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
