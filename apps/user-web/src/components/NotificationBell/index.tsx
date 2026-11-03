import {useSession} from '../../hooks/useSession';
import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  Bell,
  CheckCheck,
  ArrowRight,
  ArrowLeftRight,
  Gavel,
  ShoppingBag,
  CircleX,
  TrendingUp,
  ChevronRight,
} from "lucide-react";
import { ROUTES } from "../../lib/routes";
import { timeAgo, useOpenNotification } from "../../hooks/useOpenNotification";
import {
  listNotifications,
  notificationKeys,
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
    };
  }
  if (item.targetType === "Auction" || item.kind.startsWith("Auction")) {
    return {
      label: "Đấu giá",
      Icon: item.kind === 'AuctionCancelled' ? CircleX : item.kind === 'AuctionOutbid' ? TrendingUp : Gavel,
      boxClass: item.kind === 'AuctionCancelled' ? styles.iconCancelled : styles.iconAuction,
    };
  }
  if (item.targetType === "Order" || item.kind.startsWith("Order")) {
    return {
      label: "Đơn hàng",
      Icon: ShoppingBag,
      boxClass: styles.iconOrder,
    };
  }
  return {
    label: "Thông báo",
    Icon: Bell,
    boxClass: styles.iconGeneral,
  };
}

const panelVariants: Variants = {
  hidden: {
    opacity: 0,
    y: -14,
    scale: 0.88,
    transition: {
      duration: 0.14,
      ease: [0.4, 0, 1, 1],
    },
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 400,
      damping: 26,
      mass: 0.75,
      staggerChildren: 0.03,
      delayChildren: 0.02,
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.94,
    transition: {
      duration: 0.14,
      ease: [0.32, 0, 0.67, 0],
    },
  },
};

const itemVariants: Variants = {
  hidden: {
    opacity: 0,
    y: -8,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 380,
      damping: 26,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.08,
    },
  },
};

export function NotificationBell() {
  const auth=useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState(false);
  const panelId = useId();
  const queryClient = useQueryClient();
  const openNotification = useOpenNotification();

  const inbox = useQuery({
    queryKey: notificationKeys.bell(auth.status==='authenticated'?auth.user.id:undefined),
    queryFn: () => listNotifications(undefined, 8),
    refetchInterval: 30_000,
    retry: false,
    enabled:auth.status==='authenticated',
  });
  const unread = inbox.data?.unreadCount ?? 0;

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        bellRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const readAll = async () => {
    if (reading) return;
    setReading(true);
    setReadError(false);
    try {
      await markNotificationsRead({ all: true });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch {
      setReadError(true);
    } finally {
      setReading(false);
    }
  };

  return (
    <div className={styles.wrap} ref={ref}>
      <motion.button
        ref={bellRef}
        type="button"
        className={styles.bell}
        whileTap={{ scale: 0.94 }}
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
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={panelId}
            className={styles.panel}
            role="region"
            aria-label="Thông báo gần đây"
            data-lenis-prevent=""
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={panelVariants}
          >
            {/* Header */}
            <motion.div variants={itemVariants} className={styles.head}>
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
                  disabled={reading}
                  title="Đánh dấu tất cả thông báo là đã đọc"
                >
                  <CheckCheck size={15} aria-hidden="true" />
                  <span>{reading ? 'Đang đánh dấu…' : 'Đánh dấu tất cả đã đọc'}</span>
                </button>
              )}
            </motion.div>
            {readError && <p className={styles.readError} role="alert">Chưa đánh dấu được. Bấm lại để thử.</p>}

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
                  // Emphasize an existing quoted book name without inferring or rewriting it.
                  const subject = n.body.match(/^([“"][^”"]+[”"])([\s\S]*)$/);

                  return (
                    <motion.li
                      key={n.id}
                      variants={itemVariants}
                      className={styles.listItem}
                    >
                      <button
                        type="button"
                        className={`${styles.item} ${isUnread ? styles.unread : ""}`}
                        onClick={() => {
                          setOpen(false);
                          openNotification(n);
                        }}
                        aria-label={`${isUnread ? 'Chưa đọc. ' : ''}${n.title}: ${n.body}`}
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
                            <h3 className={styles.title}>{n.title}</h3>
                            {isUnread && (
                              <span
                                className={styles.unreadDot}
                                aria-hidden="true"
                              />
                            )}
                          </div>

                          <p className={styles.body}>{subject ? <><strong className={styles.subject}>{subject[1]}</strong>{subject[2]}</> : n.body}</p>

                          <div className={styles.timeRow}>
                            <span className={styles.categoryTag}>{cat.label}</span>
                            <span aria-hidden="true">·</span>
                            <time
                              dateTime={n.createdAt}
                              title={new Date(n.createdAt).toLocaleString("vi-VN")}
                            >
                              {timeAgo(n.createdAt)}
                            </time>
                          </div>
                        </div>

                        {/* Hover Arrow */}
                        <ChevronRight
                          size={16}
                          className={styles.arrow}
                          aria-hidden="true"
                        />
                      </button>
                    </motion.li>
                  );
                })}
              </ul>
            )}

            {/* Footer Action */}
            <motion.div variants={itemVariants} className={styles.footer}>
              <Link
                className={styles.all}
                to={ROUTES.notifications}
                onClick={() => setOpen(false)}
              >
                <span>Xem tất cả thông báo</span>
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
