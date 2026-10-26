import { useContext, useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
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

export function DecisionForm({
  kind,
  id,
  version,
  revisionId,
  canApprove,
  photosReady,
  disabled,
  reconcile,
  onPending,
  removal = false,
  bundle = false,
}: {
  kind: Kind;
  id: string;
  version: number;
  revisionId: string;
  canApprove: boolean;
  photosReady: boolean;
  disabled: boolean;
  reconcile: () => Promise<void>;
  onPending: (value: boolean) => void;
  removal?: boolean;
  bundle?: boolean;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [choice, setChoice] = useState<
    "Approve" | "Confirm" | "Reject" | "Remove" | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [reasonError, setReasonError] = useState(false);
  const [done, setDone] = useState(false);
  const [intent, setIntent] = useState<Intent>();
  const dialog = useRef<HTMLDialogElement>(null);
  const leaveDialog = useRef<HTMLDialogElement>(null);
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
    if (blocker.state === "blocked") leaveDialog.current?.showModal();
    else leaveDialog.current?.close();
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
  const locked = disabled || busy || !!intent || done;
  const ready =
    canApprove &&
    (kind === "catalog-requests" || (checked.size === (bundle ? 7 : 6) && photosReady));
  const select = (decision: typeof choice) => {
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
                    ...(bundle ? { bundleContentsVerified: true as const } : {}),
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
      setDone(true);
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
  return (
    <aside className="decision-panel" aria-label="Quyết định kiểm duyệt">
      <p className="eyebrow">
        {removal ? "Xử lý bài vi phạm" : "Kết luận cho bản gửi này"}
      </p>
      <h3>
        {removal ? "Gỡ bài phải có lý do." : "Mỗi dấu duyệt, một lần đọc kỹ."}
      </h3>
      <p className="muted">
        Đối chiếu thông tin được cung cấp. Không dùng kết quả duyệt để cam kết
        sách chính hãng.
      </p>
      {kind === "listings" && !removal && (
        <fieldset disabled={locked}>
          <legend>Kiểm tra trước khi duyệt</legend>
          {Object.entries(checks).filter(([key]) => bundle || key !== 'bundleContentsVerified').map(([key, label]) => (
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
      {kind === "listings" && !removal && !photosReady && !done && (
        <p className="muted">Cần tải được toàn bộ ảnh trước khi duyệt.</p>
      )}
      <div className="field">
        <label htmlFor="decision-reason">
          {removal ? "Lý do gỡ bài" : "Lý do từ chối"}
        </label>
        <textarea
          id="decision-reason"
          ref={reasonInput}
          rows={4}
          value={reason}
          disabled={locked}
          aria-invalid={reasonError}
          aria-describedby="reason-hint"
          onChange={(event) => {
            setReason(event.target.value);
            setReasonError(false);
          }}
        />
      </div>
      <p id="reason-hint" className={reasonError ? "field-error" : "muted"}>
        {reasonError
          ? "Nhập lý do từ 10 đến 1.000 ký tự để người đăng biết cách sửa."
          : removal
            ? "Bắt buộc từ 10–1.000 ký tự. Người đăng sẽ đọc được lý do này."
            : "Chỉ bắt buộc khi từ chối. Nói rõ phần cần sửa, từ 10–1.000 ký tự."}
      </p>
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
      {done ? (
        <Notice tone={intent?.stopped ? "info" : "success"}>
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
                disabled={locked || !ready}
                onClick={() =>
                  select(kind === "listings" ? "Approve" : "Confirm")
                }
              >
                {kind === "listings" ? "Duyệt bài đăng" : "Xác nhận đầu sách"}
              </Button>
              <Button disabled={locked} onClick={() => select("Reject")}>
                Từ chối có lý do
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
      <dialog
        ref={leaveDialog}
        aria-labelledby="leave-title"
        onCancel={(event) => {
          event.preventDefault();
          if (blocker.state === "blocked") blocker.reset();
        }}
      >
        <h3 id="leave-title">Rời hồ sơ đang xem?</h3>
        <p>
          {intent
            ? "Yêu cầu chưa được đối chiếu xong. Nếu rời đi, hãy tải lại hồ sơ để kiểm tra kết quả trước khi quyết định tiếp."
            : "Các ô kiểm tra và lý do chưa gửi sẽ bị bỏ."}
        </p>
        <div className="actions">
          <Button
            autoFocus
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
    </aside>
  );
}
