import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Wallet,
  ArrowRight,
  BarChart3,
  ArrowDownLeft,
  ArrowUpRight,
  Coins,
  ShieldCheck,
  RefreshCw,
  PlusCircle,
  Receipt,
  HelpCircle,
} from "lucide-react";
import {
  getWalletSummary,
  getWalletHistory,
  walletHistoryLabels,
} from "../../../services/wallet";
import { ROUTES, formatVnd } from "../../../lib/routes";

const dateFormat = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

interface DashboardCashflowProps {
  ownerId: string;
}

export function DashboardCashflow({ ownerId }: DashboardCashflowProps) {
  const summaryQuery = useQuery({
    queryKey: ["wallet-summary", ownerId],
    queryFn: getWalletSummary,
    enabled: !!ownerId,
  });

  const historyQuery = useQuery({
    queryKey: ["wallet-history-overview", ownerId],
    queryFn: () => getWalletHistory({}),
    enabled: !!ownerId,
  });

  const summary = summaryQuery.data;
  const historyItems = historyQuery.data?.items ?? [];

  // 1. Phân loại và tính tổng dòng tiền thật từ ledger
  let totalTopup = 0;
  let totalSettlement = 0;
  let totalPayment = 0;
  let totalFees = 0;
  let totalRefunds = 0;

  for (const item of historyItems) {
    if (item.type === "Topup") {
      totalTopup += item.amount;
    } else if (item.type === "OrderSettlement") {
      totalSettlement += item.amount;
    } else if (item.type === "OrderPayment") {
      totalPayment += Math.abs(item.amount);
    } else if (
      item.type === "ListingFeeCharge" ||
      item.type === "ListingFeeSettlement"
    ) {
      totalFees += Math.abs(item.amount);
    } else if (
      item.type === "OrderRefund" ||
      item.type === "ListingFeeRefund"
    ) {
      totalRefunds += item.amount;
    }
  }

  // Tổng thu (Nạp tiền + Bán sách + Hoàn tiền)
  const totalIncome = totalTopup + totalSettlement + totalRefunds;
  // Tổng chi (Thanh toán đơn hàng + Phí niêm yết/trừ xu)
  const totalExpense = totalPayment + totalFees;

  // 2. Nhóm dữ liệu theo 6 tháng gần nhất cho biểu đồ
  const now = new Date();
  const monthsData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const monthNumber = d.getMonth() + 1;
    const year = d.getFullYear();
    const label = `Th.${monthNumber}`;

    let income = 0;
    let expense = 0;

    for (const item of historyItems) {
      const p = new Date(item.postedAt);
      if (p.getMonth() + 1 === monthNumber && p.getFullYear() === year) {
        if (item.amount > 0) {
          income += item.amount;
        } else {
          expense += Math.abs(item.amount);
        }
      }
    }

    return { label, monthNumber, year, income, expense };
  });

  // Tìm mức max để tỉ lệ cột trong SVG không bị tràn (tối thiểu 1 triệu)
  const maxMonthlyVal = Math.max(
    ...monthsData.map((m) => Math.max(m.income, m.expense)),
    1_000_000
  );

  const availableVnd = summary?.available ?? 0;
  const heldVnd = summary?.transactionHeld ?? 0;
  const totalVnd = summary?.total ?? 0;
  const latXu = Math.floor(availableVnd / 1000);

  return (
    <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-lg border border-outline-variant/30">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-b border-surface-container-high/40 pb-space-sm">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
              <BarChart3 size={18} />
            </div>
            <h2 className="text-xl md:text-2xl text-primary font-bold tracking-normal">
              Dòng tiền &amp; Thống kê lưu khố (6 tháng)
            </h2>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Đối soát số dư thực tế, tiền nạp, nhận bán sách và các khoản trừ xu dịch vụ.
          </p>
        </div>

        {/* Chart Legends */}
        <div className="flex items-center gap-space-md flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-primary inline-block"></span>
            <span className="font-label-md text-label-md text-on-surface text-xs font-medium">
              Thu nhập bán &amp; Nạp ví
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-[#994530] inline-block"></span>
            <span className="font-label-md text-label-md text-on-surface text-xs font-medium">
              Chi phí mua &amp; Trừ xu
            </span>
          </div>
        </div>
      </div>

      {/* BANNER 1: THỂ HIỆN TIỀN TRONG VÍ HIỆN TẠI */}
      <div className="bg-surface-container-low rounded-xl p-space-md border border-primary/20 flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-space-md flex-1">
          {/* Ô 1: Số dư khả dụng */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant flex items-center gap-1">
              <Wallet size={13} className="text-primary" />
              Số dư khả dụng
            </span>
            <span className="font-currency-display text-lg md:text-xl text-primary font-bold">
              {summaryQuery.isPending ? "…" : formatVnd(availableVnd)}
            </span>
            <span className="text-[11px] text-secondary font-semibold">
              Quy đổi: +{latXu.toLocaleString("vi-VN")} Lật-Xu
            </span>
          </div>

          {/* Ô 2: Đang phong tỏa Escrow */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant flex items-center gap-1">
              <ShieldCheck size={13} className="text-secondary" />
              Tạm giữ Escrow
            </span>
            <span className="font-currency-display text-lg md:text-xl text-secondary font-bold">
              {summaryQuery.isPending ? "…" : formatVnd(heldVnd)}
            </span>
            <span className="text-[11px] text-on-surface-variant">
              Bảo hộ giao dịch an toàn
            </span>
          </div>

          {/* Ô 3: Tổng tài sản ví */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant flex items-center gap-1">
              <Coins size={13} className="text-primary" />
              Tổng tài sản ví
            </span>
            <span className="font-currency-display text-lg md:text-xl text-primary font-bold">
              {summaryQuery.isPending ? "…" : formatVnd(totalVnd)}
            </span>
            <span className="text-[11px] text-on-surface-variant">
              Gồm khả dụng + tạm giữ
            </span>
          </div>

          {/* Ô 4: Phí niêm yết hiện hành */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant flex items-center gap-1">
              <Receipt size={13} className="text-on-surface-variant" />
              Phí niêm yết
            </span>
            <span className="font-currency-display text-lg md:text-xl text-on-surface font-bold">
              {summary?.listingSubmissionFee ? formatVnd(summary.listingSubmissionFee) : "0 ₫"}
            </span>
            <span className="text-[11px] text-on-surface-variant">
              Áp dụng theo từng bản sách
            </span>
          </div>
        </div>

        {/* Nút thao tác nhanh ví */}
        <div className="flex items-center gap-2 flex-wrap flex-shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-outline-variant/30">
          <Link
            to={ROUTES.wallet}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-secondary text-on-secondary text-xs font-bold hover:bg-on-secondary-container transition-colors shadow-sm"
          >
            <PlusCircle size={15} />
            <span>Nạp tiền VNPay</span>
          </Link>
          <Link
            to={ROUTES.wallet}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-surface-container-high text-primary text-xs font-bold hover:bg-surface-dim transition-colors"
          >
            <Receipt size={15} />
            <span>Quản lý ví</span>
          </Link>
        </div>
      </div>

      {/* BANNER 2: BIỂU ĐỒ 6 THÁNG & 3 THẺ TỔNG KẾT ĐỐI SOÁT */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-space-lg items-stretch">
        {/* SVG Visual Chart Container (3 Cols) */}
        <div className="lg:col-span-3 bg-surface-container-low rounded-xl p-space-md relative overflow-hidden border border-outline-variant/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-on-surface-variant mb-2">
            <span className="font-semibold text-primary">Biểu đồ biến động thực tế (6 tháng)</span>
            <span className="font-mono text-[11px]">Đơn vị: VNĐ</span>
          </div>

          <div className="w-full h-56 flex flex-col justify-between">
            <svg
              className="w-full h-full"
              fill="none"
              preserveAspectRatio="none"
              viewBox="0 0 680 220"
            >
              {/* Grid background lines */}
              <line stroke="#ede8de" strokeDasharray="4 4" strokeWidth="1" x1="40" x2="660" y1="30" y2="30" />
              <line stroke="#ede8de" strokeDasharray="4 4" strokeWidth="1" x1="40" x2="660" y1="80" y2="80" />
              <line stroke="#ede8de" strokeDasharray="4 4" strokeWidth="1" x1="40" x2="660" y1="130" y2="130" />
              <line stroke="#dedad0" strokeWidth="1" x1="40" x2="660" y1="180" y2="180" />

              {/* Y Axis labels */}
              <text fill="#717974" fontFamily="Inter" fontSize="11" textAnchor="end" x="32" y="34">
                {Math.round(maxMonthlyVal / 1_000_000)}M
              </text>
              <text fill="#717974" fontFamily="Inter" fontSize="11" textAnchor="end" x="32" y="84">
                {Math.round((maxMonthlyVal * 0.66) / 1_000_000)}M
              </text>
              <text fill="#717974" fontFamily="Inter" fontSize="11" textAnchor="end" x="32" y="134">
                {Math.round((maxMonthlyVal * 0.33) / 1_000_000)}M
              </text>
              <text fill="#717974" fontFamily="Inter" fontSize="11" textAnchor="end" x="32" y="184">
                0
              </text>

              {/* 6 Tháng (Bars) */}
              {monthsData.map((m, idx) => {
                const xBase = 70 + idx * 100;
                // Chiều cao tối đa 140px (từ y=180 lên y=40)
                const incHeight = m.income > 0 ? Math.max(8, Math.round((m.income / maxMonthlyVal) * 140)) : 4;
                const expHeight = m.expense > 0 ? Math.max(8, Math.round((m.expense / maxMonthlyVal) * 140)) : 4;
                const yInc = 180 - incHeight;
                const yExp = 180 - expHeight;

                return (
                  <g key={m.label}>
                    {/* Cột Thu (Đỏ rượu #5c0202) */}
                    <rect
                      fill="#5c0202"
                      height={incHeight}
                      rx="2"
                      width="22"
                      x={xBase}
                      y={yInc}
                    >
                      <title>{`${m.label}: Thu ${formatVnd(m.income)}`}</title>
                    </rect>

                    {/* Cột Chi (Đất nung #994530) */}
                    <rect
                      fill="#994530"
                      height={expHeight}
                      rx="2"
                      width="22"
                      x={xBase + 26}
                      y={yExp}
                    >
                      <title>{`${m.label}: Chi ${formatVnd(m.expense)}`}</title>
                    </rect>

                    {/* Nhãn tháng */}
                    <text
                      fill={idx === 5 ? "#5c0202" : "#414844"}
                      fontFamily="Inter"
                      fontSize="12"
                      fontWeight={idx === 5 ? "700" : "500"}
                      textAnchor="middle"
                      x={xBase + 24}
                      y="202"
                    >
                      {m.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* 3 Thẻ tổng kết đối soát bên phải (1 Col) */}
        <div className="flex flex-col gap-space-sm justify-between">
          {/* Card 1: Tổng thu */}
          <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col gap-1 border border-outline-variant/30">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold flex items-center justify-between">
              <span>Tổng thu nhập vào</span>
              <ArrowDownLeft size={14} className="text-primary" />
            </span>
            <span className="font-currency-display text-headline-sm text-primary font-headline-sm font-bold">
              {formatVnd(totalIncome)}
            </span>
            <div className="text-[11px] text-on-surface-variant flex flex-col gap-0.5 mt-0.5">
              <span>• Nạp ví: {formatVnd(totalTopup)}</span>
              <span>• Nhận bán sách: {formatVnd(totalSettlement)}</span>
              {totalRefunds > 0 && <span>• Hoàn tiền: {formatVnd(totalRefunds)}</span>}
            </div>
          </div>

          {/* Card 2: Tổng chi & trừ xu */}
          <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col gap-1 border border-outline-variant/30">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold flex items-center justify-between">
              <span>Tổng chi &amp; Trừ xu</span>
              <ArrowUpRight size={14} className="text-secondary" />
            </span>
            <span className="font-currency-display text-headline-sm text-secondary font-headline-sm font-bold">
              {formatVnd(totalExpense)}
            </span>
            <div className="text-[11px] text-on-surface-variant flex flex-col gap-0.5 mt-0.5">
              <span>• Mua sách: {formatVnd(totalPayment)}</span>
              <span>• Trừ xu/phí niêm yết: {formatVnd(totalFees)}</span>
            </div>
          </div>

          {/* Card 3: Thặng dư tích lũy */}
          <div className="p-space-md rounded-lg bg-primary-container text-on-primary flex flex-col gap-1 shadow-sm">
            <span className="font-label-sm text-label-sm text-primary-fixed uppercase tracking-wider font-semibold">
              Thặng dư tích lũy ròng
            </span>
            <span className="font-currency-display text-headline-sm font-headline-sm font-bold">
              {totalIncome >= totalExpense ? "+" : "−"}
              {formatVnd(Math.abs(totalIncome - totalExpense))}
            </span>
            <div className="flex items-center justify-between mt-1 pt-1 border-t border-on-primary/10">
              <span className="font-label-sm text-[11px] text-on-primary/80">
                {historyItems.length} giao dịch ghi nhận
              </span>
              <Link
                to={ROUTES.wallet}
                className="text-[11px] text-primary-fixed underline hover:text-white flex items-center gap-0.5 font-bold"
              >
                <span>Chi tiết ví</span>
                <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* BANNER 3: BIẾN ĐỘNG SỐ DƯ GẦN NHẤT (LỊCH SỬ THẬT TỪ SỔ CÁI) */}
      <div className="bg-surface-container-low rounded-xl p-space-md border border-outline-variant/30 flex flex-col gap-space-sm">
        <div className="flex items-center justify-between border-b border-surface-container-high/60 pb-2">
          <div className="flex items-center gap-2">
            <Receipt size={16} className="text-primary" />
            <h3 className="font-title-md text-sm md:text-base text-primary font-bold">
              Biến động số dư gần nhất (Sổ cái Lật Lại)
            </h3>
          </div>
          <Link
            to={ROUTES.wallet}
            className="text-xs font-semibold text-primary hover:text-secondary underline flex items-center gap-1"
          >
            <span>Mở toàn bộ lịch sử</span>
            <ArrowRight size={12} />
          </Link>
        </div>

        {historyQuery.isPending ? (
          <div className="p-4 flex items-center justify-center gap-2 text-on-surface-variant text-xs">
            <RefreshCw size={14} className="animate-spin" />
            <span>Đang đối soát lịch sử giao dịch…</span>
          </div>
        ) : historyItems.length === 0 ? (
          <div className="py-6 px-4 text-center text-on-surface-variant flex flex-col items-center gap-1">
            <HelpCircle size={24} className="text-on-surface-variant/60 mb-1" />
            <p className="text-xs font-medium">
              Chưa có giao dịch ví nào. Các khoản nạp tiền, nhận tiền bán sách và trừ phí sẽ được ghi nhận tại đây.
            </p>
            <Link
              to={ROUTES.wallet}
              className="mt-2 text-xs font-bold text-secondary underline hover:opacity-80"
            >
              Nạp tiền đầu tiên qua VNPay
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {historyItems.slice(0, 4).map((item) => {
              const isCredit = item.amount > 0;
              const typeLabel = walletHistoryLabels[item.type] || item.type;

              return (
                <div
                  key={item.journalId}
                  className="p-3 rounded-lg bg-surface-container-lowest border border-outline-variant/20 flex items-center justify-between hover:shadow-xs transition-shadow"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isCredit
                          ? "bg-primary/10 text-primary"
                          : "bg-secondary/10 text-secondary"
                      }`}
                    >
                      {isCredit ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <strong className="text-xs text-primary font-bold truncate">
                        {typeLabel}
                      </strong>
                      <span className="text-[11px] text-on-surface-variant font-mono">
                        {dateFormat.format(new Date(item.postedAt))} • Mã #{item.journalId.slice(0, 8)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end flex-shrink-0 ml-2">
                    <span
                      className={`font-currency-display text-xs md:text-sm font-bold ${
                        isCredit ? "text-primary" : "text-secondary"
                      }`}
                    >
                      {isCredit ? "+" : "−"}
                      {formatVnd(Math.abs(item.amount))}
                    </span>
                    <span className="text-[10px] text-on-surface-variant/80">
                      Sau GD: {formatVnd(item.balanceAfter)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}