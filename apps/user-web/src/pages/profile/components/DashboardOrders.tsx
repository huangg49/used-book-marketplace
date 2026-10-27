import { useState } from "react";
import { Link } from "react-router-dom";
import { Truck, MessageSquare, ArrowRight } from "lucide-react";

export function DashboardOrders() {
  const [tab, setTab] = useState<"buy" | "sell">("buy");

  return (
    <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-lg border border-outline-variant/30">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-b border-surface-container-high/40 pb-space-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
            <Truck size={18} />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl text-primary font-bold tracking-normal">
              Theo dõi đơn hàng lưu trữ
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Tiến trình luân chuyển đơn hàng trực tiếp &amp; bảo hộ Escrow
            </p>
          </div>
        </div>

        {/* Switcher */}
        <div className="inline-flex p-1 rounded-lg bg-surface-container-high gap-1">
          <button
            onClick={() => setTab("buy")}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
              tab === "buy"
                ? "bg-surface-container-lowest text-primary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
            type="button"
          >
            Đơn mua (1)
          </button>
          <button
            onClick={() => setTab("sell")}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
              tab === "sell"
                ? "bg-surface-container-lowest text-primary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
            type="button"
          >
            Đơn bán (2)
          </button>
        </div>
      </div>

      {/* Active Order Card */}
      <div className="bg-surface-container-low rounded-xl p-space-md md:p-space-lg flex flex-col gap-space-md border border-outline-variant/30">
        {/* Order Header & Metadata */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md bg-surface-container-high/40 p-space-md rounded-lg">
          <div className="flex items-center gap-space-md">
            <div className="w-14 h-18 rounded bg-surface-container-high overflow-hidden flex-shrink-0 shadow-sm flex items-center justify-center text-on-surface-variant">
              <img
                className="w-full h-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBUW7exAcbHmQAdVKoB-vbmU8YOiQq10G1-nJfCl4Q4a-mxQNJP7UIRT9eNMgoK-pgjQDUqPjUpmOUKtiTLabq04cwjjpPV47w8wPXanAV5oVUOdqJmaqJdsPrSR6ryclor4BA4RyOknMwynwDziFJjjlsr4dhFOzBZqwJ6AGfziuPn4zvJHXRDScDwOoItda62d81oiqYBU9oQqUnIkZfFssg1SBBYDteAUV4C7B8Fda4ZtokcVR-Pzw"
                alt="Bìa sách"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="font-label-sm text-xs text-secondary font-bold">
                  {tab === "buy" ? "#DM-8021" : "#DB-4412"}
                </span>
                <span className="text-on-surface-variant">•</span>
                <span className="font-label-sm text-xs text-on-surface-variant">Ngày đặt: 21/10/2026</span>
              </div>
              <h4 className="font-title-md text-sm md:text-base text-primary font-bold">
                {tab === "buy" ? "Hà Nội 36 Phố Phường (Thạch Lam 1954)" : "Vang Bóng Một Thời (Nguyễn Tuân 1941)"}
              </h4>
              <span className="font-currency-display text-sm text-secondary font-bold">
                Tổng thanh toán: {tab === "buy" ? "620.000 ₫" : "4.200.000 ₫"}
              </span>
            </div>
          </div>

          {/* Quick links */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to="/orders"
              className="px-3 py-1.5 rounded bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container transition-colors shadow-sm flex items-center gap-1"
            >
              <span>Xem chi tiết đơn</span>
              <ArrowRight size={13} />
            </Link>
            <Link
              to="/orders"
              className="px-3 py-1.5 rounded bg-surface-container-high text-primary text-xs font-semibold hover:bg-surface-dim transition-colors flex items-center gap-1"
            >
              <MessageSquare size={13} />
              <span>Nhắn tin người {tab === "buy" ? "bán" : "mua"}</span>
            </Link>
          </div>
        </div>

        {/* 5-Step Progress Track */}
        <div className="flex flex-col gap-2 mt-2">
          <div className="flex items-center justify-between text-xs text-on-surface-variant">
            <span className="uppercase tracking-wider font-bold text-primary">Tiến trình vận chuyển</span>
            <span className="text-secondary font-medium">Chuyên vận Di sản GHN Bảo Hiểm</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            {/* Step 1: Done */}
            <div className="p-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/20 flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center text-[11px] font-bold">
                  ✓
                </span>
                <span className="text-[11px] font-semibold text-primary">Bước 1</span>
              </div>
              <span className="text-xs font-medium text-primary">Chờ xác nhận</span>
              <span className="text-[10px] text-on-surface-variant">21/10 (Đã duyệt)</span>
            </div>

            {/* Step 2: Done */}
            <div className="p-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/20 flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center text-[11px] font-bold">
                  ✓
                </span>
                <span className="text-[11px] font-semibold text-primary">Bước 2</span>
              </div>
              <span className="text-xs font-medium text-primary">Đóng gói niêm phong</span>
              <span className="text-[10px] text-on-surface-variant">22/10 (Đã xong)</span>
            </div>

            {/* Step 3: Active */}
            <div className="p-2.5 rounded-lg bg-primary-container text-on-primary shadow-sm flex flex-col gap-1 relative overflow-hidden">
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-secondary text-on-secondary flex items-center justify-center text-[11px] font-bold animate-pulse">
                  3
                </span>
                <span className="text-[11px] font-bold text-primary-fixed uppercase">Hiện tại</span>
              </div>
              <span className="text-xs font-bold text-on-primary">Đang giao hàng</span>
              <span className="text-[10px] text-primary-fixed leading-tight">Đang luân chuyển qua bưu cục</span>
            </div>

            {/* Step 4: Pending */}
            <div className="p-2.5 rounded-lg bg-surface-container-high/60 opacity-70 flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-surface-container-highest text-on-surface-variant flex items-center justify-center text-[11px]">
                  4
                </span>
                <span className="text-[11px] text-on-surface-variant">Bước 4</span>
              </div>
              <span className="text-xs font-medium text-on-surface-variant">Nhận &amp; Kiểm tra</span>
              <span className="text-[10px] text-on-surface-variant">Dự kiến 24/10</span>
            </div>

            {/* Step 5: Pending */}
            <div className="p-2.5 rounded-lg bg-surface-container-high/60 opacity-70 flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-surface-container-highest text-on-surface-variant flex items-center justify-center text-[11px]">
                  5
                </span>
                <span className="text-[11px] text-on-surface-variant">Bước 5</span>
              </div>
              <span className="text-xs font-medium text-on-surface-variant">Quyết toán Escrow</span>
              <span className="text-[10px] text-on-surface-variant">Bảo vệ 48h</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}