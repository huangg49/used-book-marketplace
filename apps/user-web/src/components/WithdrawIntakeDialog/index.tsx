import { useEffect, useId, useRef, type ReactNode } from 'react'
import { ArrowRight, BookOpen, Check, MapPin, PackageMinus, TriangleAlert, X } from 'lucide-react'
import { lockPageScroll } from '../../lib/page-scroll'
import { playAuctionMotion, sheetFrames } from '../../lib/auction-motion'
import styles from './WithdrawIntakeDialog.module.css'

/**
 * Confirm withdrawing a book from auction before it opens (FR-AU02). Same sheet
 * language as the publish dialog: the book, what happens next as a short
 * timeline, the irreversible note beside the actions. "Giữ lại" gets the first
 * focus so a stray Enter never withdraws.
 */
export function WithdrawIntakeDialog({ isOpen, onClose, onConfirm, busy, retry, error, title, pointName, stateLabel, atPoint, cover }: {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  busy: boolean
  /** The last attempt's outcome is unknown: the confirm button replays it. */
  retry: boolean
  error: string | null
  title: string
  pointName: string
  stateLabel: string
  /** The book is already at the point (Received/Passed), not waiting for drop-off. */
  atPoint: boolean
  cover: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const keep = useRef<HTMLButtonElement>(null)
  const ids = useId()

  useEffect(() => (isOpen ? lockPageScroll() : undefined), [isOpen])
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (isOpen && !dialog.open) {
      const opener = document.activeElement as HTMLElement | null
      dialog.showModal()
      keep.current?.focus()
      const stop = playAuctionMotion(dialog, sheetFrames, 220)
      return () => { stop(); if (dialog.open) dialog.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }) }
    }
    if (!isOpen && dialog.open) dialog.close()
  }, [isOpen])
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const cancel = (event: Event) => { event.preventDefault(); if (!busy) onClose() }
    const backdrop = (event: MouseEvent) => { if (event.target === dialog && !busy) onClose() }
    dialog.addEventListener('cancel', cancel)
    dialog.addEventListener('click', backdrop)
    return () => { dialog.removeEventListener('cancel', cancel); dialog.removeEventListener('click', backdrop) }
  }, [busy, onClose])

  const steps = atPoint
    ? [
        { icon: <MapPin size={15} aria-hidden="true" />, text: <>Sách đang ở <b>{pointName}</b>.</> },
        { icon: <BookOpen size={15} aria-hidden="true" />, text: <>Bạn <b>tới điểm để nhận lại sách</b>.</> },
      ]
    : [
        { icon: <Check size={15} aria-hidden="true" />, text: <>Chỗ tại <b>{pointName}</b> được trả lại.</> },
        { icon: <Check size={15} aria-hidden="true" />, text: <>Bài đăng bán <b>không còn ở trạng thái Đang giữ</b>.</> },
      ]

  return (
    <dialog ref={ref} data-lenis-prevent="true" className={styles.dialog} role="alertdialog" aria-labelledby={`${ids}-title`} aria-describedby={`${ids}-warn`}>
      <div className={styles.sheet}>
        <header className={styles.header} data-focus-inverse>
          <span className={styles.badge} aria-hidden="true"><PackageMinus size={20} /></span>
          <span className={styles.heading}>
            <strong id={`${ids}-title`}>Rút sách khỏi đấu giá?</strong>
            <small>{title}</small>
          </span>
          <button type="button" className={styles.close} onClick={onClose} disabled={busy} aria-label="Đóng">
            <X size={22} aria-hidden="true" />
          </button>
        </header>

        <div className={styles.body}>
          <div className={styles.book}>
            {cover}
            <div>
              <span className={styles.state}>{stateLabel}</span>
              <span className={styles.point}><MapPin size={13} aria-hidden="true" /> {pointName}</span>
            </div>
          </div>

          <section aria-labelledby={`${ids}-next`}>
            <p id={`${ids}-next`} className={styles.label}>Sau khi rút</p>
            <ol className={styles.steps}>
              {steps.map((step, i) => (
                <li key={i}><span className={styles.dot}>{step.icon}</span><span>{step.text}</span></li>
              ))}
            </ol>
          </section>

          {error && <p role="alert" className={styles.error}>{error}</p>}
        </div>

        <footer className={styles.footer}>
          <p id={`${ids}-warn`} className={styles.warn}>
            <TriangleAlert size={16} aria-hidden="true" />
            <span>Phiếu gửi này <b>không thể khôi phục</b> sau khi rút.</span>
          </p>
          <div className={styles.actions}>
            <button ref={keep} type="button" className={styles.keep} onClick={onClose} disabled={busy}>Giữ lại</button>
            <button type="button" data-focus-inverse className={styles.confirm} onClick={onConfirm} disabled={busy} aria-busy={busy}>
              {busy ? 'Đang rút…' : retry ? 'Thử lại' : 'Rút sách'}
              {!busy && !retry && <ArrowRight size={18} aria-hidden="true" />}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  )
}
