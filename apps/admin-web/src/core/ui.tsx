import type { ComponentPropsWithRef, ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { ApiError } from "@used-books/session-client";
import { errorText } from "./errors";

export function Button({
  busy,
  children,
  className = "",
  variant = "default",
  ...props
}: ComponentPropsWithRef<"button"> & {
  busy?: boolean;
  variant?: "default" | "primary" | "secondary" | "danger";
}) {
  const variantClass =
    variant === "primary" ? "primary" : variant === "danger" ? "danger" : "";
  const combinedClass = `button ${variantClass} ${className}`.trim();

  return (
    <button
      type="button"
      {...props}
      className={combinedClass}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy ? (
        <>
          <Loader2 className="animate-spin" size={16} aria-hidden="true" />
          <span>{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function CursorPagination({
  pageCount,
  hasNextPage,
  isFetchingNextPage,
  isFetching,
  error,
  onNextPage,
  nextLabel,
}: {
  pageCount: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetching: boolean;
  error?: unknown;
  onNextPage: () => void;
  nextLabel: string;
}) {
  if (!pageCount) return null;
  return (
    <div>
      {error != null && (
        <>
          <ErrorNotice error={error} />
          <p className="muted" role="status">
            Chưa tải được trang tiếp theo. Danh sách đã tải vẫn được giữ.
          </p>
        </>
      )}
      <nav className="cursor-pagination" aria-label="Phân trang">
        <p aria-live="polite">
          Đã tải {pageCount} trang.{!hasNextPage && error == null ? " Đã tải hết danh sách." : ""}
        </p>
        {hasNextPage && (
          <Button busy={isFetchingNextPage} disabled={isFetching} onClick={onNextPage}>
            {error != null ? "Thử tải thêm" : nextLabel}
          </Button>
        )}
      </nav>
    </div>
  );
}

export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "error" | "success" | "warning";
}) {
  const Icon =
    tone === "error"
      ? AlertCircle
      : tone === "warning"
        ? AlertTriangle
        : tone === "success"
          ? CheckCircle2
          : Info;

  return (
    <div
      className={`notice ${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
        <Icon size={18} style={{ flexShrink: 0, marginTop: "2px" }} aria-hidden="true" />
        <div style={{ flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

export function ErrorNotice({
  error,
  retry,
  busy,
  describe = errorText,
}: {
  error: unknown;
  retry?: () => void;
  busy?: boolean;
  describe?: (error: unknown) => string;
}) {
  const id =
    error instanceof ApiError &&
    /^[a-zA-Z0-9_-]{1,80}$/.test(error.requestId || "")
      ? error.requestId
      : undefined;
  return (
    <Notice tone="error">
      <p>{describe(error)}</p>
      {id && <small style={{ display: "block", marginTop: "4px" }}>Mã hỗ trợ: {id}</small>}
      {retry && (
        <Button busy={busy} onClick={retry} style={{ marginTop: "8px" }}>
          Thử tải lại
        </Button>
      )}
    </Notice>
  );
}

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "success" | "warning" | "error" | "info" | "neutral";
}) {
  return (
    <span className={`status-pill ${tone}`}>
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          backgroundColor: "currentColor",
          display: "inline-block",
        }}
        aria-hidden="true"
      />
      {children}
    </span>
  );
}

export function Card({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`admin-card ${className}`}
      style={{
        background: "var(--surface)",
        borderRadius: "12px",
        border: "1px solid var(--shop-line)",
        boxShadow: "var(--shadow-sm)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function LoadingSpinner({ text = "Đang tải dữ liệu…" }: { text?: string }) {
  return (
    <div
      role="status"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        padding: "3.5rem 1rem",
        color: "var(--shop-muted)",
      }}
    >
      <Loader2
        size={32}
        className="admin-loading-spinner"
        style={{ color: "var(--shop-wine)" }}
        aria-hidden="true"
      />
      <p style={{ margin: 0, fontSize: "0.9rem" }}>{text}</p>
    </div>
  );
}
