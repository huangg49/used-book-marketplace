import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./ui";
import styles from "./ConfirmDialog.module.css";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  busy?: boolean;
  confirmDisabled?: boolean;
  danger?: boolean;
  error?: ReactNode;
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = "Quay lại",
  onConfirm,
  busy = false,
  confirmDisabled = false,
  danger = false,
  error,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const trigger = useRef<Element | null>(null);
  const uid = useId();
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    trigger.current = document.activeElement;
    if (!dialog.open) dialog.showModal();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = prevOverflow;
      if (trigger.current instanceof HTMLElement && trigger.current.isConnected) {
        trigger.current.focus({ preventScroll: true });
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      data-danger={danger || undefined}
      role={danger ? "alertdialog" : "dialog"}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget || busy) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        ) {
          onClose();
        }
      }}
    >
      <header className={styles.header}>
        <h2 id={titleId} className={danger ? styles.titleDanger : styles.title}>
          {title}
        </h2>
        <button
          type="button"
          className={styles.closeBtn}
          aria-label="Đóng hộp thoại"
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className={styles.body}>
        {description && (
          <p id={descId} className={styles.description}>
            {description}
          </p>
        )}
        {children}
        {error && (
          <div role="alert" className={styles.errorBox}>
            {error}
          </div>
        )}
      </div>
      <footer className={styles.footer}>
        <Button autoFocus disabled={busy} onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button
          variant={danger ? "danger" : "primary"}
          busy={busy}
          disabled={confirmDisabled}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </footer>
    </dialog>
  );
}
