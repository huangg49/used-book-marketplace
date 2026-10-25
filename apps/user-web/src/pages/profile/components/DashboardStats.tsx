import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Wallet, ShieldCheck, Library, Truck, TrendingUp, RefreshCw, AlertCircle } from "lucide-react";
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

  const listingsQuery = useQuery(myListingsQuery(ownerId, "", undefined, 100));

  const totalBooks = listingsQuery.data?.items.length ?? 0;
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
        {/* Card 1: Số dư khả dụng */}
        <section
          id="overview-wallet"
          aria-labelledby="overview-wallet-title"
          className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between h-full relative overflow-hidden group hover:shadow-md transition-shadow border border-outline-variant/30"
        >
          <div className="flex items-start justify-between gap-space-sm">
            <div className="flex flex-col gap-1 min-w-0">
              <span id="overview-wallet-title" className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-semibold">
                Số dư khả dụng
              </span>
              {walletQuery.isPending ? (
                <div className="h-8 w-32 bg-surface-container-high rounded animate-pulse my-1" />
              ) : walletQuery.isError ? (
                <div className="flex items-center gap-1.5 text-error text-xs font-semibold my-1" role="alert">
                  <AlertCircle size={14} />
                  <span>Chưa tải được ví</span>
                  <button
                    type="button"
                    onClick={() => void walletQuery.refetch()}
                    className="underline hover:text-on-error ml-1 flex items-center gap-1"
                  >
                    <RefreshCw size={12} /> Thử lại
                  </button>
                </div>
              ) : (
                <span className="font-currency-display text-xl md:text-2xl text-primary tracking-normal font-bold truncate">
                  {formatVnd(availableVnd)}
                </span>
              )}
            </div>
            <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary flex-shrink-0">
              <Wallet size={20} />
            </div>
          </div>

          <div className="pt-space-md mt-space-md flex items-center justify-between border-t border-surface-container-high/40">
            <div className="flex items-center gap-1.5 text-secondary">
              <span className="font-label-md text-label-md font-bold">
                +{latXu.toLocaleString("vi-VN")} Lật-Xu
              </span>
            </div>
            <Link
              to={ROUTES.wallet}
              className="inline-flex items-center gap-1 font-label-sm text-label-sm text-primary hover:text-secondary bg-surface-container-high px-2 py-0.5 rounded transition-colors font-medium"
            >
              <TrendingUp size={13} />
              Mở ví của tôi
            </Link>
          </div>
        </section>

        {/* Card 2: Escrow bảo chứng */}
        <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between h-full group hover:shadow-md transition-shadow border border-outline-variant/30">
          <div className="flex items-start justify-between gap-space-sm">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-semibold">
                Tạm giữ (Escrow bảo chứng)
              </span>
              {walletQuery.isPending ? (
                <div className="h-8 w-28 bg-surface-container-high rounded animate-pulse my-1" />
              ) : (
                <span className="font-currency-display text-xl md:text-2xl text-primary tracking-normal font-bold truncate">
                  {formatVnd(heldVnd)}
                </span>
              )}
            </div>
            <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-secondary flex-shrink-0">
              <ShieldCheck size={20} />
            </div>
          </div>
          <div className="pt-space-md mt-space-md flex items-center gap-1.5 text-on-surface-variant font-body-sm text-body-sm border-t border-surface-container-high/40">
            <span className="w-2 h-2 rounded-full bg-secondary inline-block"></span>
            <span>Bảo lưu các giao dịch thẩm định an toàn</span>
          </div>
        </div>

        {/* Card 3: Giá trị kệ sách */}
        <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between h-full group hover:shadow-md transition-shadow border border-outline-variant/30">
          <div className="flex items-start justify-between gap-space-sm">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-semibold">
                Giá trị kệ sách
              </span>
              {listingsQuery.isPending ? (
                <div className="h-8 w-32 bg-surface-container-high rounded animate-pulse my-1" />
              ) : (
                <span className="font-currency-display text-xl md:text-2xl text-primary tracking-normal font-bold truncate">
                  {totalValue > 0 ? formatVnd(totalValue) : `${totalBooks} cuốn`}
                </span>
              )}
            </div>
            <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary flex-shrink-0">
              <Library size={20} />
            </div>
          </div>
          <div className="pt-space-md mt-space-md flex items-center justify-between border-t border-surface-container-high/40">
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              {totalBooks} ấn phẩm lưu trữ
            </span>
            <Link
              to={ROUTES.myBooks}
              className="inline-flex items-center gap-1 font-label-sm text-label-sm text-secondary bg-surface-container-high px-2 py-0.5 rounded font-medium hover:bg-surface-dim transition-colors"
            >
              Lật Lại Kệ sách
            </Link>
          </div>
        </div>

        {/* Card 4: Đơn đang xử lý */}
        <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between h-full group hover:shadow-md transition-shadow border border-outline-variant/30">
          <div className="flex items-start justify-between gap-space-sm">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-semibold">
                Đơn đang xử lý
              </span>
              <span className="font-currency-display text-xl md:text-2xl text-secondary tracking-normal font-bold truncate">
                Luân chuyển
              </span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant flex-shrink-0">
              <Truck size={20} />
            </div>
          </div>
          <div className="pt-space-md mt-space-md flex items-center justify-between text-on-surface-variant font-body-sm text-body-sm border-t border-surface-container-high/40">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-secondary inline-block"></span>
              <span className="text-xs">Đơn mua & Đơn bán</span>
            </div>
            <Link to="/orders" className="text-xs font-semibold text-primary hover:text-secondary underline">
              Xem đơn
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}