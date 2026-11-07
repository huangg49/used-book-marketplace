import { SupportLink } from '../support/SupportLink';
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
import { DemoReviewAdvance } from "./DemoReviewAdvance";
import {
  ArrowLeft,
  Star,
  BookOpen,
  Clock,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Minus,
  AlertTriangle,
} from "lucide-react";

export function ReviewContent({
  review,
  title,
}: {
  review: TransactionReview;
  title?: string;
}) {
  const isPositive = review.partnerRating >= 4;
  const isNeutral = review.partnerRating === 3;

  const tierBorderClass = isPositive
    ? styles.borderPositive
    : isNeutral
    ? styles.borderNeutral
    : styles.borderNegative;

  const tierBadgeClass = isPositive
    ? styles.badgePositive
    : isNeutral
    ? styles.badgeNeutral
    : styles.badgeNegative;

  const TierIcon = isPositive ? Sparkles : isNeutral ? Minus : AlertTriangle;
  const tierText = isPositive
    ? review.partnerRating === 5
      ? "Đánh giá xuất sắc"
      : "Đánh giá tốt"
    : isNeutral
    ? "Đánh giá trung bình"
    : review.partnerRating === 2
    ? "Đánh giá chưa tốt"
    : "Đánh giá rất kém";

  const partnerTierColor = isPositive ? "#e59819" : isNeutral ? "#c98a10" : "#c84126";
  const bookTierColor =
    review.bookRating !== null
      ? review.bookRating >= 4
        ? "#e59819"
        : review.bookRating === 3
        ? "#c98a10"
        : "#c84126"
      : "#e59819";

  return (
    <article className={`${styles.reviewCard} ${tierBorderClass}`}>
      <div className={styles.reviewCardHeader}>
        <div>
          <div className={styles.reviewAuthorRow}>
            <h3 className={styles.reviewAuthor}>{title ?? review.authorName}</h3>
            {review.status !== "Deleted" && (
              <span className={`${styles.sentimentBadge} ${tierBadgeClass}`}>
                <TierIcon size={12} />
                <span>{tierText}</span>
              </span>
            )}
          </div>
          <p className={styles.meta}>Gửi {reviewDate(review.createdAt)}</p>
        </div>

        <span
          className={`${styles.statusBadge} ${
            review.status === "Published"
              ? styles.statusPublished
              : review.status === "Pending"
              ? styles.statusPending
              : styles.statusOther
          }`}
        >
          {reviewStatusLabels[review.status]}
        </span>
      </div>

      {review.status === "Deleted" ? (
        <p className={styles.deletedText}>
          Đã xóa khỏi hiển thị công khai. Không thể gửi đánh giá mới cho giao dịch này.
        </p>
      ) : (
        <>
          <div className={styles.ratingsRow}>
            {/* Điểm đối tác với dãy 5 sao màu sắc */}
            <div
              className={`${styles.ratingChip} ${
                isPositive
                  ? styles.scoreChipPositive
                  : isNeutral
                  ? styles.scoreChipNeutral
                  : styles.scoreChipNegative
              }`}
            >
              <span className={styles.ratingLabel}>Đối tác:</span>
              <div className={styles.ratingScore} style={{ color: partnerTierColor }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={14}
                    fill={i < review.partnerRating ? partnerTierColor : "none"}
                    stroke={i < review.partnerRating ? partnerTierColor : "rgba(113, 97, 87, 0.35)"}
                  />
                ))}
                <strong>{review.partnerRating}/5</strong>
              </div>
            </div>

            {/* Điểm sách nhận được (nếu có) */}
            {review.bookRating !== null && (
              <div
                className={`${styles.ratingChip} ${
                  review.bookRating >= 4
                    ? styles.scoreChipPositive
                    : review.bookRating === 3
                    ? styles.scoreChipNeutral
                    : styles.scoreChipNegative
                }`}
              >
                <span className={styles.ratingLabel}>Chất lượng sách:</span>
                <div className={styles.ratingScore} style={{ color: bookTierColor }}>
                  <BookOpen size={14} style={{ marginRight: 2 }} />
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={14}
                      fill={i < review.bookRating! ? bookTierColor : "none"}
                      stroke={i < review.bookRating! ? bookTierColor : "rgba(113, 97, 87, 0.35)"}
                    />
                  ))}
                  <strong>{review.bookRating}/5</strong>
                </div>
              </div>
            )}
          </div>

          {review.comment && (
            <div className={!isPositive && !isNeutral ? styles.commentBoxNegative : undefined}>
              <p className={styles.commentText}>{review.comment}</p>
            </div>
          )}

          {review.tags.length > 0 && (
            <div className={styles.tagsRow}>
              {review.tags.map((tag, idx) => (
                <span key={idx} className={styles.tagPill}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {review.status === "Published" && <p><SupportLink type="Review" id={review.id} report /></p>}
      {review.reply && (
        <div className={styles.replyBox}>
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
      setNotice(path.endsWith('/demo-advance') ? 'Đã mô phỏng hết hạn chờ và công bố hai đánh giá.' : "Đã lưu theo xác nhận của máy chủ.");
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

  if (result.isPending) {
    return (
      <div className={styles.skeletonList} aria-busy="true">
        <div className={styles.skeletonCard}>
          <div className={styles.skeletonInfo}>
            <div className={styles.skeletonTitle} />
            <div className={styles.skeletonMeta} />
          </div>
        </div>
      </div>
    );
  }

  const accessDenied =
    result.error instanceof ApiError &&
    [401, 403, 404].includes(result.error.status);

  if (result.isError && (!result.data || accessDenied))
    return (
      <div className={styles.errorCard} role="alert">
        <div className={styles.errorIconWrap}>
          <AlertCircle size={24} />
        </div>
        <div className={styles.errorContent}>
          <h3>Chưa tải được đánh giá</h3>
          <p>Kiểm tra kết nối rồi thử lại.</p>
          <button
            type="button"
            disabled={result.isFetching}
            onClick={() => void result.refetch()}
            className={styles.retryBtn}
          >
            <RefreshCw size={14} className={result.isFetching ? styles.spin : ""} />
            <span>Tải lại đánh giá</span>
          </button>
        </div>
      </div>
    );

  const data = result.data!,
    mine = data.myReview,
    peer = data.partnerReview;
  const editorAvailable = !result.isError && (
    editor === "create" ? data.canReview :
    editor === "edit" ? data.canEdit && !!mine :
    editor === "delete" ? data.canDelete && !!mine :
    editor === "reply" ? data.canReply && !!peer : false
  );

  return (
    <section className={styles.panelContainer} aria-label="Đánh giá giao dịch">
      {/* Top Navigation Breadcrumb */}
      <div className={styles.panelNav}>
        <Link to={`/reviews?tab=pending&type=${type}`} className={styles.backLink}>
          <ArrowLeft size={16} />
          <span>Quay lại danh sách giao dịch</span>
        </Link>
        <span className={styles.codePill}>
          Mã #{id.slice(0, 8).toUpperCase()}
        </span>
      </div>

      {data.awaitingCompletion && <p role="status" className={styles.intro}>Bạn đã nhận sách và có thể viết đánh giá ngay. Trong 72 giờ kiểm tra, tiền vẫn được giữ; nội dung chưa công khai hoặc tính điểm trước khi giao dịch hoàn tất và đủ điều kiện công bố.</p>}
      <div className={styles.panelHeaderCard}>
        <h2>Chi tiết đánh giá giao dịch</h2>
        <p className={styles.intro}>
          Mỗi bên gửi một đánh giá. Bạn có 48 giờ từ lần gửi đầu để sửa hoặc xóa.
          Nội dung chỉ công bố khi hết quyền sửa của cả hai và đủ điều kiện; không
          mở ngay khi đối phương gửi.
        </p>
        {data.deadline && (
          <p className={styles.meta}>
            <Clock size={13} style={{ display: "inline", marginRight: 5, verticalAlign: -1 }} />
            Hạn gửi: <strong>{reviewDate(data.deadline)}</strong> (thời gian theo máy chủ).
          </p>
        )}
      </div>

      {notice && (
        <div role="status" className={styles.statusPublished} style={{ padding: "10px 16px", borderRadius: 10 }}>
          {notice}
        </div>
      )}

      {result.isError && (
        <p role="alert" className={styles.error}>
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
            className={styles.primaryAction}
          >
            {busy ? "Đang xác minh…" : "Thử lại yêu cầu đã gửi"}
          </button>
        </div>
      )}

      <div hidden={uncertain} style={{ display: uncertain ? "none" : "flex", flexDirection: "column", gap: 20 }}>
        <DemoReviewAdvance state={data.demoTimeAdvance} version={mine?.version} partnerId={data.partnerId}
          busy={busy} disabled={!!editor} send={body => send(`/transactions/Exchange/${id}/reviews/demo-advance`, body)} />
        {mine && (
          <div>
            <ReviewContent review={mine} title="Đánh giá của bạn" />
            <p className={styles.meta} style={{ marginTop: 8 }}>
              Hạn sửa/xóa: {reviewDate(mine.editDeadline)}
              {mine.legacyDisclosed ? " · Bản cũ đã được hiển thị, đã khóa sửa." : ""}
              {mine.evidenceHeld ? " · Đang giữ làm bằng chứng." : ""}
            </p>
          </div>
        )}

        {!mine && !data.canReview && (
          <p className={styles.meta}>Giao dịch chưa đủ điều kiện hoặc đã hết hạn gửi đánh giá.</p>
        )}

        {peer ? (
          <ReviewContent review={peer} title="Đánh giá từ đối tác" />
        ) : (
          <div className={styles.reviewCard} style={{ background: "#faf6f0" }}>
            <p className={styles.meta} style={{ margin: 0 }}>
              Chưa có đánh giá đối tác được công bố. Trước thời điểm công bố hoặc khi cả hai bên
              chưa hoàn tất, bạn chỉ xem được bản đánh giá của mình.
            </p>
          </div>
        )}

        <div className={styles.cardActions} style={{ marginTop: 8 }}>
          {data.canReview && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditor("create")}
              className={styles.primaryAction}
            >
              <Star size={15} />
              <span>Viết đánh giá</span>
            </button>
          )}

          {data.canEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditor("edit")}
              className={styles.secondaryAction}
            >
              Sửa đánh giá
            </button>
          )}

          {data.canDelete && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditor("delete")}
              className={styles.secondaryAction}
              style={{ color: "var(--shop-error)" }}
            >
              Xóa đánh giá công khai
            </button>
          )}

          {data.canReply && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditor("reply")}
              className={styles.secondaryAction}
            >
              Phản hồi đánh giá
            </button>
          )}

          <button
            type="button"
            disabled={busy || result.isFetching}
            onClick={() => void result.refetch()}
            className={styles.secondaryAction}
          >
            <RefreshCw size={14} className={result.isFetching ? styles.spin : ""} />
            <span>Tải lại</span>
          </button>
        </div>

        {editor && (
          <ReviewForm
            key={editor}
            mode={editor}
            mine={mine}
            peer={peer}
            bookRequired={data.bookRatingRequired}
            busy={busy}
            available={editorAvailable}
            cancel={() => setEditor(null)}
            send={(body) => {
              if (!editorAvailable) return Promise.resolve(false);
              const targetId = editor === "reply" ? peer?.id : mine?.id;
              if (editor !== "create" && !targetId) return Promise.resolve(false);
              const path =
                editor === "create"
                  ? `/transactions/${type}/${id}/reviews`
                  : `/transaction-reviews/${targetId}/${editor}`;
              return send(path, body);
            }}
          />
        )}
      </div>
    </section>
  );
}

