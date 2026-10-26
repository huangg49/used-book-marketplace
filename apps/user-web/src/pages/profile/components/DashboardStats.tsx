import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Wallet, ShieldCheck, Library, Truck, TrendingUp, RefreshCw, AlertCircle, BookOpen } from "lucide-react";
import { getWalletSummary } from "../../../services/wallet";
import { myListingsQuery } from "../../../lib/owner-listing-queries";
import { ROUTES, formatVnd } from "../../../lib/routes";

interface DashboardStatsProps {
  ownerId: string;
}

export function DashboardStats({ ownerId }: DashboardStatsProps) {
  const walletQuery = useQuery({
    queryKey: ["wallet-summary", ownerId],
    queryFn: getWalletSummary,
  });

  const listingsQuery = useQuery(myListingsQuery(ownerId, "Approved", undefined, 50));

  const totalBooks = listingsQuery.data?.items.reduce((sum, listing) => sum + (listing.currentRevision.content.bundle?.items.length ?? 1), 0) ?? 0;
  const totalValue = listingsQuery.data?.items.reduce(
    (sum, item) => sum + (item.currentRevision.content?.salePrice || 0),
    0
  ) ?? 0;

  const availableVnd = walletQuery.data?.available ?? 0;
  const heldVnd = walletQuery.data?.transactionHeld ?? 0;
  const latXu = Math.floor(availableVnd / 1000);

  return (
    <section aria-labelledby="overview-stats" className="flex flex-col gap-space-sm">
      <h2 id="overview-stats" className="sr-only">Thống kê tổng quan</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
        {/* Card 1: Số dư khả dụng (ĐỎ - Wine Red Hero Card) */}
        <section
          id="overview-wallet"
          aria-labelledby="overview-wallet-title"
          className="bg-gradient-to-br from-[#680b0b] via-[#5c0202] to-[#450202] text-white rounded-xl p-space-lg shadow-sm flex flex-col justify-between h-full relative overflow-hidden group hover:shadow-md transition-all border border-[#831a1a]/70"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <span id="overview-wallet-title" className="font-label-md text-xs text-[#f5eddc]/85 uppercase tracking-wider font-semibold">
                Số dư khả dụng
              </span>
              {walletQuery.isPending ? (
                <div className="h-8 w-28 bg-white/20 rounded animate-pulse my-1" />
              ) : walletQuery.isError ? (
                <div className="flex items-center gap-1.5 text-amber-200 text-xs font-semibold my-1" role="alert">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  <span className="truncate">Chưa tải được ví</span>
                  <button
                    type="button"
                    onClick={() => void walletQuery.refetch()}
                    className="underline hover:text-white ml-1 flex items-center gap-1 flex-shrink-0"
                  >
                    <RefreshCw size={12} /> Thử lại
                  </button>
                </div>
              ) : (
                <span className="font-currency-display text-lg sm:text-xl lg:text-2xl text-white tracking-tight font-bold truncate">
                  {formatVnd(availableVnd)}
                </span>
              )}
            </div>
            <div className="w-10 h-10 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center text-[#fceeed] flex-shrink-0 shadow-inner">
              <Wallet size={20} />
            </div>
          </div>

          <div className="pt-space-md mt-space-md flex items-center justify-between border-t border-white/15 gap-1.5">
            <span className="text-xs font-bold text-amber-200 whitespace-nowrap">
              +{latXu.toLocaleString("vi-VN")} Lật-Xu
            </span>
            <Link
              to={ROUTES.wallet}
              className="inline-flex items-center gap-1 text-[11px] text-white hover:text-[#fffcf5] bg-white/15 hover:bg-white/25 border border-white/20 px-2 py-1 rounded transition-colors font-medium shadow-sm whitespace-nowrap flex-shrink-0"
            >
              <TrendingUp size={12} />
              Mở ví
            </Link>
          </div>
        </section>

        {/* Card 2: Escrow bảo chứng (TRẮNG - Crisp White Card) */}
        <div className="bg-white rounded-xl p-space-lg shadow-sm flex flex-col justify-between h-full group hover:shadow-md transition-all border border-[#e6d5c3]">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <span className="font-label-md text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
                Tạm giữ (Escrow)
              </span>
              {walletQuery.isPending ? (
                <div className="h-8 w-28 bg-surface-container-high rounded animate-pulse my-1" />
              ) : (
                <span className="font-currency-display text-lg sm:text-xl lg:text-2xl text-primary tracking-tight font-bold truncate">
                  {formatVnd(heldVnd)}
                </span>
              )}
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#fbf5ef] border border-[#ecdacb] flex items-center justify-center text-[#5c0202] flex-shrink-0">
              <ShieldCheck size={20} />
            </div>
          </div>
          <div className="pt-space-md mt-space-md flex items-center gap-1.5 text-on-surface-variant text-[11px] border-t border-[#ebd9c8]/50">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary inline-block flex-shrink-0"></span>
            <span className="whitespace-nowrap">Bảo lưu an toàn</span>
          </div>
        </div>

        {/* Card 3: Giá trị kệ sách (ĐỎ - Wine Red Hero Card) */}
        <div className="bg-gradient-to-br from-[#680b0b] via-[#5c0202] to-[#450202] text-white rounded-xl p-space-lg shadow-sm flex flex-col justify-between h-full relative overflow-hidden group hover:shadow-md transition-all border border-[#831a1a]/70">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <span className="font-label-md text-xs text-[#f5eddc]/85 uppercase tracking-wider font-semibold">
                Giá trị kệ sách
              </span>
              {listingsQuery.isPending ? (
                <div className="h-8 w-28 bg-white/20 rounded animate-pulse my-1" />
              ) : (
                <span className="font-currency-display text-lg sm:text-xl lg:text-2xl text-white tracking-tight font-bold">
                  {totalValue > 0 ? formatVnd(totalValue) : `${totalBooks} cuốn`}
                </span>
              )}
            </div>
            <div className="w-10 h-10 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center text-[#fceeed] flex-shrink-0 shadow-inner">
              <Library size={20} />
            </div>
          </div>
          <div className="pt-space-md mt-space-md flex items-center justify-between border-t border-white/15 gap-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-300/35 text-amber-200 shadow-xs whitespace-nowrap">
              <BookOpen size={12} className="text-amber-300 flex-shrink-0" />
              <span className="text-xs font-bold tracking-wide">
                <strong className="font-extrabold text-amber-100">{totalBooks}</strong> ấn phẩm
              </span>
            </div>
            <Link
              to={ROUTES.myBooks}
              className="inline-flex items-center gap-1 text-[11px] text-white hover:text-[#fffcf5] bg-white/15 hover:bg-white/25 border border-white/20 px-2.5 py-1 rounded font-medium transition-colors shadow-sm whitespace-nowrap flex-shrink-0"
            >
              Kệ sách
            </Link>
          </div>
        </div>

        {/* Card 4: Đơn đang xử lý (TRẮNG - Crisp White Card) */}
        <div className="bg-white rounded-xl p-space-lg shadow-sm flex flex-col justify-between h-full group hover:shadow-md transition-all border border-[#e6d5c3]">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <span className="font-label-md text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
                Đơn đang xử lý
              </span>
              <span className="font-currency-display text-base sm:text-lg lg:text-xl text-primary tracking-tight font-bold whitespace-nowrap">
                Luân chuyển
              </span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#fbf5ef] border border-[#ecdacb] flex items-center justify-center text-[#5c0202] flex-shrink-0">
              <Truck size={20} />
            </div>
          </div>
          <div className="pt-space-md mt-space-md flex items-center justify-between text-on-surface-variant text-[11px] border-t border-[#ebd9c8]/50 gap-1">
            <div className="flex items-center gap-1 min-w-0">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary inline-block flex-shrink-0"></span>
              <span className="whitespace-nowrap">Mua & Bán</span>
            </div>
            <Link to="/orders" className="font-semibold text-primary hover:text-secondary underline whitespace-nowrap flex-shrink-0">
              Xem đơn
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
