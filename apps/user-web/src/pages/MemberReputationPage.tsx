import type { MemberReputation } from "@used-books/session-client";
import { useParams } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { memberReputationSchema } from "@used-books/session-client";
import { session } from "../lib/session";
import { ReviewContent } from "../features/reviews/TransactionReviewPanel";
import styles from "../features/reviews/reviews.module.css";
export function MemberReputationPage() {
  const { id } = useParams();
  const result = useInfiniteQuery({
    queryKey: ["memberReputation", id],
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p: MemberReputation) => p.nextCursor ?? undefined,
    queryFn: ({ pageParam }) =>
      session.publicRequest(
        `/members/${encodeURIComponent(id ?? "")}/reputation?limit=10${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        memberReputationSchema,
      ),
    enabled: !!id,
    retry: false,
  });
  const data = result.data?.pages[0];
  return (
    <div className={styles.page}>
      <h1>Hồ sơ uy tín</h1>
      {result.isPending && <p role="status">Đang tải hồ sơ…</p>}
      {result.isError && (
        <section role="alert">
          <h2>Chưa xem được hồ sơ</h2>
          <p>Hồ sơ không công khai hoặc kết nối chưa sẵn sàng.</p>
          <button
            type="button"
            disabled={result.isFetching}
            onClick={() => void result.refetch()}
          >
            Thử lại
          </button>
        </section>
      )}
      {data && (
        <>
          <h2>{data.displayName}</h2>
          <dl className={styles.facts}>
            <div>
              <dt>Giao dịch hoàn tất</dt>
              <dd>{data.completedTransactions}</dd>
            </div>
            <div>
              <dt>Điểm đối tác</dt>
              <dd>
                {data.partnerRating === null
                  ? "Chưa có"
                  : `${data.partnerRating.toFixed(1)}/5`}
              </dd>
            </div>
            <div>
              <dt>Điểm sách nhận</dt>
              <dd>
                {data.bookRating === null
                  ? "Chưa có"
                  : `${data.bookRating.toFixed(1)}/5`}
              </dd>
            </div>
            <div>
              <dt>Vi phạm đã xác minh</dt>
              <dd>{data.verifiedViolations}</dd>
            </div>
          </dl>
          <p className={styles.intro}>
            Điểm tính từ {data.reviewCount} đánh giá công khai hợp lệ. Đánh giá
            chưa công bố, đã xóa hoặc bị ẩn không được tính. Khiếu nại chưa kết
            luận không phải vi phạm.
          </p>
          {data.reviewCount === 0 && <p>Chưa có đánh giá công khai.</p>}
          {result.data?.pages
            .flatMap((p) => p.items)
            .map((r) => (
              <ReviewContent key={r.id} review={r} />
            ))}
          {result.hasNextPage && (
            <div className={styles.actions}>
              <button
                type="button"
                disabled={result.isFetchingNextPage}
                onClick={() => void result.fetchNextPage()}
              >
                Xem thêm đánh giá
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
