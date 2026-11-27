import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  LifeBuoy,
  Send,
  X,
} from "lucide-react";
import {
  pendingSupportIntent,
  sendSupportIntent,
  supportError,
  supportKinds,
  type SupportCase,
} from "@used-books/session-client";
import { lockPageScroll } from "../../../lib/page-scroll";
import { session } from "../../../lib/session";
import { InfoTip } from "../../InfoTip";
import { SelectMenu, type SelectMenuOption } from "../../SelectMenu";
import styles from "./ExchangeSupportDialog.module.css";

interface ExchangeSupportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  exchangeId: string;
  transactionCode: string;
  bookTitle?: string;
}

const MIN_TITLE = 3;
const MIN_DESC = 10;

export function ExchangeSupportDialog({
  isOpen,
  onClose,
  exchangeId,
  transactionCode,
  bookTitle,
}: ExchangeSupportDialogProps) {
  const titleId = useId();
  const kindLabelId = useId();
  const subjectId = useId();
  const descId = useId();
  const openerRef = useRef<HTMLElement | null>(null);
  const running = useRef(false);
  const cache = useQueryClient();

  const scope = `support:exchange:${exchangeId}`;
  const [kind, setKind] = useState<SupportCase["kind"]>("TransactionIssue");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null);

  const pending = isOpen && pendingSupportIntent(session, scope);
  const locked = busy || pending;

  const kindOptions = useMemo<SelectMenuOption[]>(
    () =>
      Object.entries(supportKinds).map(([value, label]) => ({
        value,
        label,
      })),
    [],
  );

  useEffect(() => (isOpen ? lockPageScroll() : undefined), [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    return () => {
      if (openerRef.current?.isConnected) {
        openerRef.current.focus({ preventScroll: true });
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !busy) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, busy, onClose]);

  if (!isOpen) return null;

  const trimmedTitle = title.trim();
  const trimmedDesc = description.trim();
  const titleOk = trimmedTitle.length >= MIN_TITLE;
  const descOk = trimmedDesc.length >= MIN_DESC;
  const canSubmit = pending || (titleOk && descOk);

  function handleClose() {
    if (busy) return;
    setError("");
    if (createdCaseId) {
      setCreatedCaseId(null);
      setTitle("");
      setDescription("");
      setKind("TransactionIssue");
    }
    onClose();
  }

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    if (running.current || busy) return;
    if (!pending && (!titleOk || !descOk)) {
      setError(
        `Nhập tiêu đề ít nhất ${MIN_TITLE} ký tự và nội dung ít nhất ${MIN_DESC} ký tự.`,
      );
      return;
    }
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const receipt = await sendSupportIntent(
        session,
        scope,
        "/me/support-cases",
        pending
          ? null
          : {
              kind,
              title: trimmedTitle,
              description: trimmedDesc,
              target: { type: "Exchange", id: exchangeId },
            },
        () => crypto.randomUUID(),
      );
      await cache.invalidateQueries({ queryKey: ["support"] });
      setCreatedCaseId(receipt.entityId);
    } catch (caught) {
      setError(supportError(caught));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className={styles.overlay}
      data-lenis-prevent="true"
      onClick={(event) => event.target === event.currentTarget && handleClose()}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className={styles.header} data-focus-inverse>
          <div className={styles.headerContent}>
            <span className={styles.headerIcon} aria-hidden="true">
              <LifeBuoy size={20} />
            </span>
            <div className={styles.headerHeading}>
              <h2 id={titleId} className={styles.title}>
                Gửi phản ánh
              </h2>
              <p className={styles.subtitle}>
                Phiếu #{transactionCode}
                {bookTitle ? ` · ${bookTitle}` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={handleClose}
            disabled={busy}
            aria-label="Đóng"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        {createdCaseId ? (
          <>
            <div className={styles.body}>
              <div className={styles.successCard} role="status">
                <span className={styles.successIcon} aria-hidden="true">
                  <CheckCircle2 size={24} />
                </span>
                <div className={styles.successText}>
                  <h3>Đã gửi phản ánh tới Admin</h3>
                  <p>
                    Hồ sơ <strong>#{createdCaseId.slice(0, 8).toUpperCase()}</strong>{" "}
                    đã được gắn với phiếu trao đổi <strong>#{transactionCode}</strong>.
                    Bạn có thể theo dõi phản hồi trong mục Hỗ trợ.
                  </p>
                </div>
              </div>
            </div>
            <footer className={styles.footer}>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={handleClose}
              >
                Đóng
              </button>
              <Link
                to={`/support/${createdCaseId}`}
                data-focus-inverse
                className={styles.btnConfirm}
                onClick={handleClose}
              >
                <span>Xem hồ sơ</span>
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </footer>
          </>
        ) : (
          <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
            <div className={styles.body}>
              <div className={styles.timelineBar}>
                <ol className={styles.timeline} aria-label="Quy trình xử lý phản ánh">
                  <li className={styles.timelineStep} data-active="true">
                    <span className={styles.stepNum}>1</span>
                    <span>Gửi phản ánh</span>
                  </li>
                  <li className={styles.timelineArrow} aria-hidden="true">→</li>
                  <li className={styles.timelineStep}>
                    <span className={styles.stepNum}>2</span>
                    <span>Admin đối chiếu</span>
                  </li>
                  <li className={styles.timelineArrow} aria-hidden="true">→</li>
                  <li className={styles.timelineStep} data-result="true">
                    <span className={styles.stepNum}>3</span>
                    <span>Phản hồi ở Hỗ trợ</span>
                  </li>
                </ol>
                <InfoTip label="Lưu ý khi gửi phản ánh">
                  <ul>
                    <li>
                      Phản ánh được gắn tự động với phiếu trao đổi <strong>#{transactionCode}</strong> và <strong>không tự dừng giao dịch hay hoàn tiền</strong>.
                    </li>
                    <li>
                      Nếu cần báo lỗi sách khi nhận hàng, hãy dùng nút <strong>Báo sự cố</strong> ngay trên phiếu.
                    </li>
                    <li>
                      Không chia sẻ mật khẩu, mã OTP hoặc thông tin thẻ ngân hàng.
                    </li>
                  </ul>
                </InfoTip>
              </div>

              {pending && (
                <p className={styles.pendingBanner} role="status">
                  Yêu cầu trước chưa xác định được kết quả. Bấm <strong>Thử lại</strong> để gửi đúng nội dung đó mà không tạo hồ sơ trùng.
                </p>
              )}

              <div className={styles.field}>
                <span id={kindLabelId} className={styles.labelText}>
                  Loại yêu cầu
                </span>
                <SelectMenu
                  id={`${kindLabelId}-menu`}
                  labelledBy={kindLabelId}
                  value={kind}
                  options={kindOptions}
                  disabled={locked}
                  onChange={(value) => {
                    setKind(value as SupportCase["kind"]);
                    setError("");
                  }}
                />
              </div>

              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <label htmlFor={subjectId} className={styles.labelText}>
                    Tiêu đề ngắn gọn
                  </label>
                  <span
                    className={styles.counter}
                    data-ok={titleOk || undefined}
                  >
                    {trimmedTitle.length}/{MIN_TITLE}+
                  </span>
                </div>
                <input
                  id={subjectId}
                  type="text"
                  maxLength={200}
                  disabled={locked}
                  value={title}
                  placeholder="Ví dụ: Cần hỗ trợ kiểm tra tiến độ phiếu trao đổi…"
                  className={styles.input}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setError("");
                  }}
                />
              </div>

              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <label htmlFor={descId} className={styles.labelText}>
                    Nội dung chi tiết
                  </label>
                  <span
                    className={styles.counter}
                    data-ok={descOk || undefined}
                  >
                    {trimmedDesc.length}/{MIN_DESC}+
                  </span>
                </div>
                <textarea
                  id={descId}
                  rows={4}
                  maxLength={5000}
                  disabled={locked}
                  value={description}
                  placeholder="Mô tả mốc thời gian, mã vận đơn hoặc vấn đề cần Admin hỗ trợ…"
                  className={styles.textarea}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    setError("");
                  }}
                />
              </div>

              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
            </div>

            <footer className={styles.footer}>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={handleClose}
                disabled={busy}
              >
                Hủy
              </button>
              <button
                type="submit"
                data-focus-inverse
                className={styles.btnConfirm}
                disabled={busy || !canSubmit}
                aria-busy={busy}
              >
                <Send size={15} aria-hidden="true" />
                <span>
                  {busy ? "Đang gửi…" : pending ? "Thử lại" : "Gửi phản ánh"}
                </span>
              </button>
            </footer>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
