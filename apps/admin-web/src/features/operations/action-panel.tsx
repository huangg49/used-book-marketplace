import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useBlocker } from "react-router-dom";
import type { z } from "zod";
import { createCommand, runCommand, type Intent } from "../../core/command";
import { operationErrorText } from "../../core/errors";
import { LeaveGuard } from "../../core/leave-guard";
import { session } from "../../core/session";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateDashboard } from "../../core/dashboard-cache";
import { Button, ErrorNotice, Notice } from "../../core/ui";
import { commandReceipt, type CommandReceipt } from "./contracts";

export type Outcome = {
  tone: "success" | "info" | "warning";
  text: string;
  // false keeps the panel open for another attempt, e.g. a wrong handover code.
  close: boolean;
};
export type Finish = (outcome: Omit<Outcome, "close">) => void;

// One confirmed command on one queue row. The request body and key are frozen
// when the person confirms; an unknown result is retried as the same request.
// Auction commands answer with the auction receipt; point commands pass theirs.
export function ActionPanel<R = CommandReceipt>({
  label,
  title,
  intro,
  fields,
  dirty = false,
  submitLabel,
  confirmTitle,
  confirmBody,
  validate = () => true,
  build,
  schema = commandReceipt as unknown as z.ZodType<R>,
  interpret,
  reconcile,
  onFinish,
  onPending,
  refusalText = "Thao tác chưa được thực hiện. Danh sách đã tải lại theo trạng thái mới nhất.",
  refusalRecoveryText = "Thao tác chưa được chấp nhận. Tải trạng thái mới nhất để kiểm tra.",
  refusalRecoveryLabel = "Tải kết quả mới nhất",
}: {
  label: string;
  title: string;
  intro?: ReactNode;
  fields?: (locked: boolean) => ReactNode;
  dirty?: boolean;
  submitLabel: string;
  confirmTitle: string;
  confirmBody: ReactNode;
  validate?: () => boolean;
  // `key` only where the API binds the Idempotency-Key to the payload
  // (a simulated carrier event id); otherwise a fresh key per confirmation.
  build: () => { path: string; body: unknown; key?: string };
  schema?: z.ZodType<R>;
  interpret: (receipt: R) => Outcome;
  reconcile: () => Promise<unknown>;
  onFinish: Finish;
  onPending: (pending: boolean) => void;
  refusalText?: string;
  refusalRecoveryText?: string;
  refusalRecoveryLabel?: string;
}) {
  const queryClient = useQueryClient();
  const [intent, setIntent] = useState<Intent>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [outcome, setOutcome] = useState<Outcome>();
  const dialog = useRef<HTMLDialogElement>(null);
  const leaveDialog = useRef<HTMLDialogElement>(null);
  const recoveryButton = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const registerGuard = useContext(LeaveGuard);
  const unresolved = !!intent || busy;
  const guarded = unresolved || dirty;
  const blocker = useBlocker(guarded);
  useEffect(() => {
    onPending(unresolved);
    return () => onPending(false);
  }, [unresolved, onPending]);
  useEffect(() => {
    registerGuard(
      guarded
        ? () =>
            !busy &&
            window.confirm(
              unresolved
                ? "Thao tác vừa gửi chưa được đối chiếu. Đăng xuất bây giờ có thể bỏ lỡ kết quả. Tiếp tục đăng xuất?"
                : "Thông tin đang nhập sẽ bị bỏ. Tiếp tục đăng xuất?",
            )
        : undefined,
    );
    return () => registerGuard(undefined);
  }, [guarded, unresolved, busy, registerGuard]);
  useEffect(() => {
    if (!guarded) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [guarded]);
  useEffect(() => {
    if (blocker.state === "blocked") leaveDialog.current?.showModal();
    else leaveDialog.current?.close();
  }, [blocker.state]);
  useEffect(() => {
    if (error !== undefined && !busy) recoveryButton.current?.focus();
  }, [error, busy]);

  async function send(retry?: Intent) {
    if (inFlight.current) return;
    let active = retry;
    if (!active) {
      const { path, body, key } = build();
      active = createCommand(path, body, key);
      setIntent(active);
    }
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    setOutcome(undefined);
    try {
      const receipt = await runCommand(
        active,
        schema,
        session.request.bind(session),
        async () => {
          await invalidateDashboard(queryClient);
          await reconcile();
        },
      );
      setIntent(undefined);
      if (!receipt) {
        // A definite refusal, now reconciled with the latest queue.
        onFinish({
          tone: "info",
          text: refusalText,
        });
        return;
      }
      const next = interpret(receipt);
      if (next.close) onFinish(next);
      else setOutcome(next);
    } catch (cause) {
      setError(cause);
    } finally {
      inFlight.current = false;
      setBusy(false);
      dialog.current?.close();
    }
  }
  const locked = busy || !!intent;
  return (
    <section className="decision-panel operation-panel" aria-label={label}>
      <h3>{title}</h3>
      {intro && <p className="muted">{intro}</p>}
      {fields?.(locked)}
      {outcome && <Notice tone={outcome.tone}>{outcome.text}</Notice>}
      {error !== undefined && (
        <ErrorNotice error={error} describe={operationErrorText} />
      )}
      {intent ? (
        <Notice tone="warning">
          {intent.acknowledged
            ? "Máy chủ đã ghi nhận thao tác. Cần tải lại kết quả."
            : intent.stopped
              ? refusalRecoveryText
              : "Chưa biết máy chủ đã nhận thao tác hay chưa. Thử lại đúng yêu cầu này trước khi rời đi."}
          <Button
            ref={recoveryButton}
            busy={busy}
            onClick={() => void send(intent)}
          >
            {intent.stopped
              ? refusalRecoveryLabel
              : intent.acknowledged
                ? "Tải kết quả mới nhất"
                : "Thử lại thao tác vừa gửi"}
          </Button>
        </Notice>
      ) : (
        <div className="actions">
          <Button
            className="primary"
            disabled={locked}
            onClick={() => {
              setOutcome(undefined);
              if (validate()) dialog.current?.showModal();
            }}
          >
            {submitLabel}
          </Button>
        </div>
      )}
      <dialog
        ref={dialog}
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
        aria-label={confirmTitle}
      >
        <h3>{confirmTitle}</h3>
        {confirmBody}
        <div className="actions">
          <Button
            autoFocus
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            Quay lại
          </Button>
          <Button className="primary" busy={busy} onClick={() => void send()}>
            Xác nhận
          </Button>
        </div>
      </dialog>
      <dialog
        ref={leaveDialog}
        aria-label="Rời thao tác đang mở?"
        onCancel={(event) => {
          event.preventDefault();
          if (blocker.state === "blocked") blocker.reset();
        }}
      >
        <h3>Rời thao tác đang mở?</h3>
        <p>
          {unresolved
            ? "Thao tác vừa gửi chưa được đối chiếu. Nếu rời đi, hãy mở lại danh sách để kiểm tra kết quả trước khi làm tiếp."
            : "Thông tin đang nhập sẽ bị bỏ."}
        </p>
        <div className="actions">
          <Button
            autoFocus
            onClick={() => {
              if (blocker.state === "blocked") blocker.reset();
            }}
          >
            Ở lại
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              if (blocker.state === "blocked") blocker.proceed();
            }}
          >
            Rời đi
          </Button>
        </div>
      </dialog>
    </section>
  );
}
