import type { CurrentUser } from "@used-books/session-client";
import {
  canEnterWorkspace,
  canOperateIntake,
  canOperatePoint,
  canResolve,
  canReview,
  canReviewCatalog,
  canSimulate,
  canViewFinance,
} from "../../core/session";

export type NavigationIcon =
  | "dashboard" | "statistics" | "books" | "catalog" | "review" | "rating"
  | "ai" | "intake" | "collection" | "incident" | "resolution" | "auction"
  | "overdue" | "point" | "operations" | "users" | "wallet" | "carrier"
  | "support" | "simulation" | "ledger";

export type NavigationItem = {
  label: string;
  to: string;
  icon: NavigationIcon;
  end?: boolean;
};
export type NavigationGroup = {
  id: string;
  label: string;
  icon?: NavigationIcon;
  items: NavigationItem[];
};

type Capability = (user: CurrentUser) => boolean;
type Route = NavigationItem & { visibleTo?: Capability };
type RouteGroup = Omit<NavigationGroup, "items"> & { items: Route[] };

const canSeePointIncidents: Capability = (user) =>
  canOperatePoint(user) || canResolve(user);

const workspaceGroups: RouteGroup[] = [
  {
    id: "workspace",
    label: "Tổng quan",
    items: [
      { label: "Tổng quan", to: "/dashboard", icon: "dashboard" },
    ],
  },
  {
    id: "statistics",
    label: "Thống kê",
    icon: "statistics",
    items: [
      { label: "Tài chính & Lợi nhuận", to: "/statistics/finance", icon: "statistics", visibleTo: canViewFinance },
      { label: "Dòng tiền & Đối soát", to: "/statistics/cashflow", icon: "wallet", visibleTo: canViewFinance },
      { label: "Giao dịch & Rủi ro", to: "/statistics/operations", icon: "overdue", visibleTo: canReview },
      { label: "Ghi sổ & Nổi bật", to: "/statistics", icon: "ledger", end: true, visibleTo: canReview },
      { label: "AI & Token", to: "/statistics/ai", icon: "ai", visibleTo: canReview },
    ],
  },
  {
    id: "review",
    label: "Kiểm duyệt",
    icon: "review",
    items: [
      { label: "Đầu sách", to: "/review/catalog-requests", icon: "catalog", visibleTo: canReviewCatalog },
      { label: "Bài đăng sách", to: "/review/listings", icon: "books", visibleTo: canReview },
      { label: "Hậu kiểm AI", to: "/ai-review-checks", icon: "ai", visibleTo: canReview },
      { label: "Đánh giá giao dịch", to: "/transaction-reviews", icon: "rating", visibleTo: canReview },
    ],
  },
  {
    id: "cases",
    label: "Hỗ trợ & khiếu nại",
    icon: "support",
    items: [
      { label: "Khiếu nại trao đổi", to: "/operations/exchange-disputes", icon: "resolution", visibleTo: canReview },
      { label: "Khiếu nại đấu giá", to: "/operations/auction-disputes", icon: "auction", visibleTo: canResolve },
      { label: "Yêu cầu hỗ trợ", to: "/support", icon: "support", visibleTo: canResolve },
    ],
  },
  {
    id: "operations",
    label: "Giao nhận tại điểm",
    icon: "operations",
    items: [
      { label: "Nhận sách đấu giá", to: "/operations/intakes", icon: "intake", visibleTo: canOperateIntake },
      { label: "Giao sách", to: "/operations/collections", icon: "collection", visibleTo: canOperatePoint },
      { label: "Xử lý đơn tại điểm", to: "/operations/resolutions", icon: "resolution", visibleTo: canResolve },
      { label: "Sự cố tại điểm", to: "/operations/incidents", icon: "incident", visibleTo: canSeePointIncidents },
      { label: "Việc quá hạn", to: "/operations/escalations", icon: "overdue", visibleTo: canResolve },
      { label: "Điểm giao nhận", to: "/operations/points", icon: "point", visibleTo: canResolve },
    ],
  },
  {
    id: "auctions",
    label: "Đấu giá",
    items: [
      { label: "Phiên đấu giá", to: "/operations/auctions", icon: "auction", visibleTo: canResolve },
    ],
  },
  {
    id: "management",
    label: "Tài khoản & ví",
    icon: "wallet",
    items: [
      { label: "Quản lý người dùng", to: "/users", icon: "users", visibleTo: canReviewCatalog },
      { label: "Yêu cầu rút tiền", to: "/withdrawals", icon: "wallet", visibleTo: canResolve },
      { label: "Nhật ký hoạt động", to: "/audit", icon: "ledger", visibleTo: canReviewCatalog },
    ],
  },
  {
    id: "simulation",
    label: "Mô phỏng",
    icon: "simulation",
    items: [
      { label: "Hãng vận chuyển", to: "/simulator/deliveries", icon: "carrier", visibleTo: canSimulate },
      { label: "Lấy hàng trực tiếp", to: "/simulator/events/pickups", icon: "intake", visibleTo: canSimulate },
      { label: "Giao hàng trực tiếp", to: "/simulator/events/deliveries", icon: "carrier", visibleTo: canSimulate },
      { label: "Nạp tiền mô phỏng", to: "/simulator/events/topups", icon: "wallet", visibleTo: canSimulate },
    ],
  },
];

// Route and service guards decide access. The same catalogue feeds navigation and search.
export function navigationGroups(user: CurrentUser | undefined): NavigationGroup[] {
  if (!user || !canEnterWorkspace(user)) return [];
  return workspaceGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(({ visibleTo }) => !visibleTo || visibleTo(user)),
    }))
    .filter((group) => group.items.length > 0);
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
