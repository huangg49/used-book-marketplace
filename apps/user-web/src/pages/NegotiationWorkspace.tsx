import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "@used-books/session-client";
import {
  BookOpen,
  Handshake,
  Check,
  CheckCircle2,
  ExternalLink,
  MapPin,
  Package,
  Clock,
  ChevronDown,
  ShieldCheck,
  AlertCircle,
  Tag,
  ArrowLeftRight,
  PencilLine,
  X,
} from "lucide-react";
import { BrandIcon } from "../components/BrandIcon";
import {
  changeConversationTerms,
  type PurchaseConversation,
  type TermsProposalBody,
  type TermsResponseBody,
} from "../services/purchase-conversations";
import type { PublicListing } from "../services/public-listings";
import { ListingPhoto } from "../components/BookCard";
import { BundleManifest } from "../components/BookBundle";
import { conditions } from "../lib/listing-labels";
import { formatVnd } from "../lib/routes";
import { purchaseChatGuidance } from "../lib/purchase-chat-guidance";
import { ExchangeOffer } from "../components/conversation/ExchangeOffer";
import { ExchangeDetailPage } from "./ExchangeDetailPage";
import styles from "./DirectOrders.module.css";
import sheetStyles from "../components/conversation/Conversation.module.css";

export function NegotiationWorkspace({
  room,
  userId,
  book,
  refresh,
  frozen = false,
  guidance,
  onOpenOrderDialog,
  historyExchange,
  setHistoryExchange,
}: {
  room: PurchaseConversation;
  userId: string;
  book?: PublicListing;
  refresh: () => void;
  frozen?: boolean;
  guidance: ReturnType<typeof purchaseChatGuidance>;
  onOpenOrderDialog: () => void;
  historyExchange: string | null;
  setHistoryExchange: (id: string | null) => void;
  now?: number;
  expired?: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<{
    body: TermsProposalBody | TermsResponseBody;
    key: string;
  } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);

  const seller = room.seller.id === userId;
  const isBuyer = room.buyer.id === userId;
  const terms = room.terms;
  const proposal = terms?.pendingProposal;
  const isExchange = terms?.mode === "Exchange";

  const locked =
    terms?.locked ||
    room.status !== "Active" ||
    !book ||
    book.purchaseAvailability.status !== "Available";

  async function command(body: TermsProposalBody | TermsResponseBody) {
    if (busy) return;
    pending.current ??= { body, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      await changeConversationTerms(
        room.id,
        pending.current.body,
        pending.current.key,
      );
      pending.current = null;
      setUncertain(false);
      setAmount("");
      setEditingPrice(false);
      refresh();
    } catch (e) {
      const terminal =
        e instanceof ApiError && [400, 403, 404, 409, 422].includes(e.status);
      if (terminal) {
        pending.current = null;
        setUncertain(false);
        refresh();
      } else {
        setUncertain(true);
      }
      setError(
        terminal
          ? "Điều kiện hoặc phiếu vừa thay đổi. Kiểm tra nội dung mới trước khi gửi lại."
          : "Chưa xác nhận được kết quả. Thử lại sẽ giữ đúng đề nghị vừa gửi.",
      );
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || uncertain || locked || frozen;
  const mode = terms?.mode ?? "Negotiation";
  const conditionLabel = book ? conditions[book.condition] : undefined;

  return (
    <div className={styles.orderTwoColumns}>
      {/* ========================================================
          KHUNG 1 (BÊN TRÁI): THÔNG TIN SÁCH
          ======================================================== */}
      <article className={styles.bookInfoCard} aria-labelledby="negotiation-book-heading">
        {/* Header khung Thông tin sách */}
        <div className={styles.cardHeader}>
          <div className={styles.cardHeaderIcon} aria-hidden="true">
            <BookOpen size={20} />
          </div>
          <div>
            <h3 id="negotiation-book-heading" className={styles.cardTitle}>
              Thông tin sách
            </h3>
            <p className={styles.cardSubtitle}>Chi tiết ấn bản và thanh toán</p>
          </div>
        </div>

        <div className={styles.cardContent}>
          {/* Ảnh & thông tin tiêu đề sách */}
          <div className={styles.bookProfileRow}>
            <div className={styles.bookCoverWrapper}>
              {book ? (
                <ListingPhoto book={book} eager fallbackCover />
              ) : (
                <div className={styles.placeholderCover} aria-hidden="true">
                  <BookOpen size={28} />
                </div>
              )}
            </div>

            <div className={styles.bookProfileMeta}>
              <h4 className={styles.bookTitle}>
                {book?.bundle?.title || book?.book.title || "Đang tải thông tin sách…"}
              </h4>
              <p className={styles.bookAuthor}>
                {book?.book.authors?.join(", ") || (book ? "Tác giả" : "Đang tải thông tin tác giả…")}
              </p>

              {conditionLabel && (
                <div className={styles.conditionRow}>
                  <span className={styles.conditionTag}>
                    Tình trạng: {conditionLabel}
                  </span>
                </div>
              )}

              <Link
                to={`/books/${room.listingId}`}
                className={styles.viewListingLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>Xem bài đăng gốc</span>
                <ExternalLink size={13} aria-hidden="true" />
              </Link>
            </div>
          </div>

          {/* Bundle manifest nếu là combo */}
          {book?.bundle && (
            <div className={styles.bundleSection}>
              <BundleManifest bundle={book.bundle} />
            </div>
          )}

          {/* Chi tiết tình trạng & số trang */}
          <div className={styles.specList}>
            <div className={styles.specItem}>
              <span className={styles.specLabel}>Bìa & gáy:</span>
              <span className={styles.specVal}>{book?.coverNote || "Tốt"}</span>
            </div>
            <div className={styles.specItem}>
              <span className={styles.specLabel}>Số trang:</span>
              <span className={styles.specVal}>{book?.pages || "Tốt"}</span>
            </div>
            {(book?.notes || book?.description) && (
              <div className={styles.descriptionBlock}>
                <span className={styles.specLabel}>Ghi chú người bán:</span>
                <p className={styles.descriptionText}>
                  {book.notes || book.description}
                </p>
              </div>
            )}
            {book?.exchangePreferences &&
              Boolean(
                book.exchangePreferences.targetCategory ||
                  book.exchangePreferences.targetAuthor ||
                  book.exchangePreferences.targetDescription,
              ) && (
                <div className={styles.exchangePrefBlock}>
                  <div className={styles.exchangePrefHeading}>
                    <BrandIcon size={16} />
                    <span>Tiêu chí mong muốn khi đổi</span>
                  </div>
                  {book.exchangePreferences.targetCategory && (
                    <div className={styles.specItem}>
                      <span className={styles.specLabel}>Thể loại:</span>
                      <span className={styles.specVal}>{book.exchangePreferences.targetCategory}</span>
                    </div>
                  )}
                  {book.exchangePreferences.targetAuthor && (
                    <div className={styles.specItem}>
                      <span className={styles.specLabel}>Tác giả:</span>
                      <span className={styles.specVal}>{book.exchangePreferences.targetAuthor}</span>
                    </div>
                  )}
                  {book.exchangePreferences.targetDescription && (
                    <div className={styles.descriptionBlock}>
                      <span className={styles.specLabel}>Ghi chú:</span>
                      <p className={styles.descriptionText}>
                        {book.exchangePreferences.targetDescription}
                      </p>
                    </div>
                  )}
                </div>
              )}
          </div>

          {/* Bảng chi tiết thanh toán */}
          <div className={styles.paymentCard}>
            <div className={styles.paymentCardHeader}>
              <span className={styles.paymentHeading}>Chi tiết thanh toán</span>
              <span className={styles.paymentModeBadge}>
                {mode === "Exchange" ? "Đổi sách" : "Thương lượng"}
              </span>
            </div>

            <dl className={styles.paymentDl}>
              <div className={styles.paymentRow}>
                <dt>Tiền sách</dt>
                <dd>
                  {terms?.agreedPrice != null
                    ? formatVnd(terms.agreedPrice)
                    : book?.salePrice != null
                      ? formatVnd(book.salePrice)
                      : "Chưa thống nhất"}
                </dd>
              </div>

              <div className={styles.paymentRow}>
                <dt>Phí giao hàng</dt>
                <dd>
                  {room.quotePreview
                    ? formatVnd(room.quotePreview.shippingFee)
                    : "Chưa tính"}
                </dd>
              </div>

              <div className={`${styles.paymentRow} ${styles.paymentTotalRow}`}>
                <dt>Tổng thanh toán</dt>
                <dd>
                  {terms?.agreedPrice != null
                    ? formatVnd(terms.agreedPrice + (room.quotePreview?.shippingFee ?? 0))
                    : book?.salePrice != null
                      ? formatVnd(book.salePrice + (room.quotePreview?.shippingFee ?? 0))
                      : "Chưa tính"}
                </dd>
              </div>
            </dl>

            {/* Thông báo ký quỹ bảo chứng an toàn */}
            <div className={styles.escrowNotice}>
              <div className={styles.escrowUnpaid}>
                <Clock size={18} className={styles.escrowIconUnpaid} aria-hidden="true" />
                <div>
                  <p className={styles.escrowTitle}>
                    {terms?.agreedPrice != null ? "Đã thống nhất giá sách" : "Chưa chốt giá sách"}
                  </p>
                  <p className={styles.escrowSubtitle}>
                    {room.hasQuote
                      ? "Đã có báo giá vận chuyển. Hai bên có thể tiến hành tạo đơn hàng."
                      : "Sau khi thống nhất giá và nhận thông tin giao nhận, đơn sẽ được tạo và bảo chứng bởi Lật Lại."}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Địa chỉ nhận sách (nếu người mua đã gửi báo giá vận chuyển) */}
          {room.quotePreview && (
            <div className={styles.addressBox}>
              <div className={styles.addressBoxHeader}>
                <MapPin size={16} aria-hidden="true" />
                <span>{isBuyer ? "Địa chỉ nhận sách của bạn" : "Nơi nhận của người mua"}</span>
              </div>
              <p className={styles.addressContact}>
                <strong>{room.quotePreview.destination.recipientName}</strong> · {room.quotePreview.destination.phone}
              </p>
              <p className={styles.addressDetail}>
                {room.quotePreview.destination.detail}
              </p>
            </div>
          )}
        </div>
      </article>

      {/* ========================================================
          KHUNG 2 (BÊN PHẢI): THỎA THUẬN GIAO DỊCH
          ======================================================== */}
      <article className={styles.orderProceduresCard} aria-labelledby="negotiation-terms-heading">
        {/* Header khung Thỏa thuận giao dịch */}
        <div className={styles.cardHeader}>
          <div className={styles.cardHeaderIcon} aria-hidden="true">
            {isExchange ? <ArrowLeftRight size={20} /> : <Handshake size={20} />}
          </div>
          <div className={styles.proceduresHeaderInfo}>
            <div className={styles.proceduresTitleRow}>
              <h3 id="negotiation-terms-heading" className={styles.cardTitle}>
                Thỏa thuận giao dịch
              </h3>
              <span
                className={styles.orderStatusPill}
                style={{
                  background: proposal ? "#fff2e0" : terms?.agreedPrice != null ? "#eaf8ed" : "#f4eee5",
                  color: proposal ? "#875109" : terms?.agreedPrice != null ? "#156633" : "#5c0202",
                  border: "1px solid rgba(0,0,0,0.08)",
                }}
              >
                {proposal
                  ? "Có đề nghị mới"
                  : terms?.agreedPrice != null
                  ? "Đã chốt giá"
                  : isExchange
                  ? "Đổi sách"
                  : "Đang thương lượng"}
              </span>
            </div>
            <p className={styles.cardSubtitle}>
              Mã hội thoại: <span className={styles.orderCodeBadge}>#{room.id.slice(0, 8).toUpperCase()}</span> · {isBuyer ? "Bạn là Người mua" : "Bạn là Người bán"}
            </p>
          </div>
        </div>

        <div className={styles.cardContent}>
          {/* 1. Bộ chuyển đổi hình thức giao dịch (Mode Switcher) */}
          <div className={styles.modeSwitchWrapper}>
            <div className={styles.modeSwitchHeader}>
              <span>Hình thức giao dịch:</span>
              {!seller && (
                <span style={{ color: "#5c0202", fontWeight: 700 }}>
                  {mode === "Exchange" ? "Đổi sách" : "Thương lượng mua"}
                </span>
              )}
            </div>

            {seller && (
              <div
                className={styles.modeSwitchGroup}
                role="group"
                aria-label="Người bán chọn hình thức"
              >
                {(["Negotiation", "Exchange"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={styles.modeSwitchBtn}
                    aria-pressed={mode === value}
                    disabled={
                      disabled ||
                      !!proposal ||
                      mode === value ||
                      (value === "Exchange" && book?.mode === "Sale") ||
                      (value === "Negotiation" && book?.mode === "Exchange")
                    }
                    onClick={() =>
                      void command({
                        expectedVersion: room.version,
                        kind: "Mode",
                        mode: value,
                      })
                    }
                  >
                    {mode === value && <Check size={14} aria-hidden="true" />}
                    <span>{value === "Negotiation" ? "Thương lượng mua" : "Đổi sách"}</span>
                  </button>
                ))}
              </div>
            )}

            {!seller &&
              mode === "Negotiation" &&
              book?.mode === "Both" &&
              !proposal &&
              !locked && (
                <button
                  type="button"
                  className={styles.secondaryActionBtn}
                  style={{ minHeight: 36, fontSize: "0.8125rem", marginTop: 4 }}
                  disabled={disabled}
                  onClick={() =>
                    void command({
                      expectedVersion: room.version,
                      kind: "RequestExchange",
                    })
                  }
                >
                  <ArrowLeftRight size={14} />
                  <span>Đề nghị đổi sách với người bán</span>
                </button>
              )}
          </div>

          {/* Proposal Banner: Đề nghị mới (về giá hoặc chuyển đổi hình thức) - luôn hiển thị ưu tiên khi có đề nghị */}
          {proposal && (
            <div className={styles.proposalCard}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Tag size={16} color="#875109" />
                <p className={styles.proposalText}>
                  <strong>
                    {proposal.proposedById === userId
                      ? "Bạn vừa đề nghị"
                      : "Đối tác đề nghị"}
                  </strong>{" "}
                  {proposal.kind === "Price" ? (
                    <>
                      giá sách{" "}
                      <strong style={{ color: "#5c0202", fontSize: "1rem" }}>
                        {formatVnd(proposal.amount!)}
                      </strong>
                    </>
                  ) : (
                    <>
                      chuyển sang hình thức{" "}
                      <strong>
                        {proposal.mode === "Exchange"
                          ? "Đổi sách"
                          : "Thương lượng mua"}
                      </strong>
                    </>
                  )}
                </p>
              </div>

              {proposal.proposedById !== userId ? (
                <div className={styles.proposalActions}>
                  <button
                    type="button"
                    className={styles.primaryActionBtn}
                    style={{ minHeight: 38, fontSize: "0.8125rem" }}
                    disabled={disabled}
                    onClick={() =>
                      void command({
                        expectedVersion: room.version,
                        proposalId: proposal.id,
                        accept: true,
                      })
                    }
                  >
                    <Check size={15} />
                    <span>Chấp nhận {proposal.kind === "Price" ? "giá này" : "hình thức"}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryActionBtn}
                    style={{ minHeight: 38, fontSize: "0.8125rem" }}
                    disabled={disabled}
                    onClick={() =>
                      void command({
                        expectedVersion: room.version,
                        proposalId: proposal.id,
                        accept: false,
                      })
                    }
                  >
                    <X size={15} />
                    <span>Từ chối</span>
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                  <span style={{ fontSize: "0.75rem", color: "#875109" }}>
                    Đang chờ đối tác phản hồi. Đề nghị chưa giữ sách.
                  </span>
                  <button
                    type="button"
                    style={{
                      background: "none",
                      border: 0,
                      color: "#912b0e",
                      textDecoration: "underline",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                    disabled={disabled}
                    onClick={() =>
                      void command({
                        expectedVersion: room.version,
                        proposalId: proposal.id,
                        accept: false,
                      })
                    }
                  >
                    Rút đề nghị
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 2. Nếu là Thương lượng mua (Negotiation) */}
          {mode === "Negotiation" && (
            <div className={styles.procedureSection}>
              {/* Box xác nhận giá đã thống nhất */}
              {terms?.agreedPrice != null && !proposal && (
                <div className={styles.priceAgreedBox}>
                  <div className={styles.priceAgreedText}>
                    <CheckCircle2 size={18} />
                    <span>Đã thống nhất giá: {formatVnd(terms.agreedPrice)}</span>
                  </div>
                  {!locked && !editingPrice && (
                    <button
                      type="button"
                      style={{
                        background: "none",
                        border: 0,
                        color: "#5c0202",
                        textDecoration: "underline",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                      disabled={disabled}
                      onClick={() => setEditingPrice(true)}
                    >
                      Đề nghị giá khác
                    </button>
                  )}
                </div>
              )}

              {/* Form đề xuất giá (nếu chưa chốt hoặc bấm sửa) */}
              {!locked && !proposal && (terms?.agreedPrice == null || editingPrice) && (
                <form
                  className={styles.negotiationOfferForm}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const value = Number(amount);
                    if (
                      !Number.isInteger(value) ||
                      value < 10000 ||
                      value > 1000000
                    ) {
                      setError("Nhập giá từ 10.000đ đến 1.000.000đ.");
                      return;
                    }
                    void command({
                      expectedVersion: room.version,
                      kind: "Price",
                      amount: value,
                    });
                  }}
                >
                  <label
                    htmlFor={`offer-${room.id}`}
                    style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#4a3b32" }}
                  >
                    {terms?.agreedPrice != null
                      ? "Đề nghị mức giá mới (₫):"
                      : "Đề nghị giá sách mong muốn (₫):"}
                  </label>
                  <div className={styles.negotiationOfferRow}>
                    <input
                      id={`offer-${room.id}`}
                      inputMode="numeric"
                      type="text"
                      pattern="[0-9]+"
                      value={amount}
                      disabled={disabled}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Ví dụ: 45000"
                      required
                    />
                    <button type="submit" disabled={disabled || !amount}>
                      {busy ? "Đang gửi…" : "Gửi đề nghị"}
                    </button>
                  </div>
                  {terms?.agreedPrice != null && (
                    <button
                      type="button"
                      style={{
                        alignSelf: "flex-start",
                        background: "none",
                        border: 0,
                        color: "#716157",
                        textDecoration: "underline",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                        marginTop: 2,
                      }}
                      disabled={disabled}
                      onClick={() => setEditingPrice(false)}
                    >
                      Giữ nguyên giá đã thống nhất
                    </button>
                  )}
                </form>
              )}

              {/* Cảnh báo thay đổi ấn bản */}
              {terms?.agreedPrice != null &&
                book &&
                terms.agreedListingRevisionId !== book.revisionId && (
                  <div className={styles.procedureNoticeWarning}>
                    <AlertCircle size={18} />
                    <div>
                      <h4>Bài đăng đã cập nhật nội dung</h4>
                      <p>
                        Thông tin bài đăng đã thay đổi kể từ lần chốt giá. Hai bên cần thống nhất lại giá trước khi tạo đơn.
                      </p>
                    </div>
                  </div>
                )}

              {/* 3. Khung thủ tục hành động tiếp theo (Next Step Box) */}
              <div className={styles.procedureNoticeInfo}>
                <Clock size={20} />
                <div style={{ flex: 1 }}>
                  <h4>{guidance.title}</h4>
                  <p>{guidance.description}</p>

                  {/* Tiến trình 4 bước chuẩn bị tạo đơn */}
                  <div className={styles.stepperMini}>
                    <div className={`${styles.stepperMiniItem} ${terms?.agreedPrice != null ? styles.stepperMiniDone : styles.stepperMiniActive}`}>
                      <span className={styles.stepperMiniDot}>
                        {terms?.agreedPrice != null ? <Check size={11} strokeWidth={3} /> : "1"}
                      </span>
                      <span>
                        {terms?.agreedPrice != null
                          ? `Đã thống nhất giá: ${formatVnd(terms.agreedPrice)}`
                          : "1. Thống nhất giá sách"}
                      </span>
                    </div>

                    <div
                      className={`${styles.stepperMiniItem} ${
                        guidance.action === "edit-listing"
                          ? styles.stepperMiniError
                          : styles.stepperMiniDone
                      }`}
                    >
                      <span className={styles.stepperMiniDot}>
                        {guidance.action === "edit-listing" ? (
                          <AlertCircle size={11} />
                        ) : (
                          <Check size={11} strokeWidth={3} />
                        )}
                      </span>
                      <span>
                        {guidance.action === "edit-listing"
                          ? "2. Cần cập nhật nơi gửi sách"
                          : "2. Nơi gửi sách của người bán"}
                      </span>
                    </div>

                    <div
                      className={`${styles.stepperMiniItem} ${
                        room.hasQuote && room.quotePreview
                          ? styles.stepperMiniDone
                          : terms?.agreedPrice != null && guidance.action !== "edit-listing"
                          ? styles.stepperMiniActive
                          : ""
                      }`}
                    >
                      <span className={styles.stepperMiniDot}>
                        {room.hasQuote && room.quotePreview ? (
                          <Check size={11} strokeWidth={3} />
                        ) : (
                          "3"
                        )}
                      </span>
                      <span>
                        {room.hasQuote && room.quotePreview
                          ? `3. Đã có phí giao hàng: ${formatVnd(room.quotePreview.shippingFee)}`
                          : "3. Địa chỉ nhận & phí giao hàng"}
                      </span>
                    </div>

                    <div
                      className={`${styles.stepperMiniItem} ${
                        guidance.action === "create-order"
                          ? styles.stepperMiniActive
                          : ""
                      }`}
                    >
                      <span className={styles.stepperMiniDot}>4</span>
                      <span>4. Người bán tạo đơn hàng</span>
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    {guidance.action === "edit-listing" && (
                      <Link
                        className={styles.primaryActionBtn}
                        to={`/my-books/${room.listingId}/edit`}
                      >
                        <PencilLine size={16} />
                        <span>{guidance.actionLabel || "Cập nhật nơi gửi sách"}</span>
                      </Link>
                    )}

                    {guidance.action === "address" && !room.terms?.locked && (
                      <Link
                        className={styles.primaryActionBtn}
                        to={`/checkout/${room.listingId}?conversationId=${room.id}`}
                      >
                        <MapPin size={16} />
                        <span>{guidance.actionLabel}</span>
                      </Link>
                    )}

                    {guidance.action === "create-order" && (
                      <button
                        className={styles.primaryActionBtn}
                        type="button"
                        onClick={onOpenOrderDialog}
                      >
                        <Package size={16} />
                        <span>Tạo đơn cho người mua này</span>
                      </button>
                    )}

                    {!guidance.action && (
                      <p style={{ margin: 0, fontSize: "0.75rem", color: "#145091", fontStyle: "italic" }}>
                        {isBuyer
                          ? "Trao đổi thêm với người bán ở khung chat bên phải để thống nhất giá sách."
                          : "Trao đổi với người mua ở khung chat bên phải để thống nhất giá."}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. Nếu là Đổi sách (Exchange) */}
          {mode === "Exchange" && (
            <div className={styles.procedureSection}>
              {historyExchange ? (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#5c0202" }}>
                      Đang xem đề nghị đổi sách trước đó
                    </span>
                    <button
                      type="button"
                      className={styles.secondaryActionBtn}
                      style={{ minHeight: 32, padding: "4px 12px", fontSize: "0.75rem" }}
                      onClick={() => setHistoryExchange(null)}
                    >
                      Về phiếu hiện tại
                    </button>
                  </div>
                  <ExchangeDetailPage key={historyExchange} exchangeId={historyExchange} embedded />
                </div>
              ) : room.terms?.activeExchangeId ? (
                <ExchangeDetailPage key={room.terms.activeExchangeId} exchangeId={room.terms.activeExchangeId} embedded />
              ) : book && !room.terms?.pendingProposal && !room.terms?.locked ? (
                <ExchangeOffer room={room} userId={userId} book={book} refresh={refresh} />
              ) : (
                <div className={styles.procedureNoticeInfo}>
                  <p>
                    {seller
                      ? "Chế độ Đổi sách đang hoạt động. Chờ người mua chọn sách từ tủ sách để gửi đề nghị đổi, hoặc trao đổi thêm ở khung chat bên phải."
                      : "Chưa có đề nghị đổi sách nào đang hoạt động."}
                  </p>
                </div>
              )}

              {/* Lịch sử đổi sách nếu có nhiều lần */}
              {!!room.terms?.exchangeIds.length &&
                (room.terms.exchangeIds.length > 1 || !room.terms.activeExchangeId) && (
                  <details className={sheetStyles.exchangeHistory} style={{ marginTop: 8 }}>
                    <summary>Lịch sử các đề nghị đổi sách ({room.terms.exchangeIds.length} lần)</summary>
                    {room.terms.exchangeIds.map((id, i) => (
                      <button
                        type="button"
                        key={id}
                        className={sheetStyles.textButton}
                        onClick={() => setHistoryExchange(id)}
                        style={{ display: "block", margin: "4px 0" }}
                      >
                        Xem đề nghị lần {i + 1}
                        {id === room.terms?.activeExchangeId ? " — hiện tại" : ""}
                      </button>
                    ))}
                  </details>
                )}
            </div>
          )}

          {/* Error nếu có */}
          {error && (
            <div className={styles.procedureNoticeWarning}>
              <AlertCircle size={16} />
              <p style={{ margin: 0 }}>{error}</p>
            </div>
          )}

          {uncertain && (
            <button
              type="button"
              className={styles.secondaryActionBtn}
              disabled={busy}
              onClick={() => pending.current && void command(pending.current.body)}
            >
              Thử lại thao tác trước
            </button>
          )}

          {/* 4. Accordion Cách giao dịch */}
          <details className={styles.guidanceAccordion}>
            <summary>
              <span>Quy trình giao dịch trên Lật Lại</span>
              <ChevronDown size={14} aria-hidden="true" />
            </summary>
            <ol className={styles.guidanceSteps}>
              <li>
                <strong>Thương lượng:</strong> Hai bên trao đổi qua chat và thống nhất giá hoặc sách đổi.
              </li>
              <li>
                <strong>Thông tin nhận sách:</strong> Người mua nhập địa chỉ để hệ thống báo giá giao nhận.
              </li>
              <li>
                <strong>Tạo & thanh toán đơn:</strong> Người bán tạo đơn, người mua thanh toán tiền giữ trong quỹ ký quỹ an toàn.
              </li>
            </ol>
          </details>

          {/* 5. Huy hiệu cam kết bảo đảm giao dịch an toàn */}
          <div className={styles.trustBanner}>
            <div className={styles.trustBannerIcon} aria-hidden="true">
              <ShieldCheck size={16} />
            </div>
            <div className={styles.trustBannerContent}>
              <strong className={styles.trustBannerTitle}>
                Bảo vệ giao dịch an toàn bởi Lật Lại
              </strong>
              <p className={styles.trustBannerDesc}>
                Khoản thanh toán được bảo chứng qua Quỹ ký quỹ và áp dụng quy trình kiểm định hàng trong 72h.
              </p>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
