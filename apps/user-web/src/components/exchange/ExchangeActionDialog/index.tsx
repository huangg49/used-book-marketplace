import { useEffect, useId, useRef, type ReactNode } from 'react';
import { ArrowRight, TriangleAlert, X } from 'lucide-react';
import { lockPageScroll } from '../../../lib/page-scroll';
import { InfoTip } from '../../InfoTip';
import styles from './ExchangeActionDialog.module.css';

export interface ExchangeDialogStep {
  icon: ReactNode;
  label: string;
  detail: ReactNode;
  result?: boolean;
}

export interface ExchangeActionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  icon: ReactNode;
  title: string;
  bookTitle: string;
  amount?: {
    label: string;
    value: string;
    tipLabel?: string;
    tip?: ReactNode;
  };
  steps?: ExchangeDialogStep[];
  children?: ReactNode;
  danger?: boolean;
  warning?: ReactNode;
  cancelText?: string;
  confirmText: string;
  busyText?: string;
  isBusy?: boolean;
  confirmDisabled?: boolean;
  error?: string | null;
  wide?: boolean;
}

export function ExchangeActionDialog({
  isOpen,
  onClose,
  onConfirm,
  icon,
  title,
  bookTitle,
  amount,
  steps,
  children,
  danger = false,
  warning,
  cancelText,
  confirmText,
  busyText = 'Đang xử lý…',
  isBusy = false,
  confirmDisabled = false,
  error,
  wide = false,
}: ExchangeActionDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const safeBtn = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const ids = useId();
  const resolvedCancel = cancelText ?? (danger ? 'Giữ lại' : 'Hủy');

  useEffect(() => (isOpen ? lockPageScroll() : undefined), [isOpen]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      openerRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      if (danger) {
        safeBtn.current?.focus();
      } else {
        dialog.focus();
      }
      return () => {
        if (dialog.open) dialog.close();
        if (openerRef.current?.isConnected) {
          openerRef.current.focus({ preventScroll: true });
        }
      };
    }
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen, danger]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancel = (event: Event) => {
      event.preventDefault();
      if (!isBusy) onClose();
    };
    const onBackdrop = (event: MouseEvent) => {
      if (event.target === dialog && !isBusy) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || isBusy) return;
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('click', onBackdrop);
    dialog.addEventListener('keydown', onKeyDown);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('click', onBackdrop);
      dialog.removeEventListener('keydown', onKeyDown);
    };
  }, [isBusy, onClose]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      data-lenis-prevent="true"
      className={styles.dialog}
      data-danger={danger || undefined}
      data-wide={wide || undefined}
      role={danger ? 'alertdialog' : 'dialog'}
      aria-labelledby={`${ids}-title`}
      aria-describedby={warning ? `${ids}-warn` : undefined}
    >
      <div className={styles.sheet}>
        <header className={styles.header} data-focus-inverse>
          <span className={styles.badge} aria-hidden="true">{icon}</span>
          <span className={styles.heading}>
            <strong id={`${ids}-title`}>{title}</strong>
            <small>{bookTitle}</small>
          </span>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            disabled={isBusy}
            aria-label="Đóng"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className={styles.body}>
          {amount && (
            <div className={styles.amountCard}>
              <div className={styles.amountLabelRow}>
                <span>{amount.label}</span>
                {amount.tip && (
                  <InfoTip label={amount.tipLabel ?? amount.label}>
                    {amount.tip}
                  </InfoTip>
                )}
              </div>
              <strong className={styles.amountValue}>{amount.value}</strong>
            </div>
          )}

          {steps && steps.length > 0 && (
            <ol className={styles.timeline} aria-label="Diễn biến sau khi xác nhận">
              {steps.map((step, i) => (
                <li
                  key={i}
                  className={styles.stop}
                  data-result={step.result || undefined}
                >
                  <span className={styles.node} aria-hidden="true">{step.icon}</span>
                  <div className={styles.stopBody}>
                    <span className={styles.stopLabel}>{step.label}</span>
                    <span className={styles.stopDetail}>{step.detail}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {children}

          {error && <p role="alert" className={styles.error}>{error}</p>}
        </div>

        <footer className={styles.footer}>
          {danger && warning && (
            <p id={`${ids}-warn`} className={styles.warn}>
              <TriangleAlert size={16} aria-hidden="true" />
              <span>{warning}</span>
            </p>
          )}
          <div className={styles.actions}>
            <button
              ref={safeBtn}
              type="button"
              className={styles.cancel}
              onClick={onClose}
              disabled={isBusy}
            >
              {resolvedCancel}
            </button>
            <button
              type="button"
              data-focus-inverse
              className={styles.confirm}
              onClick={onConfirm}
              disabled={isBusy || confirmDisabled}
              aria-busy={isBusy}
            >
              <span>{isBusy ? busyText : confirmText}</span>
              {!isBusy && <ArrowRight size={15} aria-hidden="true" />}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
