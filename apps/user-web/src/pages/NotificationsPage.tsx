import { useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bell, ArrowUpRight, Check } from "lucide-react";
import { timeAgo, useOpenNotification } from "../hooks/useOpenNotification";
import { useSession } from "../hooks/useSession";
import {
  listNotifications,
  markNotificationsRead,
} from "../services/notifications";
import styles from "./NotificationsPage.module.css";

export function NotificationsPage() {
  const auth = useSession();
  const queryClient = useQueryClient();
  const openNotification = useOpenNotification();
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string>();
  const pages = useInfiniteQuery({
    queryKey: ["notifications", "page"],
    queryFn: ({ pageParam }) => listNotifications(pageParam, 20),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: auth.status === "authenticated",
    retry: false,
  });
  const items = pages.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = pages.data?.pages[0]?.unreadCount;
  async function readAll() {
    if (reading) return;
    setReading(true);
    setError(undefined);
    try {
      await markNotificationsRead({ all: true });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch {
      setError("Chưa đánh dấu được thông báo. Thử lại giúp mình.");
    } finally {
      setReading(false);
    }
  }
  return (
    <section className={styles.root} aria-labelledby="notifications-title">
      <header className={styles.heading}>
        <div>
          <h1 id="notifications-title">Thông báo</h1>
          <p>
            {auth.status === "authenticated"
              ? unread == null
                ? "Cập nhật về sách và giao dịch của bạn."
                : unread
                  ? `${unread} thông báo chưa đọc`
                  : "Bạn đã đọc hết thông báo."
              : auth.status === "loading"
                ? "Đang kiểm tra đăng nhập…"
                : "Đăng nhập để xem thông báo của bạn."}
          </p>
        </div>
        {auth.status === "authenticated" && !!unread && (
          <button
            type="button"
            onClick={() => void readAll()}
            disabled={reading}
          >
            <Check size={18} aria-hidden="true" />
            {reading ? "Đang đánh dấu…" : "Đánh dấu đã đọc hết"}
          </button>
        )}
      </header>
      {auth.status !== "authenticated" ? (
        auth.status !== "loading" && (
          <Link className={styles.login} to="/login?returnUrl=%2Fnotifications">
            Đăng nhập <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        )
      ) : (
        <>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {pages.isPending && (
            <p className={styles.state} role="status">
              Đang tải thông báo…
            </p>
          )}
          {pages.isError && (
            <div className={styles.state} role="alert">
              <h2>Chưa tải được thông báo</h2>
              <p>Kiểm tra kết nối rồi thử lại.</p>
              <button
                type="button"
                disabled={pages.isFetching}
                onClick={() => void pages.refetch()}
              >
                Thử lại
              </button>
            </div>
          )}
          {pages.data && items.length === 0 && (
            <div className={styles.state}>
              <Bell size={32} aria-hidden="true" />
              <h2>Chưa có thông báo</h2>
              <p>
                Khi có cập nhật về sách hoặc giao dịch của bạn, thông báo sẽ xuất hiện
                ở đây.
              </p>
              <Link to="/auctions">
                Khám phá đấu giá <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </div>
          )}
          <ul className={styles.list}>
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={styles.item}
                  data-unread={!n.readAt}
                  onClick={() => openNotification(n)}
                >
                  <Bell size={20} aria-hidden="true" />
                  <span className={styles.content}>
                    <strong>{n.title}</strong>
                    <span>{n.body}</span>
                    <small>
                      <time
                        dateTime={n.createdAt}
                        title={new Date(n.createdAt).toLocaleString("vi-VN")}
                      >
                        {timeAgo(n.createdAt)}
                      </time>{" "}
                      · {n.readAt ? "Đã đọc" : "Chưa đọc"}
                    </small>
                  </span>
                  <ArrowUpRight size={18} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {pages.hasNextPage && (
            <button
              className={styles.more}
              type="button"
              disabled={pages.isFetchingNextPage}
              onClick={() => void pages.fetchNextPage()}
            >
              {pages.isFetchingNextPage ? "Đang tải…" : "Xem thêm"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
