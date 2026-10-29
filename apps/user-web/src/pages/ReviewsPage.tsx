import { reviewDate } from "../features/reviews/format";
import type { ReviewTransactionsPage } from "@used-books/session-client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  reviewTransactionsSchema,
  reviewTypes,
  ApiError,
  type ReviewType,
} from "@used-books/session-client";
import { session } from "../lib/session";
import { useSession } from "../hooks/useSession";
import { TransactionReviewPanel } from "../features/reviews/TransactionReviewPanel";
import styles from "../features/reviews/reviews.module.css";
export function ReviewsPage() {
  const auth = useSession(),
    [params] = useSearchParams();
  const type: ReviewType = reviewTypes.some(([t]) => t === params.get("type"))
    ? (params.get("type") as ReviewType)
    : "Exchange";
  const selected = params.get("transaction");
  const owner = auth.status === "authenticated" ? auth.user.id : undefined;
  const result = useInfiniteQuery({
    queryKey: ["reviewTransactions", owner, type],
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p: ReviewTransactionsPage) => p.nextCursor ?? undefined,
    queryFn: ({ pageParam }) =>
      session.request(
        `/me/review-transactions?limit=10&type=${type}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        reviewTransactionsSchema,
      ),
    enabled: !!owner,
    retry: false,
  });
  if (
    result.error instanceof ApiError &&
    [401, 403].includes(result.error.status)
  )
    return (
      <div role="alert">
        Phiên hoặc quyền truy cập đã thay đổi. Đăng nhập lại để xem giao dịch.
      </div>
    );
  return (
    <div className={styles.page}>
      <h1>Đánh giá của tôi</h1>
      <p className={styles.intro}>
        Các giao dịch hoàn tất được liệt kê theo thời gian. Chỉ các bên tham gia
        mới được gửi đánh giá.
      </p>
      {owner && <Link to={`/members/${owner}`}>Xem hồ sơ uy tín của tôi</Link>}
      <nav className={styles.lanes} aria-label="Loại giao dịch đánh giá">
        {reviewTypes.map(([t, label]) => (
          <Link
            key={t}
            to={`/reviews?type=${t}`}
            aria-current={type === t ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      {result.isPending && <p role="status">Đang tải giao dịch…</p>}
      {result.isError && (
        <div role="alert">
          <p>Chưa tải được giao dịch.</p>
          <button
            type="button"
            disabled={result.isFetching}
            onClick={() => void result.refetch()}
          >
            Thử lại
          </button>
        </div>
      )}
      {result.isSuccess && result.data.pages[0].items.length === 0 && (
        <section className={styles.panel}>
          <h2>Chưa có giao dịch hoàn tất ở mục này</h2>
          <p>
            Giao dịch đang vận chuyển hoặc đang xử lý sự cố chưa đủ điều kiện
            đánh giá.
          </p>
          <Link to="/orders">Xem đơn hàng của tôi</Link>
        </section>
      )}
      {selected ? (
        <TransactionReviewPanel
          key={`${type}:${selected}`}
          type={type}
          id={selected}
        />
      ) : (
        <>
          {result.data?.pages
            .flatMap((p) => p.items)
            .map((item) => (
              <section
                key={item.transactionId}
                data-transaction-id={item.transactionId}
                className={styles.panel}
              >
                <h2>Giao dịch với {item.partnerName}</h2>
                <p className={styles.meta}>
                  Mã {item.transactionId.slice(0, 8).toUpperCase()} · Hoàn tất{" "}
                  {reviewDate(item.completedAt)}
                </p>
                <div className={styles.actions}>
                  <Link
                    to={`/reviews?type=${type}&transaction=${item.transactionId}`}
                  >
                    Xem và viết đánh giá
                  </Link>
                  <Link to={`/members/${item.partnerId}`}>Hồ sơ đối tác</Link>
                </div>
              </section>
            ))}
          {result.hasNextPage && (
            <div className={styles.actions}>
              <button
                type="button"
                disabled={result.isFetchingNextPage}
                onClick={() => void result.fetchNextPage()}
              >
                {result.isFetchingNextPage ? "Đang tải…" : "Xem thêm giao dịch"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