// Bảng mô tả cảm xúc đánh giá
const partnerDescriptions: Record<number, string> = {
  5: "Rất hài lòng — Giao dịch hoàn hảo, chu đáo",
  4: "Hài lòng — Đúng thỏa thuận, nhanh chóng",
  3: "Bình thường — Giao dịch ổn thỏa, đúng hạn",
  2: "Chưa hài lòng — Có điểm chưa đúng hẹn hoặc giao tiếp chậm",
  1: "Rất không hài lòng — Giao dịch có sự cố hoặc thiếu trách nhiệm",
};

const bookDescriptions: Record<number, string> = {
  5: "Sách rất đẹp — Như mới hoặc vượt mong đợi",
  4: "Sách đúng mô tả — Tình trạng đúng như người gửi cam kết",
  3: "Sách ở mức chấp nhận được — Có dấu vết sử dụng",
  2: "Sách xuống cấp — Bị ố bẩn hoặc rách bìa không báo trước",
  1: "Sách hư hỏng nặng — Mất trang hoặc không dùng được",
};

function StarPicker({
  value,
  onChange,
  disabled,
  label,
  descriptions,
}: {
  value: number;
  onChange: (val: number) => void;
  disabled?: boolean;
  label: string;
  descriptions: Record<number, string>;
}) {
  const [hoverVal, setHoverVal] = useState<number | null>(null);
  const activeVal = hoverVal ?? value;

  const getTierColor = (val: number) => {
    if (val >= 4) return "#255c3c";
    if (val === 3) return "#c98a10";
    if (val > 0) return "#c84126";
    return "var(--shop-muted)";
  };

  return (
    <div className={styles.starPickerWrap}>
      <label className={styles.starPickerTitle}>{label}</label>
      <div className={styles.starPickerRow} onMouseLeave={() => setHoverVal(null)}>
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled = star <= activeVal;
          const starColor =
            activeVal >= 4
              ? "#e59819"
              : activeVal === 3
              ? "#c98a10"
              : activeVal > 0
              ? "#c84126"
              : "#e59819";

          return (
            <button
              key={star}
              type="button"
              disabled={disabled}
              className={styles.starPickerBtn}
              onClick={() => onChange(star)}
              onMouseEnter={() => setHoverVal(star)}
              aria-label={`${star} sao`}
            >
              <Star
                size={26}
                fill={isFilled ? starColor : "none"}
                stroke={isFilled ? starColor : "rgba(113, 97, 87, 0.35)"}
                className={isFilled ? styles.pickerStarActive : styles.pickerStarInactive}
              />
            </button>
          );
        })}

        <span
          className={styles.starPickerFeedback}
          style={{ color: getTierColor(activeVal) }}
        >
          {activeVal > 0 ? (
            <strong>
              {activeVal}/5 · {descriptions[activeVal] ?? ""}
            </strong>
          ) : (
            <span className={styles.starPickerPlaceholder}>Bấm để chọn số sao</span>
          )}
        </span>
      </div>
    </div>
  );
}

