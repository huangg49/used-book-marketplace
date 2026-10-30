import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Wallet, Library, AlertTriangle, Bell } from "lucide-react";
import { ROUTES } from "../../../lib/routes";
import { listNotifications } from "../../../services/notifications";

interface DashboardUser {
  id: string;
  displayName: string;
  email?: string;
  status: "ACTIVE" | "RESTRICTED" | "LOCKED" | string;
}

interface DashboardGreetingProps {
  user: DashboardUser;
}

export function DashboardGreeting({ user }: DashboardGreetingProps) {
  const isLocked = user.status === "LOCKED";
  const isActive = user.status === "ACTIVE";

  const notificationsQuery = useQuery({
    queryKey: ["notifications", "page"],
    queryFn: () => listNotifications(undefined, 1),
    staleTime: 30_000,
  });
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;

  return (
    <section id="overview-greeting" aria-labelledby="overview-title" className="relative bg-surface-container-low rounded-xl p-space-lg overflow-hidden border border-outline-variant/30">
      <div
        aria-hidden="true"
        className="absolute right-0 top-0 bottom-0 w-[60%] pointer-events-none mix-blend-multiply opacity-20 hidden sm:block"
        style={{
          backgroundImage: "url(/bg-greeting.png)",
          backgroundSize: "cover",
          backgroundPosition: "right center",
          backgroundRepeat: "no-repeat",
          WebkitMaskImage: "linear-gradient(to right, transparent, black 50%)",
          maskImage: "linear-gradient(to right, transparent, black 50%)",
        }}
      />
      <div className="relative z-10 flex flex-col gap-space-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
          <div className="min-w-0 flex flex-col gap-1">
            <h1 id="overview-title" tabIndex={-1} className="m-0 font-bold text-2xl md:text-3xl text-primary tracking-normal outline-none">
              Tổng quan
            </h1>
            <p className="m-0 text-sm text-on-surface-variant break-words">
              Chào {user.displayName}!
            </p>
          </div>

          {/* Quick Action CTAs */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {isActive && <Link
              to={ROUTES.sell}
              className="inline-flex items-center gap-2 min-h-11 px-4 py-2 rounded-lg bg-secondary text-on-secondary text-sm font-semibold hover:bg-on-secondary-container transition-colors"
            >
              <Plus size={18} aria-hidden="true" />
              <span>Đăng sách</span>
            </Link>}
            <Link
              to={ROUTES.wallet}
              className="inline-flex items-center gap-2 min-h-11 px-3 py-2 rounded-lg bg-surface-container-high text-primary text-sm font-semibold hover:bg-surface-dim transition-colors"
            >
              <Wallet size={18} aria-hidden="true" />
              <span>Ví Lật-Xu</span>
            </Link>
            {!isLocked && <Link
              to={ROUTES.myBooks}
              className="inline-flex items-center gap-2 min-h-11 px-3 py-2 rounded-lg text-primary text-sm font-semibold hover:bg-surface-container-high transition-colors"
            >
              <Library size={18} aria-hidden="true" />
              <span>Kệ sách</span>
            </Link>}
            <Link to={ROUTES.notifications} title="Thông báo"
              aria-label={unreadCount > 0 ? `Thông báo, ${unreadCount} chưa đọc` : "Thông báo"}
              className="relative inline-flex items-center justify-center w-11 h-11 rounded-lg text-primary hover:bg-surface-container-high transition-colors">
              <Bell size={18} aria-hidden="true" className={unreadCount > 0 ? "animate-bounce" : ""} />
              {unreadCount > 0 && <span aria-hidden="true" className="absolute top-0 right-0 min-w-4 h-4 px-1 rounded-full bg-secondary text-on-secondary text-[10px] font-semibold flex items-center justify-center">{unreadCount > 99 ? "99+" : unreadCount}</span>}
            </Link>
          </div>
        </div>
        {!isActive && (
          <p className="accountNotice m-0 p-2.5 rounded-lg bg-error-container text-on-error-container text-sm flex items-start gap-2" role="status">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Tài khoản đang {isLocked ? "khóa" : "hạn chế"} giao dịch mới.{" "}
              <Link to={ROUTES.profile} className="underline font-semibold">Xem tài khoản</Link>
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
