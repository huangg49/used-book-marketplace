import {
  ArrowRight,
  Check,
  Clock3,
  RefreshCw,
  Shield,
  Wallet,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  exchangeReturnPhase,
  type ExchangeReturnAction,
  type ExchangeReturnResolution,
  type ExchangeStatement,
} from "@used-books/session-client";
import { BookCover } from "../BookCover";
import { formatVnd } from "../../lib/routes";
import { exchangeCommand } from "../../services/exchange";
import styles from "./ExchangeReturnPanel.module.css";

const actions: Partial<
  Record<
    ExchangeReturnAction,
    { label: string; field?: "note" | "trackingCode" }
  >
> = {
  SubmitStatement: { label: "Gửi giải trình", field: "note" },
  Appeal: { label: "Gửi kháng nghị", field: "note" },
  ReportDispatch: { label: "Ghi mã vận đơn hoàn", field: "trackingCode" },
  AcknowledgeReturn: { label: "Xác nhận đã nhận sách hoàn" },
  ReportReturnProblem: { label: "Báo vấn đề khi trả sách", field: "note" },
};

const dateText = (date: string) => new Date(date).toLocaleString("vi-VN");

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
    selected && available.includes(selected) ? actions[selected] : undefined;
  const deposit = owner ? r.ownerDeposit : r.holderDeposit;
  const difference = r.differencePayerId === userId ? r.differenceAmount : 0;
  const ownRefund = r.outcome === "Compensated" && !owner ? 0 : deposit;

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
  const hasContext = Boolean(
    caseBook || !r.outcome || showAdminNote || disputeReason,
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

  return (
    <section className={styles.panel} aria-labelledby="exchange-return-title">
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.mark}>
            <Shield size={20} aria-hidden="true" />
          </span>
          <div className={styles.titleArea}>
            <p className={styles.kicker}>Hồ sơ khiếu nại</p>
            <h2 id="exchange-return-title">{exchangeReturnPhase[r.phase]}</h2>
          </div>
        </div>
        <span className={styles.roleTag}>
          {owner ? "Bạn là chủ sách" : "Bạn là bên nhận sách"}
        </span>
      </header>

      <div
        className={styles.workspace}
        data-split={Boolean(evidence) || undefined}
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
                  "Bổ sung thông tin bàn giao"
                ) : (
                  "Đã hết hạn bổ sung"
                )}
              </h3>
              <p>
                {sentNote
                  ? "Admin sẽ đối chiếu nội dung bạn gửi với thông tin bàn giao."
                  : statementOpen
                    ? r.note ||
                      "Gửi nội dung để Admin đối chiếu thông tin bàn giao."
                    : "Admin sẽ tiếp tục xem xét hồ sơ."}
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
          {current && (
            <form
              ref={form}
              tabIndex={-1}
              aria-label={current.label}
              className={styles.form}
              onSubmit={(event) => void submit(event)}
            >
              {current.field ? (
                <label>
                  {current.field === "trackingCode"
                    ? "Mã vận đơn của chặng hoàn"
                    : "Nội dung gửi"}
                  <textarea
                    rows={4}
                    value={value}
                    disabled={blocked || busy}
                    minLength={5}
                    required
                    maxLength={current.field === "trackingCode" ? 80 : 500}
                    onChange={(event) => setValue(event.target.value)}
                  />
                </label>
              ) : (
                <p>
                  Chỉ xác nhận sau khi cuốn sách đã về tay bạn. Bạn vẫn có 48
                  giờ để kiểm tra.
                </p>
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
                  {busy ? "Đang gửi…" : current.label}
                </button>
                <button
                  className={styles.secondary}
                  type="button"
                  disabled={blocked || busy}
                  onClick={() => setSelected(undefined)}
                >
                  Đóng biểu mẫu
                </button>
              </div>
            </form>
          )}
          {(sentNote || showEmptyStatement) && (
            <section
              className={styles.sentStatement}
              aria-label="Giải trình của bạn"
            >
              <h3>Giải trình của bạn</h3>
              {latestStatement && (
                <time dateTime={latestStatement.sentAt}>
                  {dateText(latestStatement.sentAt)}
                </time>
              )}
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
          {!evidenceStage && (
            <dl className={styles.facts}>
              {offerAppeal && r.appealDueAt && (
                <div className={styles.factCard}>
                  <dt>
                    <Clock3 size={15} aria-hidden="true" /> Hạn kháng nghị
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
                      <Clock3 size={15} aria-hidden="true" /> Hạn bàn giao sách
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
                    <Clock3 size={15} aria-hidden="true" /> Hạn báo vấn đề về
                    sách đã trả
                  </dt>
                  <dd>
                    <time dateTime={r.checkDueAt}>
                      {dateText(r.checkDueAt)}
                    </time>
                  </dd>
                </div>
              )}
            </dl>
          )}

          {r.appeals.length > 0 &&
            !r.effectiveAt &&
            r.phase !== "NeedsReview" && (
              <p className={styles.noticeBox}>
                Đã có kháng nghị. Đang chờ Admin xem xét.
              </p>
            )}
          {!owner &&
            available.includes("ReportDispatch") &&
            (returnAddress ? (
              <p className={styles.addressInfo}>
                Gửi về {returnAddress.recipientName} · {returnAddress.phone} ·{" "}
                {returnAddress.detail}
              </p>
            ) : (
              <p className={styles.warningBox}>
                Hồ sơ chưa có địa chỉ hoàn. Liên hệ hỗ trợ để xác nhận địa chỉ
                trước khi gửi.
              </p>
            ))}
          {r.phase === "ReturnInProgress" && (
            <p className={styles.trackingInfo}>
              Mã vận đơn hoàn <strong>{r.trackingCode}</strong>
            </p>
          )}
          {r.outcome && (
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
                      {formatVnd(difference)}
                    </span>
                  </dd>
                </div>
              )}
              {r.compensation > 0 && (
                <div className={styles.factCard}>
                  <dt>
                    {owner
                      ? "Bồi thường nhận từ cọc của đối tác"
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
          )}
          {r.phase === "CompensationOrdered" && (
            <p className={styles.noticeBox}>
              Quyết định dự kiến chi {formatVnd(r.compensation)} từ tiền cọc của
              bên giữ sách.
            </p>
          )}
          <div className={styles.actions}>
            {available
              .filter(
                (action) => action !== selected && action !== "SubmitStatement",
              )
              .map((action, index) => (
                <button
                  type="button"
                  key={action}
                  ref={!current && index === 0 ? actionTrigger : undefined}
                  className={
                    !current && index === 0 ? styles.primary : styles.secondary
                  }
                  disabled={blocked || busy}
                  onClick={() => chooseAction(action)}
                >
                  {actions[action]?.label}
                </button>
              ))}
            <button className={styles.secondary} type="button" onClick={onRead}>
              <RefreshCw size={15} aria-hidden="true" /> Cập nhật hồ sơ
            </button>
          </div>
        </div>
        {evidence}
      </div>
      {hasContext && (
        <section
          className={styles.context}
          aria-labelledby="exchange-dispute-context"
        >
          <h3 id="exchange-dispute-context">Thông tin đối chiếu</h3>
          <div className={styles.contextGrid}>
            {(caseBook || !r.outcome) && (
              <div className={styles.contextSummary}>
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
                  <dl className={styles.contextAmounts}>
                    <div className={styles.factCard}>
                      <dt>
                        <Wallet size={15} aria-hidden="true" /> Cọc của bạn đang
                        giữ
                      </dt>
                      <dd>
                        <span className={styles.depositAmount}>
                          {formatVnd(deposit)}
                        </span>
                        {difference > 0 && (
                          <small className={styles.escrowDetail}>
                            Đang giữ {formatVnd(deposit)} cọc của bạn và{" "}
                            {formatVnd(difference)} tiền bù bạn đã nộp.
                          </small>
                        )}
                      </dd>
                    </div>
                  </dl>
                )}
              </div>
            )}
            {(showAdminNote || disputeReason) && (
              <div className={styles.contextDetails}>
                {showAdminNote && (
                  <details className={styles.history}>
                    <summary>
                      {evidenceStage
                        ? "Yêu cầu đầy đủ từ Admin"
                        : "Ghi chú xử lý"}
                    </summary>
                    <p>{r.note}</p>
                  </details>
                )}
                {disputeReason && (
                  <details className={styles.history}>
                    <summary>Lý do mở khiếu nại</summary>
                    <p>{disputeReason}</p>
                  </details>
                )}
              </div>
            )}
          </div>
        </section>
      )}
    </section>
  );
}
