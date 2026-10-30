import { useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  ArrowUpRight,
  CheckCheck,
  ArrowLeftRight,
  Gavel,
  ShoppingBag,
  Clock,
  RefreshCw,
  BookOpen,
} from "lucide-react";
import { timeAgo, useOpenNotification } from "../hooks/useOpenNotification";
import { useSession } from "../hooks/useSession";
import {
  listNotifications,
  markNotificationsRead,
  type MemberNotification,
} from "../services/notifications";
import styles from "./NotificationsPage.module.css";

type FilterTab = "all" | "unread" | "exchange" | "auction" | "order";

function getNotificationCategory(item: MemberNotification) {
  if (item.targetType === "Exchange" || item.kind.startsWith("Exchange")) {
    return {
      type: "exchange" as const,
      Icon: ArrowLeftRight,
      boxClass: styles.iconExchange,
      label: "Trao đổi",
    };
  }
  if (item.targetType === "Auction" || item.kind.startsWith("Auction")) {
    return {
      type: "auction" as const,
      Icon: Gavel,
      boxClass: styles.iconAuction,
      label: "Đấu giá",
    };
  }
  if (item.targetType === "Order" || item.kind.startsWith("Order")) {
    return {
      type: "order" as const,
      Icon: ShoppingBag,
      boxClass: styles.iconOrder,
      label: "Đơn hàng",
    };
  }
  return {
    type: "general" as const,
    Icon: Bell,
    boxClass: styles.iconDefault,
    label: "Thông báo",
  };
}

