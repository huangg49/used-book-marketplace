import { Link } from "react-router-dom";
import { Plus, Wallet, Library, AlertTriangle, ShieldCheck } from "lucide-react";
import { ROUTES } from "../../../lib/routes";

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

  return (
    <section className="relative bg-surface-container-low rounded-xl p-space-lg md:p-space-xl overflow-hidden shadow-sm border border-outline-variant/30">
      <div 
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
        <div className="flex flex-col gap-space-xs max-w-3xl">
          <div className="flex items-center gap-space-sm flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-high text-primary font-label-sm text-label-sm uppercase tracking-wider font-semibold">
              <ShieldCheck size={15} className="text-primary" />
              Hội viên Lưu khố Lật Lại
            </span>
            {isActive ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container-high text-secondary font-label-sm text-label-sm uppercase tracking-wider font-medium">
                <span className="w-2 h-2 rounded-full bg-secondary inline-block"></span>
                Tài khoản Đang hoạt động
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-error-container text-on-error-container font-label-sm text-label-sm uppercase tracking-wider font-semibold">
                <AlertTriangle size={14} />
                {isLocked ? "Tài khoản đang khóa giao dịch mới" : "Tài khoản đang hạn chế giao dịch mới"}
              </span>
            )}
          </div>

          <h1 tabIndex={-1} className="font-bold text-2xl md:text-3xl text-primary tracking-normal mt-1 outline-none">
            Tổng quan của bạn
          </h1>
          <p className="font-title-md text-title-md text-primary font-semibold">
            Chào mừng trở lại, {user.displayName}
          </p>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
            Lưu khố cá nhân hiện đang vận hành ổn định. Các giao dịch ủy thác và hồ sơ đấu giá hôm nay được cập nhật theo thời gian thực.
          </p>

          {!isActive && (
            <p className="accountNotice mt-2 p-2.5 rounded bg-error-container text-on-error-container text-xs md:text-sm font-medium flex items-center gap-2">
              <AlertTriangle size={16} />
              <span>
                Tài khoản đang {isLocked ? "khóa" : "hạn chế"} giao dịch mới.{" "}
                <Link to={ROUTES.profile} className="underline font-bold hover:opacity-80">
                  Xem thông tin tài khoản
                </Link>
              </span>
            </p>
          )}
        </div>

        {/* Quick Action CTAs */}
        <div className="flex items-center gap-space-sm flex-wrap flex-shrink-0">
          <Link
            to={ROUTES.sell}
            className="inline-flex items-center gap-space-xs px-space-md py-2.5 rounded bg-secondary text-on-secondary font-title-md text-title-md hover:bg-on-secondary-container transition-colors shadow-sm"
          >
            <Plus size={18} />
            <span>Đăng sách</span>
          </Link>
          <Link
            to={ROUTES.wallet}
            className="inline-flex items-center gap-space-xs px-space-md py-2.5 rounded bg-surface-container-highest text-primary font-title-md text-title-md hover:bg-surface-dim transition-colors"
          >
            <Wallet size={18} />
            <span>Nạp / Rút Lật-Xu</span>
          </Link>
          <Link
            to={ROUTES.myBooks}
            className="inline-flex items-center gap-space-xs px-space-md py-2.5 rounded bg-surface-container-high text-primary font-title-md text-title-md hover:bg-surface-dim transition-colors"
          >
            <Library size={18} />
            <span>Kệ sách</span>
          </Link>
        </div>
      </div>
    </section>
  );
}