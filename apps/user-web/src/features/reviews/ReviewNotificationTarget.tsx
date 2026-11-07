import { useQuery } from "@tanstack/react-query";
import { ApiError, reviewTypeSchema } from "@used-books/session-client";
import { Link, Navigate } from "react-router-dom";
import { z } from "zod";
import { useSession } from "../../hooks/useSession";
import { session } from "../../lib/session";
import styles from "./reviews.module.css";

const targetSchema = z.object({ type: reviewTypeSchema, id: z.uuid() });

/** Resolve a review identifier through current server access before opening its transaction. */
export function ReviewNotificationTarget({ reviewId }: { reviewId: string }) {
  const auth = useSession();
  const owner = auth.status === "authenticated" ? auth.user.id : undefined;
  const valid = z.uuid().safeParse(reviewId).success;
  const target = useQuery({
    queryKey: ["review-notification-target", owner, reviewId],
    queryFn: () => session.request(`/me/transaction-reviews/${encodeURIComponent(reviewId)}/target`, targetSchema),
    enabled: !!owner && valid,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const unavailable = target.error instanceof ApiError && [401, 403, 404].includes(target.error.status);

  if (valid && owner && target.isSuccess && !target.isFetching) {
    return <Navigate replace to={`/reviews?${new URLSearchParams({
      tab: "pending", type: target.data.type, transaction: target.data.id,
    })}`} />;
  }
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1>Mở đánh giá từ thông báo</h1>
        <Link to="/notifications" className={styles.backLink}>Về thông báo</Link>
      </header>
      {!valid || target.isError ? (
        <div role="alert" className={styles.errorCard}>
          <div className={styles.errorContent}>
            <p>{!valid
              ? "Liên kết đánh giá chưa hợp lệ. Hãy mở lại từ thông báo của bạn."
              : unavailable
                ? "Đánh giá không còn khả dụng hoặc bạn không có quyền xem. Kiểm tra phiên đăng nhập rồi thử lại."
                : "Chưa xác minh được đánh giá. Vui lòng thử lại."}</p>
            {valid && owner && <button type="button" className={styles.retryBtn}
              disabled={target.isFetching} onClick={() => void target.refetch()}>
              Thử mở lại đánh giá
            </button>}
          </div>
        </div>
      ) : <p role="status">Đang xác minh đánh giá từ thông báo…</p>}
    </div>
  );
}
