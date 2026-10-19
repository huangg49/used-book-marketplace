import { useRef, useState } from "react";
import { ApiError } from "@used-books/session-client";
import { Check } from "lucide-react";
import {
  changeConversationTerms,
  type PurchaseConversation,
  type TermsProposalBody,
  type TermsResponseBody,
} from "../../services/purchase-conversations";
import type { PublicListing } from "../../services/public-listings";
import { formatVnd } from "../../lib/routes";
import styles from "./Conversation.module.css";

export function AgreementTerms({
  room,
  userId,
  book,
  refresh,
  frozen = false,
}: {
  room: PurchaseConversation;
  userId: string;
  book?: PublicListing;
  refresh: () => void;
  frozen?: boolean;
}) {
  const [amount, setAmount] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<{
    body: TermsProposalBody | TermsResponseBody;
    key: string;
  } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);
  const seller = room.seller.id === userId,
    terms = room.terms,
    proposal = terms?.pendingProposal;
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
      } else setUncertain(true);
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
  return (
    <section className={styles.terms} aria-label="Hình thức và thỏa thuận">
      <div className={styles.modeLine}>
        <h3>Hình thức giao dịch</h3>
        {!seller && (
          <p className={styles.mode}>
            {mode === "Exchange" ? "Đổi sách" : "Thương lượng mua"}
          </p>
        )}
      </div>
      {seller && (
        <div
          className={styles.switch}
          role="group"
          aria-label="Người bán chọn hình thức"
        >
          {(["Negotiation", "Exchange"] as const).map((value) => (
            <button
              key={value}
              type="button"
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
              {mode === value && <Check size={15} aria-hidden="true" />}
              {value === "Negotiation" ? "Thương lượng mua" : "Đổi sách"}
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
            className={`${styles.textButton} ${styles.exchangeRequest}`}
            type="button"
            disabled={disabled}
            onClick={() =>
              void command({
                expectedVersion: room.version,
                kind: "RequestExchange",
              })
            }
          >
            Đề nghị đổi sách
          </button>
        )}
      {proposal && (
        <div className={styles.proposal}>
          <p>
            {proposal.proposedById === userId
              ? "Bạn đề nghị"
              : "Đối tác đề nghị"}{" "}
            {proposal.kind === "Price" ? (
              <>
                giá sách <strong>{formatVnd(proposal.amount!)}</strong>
              </>
            ) : (
              <>
                chuyển sang{" "}
                <strong>
                  {proposal.mode === "Exchange"
                    ? "đổi sách"
                    : "thương lượng mua"}
                </strong>
              </>
            )}
            .
          </p>
          {proposal.proposedById !== userId ? (
            <div className={styles.actions}>
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  void command({
                    expectedVersion: room.version,
                    proposalId: proposal.id,
                    accept: true,
                  })
                }
              >
                Chấp nhận {proposal.kind === "Price" ? "giá" : "hình thức"}
              </button>
              <button
                type="button"
                className={styles.secondary}
                disabled={disabled}
                onClick={() =>
                  void command({
                    expectedVersion: room.version,
                    proposalId: proposal.id,
                    accept: false,
                  })
                }
              >
                Từ chối
              </button>
            </div>
          ) : (
            <>
              <p className={styles.help}>
                Đang chờ đối tác phản hồi. Đề nghị chưa giữ sách.
              </p>
              <button
                type="button"
                className={styles.textButton}
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
            </>
          )}
        </div>
      )}
      {mode === "Negotiation" && (
        <>
          <dl className={`${styles.totals} ${styles.priceSummary}`}>
            <div
              className={styles.asking}
              data-featured={terms?.agreedPrice == null}
            >
              <dt>Giá niêm yết</dt>
              <dd>
                {book?.salePrice != null
                  ? formatVnd(book.salePrice)
                  : "Đang tải…"}
              </dd>
            </div>
            <div
              className={styles.agreed}
              data-agreed={terms?.agreedPrice != null || undefined}
            >
              <dt>Giá đã thống nhất</dt>
              <dd>
                {terms?.agreedPrice != null
                  ? formatVnd(terms.agreedPrice)
                  : "Chưa thống nhất"}
              </dd>
            </div>
          </dl>
          <p className={styles.priceNote}>Chưa gồm phí giao nhận.</p>
          {terms?.agreedPrice != null &&
            book &&
            terms.agreedListingRevisionId !== book.revisionId && (
              <p className={styles.error}>
                Bài đăng đã thay đổi từ lần chốt giá. Hai bên cần thống nhất giá
                mới trước khi tạo đơn.
              </p>
            )}
          {!locked &&
            !proposal &&
            terms?.agreedPrice != null &&
            !editingPrice && (
              <button
                type="button"
                className={styles.textButton}
                disabled={disabled}
                onClick={() => setEditingPrice(true)}
              >
                Đề nghị giá khác
              </button>
            )}
          {!locked &&
            !proposal &&
            (terms?.agreedPrice == null || editingPrice) && (
              <form
                className={styles.offerForm}
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
                <label htmlFor={`offer-${room.id}`}>
                  {terms?.agreedPrice != null
                    ? "Đề nghị giá khác (₫)"
                    : "Đề nghị giá sách (₫)"}
                </label>
                <div className={styles.offerRow}>
                  <input
                    id={`offer-${room.id}`}
                    inputMode="numeric"
                    type="text"
                    pattern="[0-9]+"
                    value={amount}
                    disabled={disabled}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Ví dụ: 80000"
                    required
                  />
                  <button type="submit" disabled={disabled || !amount}>
                    {busy ? "Đang gửi…" : "Gửi đề nghị"}
                  </button>
                </div>
                {terms?.agreedPrice != null && (
                  <button
                    type="button"
                    className={styles.textButton}
                    disabled={disabled}
                    onClick={() => setEditingPrice(false)}
                  >
                    Giữ giá đã thống nhất
                  </button>
                )}
              </form>
            )}
        </>
      )}
      {terms?.activeExchangeId && (
        <p className={styles.help}>
          Đã có đề nghị đổi sách. Hủy đề nghị trước nếu hai bên muốn chuyển hình
          thức.
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {uncertain && (
        <button
          type="button"
          className={styles.retry}
          disabled={busy}
          onClick={() => pending.current && void command(pending.current.body)}
        >
          Thử lại thao tác trước
        </button>
      )}
    </section>
  );
}
