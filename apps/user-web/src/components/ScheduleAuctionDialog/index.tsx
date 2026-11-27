import { DEFAULT_SALE_COMMISSION_BPS, auctionSellerFeeText, createServerNow, formatSaleFeeRate } from '@used-books/session-client'
import { useEffect, useId, useRef, useState } from 'react'
import { ArrowRight, CalendarClock, Flag, Play, X } from 'lucide-react'
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
import { InfoTip } from '../InfoTip'
import { SelectMenu } from '../SelectMenu'
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
// The picker offers 5-minute slots. The earliest start is rounded up to the
// next slot so "Sớm nhất" never lands seconds short of the 5-minute lead.
const SLOT_MS = 5 * 60_000
const ceilSlot = (ms: number) => Math.ceil(ms / SLOT_MS) * SLOT_MS
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
  // One dropdown of common lengths; "Tùy chỉnh" opens the exact h/m/s fields.
  const [custom, setCustom] = useState(!PRESETS.includes(currentSeconds))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A lost response keeps the same body and key so the retry replays it.
  const [unknown, setUnknown] = useState<ScheduleBody | null>(null)
  const now = createServerNow(serverTime)()
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
        const start = target.kind === 'reschedule' && !target.live ? Date.parse(target.startAt) : ceilSlot(now + HOUR)
        setLater(lifecycle || (target.kind === 'reschedule' && !target.live))
        setStartInput(toLocalInput(start)); setSeconds(currentSeconds); setCustom(!PRESETS.includes(currentSeconds)); setError(null)
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
  const openText = timed || live ? when(startMs) : 'Ngay khi xác nhận'
  return (
    <dialog ref={ref} data-lenis-prevent="true" className={styles.dialog} aria-labelledby={`${ids}-title`}>
      <div className={styles.sheet}>
        <header className={styles.header} data-focus-inverse>
          <span className={styles.heading}>
            <strong id={`${ids}-title`}><CalendarClock size={20} aria-hidden="true" /> {heading}</strong>
            <small>{title}</small>
          </span>
          <button type="button" className={styles.close} onClick={onClose} disabled={busy} aria-label="Đóng">
            <X size={22} aria-hidden="true" />
          </button>
        </header>
        <div className={styles.body}>
          {/* Step 1: when it opens. A live auction keeps its open time. */}
          {live ? (
            <p className={styles.liveNote}>
              <Play size={15} aria-hidden="true" />
              <span>Phiên đã mở lúc <b>{when(Date.parse((target as { startAt: string }).startAt))}</b>. Giờ mở giữ nguyên; bạn chỉ đổi thời lượng.</span>
            </p>
          ) : (
            <fieldset className={styles.step} disabled={locked}>
              <legend className={styles.stepTitle}>
                <span className={styles.num} aria-hidden="true">1</span>
                {fixedLater ? (target.kind === 'publish' ? 'Giờ mở phiên' : 'Giờ mở mới') : 'Khi nào mở phiên?'}
                <InfoTip label="Giờ mở phiên">
                  {lifecycle ? (
                    <ul>
                      <li>Người mua đăng ký và đặt cọc trước; phiên <b>chỉ mở khi đủ người</b>.</li>
                      <li>Đến giờ mà chưa đủ: chờ thêm tối đa <b>24 giờ</b>, đủ thì mở ngay; hết hạn thì <b>hủy và hoàn cọc</b>.</li>
                      <li>Bạn đổi giờ mở <b>tối đa 2 lần</b> trong 30 ngày kể từ lúc đăng, không trong 30 phút cuối. Người đăng ký được báo mỗi lần đổi.</li>
                    </ul>
                  ) : (
                    <>Bạn đổi được thời gian <b>tối đa 5 lần</b>, chỉ khi chưa có lượt trả giá. Sau lượt trả giá đầu tiên, thời gian được giữ nguyên.</>
                  )}
                </InfoTip>
              </legend>
              {!fixedLater && (
                <div className={styles.segment}>
                  <label><input type="radio" name={`${ids}-when`} checked={!later} onChange={() => setLater(false)} /> Mở ngay</label>
                  <label><input type="radio" name={`${ids}-when`} checked={later} onChange={() => setLater(true)} /> Hẹn giờ</label>
                </div>
              )}
              {timed && (
                <DateTimePicker
                  id={`${ids}-start`} label="Giờ mở phiên" value={startInput}
                  min={toLocalInput(ceilSlot(now + AUCTION_MIN_LEAD_MS))} max={toLocalInput(horizon)}
                  onChange={setStartInput}
                />
              )}
            </fieldset>
          )}

          {/* Step 2: how long it runs. */}
          <fieldset className={styles.step} disabled={locked}>
            <legend className={styles.stepTitle}>
              {!live && <span className={styles.num} aria-hidden="true">2</span>}
              <span id={`${ids}-length-label`}>Thời lượng</span>
              <InfoTip label="Thời lượng">Phiên kéo dài từ <b>1 giờ</b> đến <b>7 ngày</b>{lifecycle ? <>, tính <b>từ lúc phiên mở</b></> : null}.</InfoTip>
            </legend>
            <SelectMenu
              id={`${ids}-length`} labelledBy={`${ids}-length-label`} disabled={locked}
              value={custom ? 'custom' : String(seconds)}
              options={[
                ...PRESETS.map((p) => ({ value: String(p), label: formatDuration(p) })),
                { value: 'custom', label: 'Tùy chỉnh…', separated: true },
              ]}
              onChange={(next) => {
                if (next === 'custom') { setCustom(true); return }
                setCustom(false); setSeconds(Number(next))
              }}
            />
            {custom && (
              <DurationInput id={`${ids}-duration`} label="Độ dài chính xác" value={seconds} presets={[]} disabled={locked} onChange={setSeconds} />
            )}
          </fieldset>

          {/* Result: one start → end line. */}
          {fieldError ? (
            <p className={styles.error} role="alert">{fieldError}</p>
          ) : (
            <div className={styles.timeline} aria-label="Lịch phiên">
              <div>
                <span className={styles.tlLabel}><Play size={13} aria-hidden="true" /> Mở</span>
                <strong>{openText}</strong>
                {lifecycle && <span className={styles.tlHint}>nếu đủ người</span>}
              </div>
              <ArrowRight className={styles.tlArrow} size={18} aria-hidden="true" />
              <div>
                <span className={styles.tlLabel}><Flag size={13} aria-hidden="true" /> Kết thúc</span>
                <strong>{lifecycle ? `${formatDuration(seconds)} sau khi mở` : when(endMs)}</strong>
                {lifecycle && <span className={styles.tlHint}>chưa đủ người: hủy lúc {when(startMs + AUCTION_OPEN_GRACE_MS)}</span>}
              </div>
            </div>
          )}

          {error && <p role="alert" className={styles.error}>{error}</p>}
        </div>
        <footer className={styles.footer}>
          {target.kind === 'publish' && (
            <p className={styles.fee}>
              Phí dịch vụ <b>{formatSaleFeeRate(DEFAULT_SALE_COMMISSION_BPS)}</b> trên giá chốt
              <InfoTip label="Phí dịch vụ">{auctionSellerFeeText}</InfoTip>
            </p>
          )}
          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose} disabled={busy}>
              Hủy
            </button>
            <button type="button" data-focus-inverse className={styles.confirm} disabled={busy || (!unknown && !!fieldError)} onClick={() => void submit()}>
              {busy ? 'Đang gửi…' : unknown ? 'Thử lại' : target.kind === 'publish' ? 'Đăng phiên' : 'Lưu thời gian mới'}
              {!busy && !unknown && <ArrowRight size={18} aria-hidden="true" />}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  )
}
