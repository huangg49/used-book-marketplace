import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, Info, X } from "lucide-react";
import {
  ApiError,
  AUCTION_FLAG_MIN_TEXT,
  auctionFlagBody,
  auctionFlagCasesPath,
  auctionFlagCategories,
  auctionFlagScope,
  openAuctionFlag,
  pendingSupportIntent,
  sendSupportIntent,
  supportError,
  supportPageSchema,
  supportStates,
  type AuctionFlagCategory,
} from "@used-books/session-client";
import { session } from "../../lib/session";
import { lockPageScroll } from "../../lib/page-scroll";
import { playAuctionMotion, sheetFrames } from "../../lib/auction-motion";
import styles from "./AuctionFlag.module.css";

/**
 * ADR 0078: the seller and members who registered or bid flag a problem with the
 * auction to the Admin queue. The flag is a support case; it never pauses the
 * auction or moves money by itself.
 */
export function AuctionFlag({
  auction,
  ownerId,
}: {
  auction: { id: string; title: string };
  ownerId: string;
}) {
  const [open, setOpen] = useState(false);
  const existing = useQuery({
    queryKey: ["support", ownerId, "auction-flag", auction.id],
    queryFn: () =>
      session.request(auctionFlagCasesPath(auction.id), supportPageSchema),
    staleTime: 0,
    retry: false,
  });
  const current = openAuctionFlag(existing.data);
  return (
    <div className={styles.flag}>
      {current ? (
        <p className={styles.sent}>
          <Flag size={14} aria-hidden="true" /> Bạn đã báo cáo phiên này cho
          Admin ({supportStates[current.state].toLowerCase()}).{" "}
          <Link to={`/support/${current.id}`}>Xem hồ sơ</Link>
        </p>
      ) : (
        <button
          type="button"
          className={styles.trigger}
          aria-haspopup="dialog"
          disabled={existing.isPending}
          onClick={() => setOpen(true)}
        >
          <Flag size={14} aria-hidden="true" /> Báo cáo sự cố cho Admin
        </button>
      )}
      <AuctionFlagDialog
        auction={auction}
        isOpen={open}
        onClose={() => setOpen(false)}
        onSent={() => existing.refetch()}
      />
    </div>
  );
}

function AuctionFlagDialog({
  auction,
  isOpen,
  onClose,
  onSent,
}: {
  auction: { id: string; title: string };
  isOpen: boolean;
  onClose: () => void;
  onSent: () => Promise<unknown>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const ids = useId();
  const cache = useQueryClient();
  const scope = auctionFlagScope(auction.id);
  const [category, setCategory] = useState<AuctionFlagCategory["id"] | null>(
    null,
  );
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A lost response pins the body and key; the retry sends exactly that again.
  const pending = pendingSupportIntent(session, scope);
  const chosen = auctionFlagCategories.find((c) => c.id === category) ?? null;
  const short = text.trim().length < AUCTION_FLAG_MIN_TEXT;

  useEffect(() => (isOpen ? lockPageScroll() : undefined), [isOpen]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
      return playAuctionMotion(dialog, sheetFrames, 220);
    }
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const cancel = (event: Event) => {
      event.preventDefault();
      if (!busy) onClose();
    };
    const backdrop = (event: MouseEvent) => {
      if (event.target === dialog && !busy) onClose();
    };
    dialog.addEventListener("cancel", cancel);
    dialog.addEventListener("click", backdrop);
    return () => {
      dialog.removeEventListener("cancel", cancel);
      dialog.removeEventListener("click", backdrop);
    };
  }, [busy, onClose]);

  async function submit() {
    if (busy) return;
    if (!pending && (!chosen || short)) {
      setError(
        !chosen
          ? "Chọn loại sự cố trước khi gửi."
          : `Mô tả ít nhất ${AUCTION_FLAG_MIN_TEXT} ký tự để Admin đối chiếu được.`,
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendSupportIntent(
        session,
        scope,
        "/me/support-cases",
        chosen ? auctionFlagBody(chosen, auction, text) : null,
        () => crypto.randomUUID(),
      );
      setCategory(null);
      setText("");
      await cache.invalidateQueries({ queryKey: ["support"] });
      await onSent();
      onClose();
    } catch (caught) {
      // A duplicate means an open case already exists: show it on the page.
      if (caught instanceof ApiError && caught.status === 409) void onSent();
      setError(supportError(caught));
    } finally {
      setBusy(false);
    }
  }

  const locked = busy || pending;
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={`${ids}-title`}
    >
      <div className={styles.sheet}>
        <header className={styles.header}>
          <span className={styles.heading}>
            <strong id={`${ids}-title`}>
              <Flag size={20} aria-hidden="true" /> Báo cáo sự cố
            </strong>
            <small>{auction.title}</small>
          </span>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            disabled={busy}
            aria-label="Đóng"
          >
            <X size={22} aria-hidden="true" />
          </button>
        </header>
        <div className={styles.body}>
          {pending ? (
            <p className={styles.warning} role="status">
              Báo cáo trước chưa xác định được kết quả. Thử lại sẽ gửi đúng nội
              dung đó một lần nữa, không tạo hồ sơ trùng.
            </p>
          ) : null}
          <fieldset className={styles.choice} disabled={locked}>
            <legend>Bạn gặp vấn đề gì?</legend>
            {auctionFlagCategories.map((c) => (
              <label key={c.id}>
                <input
                  type="radio"
                  name={`${ids}-category`}
                  checked={category === c.id}
                  onChange={() => {
                    setCategory(c.id);
                    setError(null);
                  }}
                />
                <span>{c.label}</span>
              </label>
            ))}
          </fieldset>
          <div className={styles.field}>
            <label htmlFor={`${ids}-text`}>Mô tả sự việc</label>
            <textarea
              id={`${ids}-text`}
              rows={5}
              maxLength={5000}
              disabled={locked}
              value={text}
              aria-invalid={!!error && short && !!chosen}
              aria-describedby={`${ids}-hint`}
              onChange={(e) => setText(e.target.value)}
            />
            <small id={`${ids}-hint`}>
              {chosen?.hint ??
                "Ghi mốc thời gian, số tiền hoặc thông tin giúp Admin đối chiếu."}{" "}
              Không gửi mật khẩu, OTP hoặc thông tin thẻ.
            </small>
          </div>
          <p className={styles.note}>
            <Info size={15} aria-hidden="true" />
            <span>
              Báo cáo được gửi tới Admin, không tự dừng phiên hay hoàn tiền.
              Admin đối chiếu lượt giá, tiền cọc và khoản giữ rồi phản hồi trong{" "}
              <strong>Yêu cầu hỗ trợ</strong> của bạn. Mỗi phiên bạn có một hồ
              sơ đang mở; cần bổ sung thì trả lời trong hồ sơ đó.
            </span>
          </p>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            className={styles.confirm}
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? "Đang gửi…" : pending ? "Thử lại báo cáo đã gửi" : "Gửi cho Admin"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
