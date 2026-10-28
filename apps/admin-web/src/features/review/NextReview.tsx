import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, Check, RefreshCw } from "lucide-react";
import { session } from "../../core/session";
import { Button, ErrorNotice } from "../../core/ui";
import { dateText } from "../../core/format";
import type { Kind } from "./contracts";
import {
  loadNextReviewPage,
  pendingReviewPath,
  selectNextReview,
} from "./review-navigation";
import { ListingTitle } from "./ListingTitle";
import styles from "./NextReview.module.css";

export function NextReview({
  kind,
  currentId,
  reviewerId,
}: {
  kind: Kind;
  currentId: string;
  reviewerId: string;
}) {
  const result = useQuery({
    queryKey: ["review-next", kind, currentId, reviewerId],
    queryFn: () => loadNextReviewPage(kind, session.request.bind(session)),
    staleTime: 0,
  });
  const data = result.data;
  const next = data
    ? selectNextReview(data.items, currentId, reviewerId)
    : null;
  const queue = pendingReviewPath(kind);
  return (
    <section className={styles.next} aria-label="Tiếp tục hàng chờ kiểm duyệt">
      <header className={styles.header}>
        <h3>Tiếp tục hàng chờ</h3>
        <Button
          className={styles.refresh}
          busy={result.isFetching}
          onClick={() => void result.refetch()}
          aria-label="Cập nhật hồ sơ tiếp theo"
          title="Cập nhật hồ sơ tiếp theo"
        >
          <RefreshCw size={16} aria-hidden="true" />
        </Button>
      </header>
      {result.isPending && (
        <p className={styles.note} role="status">
          Đang lấy hồ sơ chờ tiếp theo…
        </p>
      )}
      {result.isError && (
        <>
          <ErrorNotice
            error={result.error}
            retry={() => void result.refetch()}
            busy={result.isFetching}
          />
          {data && (
            <p className={styles.note}>
              Đang giữ hàng chờ lần tải trước; hồ sơ sẽ được kiểm tra lại khi
              mở.
            </p>
          )}
        </>
      )}
      {next?.kind === "next" && (
        <>
          <p className={styles.order}>
            Hồ sơ khác cũ nhất trong danh sách đã tải
          </p>
          <h4 className={styles.title}>
            {"state" in next.item ? (
              <ListingTitle value={next.item} />
            ) : (
              next.item.currentRevision.metadata.title
            )}
          </h4>
          <p className={styles.note}>
            Bản gửi {next.item.currentRevision.number} ·{" "}
            {dateText(next.item.currentRevision.submittedAt)}
          </p>
          <Link
            className={styles.open}
            to={`/review/${kind}/${next.item.id}`}
            state={{ reviewReturnTo: queue }}
          >
            Mở hồ sơ tiếp theo
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </>
      )}
      {next?.kind === "returned" && (
        <p className={styles.note} role="status">
          Hồ sơ này vừa xuất hiện lại trong hàng chờ. Dùng “Tải lại hồ sơ” bên
          dưới để đối chiếu bản gửi hiện tại trước khi quyết định.
        </p>
      )}
      {next?.kind === "empty" && (
        <div className={styles.empty}>
          <Check size={19} aria-hidden="true" />
          <p>
            {data?.nextCursor
              ? "Chưa tìm thấy hồ sơ khác cho bạn trong trang đang tải. Mở toàn bộ hàng chờ để xem tiếp."
              : "Chưa có hồ sơ khác cho bạn trong lần tải này."}
          </p>
        </div>
      )}
      <footer className={styles.footer}>
        <Link to={queue}>Xem toàn bộ hàng chờ</Link>
        {data && (
          <time dateTime={data.serverTime}>
            Cập nhật {dateText(data.serverTime)}
          </time>
        )}
      </footer>
    </section>
  );
}
