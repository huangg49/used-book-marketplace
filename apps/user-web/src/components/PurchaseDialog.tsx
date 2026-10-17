import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import styles from "./PurchaseDialog.module.css";

/** Native modal supplies focus containment and makes the background inert. */
export function PurchaseDialog({
  open,
  onClose,
  title,
  description,
  busy = false,
  children,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  busy?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, [open]);
  useEffect(() => {
    if (open) {
      ref.current?.querySelector<HTMLElement>("h2")?.focus();
      ref.current?.scrollTo({ top: 0 });
    }
  }, [open, title]);
  return createPortal(
    <dialog
      ref={ref}
      className={`${styles.dialog} ${className}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const focusable = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'button, input, select, textarea, a[href], [tabindex="0"]',
          ),
        ].filter(
          (node) =>
            !node.matches(":disabled") && node.getClientRects().length > 0,
        );
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first) {
          event.preventDefault();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !focusable.includes(document.activeElement as HTMLElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onClick={(event) => {
        // A click on the dialog's scrollbar or padding is not a backdrop click.
        if (event.target !== event.currentTarget || busy) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          onClose();
      }}
    >
      <header className={styles.header}>
        <div>
          <h2 id={titleId} tabIndex={-1} autoFocus>
            {title}
          </h2>
          {description && <p id={descriptionId}>{description}</p>}
        </div>
        <button
          type="button"
          className={styles.close}
          aria-label="Đóng popup"
          disabled={busy}
          onClick={onClose}
        >
          <X size={22} aria-hidden="true" />
        </button>
      </header>
      <div className={styles.body}>{children}</div>
    </dialog>,
    document.body,
  );
}
