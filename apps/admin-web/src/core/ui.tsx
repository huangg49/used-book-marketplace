import type { ComponentPropsWithRef, ReactNode } from "react";
import { ApiError } from "@used-books/session-client";
import { errorText } from "./errors";

export function Button({
  busy,
  children,
  className = "",
  ...props
}: ComponentPropsWithRef<"button"> & { busy?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`button ${className}`}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
    >
      {children}
      {busy && <span aria-hidden="true"> …</span>}
    </button>
  );
}
export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "error" | "success" | "warning";
}) {
  return (
    <div
      className={`notice ${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
export function ErrorNotice({
  error,
  retry,
  busy,
}: {
  error: unknown;
  retry?: () => void;
  busy?: boolean;
}) {
  const id =
    error instanceof ApiError &&
    /^[a-zA-Z0-9_-]{1,80}$/.test(error.requestId || "")
      ? error.requestId
      : undefined;
  return (
    <Notice tone="error">
      <p>{errorText(error)}</p>
      {id && <small>Mã hỗ trợ: {id}</small>}
      {retry && (
        <Button busy={busy} onClick={retry}>
          Thử tải lại
        </Button>
      )}
    </Notice>
  );
}
