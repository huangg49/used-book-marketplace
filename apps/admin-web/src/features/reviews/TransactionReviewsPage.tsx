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
          <section className={styles.record} key={item.review.id}>
            <h2>{item.review.authorName}</h2>
            <p>
              {
                reviewTypes.find(
                  ([type]) => type === item.review.transactionType,
                )?.[1]
              }{" "}
              · Mã giao dịch{" "}
              {item.review.transactionId.slice(0, 8).toUpperCase()}
            </p>
            <p>
              {reviewStatusLabels[item.review.status]} · Phiên bản{" "}
              {item.review.version} · {dateText(item.review.createdAt)}
            </p>
            <p>
              Đối tác: {item.review.partnerRating}/5
              {item.review.bookRating !== null
                ? ` · Sách: ${item.review.bookRating}/5`
                : ""}
            </p>
            <p className={styles.text}>
              {item.review.comment || "Không có nhận xét bằng chữ."}
            </p>
            {item.review.reply ? (
              <div>
                <h3>Phản hồi của người được đánh giá</h3>
                <p className={styles.text}>{item.review.reply.text}</p>
                <p>
                  {item.review.reply.status === "Pending"
                    ? "Chờ duyệt"
                    : item.review.reply.status === "Approved"
                      ? "Đã duyệt"
                      : "Đã ẩn"}
                </p>
              </div>
            ) : null}
            <p>
              {item.review.evidenceHeld
                ? "Đang giữ làm bằng chứng."
                : "Chưa có lệnh giữ làm bằng chứng."}
            </p>
            <Decision
              review={item.review}
              refresh={() => result.refetch()}
              owner={owner}
            />
            <RevisionHistory
              key={`${item.review.id}:${item.review.version}`}
              owner={owner}
              reviewId={item.review.id}
              initial={{
                items: item.revisions,
                nextCursor: item.nextRevisionCursor,
                serverTime: result.data!.pages[0].serverTime,
              }}
            />
          </section>
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
}: {
  review: TransactionReview;
  owner: string;
  refresh: () => Promise<unknown>;
}) {
  const [decision, setDecision] = useState(""),
    [reason, setReason] = useState(""),
    [version, setVersion] = useState(review.version),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const running = useRef(false),
    scope = `review-moderation:${owner}:${review.id}`,
    uncertain = pendingReviewIntent(session, scope);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await sendReviewIntent(
        session,
        scope,
        `/operations/transaction-reviews/${review.id}/decision`,
        { expectedVersion: version, decision, reason },
        () => crypto.randomUUID(),
      );
      setVersion(saved.version);
      setNotice("Đã ghi nhận quyết định.");
      setDecision("");
      setReason("");
      await refresh();
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
      {notice ? <p role="status">{notice}</p> : null}
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
