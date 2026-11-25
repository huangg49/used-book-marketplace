import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock3,
  Gavel,
  MapPin,
  RefreshCw,
  Shield,
  Truck,
  Wallet,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import {
  exchangeReturnPhase,
  isExchangeReturnOverdue,
  type ExchangeReturnAction,
  type ExchangeReturnResolution,
  type ExchangeStatement,
} from "@used-books/session-client";
import { BookCover } from "../BookCover";
import { formatVnd, ROUTES } from "../../lib/routes";
import { exchangeCommand } from "../../services/exchange";
import styles from "./ExchangeReturnPanel.module.css";

interface ActionMeta {
  label: string;
  submitLabel: string;
  tier: "primary" | "secondary";
  field?: "note" | "trackingCode";
  fieldLabel?: string;
  placeholder?: string;
  helper?: string;
}

const ACTION_CONFIG: Partial<Record<ExchangeReturnAction, ActionMeta>> = {
  SubmitStatement: {
    label: "Gửi giải trình",
    submitLabel: "Xác nhận gửi giải trình",
    tier: "primary",
    field: "note",
    fieldLabel: "Nội dung giải trình",
    placeholder: "Trình bày ngắn gọn tình trạng sách và mốc giao nhận...",
    helper: "Admin sẽ đối chiếu giải trình cùng tệp bằng chứng của hai bên.",
  },
  ReportDispatch: {
    label: "Ghi mã vận đơn hoàn",
    submitLabel: "Xác nhận đã gửi trả sách",
    tier: "primary",
    field: "trackingCode",
    fieldLabel: "Mã vận đơn của chặng hoàn",
    placeholder: "VD: GHN12345678 hoặc mã bưu gửi...",
    helper: "Chỉ gửi sau khi đã bàn giao kiện sách hoàn cho đơn vị vận chuyển.",
  },
  AcknowledgeReturn: {
    label: "Xác nhận đã nhận sách hoàn",
    submitLabel: "Xác nhận đã nhận sách hoàn",
    tier: "primary",
  },
  Appeal: {
    label: "Gửi kháng nghị",
    submitLabel: "Gửi kháng nghị lên Admin",
    tier: "secondary",
    field: "note",
    fieldLabel: "Lý do kháng nghị quyết định",
    placeholder: "Nêu rõ căn cứ hoặc điểm chưa phù hợp trong phán quyết...",
    helper: "Quyết định sẽ tạm dừng hiệu lực để Admin rà soát lại hồ sơ.",
  },
  ReportReturnProblem: {
    label: "Báo vấn đề khi trả sách",
    submitLabel: "Gửi báo cáo sự cố hoàn sách",
    tier: "secondary",
    field: "note",
    fieldLabel: "Chi tiết vấn đề khi nhận sách hoàn",
    placeholder:
      "VD: Sách bị rách gáy, thiếu trang, sai cuốn hoặc không nhận được hàng...",
    helper:
      "Tiền ký quỹ tiếp tục giữ nguyên. Bạn nên tải thêm ảnh hoặc video bằng chứng ở mục Bằng chứng sự cố.",
  },
};

const RETURN_SUB_STEPS = [
  "Tiếp nhận",
  "Phán quyết",
  "Hoàn sách",
  "Tất toán",
] as const;

function getReturnSubStepIndex(
  r: ExchangeReturnResolution,
  now: number,
): number {
  switch (r.phase) {
    case "Evidence":
    case "NeedsReview":
      return 0;
    case "CompensationOrdered":
      return 1;
    case "ReturnOrdered": {
      const effective =
        Boolean(r.effectiveAt) ||
        Boolean(
          r.appealDueAt &&
            Date.parse(r.appealDueAt) <= now &&
            r.appeals.length === 0,
        );
      return effective ? 2 : 1;
    }
    case "ReturnInProgress":
    case "ReturnIssue":
      return 2;
    case "CheckingReturn":
      return 3;
    case "Closed":
      return 4;
    default:
      return 0;
  }
}

