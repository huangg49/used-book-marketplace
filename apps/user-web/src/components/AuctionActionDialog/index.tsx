import { useEffect, useId, useRef, type ReactNode } from 'react'
import { ArrowRight, TriangleAlert, X } from 'lucide-react'
import { lockPageScroll } from '../../lib/page-scroll'
import { playAuctionMotion, sheetFrames } from '../../lib/auction-motion'
import { InfoTip } from '../InfoTip'
import styles from './AuctionActionDialog.module.css'

export interface AuctionDialogStep {
  icon: ReactNode
  label: string
  detail: ReactNode
  result?: boolean
}

export interface AuctionActionDialogProps {
  isOpen: boolean
  paused?: boolean
  onClose: () => void
  onConfirm: () => void
  icon: ReactNode
  title: string
  bookTitle: string
  /** Optional highlighted amount summary at the top of the body. */
  amount?: {
    label: string
    value: string
    tipLabel?: string
    tip?: ReactNode
    delta?: string
  }
  /** Optional extra inline node (e.g., wallet shortfall line or problem description). */
  extra?: ReactNode
  /** Visual timeline showing what happens next. Final result step gets a gold highlight. */
  steps?: AuctionDialogStep[]
  /** Short intro sentence when no timeline is needed (e.g., blocked by problem). */
  problem?: string | null
  /** Danger mode: rust header/CTA, alertdialog role, warning above buttons, focus on safe button. */
  danger?: boolean
  /** Irreversible warning pinned directly above footer buttons in danger mode. */
  warning?: ReactNode
  cancelText?: string
  confirmText: string
  busyText?: string
  isBusy?: boolean
  confirmDisabled?: boolean
  error?: string | null
}

/**
 * Shared auction confirmation sheet matching ScheduleAuctionDialog & WithdrawIntakeDialog:
 * wine (or rust for destructive) gradient header with icon badge + book title,
 * visual timeline body with rules tucked into ⓘ tooltips, pinned equal-width footer.
 */
export function AuctionActionDialog({
  isOpen,
  paused = false,
  onClose,
  onConfirm,
  icon,
  title,
  bookTitle,
  amount,
  extra,
  steps,
  problem,
  danger = false,
  warning,
  cancelText,
  confirmText,
  busyText = 'Đang xử lý…',
  isBusy = false,
  confirmDisabled = false,
  error,
}: AuctionActionDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const safeBtn = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const ids = useId()
  const visible = isOpen && !paused
  const resolvedCancel = cancelText ?? (danger ? 'Giữ lại' : 'Hủy')

  useEffect(() => (visible ? lockPageScroll() : undefined), [visible])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (visible && !dialog.open) {
      openerRef.current = document.activeElement as HTMLElement | null
      dialog.showModal()
      if (danger) {
        safeBtn.current?.focus()
      } else {
        dialog.focus()
      }
      const stop = playAuctionMotion(dialog, sheetFrames, 220)
      return () => {
        stop()
        if (dialog.open) dialog.close()
        if (openerRef.current?.isConnected) {
          openerRef.current.focus({ preventScroll: true })
        }
      }
    }
    if (!visible && dialog.open) dialog.close()
  }, [visible, danger])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const onCancel = (event: Event) => {
      event.preventDefault()
      if (!isBusy) onClose()
    }
    const onBackdrop = (event: MouseEvent) => {
      if (event.target === dialog && !isBusy) onClose()
    }
    dialog.addEventListener('cancel', onCancel)
    dialog.addEventListener('click', onBackdrop)
    return () => {
      dialog.removeEventListener('cancel', onCancel)
      dialog.removeEventListener('click', onBackdrop)
    }
  }, [isBusy, onClose])

  if (!isOpen) return null

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      data-lenis-prevent="true"
      className={styles.dialog}
      data-danger={danger || undefined}
      role={danger ? 'alertdialog' : 'dialog'}
      aria-labelledby={`${ids}-title`}
      aria-describedby={warning ? `${ids}-warn` : problem ? `${ids}-problem` : undefined}
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
          {problem ? (
            <p id={`${ids}-problem`} className={styles.problem} role="alert">
              <TriangleAlert size={16} aria-hidden="true" />
              <span>{problem}</span>
            </p>
          ) : (
            <>
              {amount && (
                <div className={styles.amountCard}>
                  <div className={styles.amountLabelRow}>
                    <span>{amount.label}</span>
                    {amount.tip && (
                      <InfoTip label={amount.tipLabel ?? amount.label}>
                        {amount.tip}
                      </InfoTip>
                    )}
                    {amount.delta && <span className={styles.delta}>{amount.delta}</span>}
                  </div>
                  <strong className={styles.amountValue}>{amount.value}</strong>
                </div>
              )}

              {extra}

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
            </>
          )}

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
              disabled={isBusy || confirmDisabled || !!problem}
              aria-busy={isBusy}
            >
              <span>{isBusy ? busyText : confirmText}</span>
              {!isBusy && <ArrowRight size={16} aria-hidden="true" />}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  )
}
