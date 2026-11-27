import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, Lock, ShieldCheck, TrendingUp, Wallet, X, Zap } from 'lucide-react'
import { formatVnd } from '../../lib/routes'
import { AUCTION_MAX_PRICE, AUCTION_PRICE_DIGITS } from '../../services/auctions'
import { lockPageScroll } from '../../lib/page-scroll'
import { playAuctionMotion, sheetFrames } from '../../lib/auction-motion'
import { InfoTip } from '../InfoTip'
import styles from './AutoBidDialog.module.css'

interface AutoBidDialogProps {
  isOpen: boolean
  paused?: boolean
  onClose: () => void
  title: string
  pointName: string
  currentPrice: number
  startPrice: number
  step: number
  /** Mức tối đa thấp nhất được phép: tối thiểu lượt tiếp theo, hoặc mức của chính mình + 1 bước. */
  floor: number
  /** Mức tự động hiện có của người dùng (chỉ họ thấy), nếu có. */
  currentMax: number | null
  busy: boolean
  submissionError?: string | null
  onConfirm: (maxAmount: number) => Promise<void>
}

function amountError(amount: number | null, floor: number, start: number, step: number) {
  if (!amount) return 'Nhập mức tối đa bạn chấp nhận.'
  if (amount < floor) return `Tối thiểu ${formatVnd(floor)}.`
  if (amount > AUCTION_MAX_PRICE) return 'Số tiền vượt mức hệ thống hỗ trợ.'
  if ((amount - start) % step !== 0) {
    const up = start + Math.ceil((amount - start) / step) * step
    return `Giá đi theo bước ${formatVnd(step)}. Thử ${formatVnd(Math.min(up, AUCTION_MAX_PRICE))}.`
  }
  return null
}

