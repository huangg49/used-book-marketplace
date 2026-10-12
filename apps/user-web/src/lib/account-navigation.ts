import { Library, UserRound, ArrowLeftRight, LayoutDashboard, Gavel } from "lucide-react";
import { ROUTES } from "./routes";

// One set of destinations for the header disclosure, mobile menu and sidebar.
export const accountNavigation = [
  { to: ROUTES.account, label: "Tổng quan", icon: LayoutDashboard },
  { to: ROUTES.profile, label: "Hồ sơ của tôi", icon: UserRound },
  { to: ROUTES.myBooks, label: "Kệ sách của tôi", icon: Library },
  { to: ROUTES.myAuctions, label: "Đấu giá của tôi", icon: Gavel },
  { to: ROUTES.exchangeMine, label: "Đề nghị đổi sách", icon: ArrowLeftRight },
] as const;
