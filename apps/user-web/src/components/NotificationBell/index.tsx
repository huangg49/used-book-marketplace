import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Bell,
  CheckCheck,
  ArrowRight,
  ArrowLeftRight,
  Gavel,
  ShoppingBag,
  Clock,
  ChevronRight,
} from "lucide-react";
import { ROUTES } from "../../lib/routes";
import { timeAgo, useOpenNotification } from "../../hooks/useOpenNotification";
import {
  listNotifications,
  markNotificationsRead,
  type MemberNotification,
} from "../../services/notifications";
import styles from "./NotificationBell.module.css";

function getCategoryInfo(item: MemberNotification) {
  if (item.targetType === "Exchange" || item.kind.startsWith("Exchange")) {
    return {
      label: "Trao đổi",
      Icon: ArrowLeftRight,
      boxClass: styles.iconExchange,
      tagClass: styles.tagExchange,
    };
  }
  if (item.targetType === "Auction" || item.kind.startsWith("Auction")) {
    return {
      label: "Đấu giá",
      Icon: Gavel,
      boxClass: styles.iconAuction,
      tagClass: styles.tagAuction,
    };
  }
  if (item.targetType === "Order" || item.kind.startsWith("Order")) {
    return {
      label: "Đơn hàng",
      Icon: ShoppingBag,
      boxClass: styles.iconOrder,
      tagClass: styles.tagOrder,
    };
  }
  return {
    label: "Thông báo",
    Icon: Bell,
    boxClass: styles.iconGeneral,
    tagClass: styles.tagGeneral,
  };
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const queryClient = useQueryClient();
  const openNotification = useOpenNotification();

  const inbox = useQuery({
    queryKey: ["notifications", "bell"],
    queryFn: () => listNotifications(undefined, 8),
    refetchInterval: 30_000,
    retry: false,
  });
  const unread = inbox.data?.unreadCount ?? 0;

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const readAll = async () => {
    await markNotificationsRead({ all: true }).catch(() => undefined);
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={styles.bell}
        aria-label={unread ? `Thông báo, ${unread} chưa đọc` : "Thông báo"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void inbox.refetch();
        }}
      >
        <Bell size={20} aria-hidden="true" />
        {unread > 0 && (
          <span className={styles.badge} aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          className={styles.panel}
          role="region"
          aria-label="Thông báo gần đây"
        >
          {/* Header */}
          <div className={styles.head}>
            <div className={styles.headTitle}>
              <strong>Thông báo</strong>
              {unread > 0 && (
                <span className={styles.unreadCountBadge}>{unread} mới</span>
              )}
            </div>

            {unread > 0 && (
              <button
                type="button"
                className={styles.readAllButton}
                onClick={() => void readAll()}
                title="Đánh dấu tất cả thông báo là đã đọc"
              >
                <CheckCheck size={15} aria-hidden="true" />
                <span>Đã đọc hết</span>
              </button>
            )}
          </div>

          {/* List or Empty State */}
          {inbox.isPending ? (
            <div className={styles.empty}>
              <p>Đang tải thông báo…</p>
            </div>
          ) : inbox.isError ? (
            <div className={styles.empty}>
              <p>Chưa tải được danh sách thông báo.</p>
              <button
                type="button"
                className={styles.retryButton}
                onClick={() => void inbox.refetch()}
              >
                Thử lại
              </button>
            </div>
          ) : inbox.data.items.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIconBox}>
                <Bell size={24} aria-hidden="true" />
              </div>
              <p className={styles.emptyTitle}>Chưa có thông báo nào</p>
              <p className={styles.emptyDesc}>
                Các cập nhật về đơn hàng, trao đổi sách và phiên đấu giá sẽ hiển thị tại đây.
              </p>
            </div>
          ) : (
            <ul className={styles.list}>
              {inbox.data.items.map((n) => {
                const isUnread = !n.readAt;
                const cat = getCategoryInfo(n);
                const IconComp = cat.Icon;

                return (
                  <li key={n.id} className={styles.listItem}>
                    <button
                      type="button"
                      className={`${styles.item} ${isUnread ? styles.unread : ""}`}
                      onClick={() => {
                        setOpen(false);
                        openNotification(n);
                      }}
                      aria-label={`${n.title}: ${n.body}`}
                    >
                      {/* Category Icon */}
                      <div
                        className={`${styles.iconBox} ${cat.boxClass}`}
                        aria-hidden="true"
                      >
                        <IconComp size={18} />
                      </div>

                      {/* Content */}
                      <div className={styles.text}>
                        <div className={styles.itemTopMeta}>
                          <span
                            className={`${styles.categoryTag} ${cat.tagClass}`}
                          >
                            {cat.label}
                          </span>
                          {isUnread && (
                            <span
                              className={styles.unreadDot}
                              title="Tin mới"
                            />
                          )}
                        </div>

                        <h4 className={styles.title}>{n.title}</h4>
                        <p className={styles.body}>{n.body}</p>

                        <div className={styles.timeRow}>
                          <Clock size={11} />
                          <time
                            dateTime={n.createdAt}
                            title={new Date(n.createdAt).toLocaleString("vi-VN")}
                          >
                            {timeAgo(n.createdAt)}
                          </time>
                          {isUnread && (
                            <span className={styles.unreadText}>· Chưa đọc</span>
                          )}
                        </div>
                      </div>

                      {/* Hover Arrow */}
                      <ChevronRight
                        size={16}
                        className={styles.arrow}
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Footer Action */}
          <Link
            className={styles.all}
            to={ROUTES.notifications}
            onClick={() => setOpen(false)}
          >
            <span>Xem tất cả thông báo</span>
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}
