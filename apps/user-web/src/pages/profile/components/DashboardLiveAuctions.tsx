import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Gavel, Bell, ArrowRight, Timer, ShieldCheck } from "lucide-react";
import { listNotifications, markNotificationsRead } from "../../../services/notifications";
import { queryClient } from "../../../lib/session";
import { ROUTES } from "../../../lib/routes";

const activityDate = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

interface DashboardLiveAuctionsProps {
  ownerId: string;
}

export function DashboardLiveAuctions({ ownerId }: DashboardLiveAuctionsProps) {
  const query = useQuery({
    queryKey: ["notifications", ownerId, "overview", 4],
    queryFn: () => listNotifications(undefined, 4),
  });

  function read(id: string, readAt: string | null) {
    if (!readAt) {
      void markNotificationsRead({ ids: [id] })
        .catch(() => undefined)
        .finally(() =>
          void queryClient.invalidateQueries({ queryKey: ["notifications"] })
        );
    }
  }

  const items = query.data?.items || [];
  const outbidNotices = items.filter((n) => n.kind === "AuctionOutbid" || n.title?.toLowerCase().includes("trả giá"));

  return (
    <section
      id="overview-activity"
      aria-labelledby="overview-activity-title"
      className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-lg border border-outline-variant/30"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-b border-surface-container-high/40 pb-space-sm">
        <div className="flex items-center gap-space-sm">
          <div className="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center text-secondary">
            <Gavel size={20} />
          </div>
          <div>
            <h2 id="overview-activity-title" className="text-lg md:text-xl text-primary font-bold tracking-normal">
              Hoạt động gần đây
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Thông báo từ các phiên đấu giá.
            </p>
          </div>
        </div>
        <Link
          to={ROUTES.notifications}
          className="font-label-md text-label-md text-primary hover:text-secondary inline-flex items-center gap-1 font-semibold transition-colors"
        >
          <span>Xem thông báo</span>
          <ArrowRight size={15} />
        </Link>
      </div>

      {query.isPending ? (
        <div className="p-8 flex flex-col items-center justify-center gap-2 text-on-surface-variant" role="status">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-sm">Đang tải thông báo…</span>
        </div>
      ) : query.isError ? (
        <div className="p-6 bg-error-container/30 rounded-lg text-error text-sm flex items-center justify-between" role="alert">
          <span>Chưa tải được thông báo. Kiểm tra kết nối rồi thử lại.</span>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="px-3 py-1 bg-surface-container-high text-primary rounded font-semibold text-xs hover:bg-surface-dim"
          >
            Thử lại
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center text-on-surface-variant">
          <div className="w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center text-secondary mb-3">
            <Bell size={24} />
          </div>
          <h3 className="font-headline-sm text-headline-sm text-primary font-bold">Chưa có thông báo</h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant max-w-sm mt-1">
            Khi có cập nhật về phiên đấu giá của bạn, thông báo sẽ nằm ở đây.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-space-md">
          {/* Main notification cards grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-md">
            {/* Card 1: Outbid Alert or Top Item */}
            {outbidNotices.length > 0 ? (
              <div className="relative bg-surface-container-low rounded-xl shadow-sm overflow-hidden flex flex-col justify-between border border-secondary/30">
                <div className="bg-secondary text-on-secondary px-space-md py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-on-secondary opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-on-secondary" />
                    </span>
                    <span className="font-label-md text-label-md uppercase tracking-wider font-bold">
                      Cảnh báo: Bạn đã bị trả giá cao hơn!
                    </span>
                  </div>
                  <span className="font-label-sm text-label-sm bg-on-secondary/20 text-on-secondary px-2 py-0.5 rounded font-mono">
                    OUTBID
                  </span>
                </div>

                <div className="p-space-md flex flex-col gap-2">
                  <h3 className="font-title-md text-title-md text-primary font-bold">
                    {outbidNotices[0].title}
                  </h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2">
                    {outbidNotices[0].body}
                  </p>
                  <div className="flex items-center justify-between text-xs text-on-surface-variant mt-2">
                    <span className="flex items-center gap-1 font-mono text-secondary font-semibold">
                      <Timer size={14} />
                      <time dateTime={outbidNotices[0].createdAt}>
                        {activityDate.format(new Date(outbidNotices[0].createdAt))}
                      </time>
                    </span>
                    {!outbidNotices[0].readAt && (
                      <span className="bg-secondary/15 text-secondary px-2 py-0.5 rounded text-[11px] font-bold">
                        Chưa đọc
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-space-md pt-0">
                  <Link
                    to={ROUTES.auctionDetail(outbidNotices[0].targetId)}
                    onClick={() => read(outbidNotices[0].id, outbidNotices[0].readAt)}
                    className="w-full py-2 px-space-md rounded bg-secondary text-on-secondary font-title-md text-sm hover:bg-on-secondary-container transition-colors shadow-sm flex items-center justify-center gap-1.5"
                  >
                    <span>Mở phiên đấu giá ngay</span>
                    <ArrowRight size={15} />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="relative bg-surface-container-low rounded-xl shadow-sm overflow-hidden flex flex-col justify-between border border-primary/20">
                <div className="bg-primary-container text-on-primary px-space-md py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-primary-fixed" />
                    <span className="font-label-md text-label-md uppercase tracking-wider font-semibold">
                      Theo dõi phiên đấu giá
                    </span>
                  </div>
                  <span className="font-label-sm text-label-sm bg-on-primary/20 text-on-primary px-2 py-0.5 rounded font-mono">
                    LIVE
                  </span>
                </div>
                <div className="p-space-md flex flex-col gap-2">
                  <h3 className="font-title-md text-title-md text-primary font-bold">
                    {items[0].title}
                  </h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2">
                    {items[0].body}
                  </p>
                  <span className="text-xs text-on-surface-variant font-mono">
                    {activityDate.format(new Date(items[0].createdAt))}
                  </span>
                </div>
                <div className="p-space-md pt-0">
                  <Link
                    to={ROUTES.auctionDetail(items[0].targetId)}
                    onClick={() => read(items[0].id, items[0].readAt)}
                    className="w-full py-2 px-space-md rounded bg-surface-container-high text-primary font-title-md text-sm hover:bg-surface-dim transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span>Xem chi tiết phiên</span>
                    <ArrowRight size={15} />
                  </Link>
                </div>
              </div>
            )}

            {/* Notification List Section */}
            <div className="bg-surface-container-low rounded-xl p-space-md border border-outline-variant/30 flex flex-col justify-between">
              <ul className="flex flex-col gap-2 list-none p-0 m-0">
                {items.slice(0, 3).map((n) => (
                  <li key={n.id} className="p-2.5 rounded-lg bg-surface-container-lowest/80 hover:bg-surface-container-lowest transition-colors border border-outline-variant/20">
                    <Link
                      to={ROUTES.auctionDetail(n.targetId)}
                      onClick={() => read(n.id, n.readAt)}
                      className="flex flex-col gap-0.5 no-underline"
                    >
                      <div className="flex items-center justify-between">
                        <strong className="text-xs md:text-sm text-primary font-semibold truncate max-w-[240px]">
                          {n.title}
                        </strong>
                        {!n.readAt && (
                          <span className="w-2 h-2 rounded-full bg-secondary inline-block flex-shrink-0" />
                        )}
                      </div>
                      <span className="text-xs text-on-surface-variant line-clamp-1">{n.body}</span>
                      <time className="text-[11px] text-on-surface-variant/80 font-mono mt-0.5">
                        {activityDate.format(new Date(n.createdAt))}
                      </time>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="pt-2 text-right">
                <Link to={ROUTES.notifications} className="text-xs font-semibold text-primary hover:text-secondary underline">
                  Xem tất cả thông báo ({items.length})
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}