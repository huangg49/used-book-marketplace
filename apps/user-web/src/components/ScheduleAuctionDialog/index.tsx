import { useEffect, useId, useRef, useState } from 'react'
import { CalendarClock, X } from 'lucide-react'
import { lockPageScroll } from '../../lib/page-scroll'
import { playAuctionMotion, sheetFrames } from '../../lib/auction-motion'
import { commandError } from '../../lib/auction-errors'
import { outcomeUnknown, useIntentKey } from '../../hooks/useAuctionClock'
import {
  AUCTION_MAX_HOURS, AUCTION_MIN_LEAD_MS, AUCTION_SCHEDULE_HORIZON_MS, publishAuction, rescheduleAuction,
  type ScheduleBody,
} from '../../services/auctions'
import styles from './ScheduleAuctionDialog.module.css'

const HOUR = 3_600_000
const PRESETS = [1, 3, 6, 12, 24, 48, 72, 120, 168]
// ADR 0047: the server keeps a live auction open at least one more hour.
const MIN_REMAINING_MS = HOUR

/** Publish a Passed intake, or edit the time of the seller's auction before its first bid. */
export type ScheduleTarget =
  | { kind: 'publish'; intakeId: string; version: number }
  | { kind: 'reschedule'; auctionId: string; version: number; live: boolean; startAt: string; endAt: string }

const pad = (n: number) => String(n).padStart(2, '0')
// <input type="datetime-local"> works in the device's local time.
const toLocalInput = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const when = (ms: number) =>
  new Date(ms).toLocaleString('vi-VN', { weekday: 'short', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })

