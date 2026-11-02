import type { OperationsReviewsPage } from "@used-books/session-client";
import { useRef, useState, type FormEvent } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import {
  operationsReviewsSchema,
  reviewRevisionPageSchema,
  type ReviewRevisionPage,
  reviewStatusLabels,
  reviewTypes,
  sendReviewIntent,
  pendingReviewIntent,
  ApiError,
  type CurrentUser,
  type TransactionReview,
} from "@used-books/session-client";
import { session, canReview } from "../../core/session";
import { Button, CursorPagination, Notice } from "../../core/ui";
import { ListFeedback } from "../../core/list-feedback";
import { dateText } from "../../core/format";
import styles from "./TransactionReviewsPage.module.css";
export function TransactionReviewsPage() {
  const user = useOutletContext<CurrentUser>();
  if (!canReview(user))
    return <Notice tone="warning">Cần quyền kiểm duyệt đang hoạt động.</Notice>;
  return <ReviewQueue key={user.id} owner={user.id} />;
}
function ReviewQueue({ owner }: { owner: string }) {
  const result = useInfiniteQuery({
    queryKey: ["operationsTransactionReviews", owner],
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p: OperationsReviewsPage) => p.nextCursor ?? undefined,
    queryFn: ({ pageParam }) =>
      session.request(
        `/operations/transaction-reviews?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        operationsReviewsSchema,
      ),
    retry: false,
  });
  if (
    result.error instanceof ApiError &&
    [401, 403].includes(result.error.status)
  )
    return (
      <Notice tone="warning">
        Quyền kiểm duyệt đã thay đổi. Đăng nhập lại trước khi tiếp tục.
      </Notice>
    );
  return (
    <>
      <header className="page-heading">
        <h1>Đánh giá giao dịch</h1>
        <p className="intro">
          Kiểm duyệt đánh giá đã đủ điều kiện công bố và phản hồi. Không hiển
          thị giao dịch bạn tham gia hoặc đánh giá còn trong thời gian bảo mật.
        </p>
      </header>
      <Button busy={result.isFetching} onClick={() => void result.refetch()}>
        Cập nhật danh sách
      </Button>
      <ListFeedback result={result} loadingText="Đang tải đánh giá…" />
      {result.isSuccess && result.data.pages[0].items.length === 0 ? (
        <div className="empty">
          <h2>Chưa có đánh giá được phép xử lý</h2>
          <p>Đánh giá chỉ vào hàng đợi sau khi hết các thời hạn bảo mật.</p>
        </div>
      ) : null}
      {result.data?.pages
        .flatMap((p) => p.items)
        .map((item) => (
          <ReviewRecord
            key={item.review.id}
            item={item}
            owner={owner}
            serverTime={result.data!.pages[0].serverTime}
            refresh={() => result.refetch()}
          />
        ))}
      <CursorPagination
        pageCount={result.data?.pages.length ?? 0}
        hasNextPage={!!result.hasNextPage}
        isFetching={result.isFetching}
        isFetchingNextPage={result.isFetchingNextPage}
        error={result.isFetchNextPageError ? result.error : undefined}
        onNextPage={() => void result.fetchNextPage()}
        nextLabel="Xem thêm đánh giá"
      />
    </>
  );
}
function ReviewRecord({
  item,
  owner,
  serverTime,
  refresh,
}: {
  item: OperationsReviewsPage["items"][number];
  owner: string;
  serverTime: string;
  refresh: () => Promise<unknown>;
}) {
  const [expanded, setExpanded] = useState(true),
    [acknowledged, setAcknowledged] = useState<TransactionReview | null>(null);
  const summary = useRef<HTMLElement>(null);
  // A saved receipt supplies the current version even if the list refresh fails.
  const review =
    acknowledged && acknowledged.version > item.review.version
      ? acknowledged
      : item.review;
  return (
    <section className={styles.record}>
      <details
        open={expanded}
        onToggle={(e) => setExpanded(e.currentTarget.open)}
      >
        <summary ref={summary} className={styles.recordSummary}>
          <span className={styles.summaryText}>
            <strong>{review.authorName}</strong>
            <span className="muted">
              {
                reviewTypes.find(
                  ([type]) => type === review.transactionType,
                )?.[1]
              }{" "}
              · Mã giao dịch {review.transactionId.slice(0, 8).toUpperCase()}
            </span>
            <span>
              {reviewStatusLabels[review.status]} · Phiên bản {review.version} ·
              Đối tác: {review.partnerRating}/5
              {review.bookRating !== null
                ? ` · Sách: ${review.bookRating}/5`
                : ""}
            </span>
          </span>
          <span className={styles.summaryAction}>
            {expanded ? "Thu gọn" : "Mở lại xử lý"}
          </span>
        </summary>
        <div className={styles.recordBody}>
          <p>Gửi {dateText(review.createdAt)}</p>
          <p className={styles.text}>
            {review.comment || "Không có nhận xét bằng chữ."}
          </p>
          {review.reply ? (
            <div>
              <h3>Phản hồi của người được đánh giá</h3>
              <p className={styles.text}>{review.reply.text}</p>
              <p>
                {review.reply.status === "Pending"
                  ? "Chờ duyệt"
                  : review.reply.status === "Approved"
                    ? "Đã duyệt"
                    : "Đã ẩn"}
              </p>
            </div>
          ) : null}
          <p>
            {review.evidenceHeld
              ? "Đang giữ làm bằng chứng."
              : "Chưa có lệnh giữ làm bằng chứng."}
          </p>
          <Decision
            review={review}
            refresh={refresh}
            owner={owner}
            onSaved={(saved) => {
              setAcknowledged(saved);
              setExpanded(false);
              summary.current?.focus();
            }}
          />
          <RevisionHistory
            key={`${review.id}:${item.review.version}`}
            owner={owner}
            reviewId={review.id}
            initial={{
              items: item.revisions,
              nextCursor: item.nextRevisionCursor,
              serverTime,
            }}
          />
        </div>
      </details>
      {acknowledged ? <p role="status">Đã ghi nhận quyết định.</p> : null}
    </section>
  );
}
function RevisionHistory({
  owner,
  reviewId,
  initial,
}: {
  owner: string;
  reviewId: string;
  initial: ReviewRevisionPage;
}) {
  const result = useInfiniteQuery({
    queryKey: [
      "reviewRevisionHistory",
      owner,
      reviewId,
      initial.items[0]?.version,
    ],
    initialPageParam: undefined as string | undefined,
    initialData: { pages: [initial], pageParams: [undefined] },
    enabled: false,
    getNextPageParam: (p: ReviewRevisionPage) => p.nextCursor ?? undefined,
    queryFn: ({ pageParam }) =>
      session.request(
        `/operations/transaction-reviews/${reviewId}/revisions?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        reviewRevisionPageSchema,
      ),
    retry: false,
  });
  if (
    result.error instanceof ApiError &&
    [401, 403, 404].includes(result.error.status)
  )
    return (
      <Notice tone="warning">Không còn quyền đọc lịch sử đánh giá này.</Notice>
    );
  return (
    <details>
      <summary>Lịch sử phiên bản · mới nhất trước</summary>
      {result.data.pages
        .flatMap((p) => p.items)
        .map((revision) => (
          <article key={revision.version} className={styles.revision}>
            <h3>
              Phiên bản {revision.version} · {revision.action}
            </h3>
            <p>{dateText(revision.at)}</p>
            {revision.reason ? <p>Lý do: {revision.reason}</p> : null}
            <p>
              Điểm đối tác: {String(revision.snapshot.partnerRating ?? "—")} ·
              Điểm sách: {String(revision.snapshot.bookRating ?? "—")}
            </p>
            <p className={styles.text}>
              {String(revision.snapshot.comment ?? "")}
            </p>
            {revision.snapshot.reply &&
            typeof revision.snapshot.reply === "object" &&
            "text" in revision.snapshot.reply ? (
              <p className={styles.text}>
                Phản hồi: {String(revision.snapshot.reply.text)}
              </p>
            ) : null}
          </article>
        ))}
      {result.isError ? (
        <Notice tone="error">
          Chưa tải được lịch sử cũ hơn. Bạn có thể thử lại.
        </Notice>
      ) : null}
      {result.hasNextPage ? (
        <Button
          busy={result.isFetchingNextPage}
          onClick={() => void result.fetchNextPage()}
        >
          Xem phiên bản cũ hơn
        </Button>
      ) : null}
    </details>
  );
}
function Decision({
  review,
  owner,
  refresh,
  onSaved,
}: {
  review: TransactionReview;
  owner: string;
  refresh: () => Promise<unknown>;
  onSaved: (review: TransactionReview) => void;
}) {
  const [decision, setDecision] = useState(""),
    [reason, setReason] = useState(""),
    [version, setVersion] = useState(review.version),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const running = useRef(false),
    scope = `review-moderation:${owner}:${review.id}`,
    uncertain = pendingReviewIntent(session, scope);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const saved = await sendReviewIntent(
        session,
        scope,
        `/operations/transaction-reviews/${review.id}/decision`,
        { expectedVersion: version, decision, reason },
        () => crypto.randomUUID(),
      );
      setVersion(saved.version);
      setDecision("");
      setReason("");
      onSaved(saved);
      // ListFeedback handles read failures independently of the saved command.
      void refresh().catch(() => {});
    } catch (e) {
      setError(
        pendingReviewIntent(session, scope)
          ? "Chưa rõ kết quả. Thử lại nguyên quyết định đã gửi."
          : e instanceof ApiError
            ? e.message
            : "Chưa lưu được quyết định.",
      );
      if (e instanceof ApiError && e.status === 409) await refresh();
    } finally {
      setBusy(false);
      running.current = false;
    }
  }
  return (
    <form
      onSubmit={submit}
      className={styles.form}
      aria-label={`Xử lý đánh giá của ${review.authorName}`}
    >
      {error ? <Notice tone="error">{error}</Notice> : null}
      {uncertain ? (
        <Button type="submit" busy={busy}>
          Thử lại quyết định đã gửi
        </Button>
      ) : (
        <>
          <label>
            Quyết định
            <select
              required
              value={decision}
              disabled={busy}
              onChange={(e) => {
                setDecision(e.target.value);
                setVersion(review.version);
              }}
            >
              <option value="">Chọn quyết định</option>
              <option value="Hide">Ẩn đánh giá</option>
              <option value="Restore">Khôi phục đánh giá</option>
              <option value="ApproveReply">Duyệt phản hồi</option>
              <option value="HideReply">Ẩn phản hồi</option>
              <option value="HoldEvidence">Giữ làm bằng chứng</option>
              <option value="ReleaseEvidence">Gỡ giữ bằng chứng</option>
            </select>
          </label>
          <label>
            Lý do
            <textarea
              required
              minLength={3}
              maxLength={1000}
              rows={4}
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <p className="muted">
            Quyết định được lưu cùng lịch sử. Không sửa hoặc giải ngân tiền giao
            dịch.
          </p>
          {version !== review.version ? (
            <Button onClick={() => setVersion(review.version)}>
              Dùng phiên bản hiện tại, giữ lý do
            </Button>
          ) : null}
          <Button
            type="submit"
            busy={busy}
            disabled={!decision || reason.trim().length < 3}
          >
            Ghi nhận quyết định
          </Button>
        </>
      )}
    </form>
  );
}
