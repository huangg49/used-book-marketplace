import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Gavel,
  Bell,
  ArrowRight,
  ShoppingBag,
  ArrowLeftRight,
  Wallet,
  Clock,
  Calendar,
  Sparkles,
} from "lucide-react";
import {
  listNotifications,
  markNotificationsRead,
  notificationPath,
  type MemberNotification,
} from "../../../services/notifications";
import { queryClient } from "../../../lib/session";
import { ROUTES } from "../../../lib/routes";
import { timeAgo } from "../../../hooks/useOpenNotification";
import { DashboardSectionHeading } from "./DashboardSectionHeading";

const activityDate = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

interface DashboardLiveAuctionsProps {
  ownerId: string;
}

export interface NotificationMeta {
  category: "order" | "auction" | "exchange" | "wallet" | "general";
  label: string;
  pillBg: string;
  pillBorder: string;
  pillText: string;
  icon: typeof Bell;
  iconContainerBg: string;
  iconColor: string;
  heroBannerBg: string;
  heroBannerTag: string;
  heroBannerTitle: string;
  actionLabel: string;
  actionBtnClass: string;
  isOutbid?: boolean;
}

export function getNotificationMeta(n: MemberNotification): NotificationMeta {
  const titleLower = n.title?.toLowerCase() ?? "";
  const bodyLower = n.body?.toLowerCase() ?? "";
  const isOutbid =
    n.kind === "AuctionOutbid" ||
    titleLower.includes("trả giá") ||
    titleLower.includes("vượt giá");

  // 1. Order (Đơn hàng / Mua ngay)
  if (
    n.targetType === "Order" ||
    n.kind.startsWith("Order") ||
    titleLower.includes("đơn") ||
    titleLower.includes("mua ngay")
  ) {
    const isSeller = titleLower.includes("chuẩn bị gửi") || bodyLower.includes("bàn giao");
    return {
      category: "order",
      label: isSeller ? "Đơn bán" : "Đơn mua",
      pillBg: "bg-emerald-50",
      pillBorder: "border-emerald-200",
      pillText: "text-emerald-800",
      icon: ShoppingBag,
      iconContainerBg: "bg-emerald-100 text-emerald-800 border-emerald-200",
      iconColor: "text-emerald-800",
      heroBannerBg: "bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-950 text-emerald-50",
      heroBannerTag: "ĐƠN HÀNG",
      heroBannerTitle: isSeller ? "ĐƠN BÁN · CẦN CHUẨN BỊ GỬI" : "CẬP NHẬT ĐƠN HÀNG",
      actionLabel: "Mở chi tiết đơn hàng",
      actionBtnClass: "bg-emerald-800 hover:bg-emerald-900 text-white shadow-sm",
    };
  }

  // 2. Auction (Đấu giá)
  if (
    n.targetType === "Auction" ||
    n.kind.startsWith("Auction") ||
    titleLower.includes("đấu giá") ||
    isOutbid
  ) {
    if (isOutbid) {
      return {
        category: "auction",
        label: "Bị vượt giá",
        pillBg: "bg-amber-100",
        pillBorder: "border-amber-300 font-bold",
        pillText: "text-amber-900",
        icon: Gavel,
        iconContainerBg: "bg-amber-100 text-amber-900 border-amber-300",
        iconColor: "text-amber-800",
        heroBannerBg: "bg-gradient-to-r from-[#7A1313] via-[#8C1B1B] to-[#5C0202] text-amber-50",
        heroBannerTag: "OUTBID",
        heroBannerTitle: "CẢNH BÁO: BẠN ĐÃ BỊ TRẢ GIÁ CAO HƠN!",
        actionLabel: "Mở phiên đấu giá ngay",
        actionBtnClass: "bg-primary text-on-primary hover:bg-primary-hover shadow-sm",
        isOutbid: true,
      };
    }
    return {
      category: "auction",
      label: "Đấu giá",
      pillBg: "bg-amber-50",
      pillBorder: "border-amber-200",
      pillText: "text-amber-900",
      icon: Gavel,
      iconContainerBg: "bg-amber-100/70 text-amber-900 border-amber-200",
      iconColor: "text-amber-800",
      heroBannerBg: "bg-gradient-to-r from-[#4A0A0A] to-[#691111] text-amber-50",
      heroBannerTag: "ĐẤU GIÁ",
      heroBannerTitle: "THEO DÕI PHIÊN ĐẤU GIÁ",
      actionLabel: "Xem chi tiết phiên",
      actionBtnClass: "bg-primary text-on-primary hover:bg-primary-hover shadow-sm",
    };
  }

  // 3. Exchange (Trao đổi)
  if (
    n.targetType === "Exchange" ||
    n.kind.startsWith("Exchange") ||
    titleLower.includes("trao đổi")
  ) {
    const isCancelled = titleLower.includes("hủy");
    return {
      category: "exchange",
      label: "Trao đổi",
      pillBg: "bg-orange-50",
      pillBorder: "border-orange-200",
      pillText: "text-orange-900",
      icon: ArrowLeftRight,
      iconContainerBg: "bg-orange-100/80 text-orange-900 border-orange-200",
      iconColor: "text-orange-800",
      heroBannerBg: "bg-gradient-to-r from-[#5B2E0E] to-[#783D13] text-orange-50",
      heroBannerTag: "TRAO ĐỔI",
      heroBannerTitle: isCancelled ? "GIAO DỊCH TRAO ĐỔI ĐÃ KẾT THÚC" : "ĐỀ XUẤT TRAO ĐỔI SÁCH",
      actionLabel: "Xem chi tiết trao đổi",
      actionBtnClass: "bg-[#783D13] hover:bg-[#5B2E0E] text-white shadow-sm",
    };
  }

  // 4. Wallet (Ví tiền & Rút tiền)
  if (
    n.targetType === "Withdrawal" ||
    n.kind.toLowerCase().includes("wallet") ||
    titleLower.includes("ví") ||
    titleLower.includes("rút tiền")
  ) {
    return {
      category: "wallet",
      label: "Ví tiền",
      pillBg: "bg-blue-50",
      pillBorder: "border-blue-200",
      pillText: "text-blue-900",
      icon: Wallet,
      iconContainerBg: "bg-blue-100/80 text-blue-900 border-blue-200",
      iconColor: "text-blue-800",
      heroBannerBg: "bg-gradient-to-r from-blue-950 to-indigo-950 text-blue-50",
      heroBannerTag: "VÍ TIỀN",
      heroBannerTitle: "BIẾN ĐỘNG SỐ DƯ VÍ",
      actionLabel: "Kiểm tra ví của bạn",
      actionBtnClass: "bg-blue-800 hover:bg-blue-900 text-white shadow-sm",
    };
  }

  // 5. Default General
  return {
    category: "general",
    label: "Thông báo",
    pillBg: "bg-surface-container-high",
    pillBorder: "border-outline-variant/40",
    pillText: "text-primary",
    icon: Bell,
    iconContainerBg: "bg-primary/10 text-primary border-primary/20",
    iconColor: "text-primary",
    heroBannerBg: "bg-gradient-to-r from-[#4A0A0A] to-[#5C0202] text-amber-50",
    heroBannerTag: "HỆ THỐNG",
    heroBannerTitle: "HOẠT ĐỘNG GẦN NHẤT",
    actionLabel: "Xem chi tiết",
    actionBtnClass: "bg-primary text-on-primary hover:bg-primary-hover shadow-sm",
  };
}

