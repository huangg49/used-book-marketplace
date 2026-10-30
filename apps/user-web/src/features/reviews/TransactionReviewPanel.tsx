import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  transactionReviewsSchema,
  reviewStatusLabels,
  sendReviewIntent,
  pendingReviewIntent,
  ApiError,
  type ReviewType,
  type TransactionReview,
} from "@used-books/session-client";
import { session } from "../../lib/session";
import { useSession } from "../../hooks/useSession";
import styles from "./reviews.module.css";
import { reviewDate } from "./format";

export function ReviewContent({
  review,
  title,
}: {
  review: TransactionReview;
  title?: string;
}) {
  return (
    <article className={styles.review}>
      <h3>{title ?? review.authorName}</h3>
      <span className={styles.status}>{reviewStatusLabels[review.status]}</span>
      <p className={styles.meta}>Gửi {reviewDate(review.createdAt)}</p>
      {review.status === "Deleted" ? (
        <p>
          Đã xóa khỏi hiển thị công khai. Không thể gửi đánh giá mới cho giao
          dịch này.
        </p>
      ) : (
        <>
          <p>
            Đối tác: <strong>{review.partnerRating}/5</strong>
            {review.bookRating !== null && (
              <>
                {" "}
                · Sách nhận: <strong>{review.bookRating}/5</strong>
              </>
            )}
          </p>
          {review.comment && <p>{review.comment}</p>}
          {review.tags.length > 0 && (
            <p className={styles.meta}>{review.tags.join(" · ")}</p>
          )}
        </>
      )}
      {review.reply && (
        <div>
          <h4>Phản hồi của người được đánh giá</h4>
          <p>{review.reply.text}</p>
          <p className={styles.meta}>
            {review.reply.status === "Pending"
              ? "Đang chờ kiểm duyệt"
              : review.reply.status === "Hidden"
                ? "Phản hồi đã được ẩn"
                : "Đã duyệt"}
          </p>
        </div>
      )}
    </article>
  );
}
export function TransactionReviewPanel({
  type,
  id,
}: {
  type: ReviewType;
  id: string;
}) {
  const auth = useSession(),
    cache = useQueryClient();
  const owner = auth.status === "authenticated" ? auth.user.id : undefined;
  const result = useQuery({
    queryKey: ["transactionReviews", owner, type, id],
    queryFn: () =>
      session.request(
        `/transactions/${type}/${id}/reviews`,
        transactionReviewsSchema,
      ),
    enabled: !!owner,
    retry: false,
    refetchInterval: 60_000,
  });
  const [editor, setEditor] = useState<
    "create" | "edit" | "reply" | "delete" | null
  >(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const running = useRef(false),
    scope = `reviews:${owner}:${type}:${id}`;
  const uncertain = pendingReviewIntent(session, scope);
  async function send(path: string, body: unknown) {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await sendReviewIntent(session, scope, path, body, () =>
        crypto.randomUUID(),
      );
      setEditor(null);
      setNotice("Đã lưu theo xác nhận của máy chủ.");
      await cache.invalidateQueries({
        queryKey: ["transactionReviews", owner, type, id],
      });
      await cache.invalidateQueries({ queryKey: ["memberReputation"] });
      return true;
    } catch (e) {
      setError(
        pendingReviewIntent(session, scope)
          ? "Chưa xác định được kết quả. Dùng “Thử lại yêu cầu đã gửi”; nội dung và mã yêu cầu được giữ nguyên."
          : e instanceof ApiError
            ? e.message
            : "Chưa gửi được đánh giá. Nội dung của bạn vẫn được giữ.",
      );
      if (e instanceof ApiError && e.status === 409) void result.refetch();
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  if (!owner) return <p>Đăng nhập để xem đánh giá giao dịch.</p>;
  if (result.isPending) return <p role="status">Đang tải đánh giá…</p>;
  const accessDenied =
    result.error instanceof ApiError &&
    [401, 403, 404].includes(result.error.status);
  if (result.isError && (!result.data || accessDenied))
    return (
      <div role="alert">
        <p>Chưa tải được đánh giá. Kiểm tra kết nối rồi thử lại.</p>
        <button
          type="button"
          disabled={result.isFetching}
          onClick={() => void result.refetch()}
        >
          Tải lại đánh giá
        </button>
      </div>
    );
  const data = result.data!,
    mine = data.myReview,
    peer = data.partnerReview;
  return (
    <section className={styles.panel} aria-label="Đánh giá giao dịch">
      <h2>Đánh giá giao dịch</h2>
      <p className={styles.intro}>
        Mỗi bên gửi một đánh giá. Bạn có 48 giờ từ lần gửi đầu để sửa hoặc xóa.
        Nội dung chỉ công bố khi hết quyền sửa của cả hai và đủ điều kiện; không
        mở ngay khi đối phương gửi.
      </p>
      {data.deadline && (
        <p className={styles.meta}>
          Hạn gửi: {reviewDate(data.deadline)} · Thời gian theo máy chủ.
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {result.isError && (
        <p role="alert">
          Chưa cập nhật được đánh giá. Đang giữ bản đã tải và bản nháp; dùng
          “Tải lại đánh giá” để thử lại.
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {uncertain && (
        <div className={styles.actions}>
          <button
            type="button"
            disabled={busy}
            onClick={() => void send("", {})}
          >
            {busy ? "Đang xác minh…" : "Thử lại yêu cầu đã gửi"}
          </button>
        </div>
      )}
      {/* Keep the editor mounted while an intent is pending so a definite
          rejection restores the exact draft instead of reinitializing it. */}
      <div hidden={uncertain}>
        {mine && (
          <>
            <ReviewContent review={mine} title="Đánh giá của bạn" />
            <p className={styles.meta}>
              Hạn sửa/xóa: {reviewDate(mine.editDeadline)}
              {mine.legacyDisclosed
                ? " · Bản cũ đã được hiển thị, đã khóa sửa."
                : ""}
              {mine.evidenceHeld ? " · Đang giữ làm bằng chứng." : ""}
            </p>
          </>
        )}
        {!mine && !data.canReview && (
          <p>Giao dịch chưa đủ điều kiện hoặc đã hết hạn gửi đánh giá.</p>
        )}
        {peer ? (
          <ReviewContent review={peer} title="Đánh giá từ đối tác" />
        ) : (
          <p className={styles.meta}>
            Chưa có đánh giá đối tác được công bố. Trước thời điểm công bố, bạn
            chỉ xem được bản của mình.
          </p>
        )}
        <div className={styles.actions}>
          {data.canReview && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditor("create")}
            >
              Viết đánh giá
            </button>
          )}
          {data.canEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditor("edit")}
            >
              Sửa đánh giá
            </button>
          )}
          {data.canDelete && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditor("delete")}
            >
              Xóa đánh giá công khai
            </button>
          )}
          {data.canReply && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditor("reply")}
            >
              Phản hồi đánh giá
            </button>
          )}
          <button
            type="button"
            disabled={busy || result.isFetching}
            onClick={() => void result.refetch()}
          >
            Tải lại đánh giá
          </button>
        </div>
        {editor && (
          <ReviewForm
            key={`${editor}:${mine?.id ?? "new"}`}
            mode={editor}
            mine={mine}
            peer={peer}
            bookRequired={data.bookRatingRequired}
            busy={busy}
            cancel={() => setEditor(null)}
            send={(body) => {
              const path =
                editor === "create"
                  ? `/transactions/${type}/${id}/reviews`
                  : `/transaction-reviews/${editor === "reply" ? peer!.id : mine!.id}/${editor}`;
              return send(path, body);
            }}
          />
        )}
      </div>
      <p className={styles.meta}>
        <Link to="/reviews">Về các giao dịch cần đánh giá</Link>
      </p>
    </section>
  );
}
function ReviewForm({
  mode,
  mine,
  peer,
  bookRequired,
  busy,
  cancel,
  send,
}: {
  mode: string;
  mine: TransactionReview | null;
  peer: TransactionReview | null;
  bookRequired: boolean;
  busy: boolean;
  cancel: () => void;
  send: (body: unknown) => Promise<boolean>;
}) {
  const [partner, setPartner] = useState(
    mode === "edit" ? String(mine?.partnerRating) : "",
  );
  const [book, setBook] = useState(
    mode === "edit" && mine?.bookRating !== null
      ? String(mine?.bookRating)
      : "",
  );
  const [text, setText] = useState(
    mode === "edit" ? (mine?.comment ?? "") : "",
  );
  const [version, setVersion] = useState(
    (mode === "reply" ? peer : mine)?.version,
  );
  function submit(e: FormEvent) {
    e.preventDefault();
    const body =
      mode === "delete"
        ? { expectedVersion: version }
        : mode === "reply"
          ? { expectedVersion: version, text }
          : {
              partnerRating: Number(partner),
              ...(bookRequired ? { bookRating: Number(book) } : {}),
              comment: text,
              ...(mode === "edit"
                ? { expectedVersion: version, tags: mine?.tags ?? [] }
                : {}),
            };
    void send(body);
  }
  return (
    <form
      className={styles.form}
      onSubmit={submit}
      aria-label={mode === "reply" ? "Phản hồi đánh giá" : "Soạn đánh giá"}
    >
      {mode === "delete" ? (
        <p>
          Xóa khỏi hiển thị công khai? Lịch sử vẫn được giữ và bạn không thể gửi
          lại đánh giá cho giao dịch này.
        </p>
      ) : (
        <>
          {mode !== "reply" && (
            <>
              <label>
                Điểm đối tác
                <select
                  required
                  value={partner}
                  disabled={busy}
                  onChange={(e) => setPartner(e.target.value)}
                >
                  <option value="">Chọn điểm</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}/5
                    </option>
                  ))}
                </select>
              </label>
              {bookRequired && (
                <label>
                  Điểm sách nhận được
                  <select
                    required
                    value={book}
                    disabled={busy}
                    onChange={(e) => setBook(e.target.value)}
                  >
                    <option value="">Chọn điểm</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}/5
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
          <label>
            {mode === "reply"
              ? "Nội dung phản hồi"
              : "Nhận xét (không bắt buộc)"}
            <textarea
              autoFocus
              required={mode === "reply"}
              maxLength={1000}
              value={text}
              disabled={busy}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <p className={styles.meta}>
            {text.length}/1.000 ký tự. Không đưa số điện thoại, địa chỉ hoặc ảnh
            chứng cứ riêng vào nội dung công khai.
          </p>
        </>
      )}
      {version !== undefined &&
        version !== (mode === "reply" ? peer : mine)?.version && (
          <button
            type="button"
            onClick={() =>
              setVersion((mode === "reply" ? peer : mine)?.version)
            }
          >
            Dùng phiên bản hiện tại, giữ bản nháp
          </button>
        )}
      <div className={styles.actions}>
        <button type="submit" disabled={busy}>
          {busy
            ? "Đang gửi…"
            : mode === "delete"
              ? "Xác nhận xóa"
              : mode === "reply"
                ? "Gửi phản hồi để kiểm duyệt"
                : "Lưu đánh giá"}
        </button>
        <button type="button" disabled={busy} onClick={cancel}>
          Đóng bản nháp
        </button>
      </div>
    </form>
  );
}