function ReviewForm({
  mode,
  mine,
  peer,
  bookRequired,
  busy,
  available,
  cancel,
  send,
}: {
  mode: string;
  mine: TransactionReview | null;
  peer: TransactionReview | null;
  bookRequired: boolean;
  busy: boolean;
  available: boolean;
  cancel: () => void;
  send: (body: unknown) => Promise<boolean>;
}) {
  const [partner, setPartner] = useState<number>(
    mode === "edit" && mine ? mine.partnerRating : 5,
  );
  const [book, setBook] = useState<number>(
    mode === "edit" && mine?.bookRating !== null && mine?.bookRating !== undefined
      ? mine.bookRating
      : 5,
  );
  const [text, setText] = useState(
    mode === "edit" ? (mine?.comment ?? "") : "",
  );
  const [version, setVersion] = useState(
    (mode === "reply" ? peer : mine)?.version,
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !available) return;
    const body =
      mode === "delete"
        ? { expectedVersion: version }
        : mode === "reply"
          ? { expectedVersion: version, text }
          : {
              partnerRating: partner,
              ...(bookRequired ? { bookRating: book } : {}),
              comment: text,
              ...(mode === "edit"
                ? { expectedVersion: version, tags: mine?.tags ?? [] }
                : {}),
            };
    void send(body);
  }

  return (
    <div className={styles.formCard}>
      <h3>
        {mode === "reply"
          ? "Phản hồi đánh giá của đối tác"
          : mode === "delete"
          ? "Xác nhận xóa"
          : "Soạn đánh giá giao dịch"}
      </h3>
      {!available && (
        <p role="status" className={styles.meta}>
          Chưa thể gửi theo trạng thái hiện tại. Bản nháp vẫn được giữ; tải lại
          đánh giá để kiểm tra.
        </p>
      )}
      <form
        className={styles.formGrid}
        onSubmit={submit}
        aria-label={mode === "reply" ? "Phản hồi đánh giá" : "Soạn đánh giá"}
      >
        {mode === "delete" ? (
          <p className={styles.meta}>
            Xóa khỏi hiển thị công khai? Lịch sử giao dịch vẫn được giữ và bạn không thể gửi
            lại đánh giá cho giao dịch này.
          </p>
        ) : (
          <>
            {mode !== "reply" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Chọn điểm đối tác tương tác 5 sao */}
                <StarPicker
                  label="Điểm đối tác (Thái độ, thời gian, uy tín)"
                  value={partner}
                  onChange={setPartner}
                  disabled={busy}
                  descriptions={partnerDescriptions}
                />

                {/* Chọn chất lượng sách tương tác 5 sao (nếu có yêu cầu) */}
                {bookRequired && (
                  <StarPicker
                    label="Chất lượng sách thực tế nhận được"
                    value={book}
                    onChange={setBook}
                    disabled={busy}
                    descriptions={bookDescriptions}
                  />
                )}
              </div>
            )}

            <div className={styles.fieldGroup}>
              <label htmlFor="commentTextarea">
                {mode === "reply"
                  ? "Nội dung phản hồi"
                  : "Nhận xét chi tiết (không bắt buộc)"}
              </label>
              <textarea
                id="commentTextarea"
                autoFocus
                required={mode === "reply"}
                maxLength={1000}
                value={text}
                disabled={busy}
                onChange={(e) => setText(e.target.value)}
                placeholder="Chia sẻ trải nghiệm đóng gói, thái độ giao tiếp hoặc tình trạng thực tế của sách..."
                className={styles.textareaInput}
              />
              <p className={styles.meta} style={{ marginTop: 4 }}>
                {text.length}/1.000 ký tự. Không đưa số điện thoại, địa chỉ hoặc thông tin riêng vào nội dung công khai.
              </p>
            </div>
          </>
        )}

        {version !== undefined &&
          version !== (mode === "reply" ? peer : mine)?.version && (
            <button
              type="button"
              onClick={() =>
                setVersion((mode === "reply" ? peer : mine)?.version)
              }
              className={styles.secondaryAction}
            >
              Dùng phiên bản hiện tại, giữ bản nháp
            </button>
          )}

        <div className={styles.formActions}>
          <button type="submit" disabled={busy || !available} className={styles.primaryAction}>
            {busy
              ? "Đang gửi…"
              : mode === "delete"
                ? "Xác nhận xóa"
                : mode === "reply"
                  ? "Gửi phản hồi"
                  : "Lưu đánh giá"}
          </button>
          <button type="button" disabled={busy} onClick={cancel} className={styles.secondaryAction}>
            Đóng bản nháp
          </button>
        </div>
      </form>
    </div>
  );
}
