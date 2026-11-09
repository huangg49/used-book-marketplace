import { useEffect, useId, useRef, useState } from 'react'
import { CalendarClock, Flag, Info, Play, X } from 'lucide-react'
import { lockPageScroll } from '../../lib/page-scroll'
import { playAuctionMotion, sheetFrames } from '../../lib/auction-motion'
import { commandError } from '../../lib/auction-errors'
import { commandOutcomeUnknown, useIntentKey } from '../../hooks/useAuctionClock'
import {
  AUCTION_MAX_DURATION_S, AUCTION_MIN_DURATION_S, AUCTION_MIN_LEAD_MS, AUCTION_OPEN_GRACE_MS, AUCTION_SCHEDULE_HORIZON_MS,
  AUCTION_OPEN_CEILING_MS, publishAuction, rescheduleAuction,
  type ScheduleBody,
} from '../../services/auctions'
import { DateTimePicker } from '../DateTimePicker'
import { DurationInput, formatDuration } from '../DurationInput'
import styles from './ScheduleAuctionDialog.module.css'

const HOUR = 3_600_000
const PRESETS = [1, 3, 6, 12, 24, 48, 72, 168].map((h) => h * 3600)
// ADR 0047: the server keeps a live auction open at least one more hour.
const MIN_REMAINING_MS = HOUR

/** Publish a Passed intake, or edit the time of the seller's auction before its first bid. */
export type ScheduleTarget =
  | { kind: 'publish'; intakeId: string; version: number }
  | { kind: 'reschedule'; auctionId: string; version: number; live: boolean; startAt: string; endAt: string
      /** ADR 0079: set for a waiting registration auction (fixed start ceiling). */
      latestStartAt?: string | null }