export function NotificationsPage() {
  const auth = useSession();
  const queryClient = useQueryClient();
  const openNotification = useOpenNotification();
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string>();
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");

  const pages = useInfiniteQuery({
    queryKey: ["notifications", "page"],
    queryFn: ({ pageParam }) => listNotifications(pageParam, 30),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: auth.status === "authenticated",
    retry: false,
  });

  const allItems = pages.data?.pages.flatMap((p) => p.items) ?? [];
  const unreadCount = pages.data?.pages[0]?.unreadCount ?? 0;

  const filteredItems = allItems.filter((item) => {
    if (activeFilter === "unread") return !item.readAt;
    if (activeFilter === "exchange")
      return item.targetType === "Exchange" || item.kind.startsWith("Exchange");
    if (activeFilter === "auction")
      return item.targetType === "Auction" || item.kind.startsWith("Auction");
    if (activeFilter === "order")
      return item.targetType === "Order" || item.kind.startsWith("Order");
    return true;
  });

  async function readAll() {
    if (reading) return;
    setReading(true);
    setError(undefined);
    try {
      await markNotificationsRead({ all: true });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch {
      setError("Chưa đánh dấu được thông báo. Bạn vui lòng thử lại.");
    } finally {
      setReading(false);
    }
  }

  if (auth.status !== "authenticated") {
    return (
      <div className={styles.root}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIconBox}>
            <Bell size={28} />
          </div>
          <h2 className={styles.emptyTitle}>Thông Báo</h2>
          <p className={styles.emptyDesc}>
            {auth.status === "loading"
              ? "Đang xác thực thông tin tài khoản…"
              : "Đăng nhập để xem cập nhật về đơn hàng, trao đổi sách và các phiên đấu giá của bạn."}
          </p>
          {auth.status !== "loading" && (
            <Link
              to="/login?returnUrl=%2Fnotifications"
              className={styles.emptyBtn}
            >
              Đăng nhập ngay
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className={styles.root} aria-labelledby="notifications-title">
      {/* 1. Header with Title & Action */}
      <header className={styles.heading}>
        <div className={styles.headingInfo}>
          <h1 id="notifications-title" className={styles.title} tabIndex={-1}>
            Thông Báo
          </h1>
          <p className={styles.subtitle}>
            {unreadCount > 0 ? (
              <span>
                Bạn có <strong className="text-[#5c0202]">{unreadCount} thông báo mới</strong> chưa đọc.
              </span>
            ) : (
              "Hộp thư thông báo của bạn đã được đọc hết."
            )}
          </p>
        </div>

        {unreadCount > 0 && (
          <div className={styles.headingActions}>
            <button
              type="button"
              className={styles.readAllBtn}
              onClick={() => void readAll()}
              disabled={reading}
            >
              <CheckCheck size={18} aria-hidden="true" />
              <span>{reading ? "Đang xử lý…" : "Đánh dấu đã đọc hết"}</span>
            </button>
          </div>
        )}
      </header>

      {/* 2. Filter Pills Bar */}
      <div className={styles.filterBar} role="tablist" aria-label="Lọc loại thông báo">
        <button
          type="button"
          role="tab"
          aria-selected={activeFilter === "all"}
          className={`${styles.filterBtn} ${activeFilter === "all" ? styles.filterBtnActive : ""}`}
          onClick={() => setActiveFilter("all")}
        >
          <span>Tất cả</span>
          <span className={styles.filterBadge}>{allItems.length}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeFilter === "unread"}
          className={`${styles.filterBtn} ${activeFilter === "unread" ? styles.filterBtnActive : ""}`}
          onClick={() => setActiveFilter("unread")}
        >
          <span>Chưa đọc</span>
          <span className={styles.filterBadge}>{unreadCount}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeFilter === "exchange"}
          className={`${styles.filterBtn} ${activeFilter === "exchange" ? styles.filterBtnActive : ""}`}
          onClick={() => setActiveFilter("exchange")}
        >
          <ArrowLeftRight size={14} />
          <span>Trao đổi</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeFilter === "auction"}
          className={`${styles.filterBtn} ${activeFilter === "auction" ? styles.filterBtnActive : ""}`}
          onClick={() => setActiveFilter("auction")}
        >
          <Gavel size={14} />
          <span>Đấu giá</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeFilter === "order"}
          className={`${styles.filterBtn} ${activeFilter === "order" ? styles.filterBtnActive : ""}`}
          onClick={() => setActiveFilter("order")}
        >
          <ShoppingBag size={14} />
          <span>Đơn hàng</span>
        </button>
      </div>

      {error && (
        <div className={styles.errorBox} role="alert">
          <p>{error}</p>
        </div>
      )}

      {pages.isPending && (
        <div className={styles.loadingBox}>
          <div className="flex items-center justify-center gap-2">
            <RefreshCw size={20} className="animate-spin text-[#5c0202]" />
            <span>Đang tải thông báo…</span>
          </div>
        </div>
      )}

      {pages.isError && (
        <div className={styles.errorBox} role="alert">
          <h2 className="font-bold text-base mb-1">Chưa tải được danh sách thông báo</h2>
          <p className="text-sm opacity-80 mb-3">Kiểm tra kết nối rồi thử lại giúp mình.</p>
          <button
            type="button"
            className={styles.readAllBtn}
            disabled={pages.isFetching}
            onClick={() => void pages.refetch()}
          >
            Thử tải lại
          </button>
        </div>
      )}

      {/* Empty State */}
      {!pages.isPending && !pages.isError && filteredItems.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className={styles.emptyState}
        >
          <div className={styles.emptyIconBox}>
            {activeFilter === "exchange" ? (
              <ArrowLeftRight size={28} />
            ) : activeFilter === "auction" ? (
              <Gavel size={28} />
            ) : activeFilter === "order" ? (
              <ShoppingBag size={28} />
            ) : (
              <Bell size={28} />
            )}
          </div>
          <h2 className={styles.emptyTitle}>
            {activeFilter === "unread"
              ? "Không có thông báo chưa đọc"
              : activeFilter === "exchange"
              ? "Chưa có thông báo trao đổi nào"
              : activeFilter === "auction"
              ? "Chưa có thông báo đấu giá nào"
              : activeFilter === "order"
              ? "Chưa có thông báo đơn hàng nào"
              : "Hộp thư thông báo đang trống"}
          </h2>
          <p className={styles.emptyDesc}>
            {activeFilter === "unread"
              ? "Tất cả thông báo đều đã được bạn xem qua. Chúng tôi sẽ thông báo ngay khi có sự kiện mới!"
              : "Mọi cập nhật trạng thái đơn mua, đề xuất trao đổi hay diễn biến trả giá đấu giá sẽ xuất hiện tại đây."}
          </p>

          <Link to="/books" className={styles.emptyBtn}>
            <BookOpen size={18} />
            <span>Khám phá sách trên sàn</span>
          </Link>
        </motion.div>
      )}

      {/* Notification List */}
      {!pages.isPending && !pages.isError && filteredItems.length > 0 && (
        <ul className={styles.list}>
          <AnimatePresence mode="popLayout">
            {filteredItems.map((n) => {
              const isUnread = !n.readAt;
              const cat = getNotificationCategory(n);
              const IconComp = cat.Icon;

              return (
                <motion.li
                  key={n.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.18 }}
                >
                  <button
                    type="button"
                    className={`${styles.item} ${isUnread ? styles.itemUnread : ""}`}
                    onClick={() => openNotification(n)}
                    aria-label={`${n.title}: ${n.body}`}
                  >
                    {/* Category Icon */}
                    <div className={`${styles.iconBox} ${cat.boxClass}`} aria-hidden="true">
                      <IconComp size={20} />
                    </div>

                    {/* Notification Content */}
                    <div className={styles.content}>
                      <div className={styles.itemTopRow}>
                        <h2 className={styles.itemTitle}>{n.title}</h2>
                        {isUnread && <span className={styles.unreadDot} title="Chưa đọc" />}
                      </div>

                      <p className={styles.itemBody}>{n.body}</p>

                      <div className={styles.itemMeta}>
                        <span className={styles.timeTag}>
                          <Clock size={12} />
                          <time dateTime={n.createdAt} title={new Date(n.createdAt).toLocaleString("vi-VN")}>
                            {timeAgo(n.createdAt)}
                          </time>
                        </span>
                        <span
                          className={`${styles.readStatus} ${
                            isUnread ? styles.readStatusUnread : styles.readStatusRead
                          }`}
                        >
                          {isUnread ? "Mới" : "Đã đọc"}
                        </span>
                      </div>
                    </div>

                    {/* Action Arrow */}
                    <div className={styles.arrowBox} aria-hidden="true">
                      <ArrowUpRight size={18} />
                    </div>
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      {/* Infinite Scroll / More */}
      {pages.hasNextPage && (
        <div className={styles.moreContainer}>
          <button
            className={styles.moreBtn}
            type="button"
            disabled={pages.isFetchingNextPage}
            onClick={() => void pages.fetchNextPage()}
          >
            {pages.isFetchingNextPage ? (
              <span className="flex items-center gap-2">
                <RefreshCw size={16} className="animate-spin" />
                Đang tải…
              </span>
            ) : (
              "Xem thông báo cũ hơn"
            )}
          </button>
        </div>
      )}
    </section>
  );
}