export function DashboardLiveAuctions({ ownerId }: DashboardLiveAuctionsProps) {
  const query = useQuery({
    queryKey: ["notifications", ownerId, "overview", 6],
    queryFn: () => listNotifications(undefined, 6),
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
  const unreadCount = items.filter((n) => !n.readAt).length;

  // Hero Item: Prioritize unread Outbid alert, then first unread item, otherwise top item
  const outbidNotice =
    items.find(
      (n) =>
        (n.kind === "AuctionOutbid" || n.title?.toLowerCase().includes("trả giá")) &&
        !n.readAt
    ) ??
    items.find((n) => n.kind === "AuctionOutbid" || n.title?.toLowerCase().includes("trả giá"));

  const heroItem = outbidNotice ?? items.find((n) => !n.readAt) ?? items[0];
  const heroMeta = heroItem ? getNotificationMeta(heroItem) : null;

  // Other items to show in the list (excluding heroItem)
  const feedItems = heroItem
    ? items.filter((n) => n.id !== heroItem.id).slice(0, 3)
    : [];

  return (
    <section
      id="overview-activity"
      aria-labelledby="overview-activity-title"
      className="bg-surface-container-lowest rounded-2xl p-space-md md:p-space-lg shadow-sm flex flex-col gap-space-md border border-outline-variant/30"
    >
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-b border-surface-container-high/60 pb-space-sm">
        <DashboardSectionHeading
          id="overview-activity-title"
          title="Hoạt động & Thông báo mới"
          description="Cập nhật nhanh về đơn mua/bán, phiên đấu giá, trao đổi sách và ví của bạn."
          icon={<Bell size={20} />}
        />
        <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
          {unreadCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              {unreadCount} chưa đọc
            </span>
          )}
          <Link
            to={ROUTES.notifications}
            className="font-label-md text-label-md text-primary hover:text-secondary inline-flex items-center gap-1 font-semibold transition-colors py-1 px-2 rounded-lg hover:bg-surface-container-low"
          >
            <span>Tất cả thông báo</span>
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>

      {query.isPending ? (
        <div className="p-8 flex flex-col items-center justify-center gap-2 text-on-surface-variant" role="status">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-sm">Đang tải thông báo…</span>
        </div>
      ) : query.isError ? (
        <div className="p-6 bg-error-container/30 rounded-xl text-error text-sm flex items-center justify-between border border-error/20" role="alert">
          <span>Chưa tải được thông báo. Kiểm tra kết nối rồi thử lại.</span>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="px-3 py-1 bg-surface-container-high text-primary rounded font-semibold text-xs hover:bg-surface-dim transition-colors"
          >
            Thử lại
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center text-on-surface-variant">
          <div className="w-14 h-14 rounded-full bg-surface-container-low flex items-center justify-center text-primary mb-3 border border-outline-variant/30">
            <Bell size={26} />
          </div>
          <h3 className="m-0 font-title-md text-title-md text-primary font-bold">Chưa có thông báo</h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant max-w-sm mt-1">
            Khi có cập nhật mới về đơn mua bán, phiên đấu giá hoặc trao đổi sách của bạn, thông tin chi tiết sẽ xuất hiện tại đây.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md items-stretch">
          {/* Spotlight Hero Card (5 cols on lg) */}
          {heroItem && heroMeta && (
            <div className="lg:col-span-5 bg-surface-container-low rounded-xl shadow-sm overflow-hidden flex flex-col justify-between border border-outline-variant/30 hover:border-primary/40 transition-all">
              {/* Card Banner Header */}
              <div className={`${heroMeta.heroBannerBg} px-space-md py-3 flex items-center justify-between shadow-xs`}>
                <div className="flex items-center gap-2 min-w-0">
                  {heroMeta.isOutbid ? (
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400" />
                    </span>
                  ) : (
                    <heroMeta.icon size={16} className="shrink-0 opacity-90" />
                  )}
                  <span className="text-xs font-bold uppercase tracking-wider truncate">
                    {heroMeta.heroBannerTitle}
                  </span>
                </div>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-white/20 text-white shrink-0 ml-2">
                  {heroMeta.heroBannerTag}
                </span>
              </div>

              {/* Card Content */}
              <div className="p-space-md flex flex-col gap-3 flex-1">
                {/* Meta Tags Row */}
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${heroMeta.pillBg} ${heroMeta.pillBorder} ${heroMeta.pillText}`}>
                      <heroMeta.icon size={12} />
                      {heroMeta.label}
                    </span>
                    {!heroItem.readAt && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                        Mới
                      </span>
                    )}
                  </div>
                  <span className="flex items-center gap-1 text-[11px] font-medium text-on-surface-variant font-mono shrink-0">
                    <Clock size={12} />
                    {timeAgo(heroItem.createdAt)}
                  </span>
                </div>

                {/* Notification Full Title */}
                <h3 className="m-0 text-base md:text-lg font-bold text-primary leading-snug">
                  {heroItem.title}
                </h3>

                {/* Notification Rich Body */}
                <p className="m-0 text-xs md:text-sm text-on-surface-variant leading-relaxed bg-surface-container-lowest/80 p-3 rounded-lg border border-outline-variant/20 flex-1">
                  {heroItem.body}
                </p>

                {/* Formatted Date Footer */}
                <div className="flex items-center justify-between text-[11px] text-on-surface-variant/80 pt-1 border-t border-outline-variant/15">
                  <span className="flex items-center gap-1 font-mono">
                    <Calendar size={13} className="text-on-surface-variant/60" />
                    <time dateTime={heroItem.createdAt}>
                      {activityDate.format(new Date(heroItem.createdAt))}
                    </time>
                  </span>
                  <span className="text-[11px] text-primary font-medium">Tiêu điểm</span>
                </div>
              </div>

              {/* CTA Action Button */}
              <div className="p-space-md pt-0">
                <Link
                  to={notificationPath(heroItem)}
                  onClick={() => read(heroItem.id, heroItem.readAt)}
                  className={`w-full py-2.5 px-space-md rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 ${heroMeta.actionBtnClass}`}
                >
                  <span>{heroMeta.actionLabel}</span>
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          )}

          {/* Right Notifications List (7 cols on lg) */}
          <div className="lg:col-span-7 bg-surface-container-low rounded-xl p-space-md border border-outline-variant/30 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
              <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
                <Sparkles size={14} className="text-primary" />
                Cập nhật gần đây
              </span>
              <span className="text-xs font-medium text-on-surface-variant/80">
                {items.length} thông báo
              </span>
            </div>

            {feedItems.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-on-surface-variant">
                <p className="text-xs text-on-surface-variant/80 m-0">
                  Không còn thông báo nào khác gần đây.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2.5 list-none p-0 m-0 flex-1">
                {feedItems.map((n) => {
                  const itemMeta = getNotificationMeta(n);
                  const isUnread = !n.readAt;

                  return (
                    <li key={n.id}>
                      <Link
                        to={notificationPath(n)}
                        onClick={() => read(n.id, n.readAt)}
                        className={`group p-3 rounded-xl bg-surface-container-lowest border transition-all flex items-start gap-3 no-underline cursor-pointer ${
                          isUnread
                            ? "border-primary/30 hover:border-primary shadow-xs"
                            : "border-outline-variant/20 hover:border-outline-variant/50 hover:bg-surface-container-lowest/90"
                        }`}
                      >
                        {/* Category Avatar */}
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border mt-0.5 ${itemMeta.iconContainerBg}`}
                        >
                          <itemMeta.icon size={16} className={itemMeta.iconColor} />
                        </div>

                        {/* Content Area */}
                        <div className="min-w-0 flex-1 flex flex-col gap-1">
                          {/* Row 1: Category Tag + Unread Indicator + Relative Time */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.2 rounded text-[10px] font-bold uppercase tracking-wider border ${itemMeta.pillBg} ${itemMeta.pillBorder} ${itemMeta.pillText}`}
                              >
                                {itemMeta.label}
                              </span>
                              {isUnread && (
                                <span
                                  className="w-2 h-2 rounded-full bg-secondary shrink-0 animate-pulse"
                                  title="Chưa đọc"
                                />
                              )}
                            </div>
                            <time className="text-[11px] text-on-surface-variant/75 font-mono flex items-center gap-1">
                              <Clock size={11} />
                              {timeAgo(n.createdAt)}
                            </time>
                          </div>

                          {/* Row 2: Full Title without ugly cutoffs */}
                          <strong className="text-xs md:text-sm text-primary font-semibold leading-snug line-clamp-1 group-hover:text-primary-hover transition-colors">
                            {n.title}
                          </strong>

                          {/* Row 3: Snippet */}
                          <p className="m-0 text-xs text-on-surface-variant/90 line-clamp-1 leading-normal">
                            {n.body}
                          </p>
                        </div>

                        {/* Right Chevron Indicator */}
                        <ArrowRight
                          size={15}
                          className="text-outline-variant/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 self-center hidden sm:block"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* List Footer Link */}
            <div className="pt-2 text-right border-t border-outline-variant/15 flex items-center justify-between text-xs">
              <span className="text-[11px] text-on-surface-variant/70">
                Nhấp vào thông báo để mở trang chi tiết
              </span>
              <Link
                to={ROUTES.notifications}
                className="font-semibold text-primary hover:text-secondary inline-flex items-center gap-1 transition-colors"
              >
                <span>Xem tất cả thông báo ({items.length})</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
