import {
  Library,
  ArrowLeftRight,
  LayoutDashboard,
  Gavel,
  ShoppingBag,
  Package,
  Wallet,
  Star,
  UserRound,
} from "lucide-react";
import { ROUTES } from "./routes";

// One set of destinations for the header disclosure, mobile menu and sidebar.
export const accountNavigation = [
  // Nhóm 1: Trung tâm & Dòng tiền
  { to: ROUTES.account, label: "Tổng quan", icon: LayoutDashboard, section: "overview" },
  { to: ROUTES.wallet, label: "Ví của tôi", icon: Wallet, section: "overview" },

  // Nhóm 2: Hoạt động giao dịch & Tủ sách cốt lõi
  { to: ROUTES.myBooks, label: "Kệ sách của tôi", icon: Library, section: "marketplace" },
  { to: "/orders", label: "Đơn trực tiếp", icon: Package, section: "marketplace" },
  { to: ROUTES.myAuctions, label: "Đấu giá của tôi", icon: Gavel, section: "marketplace" },
  { to: ROUTES.exchangeMine, label: "Trao đổi của tôi", icon: ArrowLeftRight, section: "marketplace" },
  { to: "/cart", label: "Giỏ sách", icon: ShoppingBag, section: "marketplace" },

  // Nhóm 3: Tương tác & Tài khoản cá nhân
  { to: "/reviews", label: "Đánh giá của tôi", icon: Star, section: "account" },
  { to: "/profile", label: "Hồ sơ & bảo mật", icon: UserRound, section: "account" },
] as const;
