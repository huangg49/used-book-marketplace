import {
  Library,
  ArrowLeftRight,
  LayoutDashboard,
  Gavel,
  ShoppingBag,
  Wallet,
  Star,
  UserRound,
  MessageSquare,
} from "lucide-react";
import { ROUTES } from "./routes";

// One set of destinations for the header disclosure, mobile menu and sidebar.
export const accountNavigation = [
  { to: ROUTES.account, label: "Tổng quan", icon: LayoutDashboard },
  { to: '/profile', label: 'Hồ sơ & bảo mật', icon: UserRound },
  { to: '/cart', label: 'Giỏ sách', icon: ShoppingBag },
  { to: '/reviews', label: 'Đánh giá của tôi', icon: Star },
  { to: '/support', label: 'Hỗ trợ & phản ánh', icon: MessageSquare },
  { to: ROUTES.wallet, label: "Ví của tôi", icon: Wallet },
  { to: "/orders", label: "Đơn trực tiếp", icon: ShoppingBag },
  { to: ROUTES.myBooks, label: "Kệ sách của tôi", icon: Library },
  { to: ROUTES.myAuctions, label: "Đấu giá của tôi", icon: Gavel },
  { to: ROUTES.exchangeMine, label: "Trao đổi của tôi", icon: ArrowLeftRight },
] as const;