export function ScheduleAuctionDialog({ isOpen, paused = false, onClose, onDone, title, target, serverTime }: {
  isOpen: boolean
  paused?: boolean
  onClose: () => void
  onDone: () => Promise<unknown> | void
  title: string
  target: ScheduleTarget
  /** Last server time seen, so a wrong device clock does not shift the limits. */
  serverTime?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const prepared = useRef(false)
  const ids = useId()
  const intent = useIntentKey()
  const live = target.kind === 'reschedule' && target.live
  const currentHours = target.kind === 'reschedule'
    ? Math.round((Date.parse(target.endAt) - Date.parse(target.startAt)) / HOUR)
    : 24
  const [later, setLater] = useState(target.kind === 'reschedule' && !live)
  const [startInput, setStartInput] = useState('')
  const [hours, setHours] = useState(currentHours)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A lost response keeps the same body and key so the retry replays it.
  const [unknown, setUnknown] = useState<ScheduleBody | null>(null)
  const offset = serverTime ? Date.parse(serverTime) - Date.now() : 0
  const now = Date.now() + offset

  useEffect(() => isOpen && !paused ? lockPageScroll() : undefined, [isOpen, paused])
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (!isOpen) prepared.current = false
    if (isOpen && !paused && !dialog.open) {
      if (!prepared.current) {
        const start = target.kind === 'reschedule' && !target.live ? Date.parse(target.startAt) : now + HOUR
        setLater(target.kind === 'reschedule' && !target.live)
        setStartInput(toLocalInput(start)); setHours(currentHours); setError(null)
        prepared.current = true
      }
      dialog.showModal()
      return playAuctionMotion(dialog, sheetFrames, 220)
    }
    if ((!isOpen || paused) && dialog.open) dialog.close()
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

  const startMs = live && target.kind === 'reschedule'
    ? Date.parse(target.startAt)
    : later ? Date.parse(startInput) : now
  const endMs = startMs + hours * HOUR
  const fieldError = live
    ? endMs < now + MIN_REMAINING_MS ? 'Phiên đang mở phải còn ít nhất 1 giờ. Chọn thời lượng dài hơn.' : null
    : later && Number.isNaN(startMs) ? 'Chọn ngày giờ mở phiên.'
      : later && startMs < now + AUCTION_MIN_LEAD_MS ? 'Hẹn giờ mở ít nhất 5 phút sau bây giờ.'
        : later && startMs > now + AUCTION_SCHEDULE_HORIZON_MS ? 'Chỉ hẹn trong vòng 7 ngày tới.'
          : null

  const submit = async () => {
    const body: ScheduleBody = unknown ?? {
      expectedVersion: target.version,
      startAt: !live && later ? new Date(startMs).toISOString() : null,
      durationHours: hours,
    }
    const key = intent.keyFor(JSON.stringify(body))
    let pending = false, done = false
    setBusy(true); setError(null)
    try {
      if (target.kind === 'publish') await publishAuction(target.intakeId, body, key)
      else await rescheduleAuction(target.auctionId, body, key)
      intent.settle(); done = true
    } catch (caught) {
      pending = outcomeUnknown(caught)
      if (!pending) intent.settle()
      setError(pending ? 'Chưa rõ yêu cầu đã được ghi hay chưa. Hãy thử lại đúng thao tác này.' : commandError(caught))
    } finally {
      setUnknown(pending ? body : null); setBusy(false)
      if (!pending) void onDone()
    }
    // A refusal stays on screen with the seller's choices kept.
    if (done) onClose()
  }

  const heading = target.kind === 'publish' ? 'Đăng phiên đấu giá' : 'Đổi thời gian phiên'
  const locked = busy || !!unknown
  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={`${ids}-title`}>
      <div className={styles.sheet}>
        <header className={styles.header}>
          <span className={styles.heading}>
            <strong id={`${ids}-title`}><CalendarClock size={20} aria-hidden="true" /> {heading}</strong>
            <small>{title}</small>
          </span>
          <button type="button" className={styles.close} onClick={onClose} disabled={busy} aria-label="Đóng">
            <X size={22} aria-hidden="true" />
          </button>
        </header>
        <div className={styles.body}>
          {live ? (
            <p className={styles.note}>Phiên đã mở lúc {when(Date.parse((target as { startAt: string }).startAt))}. Khi chưa có ai trả giá, bạn có thể đổi thời lượng; giờ mở giữ nguyên.</p>
          ) : (
            <fieldset className={styles.choice} disabled={locked}>
              <legend>Khi nào mở phiên?</legend>
              <label><input type="radio" name={`${ids}-when`} checked={!later} onChange={() => setLater(false)} /> Mở ngay</label>
              <label><input type="radio" name={`${ids}-when`} checked={later} onChange={() => setLater(true)} /> Hẹn giờ mở</label>
              {later && (
                <div className={styles.field}>
                  <label htmlFor={`${ids}-start`}>Giờ mở phiên</label>
                  <input
                    id={`${ids}-start`} type="datetime-local" value={startInput}
                    min={toLocalInput(now + AUCTION_MIN_LEAD_MS)} max={toLocalInput(now + AUCTION_SCHEDULE_HORIZON_MS)}
                    onChange={(event) => setStartInput(event.target.value)}
                  />
                </div>
              )}
            </fieldset>
          )}
          <div className={styles.field}>
            <label htmlFor={`${ids}-hours`}>Thời lượng phiên</label>
            <select id={`${ids}-hours`} value={hours} disabled={locked} onChange={(event) => setHours(Number(event.target.value))}>
              {[...new Set([...PRESETS, currentHours])].filter((h) => h >= 1 && h <= AUCTION_MAX_HOURS).sort((a, b) => a - b).map((h) => (
                <option key={h} value={h}>{h < 24 || h % 24 ? `${h} giờ` : `${h / 24} ngày (${h} giờ)`}</option>
              ))}
            </select>
          </div>
          <p className={fieldError ? styles.error : styles.summary} role={fieldError ? 'alert' : undefined}>
            {fieldError ?? `Mở ${later || live ? when(startMs) : 'ngay khi xác nhận'} · kết thúc ${when(endMs)}`}
          </p>
          <p className={styles.note}>Bạn đổi được thời gian tối đa 5 lần, chỉ khi chưa có lượt trả giá. Sau lượt trả giá đầu tiên, thời gian phiên được giữ nguyên.</p>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          <button type="button" className={styles.confirm} disabled={busy || (!unknown && !!fieldError)} onClick={() => void submit()}>
            {busy ? 'Đang gửi…' : unknown ? 'Thử lại' : target.kind === 'publish' ? (later ? 'Hẹn giờ mở phiên' : 'Mở phiên ngay') : 'Lưu thời gian mới'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
