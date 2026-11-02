import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Gavel } from "lucide-react";
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

  const summaries = [
    { label: "Đang diễn ra", count: activeCount, view: "active" },
    { label: "Cần thanh toán", count: paymentCount, view: "payment" },
    { label: "Đã tham gia", count: totalCount, view: "all" },
  ];

  return (
    <section
      className="bg-white rounded-xl p-space-lg border border-[#e6d5c3]"
      aria-labelledby="overview-auction-title"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
        <DashboardSectionHeading id="overview-auction-title" title="Đấu giá của bạn" icon={<Gavel size={20} />}
          description="Theo dõi các phiên và khoản cần thanh toán." />
        <Link
          to={ROUTES.auctions}
          className="shrink-0 self-start sm:self-center min-h-11 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-on-secondary hover:bg-on-secondary-container transition-colors text-sm font-semibold"
        >
          Khám phá sàn <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>

      <ul aria-label="Trạng thái đấu giá" className="m-0 mt-space-md grid grid-cols-1 sm:grid-cols-3 list-none p-0 border-t border-outline-variant/40 divide-y sm:divide-y-0 sm:divide-x divide-outline-variant/40">
        {summaries.map(({ label, count, view }) => {
          const needsAttention = view === "payment" && !isPending && !isError && count > 0;
          return (
            <li key={view} className="min-w-0">
              <Link
                to={`${ROUTES.myAuctions}?view=${view}`}
                className="group flex items-center justify-between gap-3 min-h-11 py-3 sm:px-4 rounded-lg hover:bg-surface-container-low transition-colors"
              >
                <div className="min-w-0 flex flex-col gap-1">
                  <span className={`text-sm ${needsAttention ? "text-secondary font-semibold" : "text-on-surface-variant"}`}>{label}</span>
                  <span className={`font-semibold tabular-nums ${needsAttention ? "text-secondary" : "text-primary"}`}>
                    {isPending ? <span className="text-sm">Đang tải…</span> : isError ? <span className="text-sm">Chưa tải</span> : <><span className="text-xl">{count}</span><span className="ml-1.5 text-xs font-normal text-on-surface-variant">phiên</span></>}
                  </span>
                </div>
                <ArrowUpRight size={16} aria-hidden="true" className="shrink-0 text-on-surface-variant group-hover:text-primary" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
