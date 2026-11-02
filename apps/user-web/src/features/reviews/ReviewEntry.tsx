import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ApiError,
  transactionReviewsSchema,
  type ReviewType,
} from "@used-books/session-client";
import { Star } from "lucide-react";
import { useSession } from "../../hooks/useSession";
import { session } from "../../lib/session";
import styles from "./ReviewEntry.module.css";

export function ReviewEntry({
  type,
  id,
  version,
}: {
  type: ReviewType;
  id: string;
  version?: number;
}) {
  const auth = useSession();
  const owner = auth.status === "authenticated" ? auth.user.id : undefined;
  const result = useQuery({
    queryKey: ["reviewEntry", owner, type, id, version],
    queryFn: () =>
      session.request(
        `/transactions/${type}/${id}/reviews`,
        transactionReviewsSchema,
      ),
    enabled: !!owner,
    retry: false,
  });
  if (
    !owner ||
    (result.error instanceof ApiError &&
      [401, 403, 404].includes(result.error.status))
  )
    return null;
  if (result.isPending)
    return <p role="status">Đang kiểm tra quyền đánh giá…</p>;
  if (result.isError)
    return (
      <p role="alert">
        Chưa tải được quyền đánh giá.{" "}
        <button
          type="button"
          disabled={result.isFetching}
          onClick={() => void result.refetch()}
        >
          Thử lại
        </button>
      </p>
    );
  const data = result.data;
  if (!data?.canReview && !data?.myReview && !data?.partnerReview) return null;
  return (
    <section className={styles.entry} aria-label="Đánh giá giao dịch này">
      <div>
        <h3>
          {data.canReview ? "Bạn có thể đánh giá ngay" : "Đánh giá giao dịch"}
        </h3>
        <p>
          {data.awaitingCompletion
            ? "Không cần chờ hết 72 giờ để viết. Đánh giá được giữ riêng đến khi giao dịch hoàn tất và đủ điều kiện công bố; tiền vẫn được giữ theo quy trình."
            : "Xem hoặc chia sẻ trải nghiệm với người đã giao dịch cùng bạn."}
        </p>
      </div>
      <Link to={`/reviews?tab=pending&type=${type}&transaction=${id}`}>
        <Star size={18} aria-hidden="true" />
        {data.canReview ? "Viết đánh giá" : "Xem đánh giá"}
      </Link>
    </section>
  );
}
