import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Wallet, Library, AlertTriangle, ShieldCheck, Bell } from "lucide-react";
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
    <section id="overview-greeting" aria-labelledby="overview-title" className="relative bg-surface-container-low rounded-xl p-space-lg md:p-space-xl overflow-hidden shadow-sm border border-outline-variant/30">
      <div
        aria-hidden="true"
        className="absolute right-0 top-0 bottom-0 w-[70%] pointer-events-none mix-blend-multiply opacity-40 hidden sm:block"
        style={{
          backgroundImage: "url(/bg-greeting.png)",
          backgroundSize: "cover",
          backgroundPosition: "right center",
          backgroundRepeat: "no-repeat",
          WebkitMaskImage: "linear-gradient(to right, transparent, black 50%)",
          maskImage: "linear-gradient(to right, transparent, black 50%)",
        }}
      />
      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg">
        <div className="min-w-0 flex flex-col gap-space-xs max-w-3xl">
          <div className="flex items-center gap-space-sm flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-high text-primary font-label-sm text-label-sm uppercase tracking-wider font-semibold">
              <ShieldCheck size={15} className="text-primary" />
              Hội viên Lật lại
            </span>
            {isActive ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container-high text-secondary font-label-sm text-label-sm uppercase tracking-wider font-medium">
                <span className="w-2 h-2 rounded-full bg-secondary inline-block"></span>
                Đang hoạt động
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-error-container text-on-error-container font-label-sm text-label-sm uppercase tracking-wider font-semibold">
                <AlertTriangle size={14} />
                {isLocked ? "Tài khoản đang khóa giao dịch mới" : "Tài khoản đang hạn chế giao dịch mới"}
              </span>
            )}
            <Link
              to={ROUTES.notifications}
              aria-label={unreadCount > 0 ? `Thông báo, ${unreadCount} chưa đọc` : "Thông báo"}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-label-sm text-label-sm uppercase tracking-wider font-semibold transition-colors ${
                unreadCount > 0
                  ? "bg-[#fbe9e7] text-[#bf360c] border border-[#ffccbc] hover:bg-[#ffccbc]/60"
                  : "bg-surface-container-high text-on-surface-variant hover:text-primary"
              }`}
            >
              <Bell size={13} className={unreadCount > 0 ? "text-[#bf360c] animate-bounce" : ""} />
              <span>{unreadCount > 0 ? `${unreadCount} thông báo mới` : "Thông báo"}</span>
            </Link>
          </div>

          <h1 id="overview-title" tabIndex={-1} className="m-0 font-bold text-2xl md:text-3xl text-primary tracking-normal mt-1 outline-none">
            Tổng quan của bạn
          </h1>
          <p className="m-0 break-words font-title-md text-title-md text-primary font-semibold">
            Chào mừng trở lại, {user.displayName}
          </p>
          <p className="m-0 font-body-md text-body-md text-on-surface-variant max-w-2xl">
            Quản lý sách, giao dịch và các phiên đấu giá của bạn.
          </p>

          {!isActive && (
            <p role="status" className="accountNotice mt-2 p-2.5 rounded bg-error-container text-on-error-container text-xs md:text-sm font-medium flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
              <span>
                Tài khoản đang {isLocked ? "khóa" : "hạn chế"} giao dịch mới.{" "}
                <Link to={ROUTES.profile} className="underline font-bold hover:opacity-80">
                  Xem tài khoản
                </Link>
              </span>
            </p>
          )}
        </div>

        {/* Quick Action CTAs */}
        <div className="flex items-center gap-space-sm flex-wrap flex-shrink-0">
          {isActive && <Link
            to={ROUTES.sell}
            className="inline-flex items-center gap-space-xs px-space-md py-2.5 rounded bg-secondary text-on-secondary font-title-md text-title-md hover:bg-on-secondary-container transition-colors shadow-sm"
          >
            <Plus size={18} />
            <span>Đăng sách</span>
          </Link>}
          <Link
            to={ROUTES.wallet}
            className="inline-flex items-center gap-space-xs px-space-md py-2.5 rounded bg-surface-container-highest text-primary font-title-md text-title-md hover:bg-surface-dim transition-colors"
          >
            <Wallet size={18} />
            <span>Ví Lật-Xu</span>
          </Link>
          {!isLocked && <Link
            to={ROUTES.myBooks}
            className="inline-flex items-center gap-space-xs px-space-md py-2.5 rounded bg-surface-container-high text-primary font-title-md text-title-md hover:bg-surface-dim transition-colors"
          >
            <Library size={18} />
            <span>Kệ sách</span>
          </Link>}
        </div>
      </div>
    </section>
  );
}
