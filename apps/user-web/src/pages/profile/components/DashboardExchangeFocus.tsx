import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeftRight, ArrowRight, ArrowUpRight, Inbox, Clock, CheckCircle2, BookOpen } from "lucide-react";
import { ROUTES } from "../../../lib/routes";
import { getExchangeCounts } from "../../../services/exchange";
import { useSession } from "../../../hooks/useSession";

export function DashboardExchangeFocus() {
  const auth = useSession();
  const actor = auth.status === "authenticated" ? auth.user.id : undefined;

  const { data: counts, isLoading } = useQuery({
    queryKey: ["exchangeCounts", actor],
    queryFn: getExchangeCounts,
    enabled: !!actor,
  });

  const sentCount = counts?.sent ?? 0;
  const receivedCount = counts?.received ?? 0;
  const activeCount = counts?.active ?? 0;
  const doneCount = counts?.done ?? 0;
  const totalCount = sentCount + receivedCount + activeCount + doneCount;

  return (
    <section
      className="bg-white rounded-xl p-space-lg shadow-sm border border-[#e6d5c3]"
      aria-labelledby="overview-exchange-title"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg">
        {/* Left Information & Actions */}
        <div className="flex flex-col gap-2 max-w-2xl">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#fbf5ef] border border-[#ecdacb] flex items-center justify-center text-[#5c0202] flex-shrink-0">
              <ArrowLeftRight size={20} />
            </div>
            <div className="flex items-center gap-2">
              <h2
                id="overview-exchange-title"
                className="text-xl md:text-2xl text-primary font-bold tracking-normal"
              >
                Trao đổi sách của bạn
              </h2>
              {totalCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#f4eddf] text-[#5c0202] border border-[#ecdacb]">
                  {totalCount} giao dịch
                </span>
              )}
            </div>
          </div>

          <p className="font-body-md text-body-md text-on-surface-variant">
            Theo dõi các lời đề nghị đổi sách đã gửi, lời mời nhận được từ cộng đồng, tiến trình đặt cọc và luân chuyển sách an toàn.
          </p>

          <div className="flex items-center gap-space-sm mt-1 flex-wrap">
            <Link
              to={ROUTES.exchangeMine}
              className="inline-flex items-center gap-1.5 px-space-md py-2 rounded-lg bg-secondary text-on-secondary font-title-md hover:bg-on-secondary-container transition-colors shadow-sm text-sm font-semibold"
            >
              <ArrowLeftRight size={16} />
              <span>Xem tất cả trao đổi</span>
              <ArrowRight size={16} />
            </Link>

            <Link
              to={ROUTES.exchange}
              className="inline-flex items-center gap-1.5 px-space-md py-2 rounded-lg bg-[#fbf7f0] text-primary hover:bg-[#f3eadc] border border-[#e8ddcf] transition-colors text-sm font-semibold"
            >
              <BookOpen size={14} className="text-secondary" />
              <span>Khám phá sàn trao đổi</span>
            </Link>
          </div>
        </div>

        {/* Right Status / Filter Navigation Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2 flex-shrink-0">
          <Link
            to={`${ROUTES.exchangeMine}?tab=sent`}
            className="flex items-center gap-2.5 p-3 rounded-lg border border-[#e8ddcf] bg-[#fdfbf7] hover:bg-[#f7efe4] hover:border-[#d9cbbd] transition-all group"
          >
            <div className="w-8 h-8 rounded-md bg-amber-50 text-amber-700 flex items-center justify-center flex-shrink-0 border border-amber-200/60">
              <ArrowUpRight size={16} />
            </div>
            <div className="min-w-0">
              <span className="block text-xs text-on-surface-variant font-medium">Đã gửi</span>
              <span className="text-base font-bold text-primary tabular-nums">
                {isLoading ? "—" : sentCount}
              </span>
            </div>
          </Link>

          <Link
            to={`${ROUTES.exchangeMine}?tab=received`}
            className="flex items-center gap-2.5 p-3 rounded-lg border border-[#e8ddcf] bg-[#fdfbf7] hover:bg-[#f7efe4] hover:border-[#d9cbbd] transition-all group"
          >
            <div className="w-8 h-8 rounded-md bg-blue-50 text-blue-700 flex items-center justify-center flex-shrink-0 border border-blue-200/60">
              <Inbox size={16} />
            </div>
            <div className="min-w-0">
              <span className="block text-xs text-on-surface-variant font-medium">Nhận được</span>
              <span className="text-base font-bold text-primary tabular-nums">
                {isLoading ? "—" : receivedCount}
              </span>
            </div>
          </Link>

          <Link
            to={`${ROUTES.exchangeMine}?tab=active`}
            className="flex items-center gap-2.5 p-3 rounded-lg border border-[#e8ddcf] bg-[#fdfbf7] hover:bg-[#f7efe4] hover:border-[#d9cbbd] transition-all group"
          >
            <div className="w-8 h-8 rounded-md bg-purple-50 text-purple-700 flex items-center justify-center flex-shrink-0 border border-purple-200/60">
              <Clock size={16} />
            </div>
            <div className="min-w-0">
              <span className="block text-xs text-on-surface-variant font-medium">Đang thực hiện</span>
              <span className="text-base font-bold text-primary tabular-nums">
                {isLoading ? "—" : activeCount}
              </span>
            </div>
          </Link>

          <Link
            to={`${ROUTES.exchangeMine}?tab=done`}
            className="flex items-center gap-2.5 p-3 rounded-lg border border-[#e8ddcf] bg-[#fdfbf7] hover:bg-[#f7efe4] hover:border-[#d9cbbd] transition-all group"
          >
            <div className="w-8 h-8 rounded-md bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0 border border-emerald-200/60">
              <CheckCircle2 size={16} />
            </div>
            <div className="min-w-0">
              <span className="block text-xs text-on-surface-variant font-medium">Hoàn tất</span>
              <span className="text-base font-bold text-primary tabular-nums">
                {isLoading ? "—" : doneCount}
              </span>
            </div>
          </Link>
        </div>
      </div>
    </section>
  );
}
