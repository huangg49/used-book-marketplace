import {
  Library,
  UserRound,
  ArrowLeftRight,
  LayoutDashboard,
  Gavel,
  ShoppingBag,
  Wallet,
  Star,
} from "lucide-react";
import { ROUTES } from "./routes";

// One set of destinations for the header disclosure, mobile menu and sidebar.
export const accountNavigation = [
  { to: ROUTES.account, label: "Tổng quan", icon: LayoutDashboard },
  { to: ROUTES.profile, label: "Hồ sơ của tôi", icon: UserRound },
  { to: '/reviews', label: 'Đánh giá của tôi', icon: Star },
  { to: ROUTES.wallet, label: "Ví của tôi", icon: Wallet },
  { to: "/orders", label: "Đơn hàng của tôi", icon: ShoppingBag },
  { to: ROUTES.myBooks, label: "Kệ sách của tôi", icon: Library },
  { to: ROUTES.myAuctions, label: "Đấu giá của tôi", icon: Gavel },
  { to: ROUTES.exchangeMine, label: "Đề nghị đổi sách", icon: ArrowLeftRight },
] as const;