// ADR 0081: for a waiting registration auction, startAt is its open time
// (opensAt) and endAt the end if it opens then.

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
  // ADR 0081: a registration auction always opens at a chosen time within
  // 30 days of publishing (ADR 0082), and only with enough registrants; there is no "open
  // now". A waiting auction moves to a new time.
  const lifecycle = target.kind === 'publish' || (target.kind === 'reschedule' && !target.live && !!target.latestStartAt)
  const fixedLater = lifecycle
  const currentSeconds = target.kind === 'reschedule'
    ? Math.round((Date.parse(target.endAt) - Date.parse(target.startAt)) / 1000)
    : 24 * 3600
  const [later, setLater] = useState(lifecycle || (target.kind === 'reschedule' && !live))
  const [startInput, setStartInput] = useState('')
  const [seconds, setSeconds] = useState(currentSeconds)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A lost response keeps the same body and key so the retry replays it.
  const [unknown, setUnknown] = useState<ScheduleBody | null>(null)
  const offset = serverTime ? Date.parse(serverTime) - Date.now() : 0
  const now = Date.now() + offset
  const horizon = target.kind === 'publish'
    ? now + AUCTION_OPEN_CEILING_MS
    : lifecycle && target.kind === 'reschedule'
      ? Date.parse(target.latestStartAt!)
      : now + AUCTION_SCHEDULE_HORIZON_MS

  useEffect(() => isOpen && !paused ? lockPageScroll() : undefined, [isOpen, paused])
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (!isOpen) prepared.current = false
    if (isOpen && !paused && !dialog.open) {
      if (!prepared.current) {
        const start = target.kind === 'reschedule' && !target.live ? Date.parse(target.startAt) : now + HOUR
        setLater(lifecycle || (target.kind === 'reschedule' && !target.live))
        setStartInput(toLocalInput(start)); setSeconds(currentSeconds); setError(null)
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

  const timed = later || fixedLater
  const startMs = live && target.kind === 'reschedule'
    ? Date.parse(target.startAt)
    : timed ? Date.parse(startInput) : now
  const endMs = startMs + seconds * 1000
  const fieldError = seconds < AUCTION_MIN_DURATION_S || seconds > AUCTION_MAX_DURATION_S
    ? 'Thời lượng phiên từ 1 giờ đến 7 ngày.'
    : live
    ? endMs < now + MIN_REMAINING_MS ? 'Phiên đang mở phải còn ít nhất 1 giờ. Chọn thời lượng dài hơn.' : null
    : timed && Number.isNaN(startMs) ? 'Chọn ngày giờ mở phiên.'
      : timed && startMs < now + AUCTION_MIN_LEAD_MS ? 'Hẹn giờ mở ít nhất 5 phút sau bây giờ.'
        : timed && startMs > horizon ? (lifecycle ? 'Giờ mở phải trong vòng 30 ngày kể từ lúc đăng phiên.' : 'Chỉ hẹn trong vòng 7 ngày tới.')
          : null

  const submit = async () => {
    const body: ScheduleBody = unknown ?? {
      expectedVersion: target.version,
      startAt: !live && timed ? new Date(startMs).toISOString() : null,
      durationSeconds: seconds,
    }
    const key = intent.keyFor(JSON.stringify(body))
    let pending = false, done = false
    setBusy(true); setError(null)
    try {
      if (target.kind === 'publish') await publishAuction(target.intakeId, body, key)
      else await rescheduleAuction(target.auctionId, body, key)
      intent.settle(); done = true
    } catch (caught) {
      pending = commandOutcomeUnknown(caught)
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
              <legend>{fixedLater ? (target.kind === 'publish' ? 'Hẹn giờ mở phiên' : 'Giờ mở mới') : 'Khi nào mở phiên?'}</legend>
              {!fixedLater && <label><input type="radio" name={`${ids}-when`} checked={!later} onChange={() => setLater(false)} /> Mở ngay</label>}
              {!fixedLater && <label><input type="radio" name={`${ids}-when`} checked={later} onChange={() => setLater(true)} /> Hẹn giờ mở</label>}
              {timed && (
                <div className={styles.field}>
                  <label htmlFor={`${ids}-start`}>Giờ mở phiên</label>
                  <DateTimePicker
                    id={`${ids}-start`} label="Giờ mở phiên" value={startInput}
                    min={toLocalInput(now + AUCTION_MIN_LEAD_MS)} max={toLocalInput(horizon)}
                    onChange={setStartInput}
                  />
                </div>
              )}
            </fieldset>
          )}
          <DurationInput
            id={`${ids}-duration`} label="Thời lượng phiên" value={seconds}
            presets={PRESETS} disabled={locked} onChange={setSeconds}
          />
          {fieldError ? (
            <p className={styles.error} role="alert">{fieldError}</p>
          ) : (
            <dl className={styles.summary}>
              <div>
                <dt><Play size={14} aria-hidden="true" /> Mở phiên</dt>
                <dd>{timed || live ? `${when(startMs)}${lifecycle ? ' nếu đủ người' : ''}` : 'Ngay khi xác nhận'}</dd>
              </div>
              {lifecycle && (
                <div>
                  <dt><CalendarClock size={14} aria-hidden="true" /> Chưa đủ người</dt>
                  <dd>Chờ thêm tới {when(startMs + AUCTION_OPEN_GRACE_MS)}, rồi hủy</dd>
                </div>
              )}
              <div>
                <dt><Flag size={14} aria-hidden="true" /> Kết thúc</dt>
                <dd>{lifecycle ? `${formatDuration(seconds)} sau khi mở` : when(endMs)}</dd>
              </div>
            </dl>
          )}
          <p className={styles.note}>
            <Info size={15} aria-hidden="true" />
            {lifecycle
              ? <span>Người mua đăng ký và đặt cọc trước. Phiên <strong>chỉ mở khi đủ người</strong>: đến giờ mở mà chưa đủ, phiên chờ thêm tối đa 24 giờ và mở ngay khi đủ; hết 24 giờ vẫn chưa đủ thì phiên bị hủy và hoàn cọc. Bạn đổi giờ mở <strong>tối đa 2 lần</strong> trong 30 ngày kể từ lúc đăng, trước giờ mở và không trong 30 phút cuối; người đăng ký được báo mỗi lần đổi.</span>
              : <span>Bạn đổi được thời gian <strong>tối đa 5 lần</strong>, chỉ khi chưa có lượt trả giá. Sau lượt trả giá đầu tiên, thời gian phiên được giữ nguyên.</span>}
          </p>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          <button type="button" className={styles.confirm} disabled={busy || (!unknown && !!fieldError)} onClick={() => void submit()}>
            {busy ? 'Đang gửi…' : unknown ? 'Thử lại' : target.kind === 'publish' ? (timed ? 'Hẹn giờ mở phiên' : 'Đăng phiên') : 'Lưu thời gian mới'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
