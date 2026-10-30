import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Gavel, History, Timer, AlertCircle } from "lucide-react";
import { ROUTES } from "../../../lib/routes";
import { listMyAuctions } from "../../../services/auctions";
import { DashboardSectionHeading } from "./DashboardSectionHeading";

interface DashboardAuctionFocusProps {
  ownerId: string;
}

export function DashboardAuctionFocus({ ownerId }: DashboardAuctionFocusProps) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["my-auctions", ownerId, "summary"],
    queryFn: () => listMyAuctions("all"),
  });

  const items = data?.items || [];
  const activeCount = items.filter(
    (item) => item.auction.state === "Active" || item.auction.state === "BuyNowPending"
  ).length;
  const paymentCount = items.filter((item) => item.needsPayment).length;
  const totalCount = items.length;

  return (
    <section
      className="bg-white rounded-xl p-space-lg shadow-sm border border-[#e6d5c3]"
      aria-labelledby="overview-auction-title"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg">
        {/* Left Information & Actions */}
        <div className="min-w-0 flex flex-col gap-2 max-w-2xl">
          <DashboardSectionHeading id="overview-auction-title" title="Đấu giá của bạn" icon={<Gavel size={20} />}
            description="Theo dõi diễn biến các phiên bạn tham gia, tình trạng trả giá, người dẫn đầu và xem lại toàn bộ lịch sử đấu giá sách quý." />

          <div className="flex items-center gap-space-sm mt-1 flex-wrap">
            {/* Primary Action Button: Xem lịch sử đấu giá */}
            <Link
              to={ROUTES.myAuctions}
              className="inline-flex items-center gap-1.5 px-space-md py-2 rounded-lg bg-secondary text-on-secondary font-title-md hover:bg-on-secondary-container transition-colors shadow-sm text-sm font-semibold"
            >
              <History size={16} />
              <span>Xem lịch sử đấu giá</span>
              <ArrowRight size={16} />
            </Link>

            {/* Secondary Action: Khám phá sàn đấu giá */}
            <Link
              to={ROUTES.auctions}
              className="inline-flex items-center gap-1.5 px-space-md py-2 rounded-lg bg-[#fbf7f0] text-primary hover:bg-[#f3eadc] border border-[#e8ddcf] transition-colors text-sm font-semibold"
            >
              <Gavel size={14} className="text-secondary" />
              <span>Sàn đấu giá đang mở</span>
            </Link>
          </div>
        </div>

        {/* Right Status / Filter Navigation Pills */}
        <ul className="flex items-center gap-space-sm flex-wrap list-none p-0 m-0">
          {/* Pill 1: Đang diễn ra */}
          <li>
            <Link
              to={`${ROUTES.myAuctions}?view=active`}
              className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-lg bg-[#fbf7f0] border border-[#e8ddcf] hover:bg-[#f5ede0] hover:border-[#d9c9b7] transition-all text-xs group"
            >
              <div className="flex flex-col">
                <span className="flex items-center gap-1 font-semibold text-primary">
                  <Timer size={13} className="text-secondary" />
                  Đang diễn ra
                </span>
                <small className="text-on-surface-variant text-[11px] font-medium">
                  {isPending ? "Đang tải…" : isError ? "Chưa tải" : `${activeCount} phiên`}
                </small>
              </div>
              <ArrowUpRight size={14} className="text-on-surface-variant group-hover:text-primary transition-colors" />
            </Link>
          </li>

          {/* Pill 2: Cần thanh toán */}
          <li>
            <Link
              to={`${ROUTES.myAuctions}?view=payment`}
              className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-lg bg-[#fbf7f0] border border-[#e8ddcf] hover:bg-[#f5ede0] hover:border-[#d9c9b7] transition-all text-xs group"
            >
              <div className="flex flex-col">
                <span className="flex items-center gap-1 font-semibold text-primary">
                  {paymentCount > 0 && <AlertCircle size={13} className="text-amber-600" />}
                  Cần thanh toán
                </span>
                <small className="text-on-surface-variant text-[11px] font-medium">
                  {isPending ? "Đang tải…" : isError ? "Chưa tải" : `${paymentCount} phiên`}
                </small>
              </div>
              <ArrowUpRight size={14} className="text-on-surface-variant group-hover:text-primary transition-colors" />
            </Link>
          </li>

          {/* Pill 3: Tất cả lịch sử */}
          <li>
            <Link
              to={`${ROUTES.myAuctions}?view=all`}
              className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-lg bg-[#fbf7f0] border border-[#e8ddcf] hover:bg-[#f5ede0] hover:border-[#d9c9b7] transition-all text-xs group"
            >
              <div className="flex flex-col">
                <strong className="text-primary font-semibold">Tất cả phiên</strong>
                <small className="text-on-surface-variant text-[11px] font-medium">
                  {isPending ? "Đang tải…" : isError ? "Chưa tải" : `${totalCount} đã tham gia`}
                </small>
              </div>
              <ArrowUpRight size={14} className="text-on-surface-variant group-hover:text-primary transition-colors" />
            </Link>
          </li>
        </ul>
      </div>
    </section>
  );
}
