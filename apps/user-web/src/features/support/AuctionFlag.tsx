import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Flag, LogIn, MessageSquareText, ShieldCheck, X } from "lucide-react";
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
import { InfoTip } from "../../components/InfoTip";
import { SelectMenu, type SelectMenuOption } from "../../components/SelectMenu";
import { ROUTES } from "../../lib/routes";
import { session } from "../../lib/session";
import { lockPageScroll } from "../../lib/page-scroll";
import { playAuctionMotion, sheetFrames } from "../../lib/auction-motion";
import styles from "./AuctionFlag.module.css";

function categoryOptionsFor(participant: boolean): SelectMenuOption[] {
  const list = participant
    ? auctionFlagCategories
    : auctionFlagCategories.filter((c) => c.kind !== "TransactionIssue");
  return [
    { value: "", label: participant ? "Chọn loại sự cố…" : "Chọn lý do báo cáo…" },
    ...list.map((c, i) => ({
      value: c.id,
      label: c.label,
      separated: i === 0,
    })),
  ];
}

/**
 * ADR 0078: the seller and members who registered or bid flag a problem with the
 * auction to the Admin queue; any member can also report content/violation on the
 * auction via the same modal (excluding TransactionIssue). Never pauses the
 * auction or moves money by itself.
 */
export function AuctionFlag({
  auction,
  ownerId,
  participant = true,
  loginReturnUrl,
}: {
  auction: { id: string; title: string };
  ownerId?: string | null;
  participant?: boolean;
  loginReturnUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  const authed = Boolean(ownerId);
  const existing = useQuery({
    queryKey: ["support", ownerId ?? "guest", "auction-flag", auction.id],
    queryFn: () =>
      session.request(auctionFlagCasesPath(auction.id), supportPageSchema),
    enabled: authed,
    staleTime: 0,
    retry: false,
  });
  const current = authed ? openAuctionFlag(existing.data) : null;
  const triggerLabel = participant ? "Báo cáo sự cố cho Admin" : "Báo cáo nội dung";

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
          disabled={authed && existing.isPending}
          onClick={() => setOpen(true)}
        >
          <Flag size={14} aria-hidden="true" /> {triggerLabel}
        </button>
      )}
      <AuctionFlagDialog
        auction={auction}
        authed={authed}
        participant={participant}
        loginReturnUrl={loginReturnUrl}
        isOpen={open}
        onClose={() => setOpen(false)}
        onSent={() => (authed ? existing.refetch() : Promise.resolve())}
      />
    </div>
  );
}