/** Hộp thoại hai bước: nhập mức tối đa, rồi xác nhận theo mốc diễn biến. */
export function AutoBidDialog(props: AutoBidDialogProps) {
  const {
    isOpen, paused = false, onClose, title, pointName, currentPrice, startPrice, step,
    floor, currentMax, busy, submissionError, onConfirm,
  } = props
  const ref = useRef<HTMLDialogElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const prepared = useRef(false)
  const confirmationHeading = useRef<HTMLHeadingElement>(null)
  const ids = useId()
  const [value, setValue] = useState<number | null>(floor)
  const [stage, setStage] = useState<'form' | 'confirm'>('form')
  const error = amountError(value, floor, startPrice, step)
  const unchanged = currentMax !== null && value === currentMax
  const delta = currentMax !== null && value !== null && value > currentMax ? value - currentMax : null
  const isEditing = currentMax !== null

  useEffect(() => (isOpen && !paused ? lockPageScroll() : undefined), [isOpen, paused])

  useLayoutEffect(() => {
    if (isOpen && !paused && stage === 'confirm') confirmationHeading.current?.focus()
    else if (isOpen && !paused && stage === 'form' && ref.current?.open) {
      ref.current.querySelector<HTMLInputElement>('input')?.focus()
    }
  }, [isOpen, paused, stage])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (!isOpen) prepared.current = false
    if (isOpen && !paused && !dialog.open) {
      openerRef.current = document.activeElement as HTMLElement | null
      if (!prepared.current) { setValue(floor); setStage('form'); prepared.current = true }
      dialog.showModal()
      const stop = playAuctionMotion(dialog, sheetFrames, 220)
      return () => {
        stop()
        if (dialog.open) dialog.close()
        if (openerRef.current?.isConnected) openerRef.current.focus({ preventScroll: true })
      }
    }
    if ((!isOpen || paused) && dialog.open) dialog.close()
    // A real reopen starts at the latest floor; role recovery keeps the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, paused])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const cancel = (event: Event) => { event.preventDefault(); if (!busy) onClose() }
    const backdrop = (event: MouseEvent) => { if (event.target === dialog && !busy) onClose() }
    dialog.addEventListener('cancel', cancel)
    dialog.addEventListener('click', backdrop)
    return () => { dialog.removeEventListener('cancel', cancel); dialog.removeEventListener('click', backdrop) }
  }, [busy, onClose])

  return (
    <dialog ref={ref} data-lenis-prevent="true" className={styles.dialog} aria-labelledby={`${ids}-title`}>
      <div className={styles.sheet}>
        <header className={styles.header} data-focus-inverse>
          <span className={styles.badge} aria-hidden="true"><Zap size={20} /></span>
          <span className={styles.heading}>
            <strong id={`${ids}-title`}>{isEditing ? 'Nâng mức tự động' : 'Đặt giá tự động'}</strong>
            <small>{title}</small>
          </span>
          <button type="button" className={styles.close} onClick={onClose} disabled={busy} aria-label="Đóng">
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        {stage === 'form' ? (
          <>
            <div key="form" className={styles.body}>
              <div className={styles.sectionHead}>
                <span>Cách hoạt động</span>
                <InfoTip label="Quy tắc đặt giá tự động">
                  <ul>
                    <li>Hệ thống trả thay bạn cao hơn người khác <strong>đúng 1 bước ({formatVnd(step)})</strong>, không nhảy thẳng lên mức tối đa.</li>
                    <li><strong>Chỉ bạn thấy</strong> mức tối đa; bạn có thể nâng mức hoặc tắt khi phiên còn mở.</li>
                    <li>Khi dẫn giá, Ví tạm giữ mức cam kết và <mark>tự hoàn lại ngay</mark> nếu có người trả cao hơn.</li>
                  </ul>
                </InfoTip>
              </div>

              <ol className={styles.miniFlow} aria-label="Tóm tắt 3 bước đặt giá tự động">
                <li>
                  <span className={styles.miniDot} aria-hidden="true"><Zap size={13} /></span>
                  <span>Chọn mức <b>tối đa</b></span>
                </li>
                <li>
                  <span className={styles.miniDot} aria-hidden="true"><TrendingUp size={13} /></span>
                  <span>Tự trả <b>+{formatVnd(step)}</b></span>
                </li>
                <li data-result="true">
                  <span className={styles.miniDot} aria-hidden="true"><ShieldCheck size={13} /></span>
                  <span>Bí mật &amp; tự hoàn</span>
                </li>
              </ol>

              <div className={styles.tiles}>
                <div className={styles.tile}>
                  <span>Giá hiện tại</span>
                  <strong>{formatVnd(currentPrice)}</strong>
                </div>
                <button
                  type="button"
                  className={`${styles.tile} ${styles.tileAlt}`}
                  onClick={() => setValue(floor)}
                  aria-label={`Dùng mức thấp nhất ${formatVnd(floor)}`}
                >
                  <span>{isEditing ? 'Nâng từ' : 'Đặt từ'}</span>
                  <strong>{formatVnd(floor)}</strong>
                </button>
              </div>

              <div className={styles.field}>
                <div className={styles.fieldTop}>
                  <label htmlFor={`${ids}-amount`}>Mức tối đa của bạn</label>
                  {isEditing && (
                    <span className={styles.currentMeta}>
                      Hiện tại: <b>{formatVnd(currentMax)}</b>
                      {delta !== null && <span className={styles.delta}>+{formatVnd(delta)}</span>}
                    </span>
                  )}
                </div>
                <div data-focus-surface data-focus-invalid={!!error} className={`${styles.inputWrap} ${error ? styles.invalid : ''}`}>
                  <input
                    id={`${ids}-amount`}
                    inputMode="numeric"
                    autoComplete="off"
                    value={value ? value.toLocaleString('vi-VN') : ''}
                    aria-invalid={!!error}
                    aria-describedby={`${ids}-hint`}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, '').slice(0, AUCTION_PRICE_DIGITS)
                      setValue(digits ? Number(digits) : null)
                    }}
                  />
                  <span className={styles.unit} aria-hidden="true">₫</span>
                </div>
                <p id={`${ids}-hint`} className={error ? styles.errorText : styles.hint}>
                  {error ?? `Từ ${formatVnd(floor)} trở lên · bước ${formatVnd(step)}`}
                </p>
              </div>
            </div>

            <footer className={styles.footer}>
              <p className={styles.footNote}>
                <Lock size={13} aria-hidden="true" />
                <span>Xác nhận ở bước sau · Ví chỉ giữ khi bạn dẫn giá</span>
              </p>
              <div className={styles.actions}>
                <button type="button" className={styles.back} onClick={onClose} disabled={busy}>
                  Hủy
                </button>
                <button
                  type="button"
                  data-focus-inverse
                  className={styles.confirm}
                  disabled={!!error || unchanged}
                  onClick={() => setStage('confirm')}
                >
                  <span>Tiếp tục</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>
            </footer>
          </>
        ) : (
          <>
            <div key="confirm" className={styles.body}>
              <div className={styles.confirmSummary}>
                <div className={styles.confirmTop}>
                  <h3 ref={confirmationHeading} tabIndex={-1}>Mức tối đa xác nhận</h3>
                  {delta !== null && <span className={styles.delta}>+{formatVnd(delta)}</span>}
                  <InfoTip label="Quy định giữ tiền và thanh toán">
                    <ul>
                      <li>Khi dẫn giá, Ví tạm giữ mức cam kết (gồm cọc đăng ký) và hoàn lại ngay nếu bị vượt giá.</li>
                      <li>Nếu thắng, thanh toán trong <strong>24 giờ</strong> và chọn nhận tại <strong>{pointName}</strong> hoặc giao tận nơi.</li>
                      <li><mark>Quá hạn thanh toán</mark> sẽ bị ghi nhận vi phạm.</li>
                    </ul>
                  </InfoTip>
                </div>
                <strong className={styles.confirmAmount}>{formatVnd(value!)}</strong>
                {isEditing && (
                  <span className={styles.currentMeta}>Hiện tại: <b>{formatVnd(currentMax)}</b></span>
                )}
              </div>

              <ol className={styles.timeline} aria-label="Diễn biến đặt giá tự động">
                <li className={styles.stop}>
                  <span className={styles.node} aria-hidden="true"><TrendingUp size={15} /></span>
                  <div className={styles.stopBody}>
                    <span className={styles.stopLabel}>Tự trả theo bước</span>
                    <span className={styles.stopDetail}>Cao hơn đối thủ <b>+{formatVnd(step)}</b>, không vượt <b>{formatVnd(value!)}</b>.</span>
                  </div>
                </li>
                <li className={styles.stop}>
                  <span className={styles.node} aria-hidden="true"><Wallet size={15} /></span>
                  <div className={styles.stopBody}>
                    <span className={styles.stopLabel}>Giữ &amp; hoàn tiền Ví</span>
                    <span className={styles.stopDetail}>Tạm giữ khi dẫn; <b>hoàn lại ngay</b> nếu bị vượt giá.</span>
                  </div>
                </li>
                <li className={styles.stop} data-result="true">
                  <span className={styles.node} aria-hidden="true"><CheckCircle2 size={15} /></span>
                  <div className={styles.stopBody}>
                    <span className={styles.stopLabel}>Nếu thắng phiên</span>
                    <span className={styles.stopDetail}>Thanh toán trong <b>24 giờ</b> · nhận tại <b>{pointName}</b> hoặc giao tận nơi.</span>
                  </div>
                </li>
              </ol>

              {submissionError && (
                <p className={styles.errorBox} role="alert">
                  {submissionError} Chọn “Sửa mức” để điều chỉnh; số tiền bạn nhập vẫn được giữ.
                </p>
              )}
            </div>

            <footer className={styles.footer}>
              <div className={styles.actions}>
                <button type="button" className={styles.back} onClick={() => setStage('form')} disabled={busy}>
                  <ArrowLeft size={16} aria-hidden="true" />
                  <span>Sửa mức</span>
                </button>
                <button
                  type="button"
                  data-focus-inverse
                  className={styles.confirm}
                  disabled={busy}
                  aria-busy={busy}
                  onClick={() => void onConfirm(value!)}
                >
                  <span>{busy ? 'Đang đặt…' : 'Xác nhận đặt'}</span>
                  {!busy && <ArrowRight size={16} aria-hidden="true" />}
                </button>
              </div>
            </footer>
          </>
        )}
      </div>
    </dialog>
  )
}
