import {
  Library,
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
  { to: '/reviews', label: 'Đánh giá của tôi', icon: Star },
  { to: ROUTES.wallet, label: "Ví của tôi", icon: Wallet },
  { to: "/orders", label: "Đơn trực tiếp", icon: ShoppingBag },
  { to: ROUTES.myBooks, label: "Kệ sách của tôi", icon: Library },
  { to: ROUTES.myAuctions, label: "Đấu giá của tôi", icon: Gavel },
  { to: ROUTES.exchangeMine, label: "Trao đổi của tôi", icon: ArrowLeftRight },
] as const;
