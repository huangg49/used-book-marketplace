import { useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, CircleCheck, Lock, X, Zap } from 'lucide-react'
import { formatVnd } from '../../lib/routes'
import { AUCTION_MAX_PRICE } from '../../services/auctions'
import styles from './AutoBidDialog.module.css'

interface AutoBidDialogProps {
  isOpen: boolean
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
  onConfirm: (maxAmount: number) => Promise<void>
}

function amountError(amount: number | null, floor: number, start: number, step: number) {
  if (!amount) return 'Nhập mức tối đa bạn chấp nhận.'
  if (amount < floor) return `Tối thiểu ${formatVnd(floor)}.`
  if (amount > AUCTION_MAX_PRICE) return `Tối đa ${formatVnd(AUCTION_MAX_PRICE)}.`
  if ((amount - start) % step !== 0) {
    const up = start + Math.ceil((amount - start) / step) * step
    return `Giá đi theo bước ${formatVnd(step)}. Thử ${formatVnd(Math.min(up, AUCTION_MAX_PRICE))}.`
  }
  return null
}

/** Hộp thoại hai bước: nhập mức tối đa, rồi xác nhận ở màn hình sau. */
export function AutoBidDialog(props: AutoBidDialogProps) {
  const { isOpen, onClose, title, pointName, currentPrice, startPrice, step, floor, currentMax, busy, onConfirm } = props
  const ref = useRef<HTMLDialogElement>(null)
  const ids = useId()
  const [value, setValue] = useState<number | null>(floor)
  const [stage, setStage] = useState<'form' | 'confirm'>('form')
  const error = amountError(value, floor, startPrice, step)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (isOpen && !dialog.open) { setValue(floor); setStage('form'); dialog.showModal() }
    if (!isOpen && dialog.open) dialog.close()
    // Mở lại luôn bắt đầu từ mức tối thiểu mới nhất.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={`${ids}-title`}>
      <div className={styles.sheet}>
        <header className={styles.header}>
          <span className={styles.thumb} aria-hidden="true"><span>{title}</span></span>
          <span className={styles.heading}>
            <strong id={`${ids}-title`}><Zap size={20} aria-hidden="true" /> Đặt giá tự động</strong>
            <small>cho {title}</small>
          </span>
          <button type="button" className={styles.close} onClick={onClose} disabled={busy} aria-label="Đóng">
            <X size={22} aria-hidden="true" />
          </button>
        </header>

        {stage === 'form' ? (
          <div className={styles.body}>
            <section className={styles.how}>
              <h3>Cách đặt giá tự động hoạt động</h3>
              <p>
                Hệ thống trả giá thay bạn đến mức tối đa bạn chọn. Giá chỉ tăng vừa đủ để bạn dẫn, không nhảy thẳng
                lên mức tối đa.
              </p>
              <ul>
                <li><CircleCheck size={16} aria-hidden="true" /> Giữ vị trí dẫn mà không cần theo dõi liên tục</li>
                <li><CircleCheck size={16} aria-hidden="true" /> Chỉ trả cao hơn người khác đúng một bước {formatVnd(step)}</li>
                <li><CircleCheck size={16} aria-hidden="true" /> Chỉ bạn thấy mức tối đa của mình</li>
                <li><CircleCheck size={16} aria-hidden="true" /> Có thể nâng mức hoặc tắt tự động khi phiên còn mở</li>
              </ul>
            </section>

            <div className={styles.tiles}>
              <div className={styles.tile}>
                <span>Giá hiện tại</span>
                <strong>{formatVnd(currentPrice)}</strong>
              </div>
              <button type="button" className={`${styles.tile} ${styles.tileAlt}`} onClick={() => setValue(floor)} aria-label={`Dùng mức thấp nhất ${formatVnd(floor)}`}>
                <span>{currentMax !== null ? 'Nâng từ' : 'Đặt từ'}</span>
                <strong>{formatVnd(floor)}</strong>
              </button>
            </div>
            {currentMax !== null && <p className={styles.mine}>Mức tối đa hiện tại của bạn: <strong>{formatVnd(currentMax)}</strong></p>}

            <div className={styles.entry}>
              <div className={styles.field}>
                <label htmlFor={`${ids}-amount`} className="sr-only">Mức tối đa cho đặt giá tự động</label>
                <div className={`${styles.inputWrap} ${error ? styles.invalid : ''}`}>
                  <input
                    id={`${ids}-amount`}
                    inputMode="numeric"
                    autoComplete="off"
                    value={value ? value.toLocaleString('vi-VN') : ''}
                    aria-invalid={!!error}
                    aria-describedby={`${ids}-hint`}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, '').slice(0, 7)
                      setValue(digits ? Number(digits) : null)
                    }}
                  />
                  <span aria-hidden="true">₫</span>
                </div>
                <p id={`${ids}-hint`} className={error ? styles.error : styles.hint}>
                  {error ?? `Từ ${formatVnd(floor)} đến ${formatVnd(AUCTION_MAX_PRICE)}, theo bước ${formatVnd(step)}.`}
                </p>
              </div>
              <button type="button" className={styles.continue} disabled={!!error} onClick={() => setStage('confirm')}>
                Tiếp tục đặt giá tự động <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
            <p className={styles.footnote}>
              <Lock size={14} aria-hidden="true" /> Xác nhận ở bước tiếp theo.<br />
              Không giữ tiền khi trả giá; chỉ người thắng mới thanh toán.
            </p>
          </div>
        ) : (
          <div className={styles.body}>
            <section className={styles.how}>
              <h3>Xác nhận mức tối đa {formatVnd(value!)}</h3>
              <p>
                Khi có người trả cao hơn, hệ thống trả thay bạn cao hơn họ một bước {formatVnd(step)}, không vượt {formatVnd(value!)}. Mức này
                chỉ có thể nâng lên. Nếu thắng, bạn thanh toán từ ví trong 24 giờ sau khi phiên kết thúc và tự nhận
                sách tại {pointName}. Không thanh toán đúng hạn sẽ bị ghi nhận vi phạm.
              </p>
            </section>
            <div className={styles.actions}>
              <button type="button" className={styles.back} onClick={() => setStage('form')} disabled={busy}>
                <ArrowLeft size={16} aria-hidden="true" /> Sửa mức
              </button>
              <button type="button" className={styles.confirm} disabled={busy} aria-busy={busy} onClick={() => void onConfirm(value!)}>
                {busy ? 'Đang đặt…' : `Đặt tối đa ${formatVnd(value!)}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  )
}
