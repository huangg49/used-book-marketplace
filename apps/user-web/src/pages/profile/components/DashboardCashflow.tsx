import { Link } from "react-router-dom";
import { ArrowRight, BarChart3 } from "lucide-react";
import { ROUTES } from "../../../lib/routes";

export function DashboardCashflow() {
  return (
    <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-lg border border-outline-variant/30">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-b border-surface-container-high/40 pb-space-sm">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
              <BarChart3 size={18} />
            </div>
            <h2 className="font-headline-md text-headline-md text-primary font-semibold">
              Dòng tiền &amp; Thống kê lưu khố (6 tháng)
            </h2>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Đối soát doanh thu bán sách, trúng đấu giá và ngân sách sưu tập thư tịch.
          </p>
        </div>

        {/* Chart Legends */}
        <div className="flex items-center gap-space-md flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-primary inline-block"></span>
            <span className="font-label-md text-label-md text-on-surface text-xs font-medium">
              Thu nhập bán &amp; đấu giá
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-secondary inline-block"></span>
            <span className="font-label-md text-label-md text-on-surface text-xs font-medium">
              Chi phí sưu tầm sách
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-space-lg items-center">
        {/* SVG Visual Chart Container (3 Cols) */}
        <div className="lg:col-span-3 bg-surface-container-low rounded-xl p-space-md relative overflow-hidden border border-outline-variant/20">
          <div className="w-full h-60 flex flex-col justify-between">
            <svg className="w-full h-full" fill="none" preserveAspectRatio="none" viewBox="0 0 680 220">
              {/* Grid background lines */}
              <line stroke="#ede8de" strokeDasharray="4 4" strokeWidth="1" x1="40" x2="660" y1="30" y2="30" />
              <line stroke="#ede8de" strokeDasharray="4 4" strokeWidth="1" x1="40" x2="660" y1="80" y2="80" />
              <line stroke="#ede8de" strokeDasharray="4 4" strokeWidth="1" x1="40" x2="660" y1="130" y2="130" />
              <line stroke="#dedad0" strokeWidth="1" x1="40" x2="660" y1="180" y2="180" />

              {/* Y Axis labels */}
              <text fill="#717974" fontFamily="Inter" fontSize="11" textAnchor="end" x="32" y="34">8M</text>
              <text fill="#717974" fontFamily="Inter" fontSize="11" textAnchor="end" x="32" y="84">5M</text>
              <text fill="#717974" fontFamily="Inter" fontSize="11" textAnchor="end" x="32" y="134">2M</text>
              <text fill="#717974" fontFamily="Inter" fontSize="11" textAnchor="end" x="32" y="184">0</text>

              {/* Month 5 (Th.5) */}
              <rect fill="#00261a" height="92" rx="2" width="24" x="85" y="88" />
              <rect fill="#994530" height="52" rx="2" width="24" x="113" y="128" />
              <text fill="#414844" fontFamily="Inter" fontSize="12" fontWeight="500" textAnchor="middle" x="111" y="202">Th.5</text>

              {/* Month 6 (Th.6) */}
              <rect fill="#00261a" height="75" rx="2" width="24" x="185" y="105" />
              <rect fill="#994530" height="62" rx="2" width="24" x="213" y="118" />
              <text fill="#414844" fontFamily="Inter" fontSize="12" fontWeight="500" textAnchor="middle" x="211" y="202">Th.6</text>

              {/* Month 7 (Th.7) */}
              <rect fill="#00261a" height="115" rx="2" width="24" x="285" y="65" />
              <rect fill="#994530" height="38" rx="2" width="24" x="313" y="142" />
              <text fill="#414844" fontFamily="Inter" fontSize="12" fontWeight="500" textAnchor="middle" x="311" y="202">Th.7</text>

              {/* Month 8 (Th.8) */}
              <rect fill="#00261a" height="80" rx="2" width="24" x="385" y="100" />
              <rect fill="#994530" height="87" rx="2" width="24" x="413" y="93" />
              <text fill="#414844" fontFamily="Inter" fontSize="12" fontWeight="500" textAnchor="middle" x="411" y="202">Th.8</text>

              {/* Month 9 (Th.9) */}
              <rect fill="#00261a" height="108" rx="2" width="24" x="485" y="72" />
              <rect fill="#994530" height="58" rx="2" width="24" x="513" y="122" />
              <text fill="#414844" fontFamily="Inter" fontSize="12" fontWeight="500" textAnchor="middle" x="511" y="202">Th.9</text>

              {/* Month 10 (Th.10 - Current) */}
              <rect fill="#00261a" height="138" rx="2" width="24" x="585" y="42" />
              <rect fill="#994530" height="66" rx="2" width="24" x="613" y="114" />
              <text fill="#414844" fontFamily="Inter" fontSize="12" fontWeight="600" textAnchor="middle" x="611" y="202">Th.10</text>
            </svg>
          </div>
        </div>

        {/* Mini Summary Beside Chart (1 Col) */}
        <div className="flex flex-col gap-space-sm">
          <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col gap-0.5 border border-outline-variant/30">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
              Tổng thu 6 tháng qua
            </span>
            <span className="font-currency-display text-headline-sm text-primary font-headline-sm font-bold">
              32.400.000 ₫
            </span>
            <span className="font-label-sm text-[11px] text-on-surface-variant">
              Bao gồm 8 phiên thanh lý ấn bản
            </span>
          </div>

          <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col gap-0.5 border border-outline-variant/30">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
              Tổng chi sưu tầm
            </span>
            <span className="font-currency-display text-headline-sm text-secondary font-headline-sm font-bold">
              18.250.000 ₫
            </span>
            <span className="font-label-sm text-[11px] text-on-surface-variant">
              Mua 14 tác phẩm bổ sung kho
            </span>
          </div>

          <div className="p-space-md rounded-lg bg-primary-container text-on-primary flex flex-col gap-0.5 shadow-sm">
            <span className="font-label-sm text-label-sm text-primary-fixed uppercase tracking-wider font-semibold">
              Thặng dư tích lũy
            </span>
            <span className="font-currency-display text-headline-sm font-headline-sm font-bold">
              +14.150.000 ₫
            </span>
            <div className="flex items-center justify-between mt-1 pt-1 border-t border-on-primary/10">
              <span className="font-label-sm text-[11px] text-on-primary/80">
                Hiệu suất tăng 24%
              </span>
              <Link to={ROUTES.wallet} className="text-[11px] text-primary-fixed underline hover:text-white flex items-center gap-0.5">
                <span>Chi tiết ví</span>
                <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}