const dateText = (date: string) =>
  new Date(date).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

export function ExchangeReturnPanel({
  id,
  revision,
  userId,
  resolution: r,
  blocked,
  disputeReason,
  statements,
  caseBook,
  evidence,
  returnAddress,
  onRead,
}: {
  id: string;
  revision: number;
  userId: string;
  resolution: ExchangeReturnResolution;
  blocked: boolean;
  disputeReason?: string | null;
  statements?: ExchangeStatement[];
  evidence?: ReactNode;
  caseBook?: { title: string; coverUrl?: string; confirmed: boolean };
  returnAddress?: { recipientName: string; phone: string; detail: string };
  onRead: () => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const actionTrigger = useRef<HTMLButtonElement>(null);
  const openedForm = useRef(false);
  const statementSaved = useRef(false);
  const savedHeading = useRef<HTMLHeadingElement>(null);
  const [selected, setSelected] = useState<ExchangeReturnAction>();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const owner = r.ownerId === userId;
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const open = (date: string | null) => Boolean(date && Date.parse(date) > now);
  const expired = (date: string | null) =>
    Boolean(date && Date.parse(date) <= now);
  const offerAppeal =
    (r.phase === "ReturnOrdered" || r.phase === "CompensationOrdered") &&
    !r.effectiveAt &&
    open(r.appealDueAt);
  const returnOverdue = isExchangeReturnOverdue(r, now);

  const available: ExchangeReturnAction[] = [];
  if (r.phase === "Evidence" && (!r.evidenceDueAt || open(r.evidenceDueAt)))
    available.push("SubmitStatement");
  if (offerAppeal && !r.appeals.some((appeal) => appeal.by === userId))
    available.push("Appeal");
  if (
    !owner &&
    r.phase === "ReturnOrdered" &&
    open(r.returnDueAt) &&
    (r.effectiveAt || (expired(r.appealDueAt) && !r.appeals.length))
  )
    available.push("ReportDispatch");
  if (owner && r.phase === "ReturnInProgress")
    available.push("AcknowledgeReturn", "ReportReturnProblem");
  if (owner && r.phase === "CheckingReturn" && open(r.checkDueAt))
    available.push("ReportReturnProblem");

  const current =
    selected && available.includes(selected)
      ? ACTION_CONFIG[selected]
      : undefined;

  const deposit = owner ? r.ownerDeposit : r.holderDeposit;
  const difference = r.differencePayerId === userId ? r.differenceAmount : 0;
  const myLocked = deposit + difference;
  const compensatedHolder = r.outcome === "Compensated" && !owner;
  const depositUsed = compensatedHolder ? Math.min(deposit, r.compensation) : 0;
  const differenceUsed = compensatedHolder
    ? Math.min(difference, Math.max(0, r.compensation - depositUsed))
    : 0;
  const ownRefund = deposit - depositUsed;
  const ownDifferenceRefund = difference - differenceUsed;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || busy || !current || !selected) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await exchangeCommand("/exchanges/" + id + "/return-resolution", {
        expectedVersion: revision,
        action: selected,
        ...(current.field ? { [current.field]: value.trim() } : {}),
      });
      statementSaved.current = selected === "SubmitStatement";
      setSelected(undefined);
      setValue("");
      setNotice(
        selected === "SubmitStatement"
          ? "Đã ghi nhận giải trình."
          : selected === "ReportDispatch"
            ? "Đã cập nhật mã vận đơn hoàn sách."
            : selected === "AcknowledgeReturn"
              ? "Đã xác nhận nhận lại sách hoàn. Bắt đầu 48 giờ kiểm tra."
              : selected === "Appeal"
                ? "Đã gửi kháng nghị lên Admin."
                : "Đã ghi nhận yêu cầu.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Chưa xác nhận được yêu cầu.",
      );
    } finally {
      setBusy(false);
      onRead();
    }
  }

  function chooseAction(action: ExchangeReturnAction) {
    setSelected(action);
    setValue("");
    setError("");
    setNotice("");
  }

  const evidenceStage = r.phase === "Evidence";
  const latestStatement = statements?.at(-1);
  const sentNote = latestStatement?.note;
  const statementOpen = available.includes("SubmitStatement");
  const showAdminNote = Boolean(
    r.note && (!evidenceStage || sentNote || !statementOpen),
  );
  const showEmptyStatement =
    evidenceStage && statements?.length === 0 && !current && !notice;

  useEffect(() => {
    if (current) {
      openedForm.current = true;
      form.current?.focus();
    } else if (openedForm.current) {
      openedForm.current = false;
      (statementSaved.current
        ? savedHeading.current
        : actionTrigger.current
      )?.focus({ preventScroll: true });
      statementSaved.current = false;
    }
  }, [current, selected]);

  const subStepIdx = getReturnSubStepIndex(r, now);
  const isMyTurn = available.some(
    (act) => ACTION_CONFIG[act]?.tier === "primary",
  );
  const roleLabel = owner
    ? "Chủ sách · Bên nhận hoàn"
    : r.phase === "ReturnOrdered" || r.phase === "ReturnInProgress"
      ? "Bên giữ sách · Cần gửi trả"
      : "Bên đang giữ sách";

  const headline = (() => {
    if (returnOverdue) return "Đã quá hạn gửi trả sách";
    if (r.phase === "ReturnInProgress") {
      return owner
        ? "Sách hoàn đang trên đường về bạn"
        : "Đã gửi trả sách · Chờ chủ sách xác nhận";
    }
    if (r.phase === "ReturnOrdered" && available.includes("ReportDispatch")) {
      return "Gửi trả sách & nhập mã vận đơn hoàn";
    }
    if (r.phase === "CheckingReturn") {
      return owner
        ? "Kiểm tra tình trạng sách hoàn (48 giờ)"
        : "Đối tác đang kiểm tra sách hoàn (48 giờ)";
    }
    return exchangeReturnPhase[r.phase];
  })();

  const escrowOutcomeText = (() => {
    if (r.outcome || myLocked <= 0) return null;
    if (r.phase === "CompensationOrdered") {
      return owner
        ? `Dự kiến hoàn đủ ${formatVnd(myLocked)} đã khóa và nhận thêm ${formatVnd(r.compensation)} bồi hoàn.`
        : `Dự kiến khấu trừ ${formatVnd(r.compensation)} từ khoản đã khóa (${formatVnd(myLocked)}); phần dư (nếu có) hoàn về ví.`;
    }
    return owner
      ? `Khi bạn nhận lại sách hoàn nguyên vẹn, bạn được hoàn đủ 100% khoản đã khóa (${formatVnd(myLocked)}). Nếu đối tác không trả, Admin xử lý bồi thường từ cọc đối tác.`
      : `Khi đối tác xác nhận nhận lại sách hoàn nguyên vẹn, bạn được hoàn đủ 100% khoản đã khóa (${formatVnd(myLocked)}). Chỉ khấu trừ nếu không trả hoặc sách hư hại.`;
  })();

  const actionButtons = available.filter(
    (action) => action !== selected && action !== "SubmitStatement",
  );
  const primaryButtons = actionButtons.filter(
    (act) => ACTION_CONFIG[act]?.tier === "primary",
  );
  const secondaryButtons = actionButtons.filter(
    (act) => ACTION_CONFIG[act]?.tier === "secondary",
  );
  const hasSupportingRail = Boolean(
    evidence || caseBook || !r.outcome || disputeReason,
  );

  return (
    <section className={styles.panel} aria-labelledby="exchange-return-title">
      {/* 1. Unified Header + Turn Indicator + Role Pill + Refresh */}
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.mark} data-turn={isMyTurn || undefined}>
            {isMyTurn ? (
              <Gavel size={20} aria-hidden="true" />
            ) : (
              <Shield size={20} aria-hidden="true" />
            )}
          </span>
          <div className={styles.titleArea}>
            <div className={styles.kickerRow}>
              <span
                className={
                  isMyTurn
                    ? styles.turnBadge
                    : returnOverdue ||
                        r.phase === "ReturnIssue" ||
                        r.phase === "NeedsReview"
                      ? styles.alertBadge
                      : styles.kickerBadge
                }
              >
                {isMyTurn
                  ? "Đến lượt bạn"
                  : returnOverdue
                    ? "Quá hạn trả sách"
                    : exchangeReturnPhase[r.phase]}
              </span>
              <span className={styles.roleTag}>{roleLabel}</span>
            </div>
            <h2 id="exchange-return-title">{headline}</h2>
          </div>
        </div>
        <button
          className={styles.refreshBtn}
          type="button"
          onClick={onRead}
          disabled={busy}
        >
          <RefreshCw size={14} aria-hidden="true" /> Cập nhật
        </button>
      </header>

      {/* 2. 4-Step Post-Dispute Progress Bar */}
      <ol className={styles.subTrack} aria-label="Tiến độ xử lý tranh chấp">
        {RETURN_SUB_STEPS.map((label, idx) => {
          const state =
            idx < subStepIdx
              ? "done"
              : idx === subStepIdx && r.phase !== "Closed"
                ? "current"
                : "upcoming";
          return (
            <li key={label} className={styles.subStep} data-state={state}>
              <span className={styles.subStepBar} aria-hidden="true" />
              <span className={styles.subStepLabel}>{label}</span>
            </li>
          );
        })}
      </ol>

      {/* 3. Main Workspace (Left: Decision & Action Hub | Right: Evidence + Reference) */}
      <div
        className={styles.workspace}
        data-split={hasSupportingRail || undefined}
      >
        <div className={styles.primaryColumn}>
          {evidenceStage && (
            <section className={styles.memberTask} aria-label="Việc cần làm">
              <h3 tabIndex={-1} ref={savedHeading}>
                {sentNote ? (
                  <>
                    <Check size={20} aria-hidden="true" /> Đã gửi giải trình
                  </>
                ) : statementOpen ? (
                  "Bổ sung giải trình & bằng chứng"
                ) : (
                  "Đã hết hạn bổ sung"
                )}
              </h3>
              <p>
                {sentNote
                  ? "Admin sẽ đối chiếu nội dung bạn gửi với tệp bằng chứng của hai bên."
                  : statementOpen
                    ? r.note ||
                      "Gửi nội dung giải trình để Admin đối chiếu thông tin bàn giao."
                    : "Admin đang tiếp tục xem xét hồ sơ."}
              </p>
              {r.evidenceDueAt && (
                <div className={styles.taskDeadline}>
                  <Clock3 size={17} aria-hidden="true" />
                  <div>
                    <span>Hạn bổ sung bằng chứng</span>
                    <time dateTime={r.evidenceDueAt}>
                      {dateText(r.evidenceDueAt)}
                    </time>
                  </div>
                </div>
              )}
              {statementOpen && !current && (
                <button
                  ref={actionTrigger}
                  type="button"
                  disabled={blocked || busy}
                  onClick={() => chooseAction("SubmitStatement")}
                >
                  {sentNote ? "Gửi thêm giải trình" : "Gửi giải trình"}{" "}
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              )}
            </section>
          )}

          {error && !blocked && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className={styles.success} role="status">
              {notice}
            </p>
          )}

          {/* Appeal / Overdue Callouts */}
          {r.appeals.length > 0 &&
            !r.effectiveAt &&
            r.phase !== "NeedsReview" && (
              <div className={styles.statusCallout}>
                <AlertTriangle size={16} aria-hidden="true" />
                <span>
                  Đã ghi nhận kháng nghị. Quyết định đang tạm dừng hiệu lực để
                  Admin xem xét lại.
                </span>
              </div>
            )}
          {returnOverdue && (
            <div className={styles.warningBox}>
              Đã quá hạn gửi hoàn sách. Tiền ký quỹ tiếp tục được giữ để Admin
              đối chiếu bằng chứng và quyết định bước tiếp theo.
            </div>
          )}

          {/* Admin Ruling Note Promoted Directly Visible */}
          {showAdminNote && (
            <div className={styles.rulingNoteBox}>
              <span className={styles.rulingNoteLabel}>
                Ghi chú từ Admin phụ trách
              </span>
              <p className={styles.rulingNoteText}>{r.note}</p>
            </div>
          )}

          {/* Key Actionable Facts Grid */}
          {!evidenceStage && (
            <dl className={styles.facts}>
              {offerAppeal && r.appealDueAt && (
                <div className={styles.factCard}>
                  <dt>
                    <Clock3 size={14} aria-hidden="true" /> Hạn kháng nghị
                  </dt>
                  <dd>
                    <time dateTime={r.appealDueAt}>
                      {dateText(r.appealDueAt)}
                    </time>
                  </dd>
                </div>
              )}
              {r.phase === "ReturnOrdered" &&
                r.returnDueAt &&
                (!r.appeals.length || r.effectiveAt) && (
                  <div className={styles.factCard}>
                    <dt>
                      <Clock3 size={14} aria-hidden="true" /> Hạn bàn giao sách
                      hoàn
                    </dt>
                    <dd>
                      <time dateTime={r.returnDueAt}>
                        {dateText(r.returnDueAt)}
                      </time>
                      {offerAppeal && (
                        <small className={styles.factMuted}>
                          Hạn này được tính lại nếu có kháng nghị.
                        </small>
                      )}
                    </dd>
                  </div>
                )}
              {r.phase === "CheckingReturn" && r.checkDueAt && (
                <div className={styles.factCard}>
                  <dt>
                    <Clock3 size={14} aria-hidden="true" /> Hạn kiểm tra sách
                    hoàn (48h)
                  </dt>
                  <dd>
                    <time dateTime={r.checkDueAt}>
                      {dateText(r.checkDueAt)}
                    </time>
                  </dd>
                </div>
              )}
              {r.trackingCode && (
                <div className={`${styles.factCard} ${styles.trackingCard}`}>
                  <dt>
                    <Truck size={14} aria-hidden="true" /> Mã vận đơn hoàn sách
                  </dt>
                  <dd className={styles.trackingCodeValue}>
                    {r.trackingCode}
                  </dd>
                </div>
              )}
              {r.phase === "CompensationOrdered" && r.compensation > 0 && (
                <div className={styles.factCard}>
                  <dt>
                    <Wallet size={14} aria-hidden="true" /> Mức bồi hoàn dự kiến
                  </dt>
                  <dd>
                    <span className={styles.depositAmount}>
                      {formatVnd(r.compensation)}
                    </span>
                  </dd>
                </div>
              )}
            </dl>
          )}

          {/* Return Address Card (for holder when dispatching) */}
          {!owner &&
            (r.phase === "ReturnOrdered" || r.phase === "ReturnInProgress") &&
            (returnAddress ? (
              <div className={styles.addressCard}>
                <MapPin size={16} aria-hidden="true" />
                <div>
                  <span className={styles.addressLabel}>
                    Địa chỉ gửi trả sách về chủ sách
                  </span>
                  <p className={styles.addressValue}>
                    <strong>{returnAddress.recipientName}</strong> ·{" "}
                    {returnAddress.phone}
                  </p>
                  <p className={styles.addressDetail}>{returnAddress.detail}</p>
                </div>
              </div>
            ) : available.includes("ReportDispatch") ? (
              <p className={styles.warningBox}>
                Hồ sơ chưa có địa chỉ hoàn. Liên hệ hỗ trợ để xác nhận địa chỉ
                trước khi gửi.
              </p>
            ) : null)}

          {/* Primary + Secondary Action Buttons */}
          {(primaryButtons.length > 0 || secondaryButtons.length > 0) && (
            <div className={styles.actions}>
              {primaryButtons.map((action, index) => (
                <button
                  type="button"
                  key={action}
                  ref={!current && index === 0 ? actionTrigger : undefined}
                  className={styles.primary}
                  disabled={blocked || busy}
                  onClick={() => chooseAction(action)}
                >
                  {ACTION_CONFIG[action]?.label}
                </button>
              ))}
              {secondaryButtons.map((action, index) => (
                <button
                  type="button"
                  key={action}
                  ref={
                    !current && primaryButtons.length === 0 && index === 0
                      ? actionTrigger
                      : undefined
                  }
                  className={styles.secondary}
                  disabled={blocked || busy}
                  onClick={() => chooseAction(action)}
                >
                  {ACTION_CONFIG[action]?.label}
                </button>
              ))}
            </div>
          )}

          {/* Inline Action Form */}
          {current && selected && (
            <form
              ref={form}
              tabIndex={-1}
              aria-label={current.label}
              className={styles.form}
              onSubmit={(event) => void submit(event)}
            >
              {current.field === "trackingCode" ? (
                <label>
                  <span>{current.fieldLabel ?? "Mã vận đơn của chặng hoàn"}</span>
                  <input
                    type="text"
                    className={styles.textInput}
                    value={value}
                    disabled={blocked || busy}
                    minLength={5}
                    maxLength={80}
                    required
                    placeholder={current.placeholder}
                    onChange={(event) => setValue(event.target.value)}
                  />
                </label>
              ) : current.field === "note" ? (
                <label>
                  <span className={styles.labelRow}>
                    <span>{current.fieldLabel ?? "Nội dung gửi"}</span>
                    <span className={styles.charCount}>
                      {value.trim().length}/5+ ký tự
                    </span>
                  </span>
                  <textarea
                    rows={3}
                    value={value}
                    disabled={blocked || busy}
                    minLength={5}
                    required
                    maxLength={500}
                    placeholder={current.placeholder}
                    onChange={(event) => setValue(event.target.value)}
                  />
                </label>
              ) : (
                <p className={styles.confirmCopy}>
                  Chỉ xác nhận sau khi cuốn sách hoàn đã về tay bạn. Sau bước
                  này bạn vẫn có <strong>48 giờ</strong> để kiểm tra tình trạng
                  sách trước khi hoàn tất tất toán.
                </p>
              )}
              {current.helper && (
                <p className={styles.formHelper}>{current.helper}</p>
              )}
              <div className={styles.formActions}>
                <button
                  className={styles.primary}
                  disabled={
                    blocked ||
                    busy ||
                    (!!current.field && value.trim().length < 5)
                  }
                >
                  {busy ? "Đang gửi…" : current.submitLabel}
                </button>
                <button
                  className={styles.secondary}
                  type="button"
                  disabled={blocked || busy}
                  onClick={() => setSelected(undefined)}
                >
                  Hủy
                </button>
              </div>
            </form>
          )}

          {/* Clear Escrow Outcome Explanation (while open) OR Final Settlement Breakdown (when closed) */}
          {r.outcome ? (
            <div className={styles.settlementSection}>
              <dl className={styles.facts}>
                <div className={styles.factCard}>
                  <dt>Cọc của bạn được hoàn</dt>
                  <dd>
                    <span className={styles.depositAmount}>
                      {formatVnd(ownRefund)}
                    </span>
                  </dd>
                </div>
                {difference > 0 && (
                  <div className={styles.factCard}>
                    <dt>Tiền bù bạn đã nộp được hoàn</dt>
                    <dd>
                      <span className={styles.depositAmount}>
                        {formatVnd(ownDifferenceRefund)}
                      </span>
                    </dd>
                  </div>
                )}
                {r.compensation > 0 && (
                  <div className={styles.factCard}>
                    <dt>
                      {owner
                        ? "Bồi thường nhận từ cọc đối tác"
                        : "Tiền cọc đã dùng để bồi thường"}
                    </dt>
                    <dd>
                      <span className={styles.depositAmount}>
                        {formatVnd(r.compensation)}
                      </span>
                    </dd>
                  </div>
                )}
              </dl>
              <p className={styles.walletLinkRow}>
                <Link to={`${ROUTES.wallet}#lich-su-giao-dich`}>
                  Xem lịch sử giao dịch Ví →
                </Link>
              </p>
            </div>
          ) : escrowOutcomeText ? (
            <div className={styles.escrowClarityBox}>
              <Wallet size={16} aria-hidden="true" />
              <div>
                <span className={styles.escrowClarityLabel}>
                  Dự kiến hoàn tiền ký quỹ
                </span>
                <p>{escrowOutcomeText}</p>
              </div>
            </div>
          ) : null}

          {/* Submitted Statements */}
          {(sentNote || showEmptyStatement) && (
            <section
              className={styles.sentStatement}
              aria-label="Giải trình của bạn"
            >
              <div className={styles.sentStatementHead}>
                <h3>Giải trình của bạn</h3>
                {latestStatement && (
                  <time dateTime={latestStatement.sentAt}>
                    {dateText(latestStatement.sentAt)}
                  </time>
                )}
              </div>
              {sentNote ? (
                <p>{sentNote}</p>
              ) : (
                <div className={styles.emptyStatement}>
                  <strong>Chưa gửi giải trình</strong>
                  {statementOpen && (
                    <p>Bấm “Gửi giải trình” để bổ sung thông tin cho Admin.</p>
                  )}
                </div>
              )}
            </section>
          )}
        </div>

        {/* Right Supporting Rail: Collapsible Evidence (Tier 2) + Reference & Escrow Card (Tier 3) */}
        {hasSupportingRail && (
          <aside className={styles.supportRail} aria-label="Bằng chứng và đối chiếu">
            {evidence}
            {(caseBook || !r.outcome || disputeReason) && (
              <section
                className={styles.context}
                aria-labelledby="exchange-dispute-context"
              >
                <h3 id="exchange-dispute-context">Thông tin sự cố &amp; Ký quỹ</h3>
                {caseBook && (
                  <div className={styles.caseBook}>
                    <div aria-hidden="true">
                      <BookCover
                        title={caseBook.title}
                        coverUrl={caseBook.coverUrl}
                        className={styles.caseCover}
                      />
                    </div>
                    <div>
                      <strong>{caseBook.title}</strong>
                      <p>
                        {caseBook.confirmed
                          ? "Đã xác nhận nhận sách"
                          : "Admin đã xác minh giao đến"}
                      </p>
                    </div>
                  </div>
                )}
                {!r.outcome && (
                  <dl className={styles.escrowList}>
                    <div className={styles.escrowLine}>
                      <dt>Cọc của bạn đang giữ</dt>
                      <dd>{formatVnd(deposit)}</dd>
                    </div>
                    {difference > 0 && (
                      <div className={styles.escrowLine}>
                        <dt>Tiền bù bạn đã nộp</dt>
                        <dd>{formatVnd(difference)}</dd>
                      </div>
                    )}
                    <div className={styles.escrowLineTotal}>
                      <dt>Tổng khoản bạn đang khóa</dt>
                      <dd>{formatVnd(myLocked)}</dd>
                    </div>
                  </dl>
                )}
                {disputeReason && (
                  <details className={styles.history}>
                    <summary>Nội dung phản ánh ban đầu</summary>
                    <p>{disputeReason}</p>
                  </details>
                )}
              </section>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}