function AuctionFlagDialog({
  auction,
  authed,
  participant,
  loginReturnUrl,
  isOpen,
  onClose,
  onSent,
}: {
  auction: { id: string; title: string };
  authed: boolean;
  participant: boolean;
  loginReturnUrl?: string;
  isOpen: boolean;
  onClose: () => void;
  onSent: () => Promise<unknown>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
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
  const pending = authed && pendingSupportIntent(session, scope);
  const allowedCategories = useMemo(
    () =>
      participant
        ? auctionFlagCategories
        : auctionFlagCategories.filter((c) => c.kind !== "TransactionIssue"),
    [participant],
  );
  const categoryOptions = useMemo(
    () => categoryOptionsFor(participant),
    [participant],
  );
  const chosen = allowedCategories.find((c) => c.id === category) ?? null;
  const trimmedLen = text.trim().length;
  const short = trimmedLen < AUCTION_FLAG_MIN_TEXT;
  const headingTitle = participant ? "Báo cáo sự cố" : "Báo cáo nội dung";
  const loginHref = loginReturnUrl
    ? `${ROUTES.login}?returnUrl=${encodeURIComponent(loginReturnUrl)}`
    : ROUTES.login;

  useEffect(() => (isOpen ? lockPageScroll() : undefined), [isOpen]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      openerRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      const stop = playAuctionMotion(dialog, sheetFrames, 220);
      return () => {
        stop();
        if (dialog.open) dialog.close();
        if (openerRef.current?.isConnected) {
          openerRef.current.focus({ preventScroll: true });
        }
      };
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
  const categoryLabelId = `${ids}-category-label`;

  return (
    <dialog
      ref={ref}
      data-lenis-prevent="true"
      className={styles.dialog}
      aria-labelledby={`${ids}-title`}
    >
      <div className={styles.sheet}>
        <header className={styles.header} data-focus-inverse>
          <span className={styles.badge} aria-hidden="true">
            <Flag size={20} />
          </span>
          <span className={styles.heading}>
            <strong id={`${ids}-title`}>{headingTitle}</strong>
            <small>{auction.title}</small>
          </span>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            disabled={busy}
            aria-label="Đóng"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        {!authed ? (
          <>
            <div className={styles.body}>
              <p className={styles.guestNote}>
                Đăng nhập để gửi báo cáo về phiên đấu giá này tới Admin. Sau khi
                đăng nhập, bạn sẽ quay lại đúng trang này.
              </p>
              <ol className={styles.miniFlow} aria-label="Quy trình báo cáo">
                <li>
                  <span className={styles.miniDot} aria-hidden="true">
                    <LogIn size={13} />
                  </span>
                  <span>Đăng nhập</span>
                </li>
                <li>
                  <span className={styles.miniDot} aria-hidden="true">
                    <MessageSquareText size={13} />
                  </span>
                  <span>Gửi báo cáo</span>
                </li>
                <li data-result="true">
                  <span className={styles.miniDot} aria-hidden="true">
                    <CheckCircle2 size={13} />
                  </span>
                  <span>
                    Admin <b>đối chiếu</b>
                  </span>
                </li>
              </ol>
            </div>
            <footer className={styles.footer}>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.cancel}
                  onClick={onClose}
                >
                  Hủy
                </button>
                <Link
                  to={loginHref}
                  data-focus-inverse
                  className={styles.confirm}
                  onClick={onClose}
                >
                  <span>Đăng nhập</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </footer>
          </>
        ) : (
          <>
            <div className={styles.body}>
              {pending ? (
                <p className={styles.warning} role="status">
                  Báo cáo trước chưa xác định được kết quả. Thử lại sẽ gửi đúng
                  nội dung đó một lần nữa, không tạo hồ sơ trùng.
                </p>
              ) : null}

              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <span id={categoryLabelId} className={styles.labelText}>
                    {participant ? "Loại sự cố" : "Lý do báo cáo"}
                  </span>
                  <InfoTip label="Quy định xử lý báo cáo sự cố">
                    <ul>
                      <li>
                        Báo cáo được gửi tới Admin,{" "}
                        <mark>không tự dừng phiên hay hoàn tiền</mark>.
                      </li>
                      <li>
                        Admin đối chiếu lượt giá, tiền cọc và khoản giữ rồi phản
                        hồi trong <strong>Yêu cầu hỗ trợ</strong>.
                      </li>
                      <li>
                        Mỗi phiên có <strong>1 hồ sơ đang mở</strong>; cần bổ
                        sung thì trả lời ngay trong hồ sơ đó.
                      </li>
                    </ul>
                  </InfoTip>
                </div>
                <SelectMenu
                  id={`${ids}-category`}
                  labelledBy={categoryLabelId}
                  value={category ?? ""}
                  options={categoryOptions}
                  disabled={locked}
                  onChange={(val) => {
                    setCategory(val ? (val as AuctionFlagCategory["id"]) : null);
                    setError(null);
                  }}
                />
              </div>

              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <label htmlFor={`${ids}-text`} className={styles.labelText}>
                    Mô tả sự việc
                  </label>
                  <InfoTip label="Lưu ý bảo mật khi mô tả">
                    Ghi mốc thời gian, số tiền hoặc chi tiết giúp Admin đối
                    chiếu.{" "}
                    <mark>Không gửi mật khẩu, OTP hoặc thông tin thẻ.</mark>
                  </InfoTip>
                  <span
                    className={`${styles.counter} ${!short ? styles.counterOk : ""}`}
                  >
                    {trimmedLen}/{AUCTION_FLAG_MIN_TEXT}+
                  </span>
                </div>
                <textarea
                  id={`${ids}-text`}
                  rows={4}
                  maxLength={5000}
                  disabled={locked}
                  value={text}
                  placeholder={
                    chosen?.hint ??
                    "Ghi mốc thời gian, số tiền hoặc thông tin giúp Admin đối chiếu…"
                  }
                  aria-invalid={!!error && short && !!chosen}
                  aria-describedby={`${ids}-hint`}
                  onChange={(e) => setText(e.target.value)}
                />
                {chosen?.hint && (
                  <small id={`${ids}-hint`} className={styles.hint}>
                    {chosen.hint}
                  </small>
                )}
                {!chosen?.hint && (
                  <small id={`${ids}-hint`} className="sr-only">
                    Ghi mốc thời gian, số tiền hoặc thông tin giúp Admin đối
                    chiếu. Không gửi mật khẩu, OTP hoặc thông tin thẻ.
                  </small>
                )}
              </div>

              <ol
                className={styles.miniFlow}
                aria-label="Quy trình sau khi gửi báo cáo"
              >
                <li>
                  <span className={styles.miniDot} aria-hidden="true">
                    <MessageSquareText size={13} />
                  </span>
                  <span>Gửi hồ sơ</span>
                </li>
                <li>
                  <span className={styles.miniDot} aria-hidden="true">
                    <ShieldCheck size={13} />
                  </span>
                  <span>Admin đối chiếu</span>
                </li>
                <li data-result="true">
                  <span className={styles.miniDot} aria-hidden="true">
                    <CheckCircle2 size={13} />
                  </span>
                  <span>
                    Phản hồi ở <b>Hỗ trợ</b>
                  </span>
                </li>
              </ol>

              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}
            </div>

            <footer className={styles.footer}>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.cancel}
                  onClick={onClose}
                  disabled={busy}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  data-focus-inverse
                  className={styles.confirm}
                  disabled={busy}
                  aria-busy={busy}
                  onClick={() => void submit()}
                >
                  <span>
                    {busy
                      ? "Đang gửi…"
                      : pending
                        ? "Thử lại"
                        : "Gửi cho Admin"}
                  </span>
                  {!busy && <ArrowRight size={16} aria-hidden="true" />}
                </button>
              </div>
            </footer>
          </>
        )}
      </div>
    </dialog>
  );
}
