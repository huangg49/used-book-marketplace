import { useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, CircleAlert, ClipboardCheck } from "lucide-react";
import { Link, useBlocker } from "react-router-dom";
import { session } from "../../core/session";
import { LeaveGuard } from "../../core/leave-guard";
import { Button, ErrorNotice, Notice } from "../../core/ui";
import { checks, labels, type DecisionBody, type Kind } from "./contracts";
import {
  createIntent,
  createRemovalIntent,
  executeIntent,
  validReason,
  type Intent,
} from "./decision-command";
import styles from "./ReviewWorkspace.module.css";

export function DecisionForm({
  kind,
  id,
  version,
  revisionId,
  canApprove,
  approvalBlock,
  approvalAction,
  photosReady,
  disabled,
  reconcile,
  onPending,
  removal = false,
  bundle = false,
  onRecorded,
  onChecklistProgress,
  subject,
  revisionNumber,
}: {
  kind: Kind;
  id: string;
  version: number;
  revisionId: string;
  canApprove: boolean;
  approvalBlock?: string;
  approvalAction?: { to: string; label: string };
  photosReady: boolean;
  disabled: boolean;
  reconcile: () => Promise<void>;
  onPending: (value: boolean) => void;
  removal?: boolean;
  bundle?: boolean;
  onRecorded?: (intent: Intent) => void;
  onChecklistProgress?: (count: number) => void;
  subject?: ReactNode;
  revisionNumber?: number;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [rejectReasonOpen, setRejectReasonOpen] = useState(false);
  const [choice, setChoice] = useState<
    "Approve" | "Confirm" | "Reject" | "Remove" | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [reasonError, setReasonError] = useState(false);
  const [done, setDone] = useState<"recorded" | "reconciled" | null>(null);
  const [intent, setIntent] = useState<Intent>();
  const dialog = useRef<HTMLDialogElement>(null);
  const leaveDialog = useRef<HTMLDialogElement>(null);
  const stayButton = useRef<HTMLButtonElement>(null);
  const leaveTitleId = useId();
  const registerGuard = useContext(LeaveGuard);
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const recoveryButton = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const dirty = !done && (!!reason || checked.size > 0 || !!intent || busy);
  const blocker = useBlocker(dirty);
  useEffect(() => {
    registerGuard(
      dirty
        ? () =>
            !busy &&
            window.confirm(
              "Đăng xuất sẽ bỏ các ô kiểm tra, lý do và yêu cầu chưa đối chiếu. Tiếp tục đăng xuất?",
            )
        : undefined,
    );
    return () => registerGuard(undefined);
  }, [dirty, busy, registerGuard]);
  useEffect(() => {
    onPending(!!intent || busy);
    return () => onPending(false);
  }, [intent, busy, onPending]);
  useEffect(() => {
    // The original action is disabled while an intent needs reconciliation.
    // After the dialog closes, keep keyboard users beside the recovery message.
    if (error !== undefined && !busy) recoveryButton.current?.focus();
  }, [error, busy]);
  useEffect(() => {
    const prompt = leaveDialog.current;
    if (!prompt) return;
    if (blocker.state !== "blocked") {
      prompt.close();
      return;
    }
    prompt.showModal();
    const focusStay = () => {
      if (prompt.open && !prompt.contains(prompt.ownerDocument.activeElement))
        stayButton.current?.focus({ preventScroll: true });
    };
    focusStay();
    // Closing the previous modal can restore focus after this prompt opens.
    const frame = requestAnimationFrame(focusStay);
    return () => cancelAnimationFrame(frame);
  }, [blocker.state]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const locked = disabled || busy || !!intent || !!done;
  const approvalHintId = useId();
  const reasonId = useId();
  const listingReview = kind === "listings" && !removal;
  const showReason = !listingReview || rejectReasonOpen;
  useEffect(() => {
    onChecklistProgress?.(checked.size);
  }, [checked.size, onChecklistProgress]);
  useLayoutEffect(() => {
    if (rejectReasonOpen) reasonInput.current?.focus();
  }, [rejectReasonOpen]);
  const showApprovalGate =
    kind === "listings" && !removal && !done && !intent &&
    (!canApprove || !photosReady);
  const ready =
    canApprove &&
    (kind === "catalog-requests" ||
      (checked.size === (bundle ? 7 : 6) && photosReady));
  const select = (decision: typeof choice) => {
    if (decision === "Reject" && listingReview && !rejectReasonOpen) {
      setRejectReasonOpen(true);
      return;
    }
    if (
      (decision === "Reject" || decision === "Remove") &&
      !validReason(reason)
    ) {
      setReasonError(true);
      reasonInput.current?.focus();
      return;
    }
    setError(undefined);
    setReasonError(false);
    setChoice(decision);
    dialog.current?.showModal();
  };
  async function send(retry?: Intent) {
    if (inFlight.current) return;
    let active = retry;
    if (!active) {
      if (
        !choice ||
        locked ||
        (choice !== "Reject" && choice !== "Remove" && !ready)
      )
        return;
      if (choice === "Remove")
        active = createRemovalIntent(id, version, reason);
      else {
        const base = { expectedVersion: version, revisionId };
        const body: DecisionBody =
          choice === "Reject"
            ? { ...base, decision: choice, reason: reason.trim() }
            : choice === "Confirm"
              ? { ...base, decision: choice }
              : {
                  ...base,
                  decision: choice,
                  checklist: {
                    ...(bundle
                      ? { bundleContentsVerified: true as const }
                      : {}),
                    catalogMatches: true,
                    photosClear: true,
                    conditionDisclosed: true,
                    readable: true,
                    pricingValid: true,
                    contentAppropriate: true,
                  },
                };
        active = createIntent(kind, id, body);
      }
      setIntent(active);
    }
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await executeIntent(active, session.request.bind(session), reconcile);
      onRecorded?.(active);
      setDone(
        active.acknowledged && !active.stopped ? "recorded" : "reconciled",
      );
      setReason("");
      setChecked(new Set());
      setIntent(undefined);
    } catch (cause) {
      setError(cause);
    } finally {
      inFlight.current = false;
      setBusy(false);
      dialog.current?.close();
    }
  }
  const leavePrompt = (
    <dialog
      ref={leaveDialog}
      className={styles.leavePrompt}
      aria-labelledby={leaveTitleId}
      onCancel={(event) => {
        event.preventDefault();
        if (blocker.state === "blocked") blocker.reset();
      }}
    >
      <h3 id={leaveTitleId}>Rời hồ sơ đang xem?</h3>
      <p>
        {intent
          ? "Yêu cầu chưa được đối chiếu xong. Nếu rời đi, hãy tải lại hồ sơ để kiểm tra kết quả trước khi quyết định tiếp."
          : "Các ô kiểm tra và lý do chưa gửi sẽ bị bỏ."}
      </p>
      <div className="actions">
        <Button
          ref={stayButton}
          onClick={() => {
            if (blocker.state === "blocked") blocker.reset();
          }}
        >
          Ở lại hồ sơ
        </Button>
        <Button
          disabled={busy}
          onClick={() => {
            if (blocker.state === "blocked") blocker.proceed();
          }}
        >
          Rời hồ sơ
        </Button>
      </div>
    </dialog>
  );
  return (
    <aside className="decision-panel" aria-label="Quyết định kiểm duyệt">
      <h3>
        <ClipboardCheck size={21} aria-hidden="true" />
        {removal ? "Gỡ bài đăng" : "Quyết định kiểm duyệt"}
      </h3>
      <p className="muted">
        {removal
          ? "Nêu rõ vi phạm để người đăng biết lý do xử lý."
          : "Đối chiếu đủ thông tin trước khi xác nhận."}
      </p>
      {kind === "listings" && !removal && (
        <div className={styles.progress}>
          <div className={styles.progressLabel} aria-live="polite">
            <span>Đã đối chiếu</span>
            <strong>
              {checked.size} / {bundle ? 7 : 6} mục
            </strong>
          </div>
          <progress
            value={checked.size}
            max={bundle ? 7 : 6}
            aria-label="Tiến độ đối chiếu hồ sơ"
          />
        </div>
      )}
      {kind === "listings" && !removal && (
        <fieldset disabled={locked}>
          <legend>Kiểm tra trước khi duyệt</legend>
          {Object.entries(checks)
            .filter(([key]) => bundle || key !== "bundleContentsVerified")
            .map(([key, label]) => (
              <label className="check" key={key}>
                <input
                  type="checkbox"
                  checked={checked.has(key)}
                  onChange={(event) =>
                    setChecked((previous) => {
                      const next = new Set(previous);
                      if (event.target.checked) next.add(key);
                      else next.delete(key);
                      return next;
                    })
                  }
                />
                {label}
              </label>
            ))}
        </fieldset>
      )}
      <div hidden={!showReason}>
        <div className="field">
          <label htmlFor={reasonId}>
            {removal ? "Lý do gỡ bài" : "Lý do từ chối"}
          </label>
          <textarea
            id={reasonId}
            ref={reasonInput}
            rows={4}
            value={reason}
            disabled={locked}
            aria-invalid={reasonError}
            aria-describedby={`${reasonId}-hint`}
            onChange={(event) => {
              setReason(event.target.value);
              setReasonError(false);
            }}
          />
        </div>
        <p id={`${reasonId}-hint`} className={reasonError ? "field-error" : "muted"}>
          {reasonError
            ? "Nhập lý do từ 10 đến 1.000 ký tự để người đăng biết cách sửa."
            : removal
              ? "Bắt buộc từ 10–1.000 ký tự. Người đăng sẽ đọc được lý do này."
              : "Chỉ bắt buộc khi từ chối. Nói rõ phần cần sửa, từ 10–1.000 ký tự."}
        </p>
      </div>
      {error !== undefined && <ErrorNotice error={error} />}
      {intent && !done && (
        <Notice tone="warning">
          {intent.acknowledged
            ? "Máy chủ đã ghi nhận quyết định. Cần tải lại kết quả."
            : intent.stopped
              ? "Quyết định chưa được chấp nhận. Tải kết quả mới nhất để kiểm tra."
              : "Chưa biết máy chủ đã nhận quyết định hay chưa. Thử lại đúng yêu cầu này trước khi rời hồ sơ."}
          <Button
            ref={recoveryButton}
            busy={busy}
            onClick={() => void send(intent)}
          >
            {intent.acknowledged || intent.stopped
              ? "Tải kết quả mới nhất"
              : "Thử lại quyết định vừa gửi"}
          </Button>
        </Notice>
      )}
      {showApprovalGate && (
        <div
          id={approvalHintId}
          className={styles.decisionGate}
          role="status"
          aria-label="Điều kiện duyệt bài"
        >
          <h4>
            <CircleAlert size={17} aria-hidden="true" />
            Chưa thể duyệt bài đăng
          </h4>
          <p>
            {!canApprove
              ? approvalBlock ||
                "Chưa đủ điều kiện duyệt. Kiểm tra các thông tin trong hồ sơ."
              : "Cần tải thành công toàn bộ ảnh người đăng gửi trước khi duyệt."}
          </p>
          {!canApprove && approvalAction && (
            <Link to={approvalAction.to}>
              {approvalAction.label}
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
      {done ? (
        <Notice tone={done === "recorded" ? "success" : "info"}>
          Đã đối chiếu kết quả với máy chủ. Trạng thái mới nhất hiển thị trong
          hồ sơ.
        </Notice>
      ) : (
        <div className="actions">
          {removal ? (
            <Button disabled={locked} onClick={() => select("Remove")}>
              Gỡ bài đăng
            </Button>
          ) : (
            <>
              <Button
                className="primary"
                aria-describedby={showApprovalGate ? approvalHintId : undefined}
                disabled={locked || !ready}
                onClick={() =>
                  select(kind === "listings" ? "Approve" : "Confirm")
                }
              >
                {kind === "listings" ? "Duyệt bài đăng" : "Xác nhận đầu sách"}
              </Button>
              <Button disabled={locked} onClick={() => select("Reject")}>
                {listingReview && rejectReasonOpen ? "Tiếp tục từ chối" : "Từ chối có lý do"}
              </Button>
            </>
          )}
        </div>
      )}
      <dialog
        ref={dialog}
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
        aria-labelledby="decision-title"
      >
        <h3 id="decision-title">
          {choice === "Remove" ? "Gỡ bài đăng" : labels[choice || ""]}?
        </h3>
        <p>
          {removal
            ? "Bài sẽ ngừng công khai. Người đăng không thể tự mở lại; nội dung và lý do được giữ để đối chiếu. Thao tác này không xử lý giao dịch."
            : "Quyết định sẽ được lưu vào lịch sử của bản gửi đang xem."}
        </p>
        {subject && (
          <div className={styles.decisionSubject}>
            <strong>{subject}</strong>
            <span>#{id.slice(0, 8)} · Bản gửi {revisionNumber}</span>
          </div>
        )}
        {(choice === "Reject" || choice === "Remove") && (
          <blockquote className="prose">{reason.trim()}</blockquote>
        )}
        <div className="actions">
          <Button
            autoFocus
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            Quay lại kiểm tra
          </Button>
          <Button className="primary" busy={busy} onClick={() => void send()}>
            Xác nhận quyết định
          </Button>
        </div>
      </dialog>
      {kind === "listings" ? createPortal(leavePrompt, document.body) : leavePrompt}
    </aside>
  );
}
