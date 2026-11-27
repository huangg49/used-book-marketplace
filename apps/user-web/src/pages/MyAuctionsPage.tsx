import { CursorPager } from "../components/Pagination/CursorPager";
import { useCursorNavigation } from "../components/Pagination/useCursorNavigation";
import { formatDuration } from '../components/DurationInput'
import { InfoTip } from '../components/InfoTip'
import { useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@used-books/session-client'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, BookOpen, CalendarClock, Check, Clock, TriangleAlert, Gavel, LayoutGrid, MapPin, Plus, RefreshCw, Store, Timer, Wallet, type LucideIcon } from 'lucide-react'
import { AuctionPhoto } from '../components/AuctionGallery'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DemoSkipButton } from '../components/DemoSkipButton'
import { ScheduleAuctionDialog } from '../components/ScheduleAuctionDialog'
import { useSession } from '../hooks/useSession'
import { formatRemaining, outcomeUnknown, commandOutcomeUnknown, useCountdown, useIntentKey } from '../hooks/useAuctionClock'
import {
  AUCTION_MAX_SCHEDULE_EDITS, AUCTION_MIN_BIDDERS_FLOOR, EVIDENCE_MIN_LENGTH, auctionPhase, getMyAuctionIntakes, listHandoverPoints, listMyAuctions,
  submitIntakeEvidence, waitingForRegistrants, waitingTime, withdrawIntake, getMyAuctionIntake, advanceDemoAuction, type MyAuctionItem, type MyIntake,
} from '../services/auctions'
import { getMyListing, getMyPhoto } from '../services/my-listings'
import { ROUTES, formatVnd } from '../lib/routes'
import styles from './MyAuctionsPage.module.css'

const views: { value: string; label: string; icon: LucideIcon }[] = [
  { value: 'all', label: 'Tất cả', icon: LayoutGrid },
  { value: 'active', label: 'Đang diễn ra', icon: Timer },
  { value: 'upcoming', label: 'Sắp mở', icon: CalendarClock },
  { value: 'payment', label: 'Cần thanh toán', icon: Wallet },
  { value: 'selling', label: 'Phiên của tôi', icon: Store },
]
// Colour family for a row: drives the accent bar, the status pill and the clock.
type Tone = 'pay' | 'lead' | 'outbid' | 'mine' | 'soon' | 'won' | 'done'

// Falling leaves: [left %, top %, size px, duration s, delay s, colour 0-4].
// Fixed values so the scene is the same on every render and device. Leaves are
// spread down the whole page, each falling about one screen while it sways.
const LEAVES: [number, number, number, number, number, number][] = [
  [4, -2, 22, 14, 0, 0], [16, 4, 16, 17, -6, 1], [29, -4, 26, 15, -3, 2], [43, 8, 18, 19, -11, 3], [57, -3, 24, 16, -8, 4],
  [70, 6, 18, 18, -2, 0], [84, -1, 28, 15, -12, 2], [95, 10, 16, 20, -5, 1], [8, 22, 20, 17, -9, 3], [24, 30, 14, 15, -1, 4],
  [37, 25, 22, 19, -14, 0], [63, 28, 18, 16, -7, 2], [78, 24, 24, 18, -3, 1], [92, 34, 18, 15, -10, 3], [3, 46, 26, 19, -4, 2],
  [18, 52, 16, 16, -13, 0], [50, 48, 20, 18, -6, 4], [88, 54, 22, 17, -9, 1], [10, 68, 18, 15, -2, 3], [33, 72, 24, 19, -11, 2],
  [66, 70, 16, 16, -5, 0], [96, 74, 20, 18, -8, 4], [22, 86, 22, 17, -12, 1], [74, 88, 18, 15, -1, 3],
]

// Full-width auction stage behind the centred page column: drifting wine/gold
// light, a breathing lamp at the top and autumn leaves falling past the page.
function AuctionStage({ children }: { children: ReactNode }) {
  return (
    <div className={styles.stage}>
      <div className={styles.backdrop} aria-hidden="true">
        <span className={styles.bdPattern} />
        <span className={styles.bdLamp} />
        {LEAVES.map(([x, y, size, duration, delay, colour], i) => (
          <span
            key={i}
            className={styles.bdLeaf}
            data-c={colour}
            style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, animationDuration: `${duration}s`, animationDelay: `${delay}s` }}
          />
        ))}
      </div>
      {children}
    </div>
  )
}
const states: Record<string, string> = {
  BuyNowPending: 'Chờ thanh toán mua ngay',
  AwaitingWinnerPayment: 'Chờ người thắng thanh toán',
  Sold: 'Người thắng đã thanh toán',
  Unsold: 'Kết thúc, chưa có người trả giá',
  OnHold: 'Phiên tạm dừng',
  Cancelled: 'Phiên đã hủy',
  PaymentExpired: 'Đã quá hạn thanh toán',
  SecondChanceOffered: 'Đang mời người trả giá cao thứ hai',
}
function AuctionRow({
  item,
  serverTime,
  onChanged,
}: {
  item: MyAuctionItem
  serverTime: string
  onChanged: () => Promise<unknown>
}) {
  const { auction: a } = item
  const [editing, setEditing] = useState(false)
  const remaining = useCountdown(a.endAt, serverTime)
  // ADR 0081: until enough people register, startAt is the registration
  // deadline (opensAt + 24 h); the time to show is the seller's open time.
  const waiting = waitingForRegistrants(a) ? waitingTime(a, Date.parse(serverTime)) : null
  const untilStart = useCountdown(waiting?.at ?? a.startAt, serverTime)
  const deadline = useCountdown(item.paymentDeadline ?? undefined, serverTime)
  // ADR 0047: a scheduled auction is Active but takes no bids before its start.
  const scheduled = auctionPhase(a, serverTime) === 'Scheduled' && untilStart > 0
  const open = a.state === 'Active' && remaining > 0 && !scheduled
  const payable = item.needsPayment && deadline > 0
  // The seller edits the time only before the first bid (the server rechecks).
  // Registration auctions change their open time on the detail page instead.
  const editable = item.role === 'Seller' && a.minBidders == null && (open || scheduled) && a.bidderCount === 0 && !a.buyNowAt
    && a.version != null && (a.scheduleRevision ?? 0) < AUCTION_MAX_SCHEDULE_EDITS
  const status = payable
    ? 'Cần thanh toán'
    : item.needsPayment ? 'Đã hết thời gian thanh toán, đang cập nhật'
    : scheduled && waiting ? `${waiting.label} ${intakeTime(waiting.at)}`
    : scheduled ? `Hẹn mở lúc ${intakeTime(a.startAt)}`
    : item.role === 'Seller'
      ? open
        ? 'Phiên của bạn đang mở'
        : (states[a.state] ?? 'Đang chốt kết quả')
      : open
        ? item.leading
          ? 'Bạn đang dẫn giá'
          : 'Bạn đã bị vượt giá'
        : item.won && a.state === 'Sold'
          ? 'Bạn đã thắng và thanh toán'
          : (states[a.state] ?? 'Đang chốt kết quả')
  const tone: Tone = payable ? 'pay'
    : item.needsPayment ? 'done'
    : scheduled ? 'soon'
    : item.role === 'Seller' ? (open ? 'mine' : 'done')
    : open ? (item.leading ? 'lead' : 'outbid')
    : item.won && a.state === 'Sold' ? 'won' : 'done'
  const registered = a.registeredCount ?? 0
  const needed = a.minBidders ?? AUCTION_MIN_BIDDERS_FLOOR
  return (
    <article className={styles.row} data-tone={tone}>
      <div className={styles.cover}>
        <AuctionPhoto auction={a} interactive={false} />
      </div>
      <div className={styles.info}>
        <div className={styles.badges}>
          <span className={styles.role} data-role={item.role}>
            {item.role === 'Seller' ? <Store size={13} aria-hidden="true" /> : <Gavel size={13} aria-hidden="true" />}
            {item.role === 'Seller' ? 'Bạn mở phiên' : 'Bạn tham gia'}
          </span>
          <span className={`${styles.status} ${payable ? styles.urgent : ''}`}>
            {open && <i className={styles.live} aria-hidden="true" />}
            {status}
          </span>
        </div>
        <h2>
          <Link to={ROUTES.auctionDetail(a.id)}>{a.title}</Link>
        </h2>
        <p className={styles.place}><MapPin size={13} aria-hidden="true" /> {a.pointName}</p>
        {item.needsPayment && (
          <p className={styles.clock} data-urgent={deadline > 0 || undefined}>
            <Wallet size={14} aria-hidden="true" />
            {deadline > 0 ? <>Còn <b>{formatRemaining(deadline)}</b> để thanh toán</> : <b>Đã hết giờ thanh toán</b>}
            {item.paymentDeadline && <span className={styles.clockAt}>hạn {new Date(item.paymentDeadline).toLocaleString('vi-VN')}</span>}
          </p>
        )}
        {open && (
          <p className={styles.clock}>
            <Clock size={14} aria-hidden="true" /> Còn <b>{formatRemaining(remaining)}</b>
          </p>
        )}
        {scheduled && waiting && (
          <div className={styles.registrants}>
            <p className={styles.clock}>
              <CalendarClock size={14} aria-hidden="true" />
              Đăng ký <b>{registered}/{needed}</b> người · {waiting.label === 'Mở lúc' ? 'mở sau' : 'hạn còn'} <b>{formatRemaining(untilStart)}</b>
            </p>
            <span className={styles.meter} aria-hidden="true">
              <span style={{ width: `${Math.min(100, (registered / Math.max(1, needed)) * 100)}%` }} />
            </span>
          </div>
        )}
        {scheduled && !waiting && (
          <p className={styles.clock}>
            <CalendarClock size={14} aria-hidden="true" />
            Mở sau <b>{formatRemaining(untilStart)}</b>
            <span className={styles.clockAt}>kéo dài {formatDuration(Math.round((Date.parse(a.endAt) - Date.parse(a.startAt)) / 1000))}</span>
          </p>
        )}
      </div>
      <div className={styles.action}>
        <span className={styles.priceLabel}>
          {a.currentPrice === null
            ? 'Giá khởi điểm'
            : 'Giá hiện tại / giá chốt'}
          <InfoTip label={a.currentPrice === null ? 'Giá khởi điểm' : 'Giá hiện tại'}>
            {a.currentPrice === null
              ? <>Chưa có lượt trả giá. Lượt đầu tiên phải từ <b>{formatVnd(a.startPrice)}</b>, mỗi bước <b>{formatVnd(a.step)}</b>.</>
              : <>Giá cao nhất đang được giữ. Khi phiên kết thúc, đây là <b>giá chốt</b> người thắng thanh toán.</>}
          </InfoTip>
        </span>
        <strong key={a.currentPrice ?? a.startPrice}>{formatVnd(a.currentPrice ?? a.startPrice)}</strong>
        <span className={styles.bidders}>{a.bidderCount ? <><b>{a.bidderCount}</b> người trả giá</> : 'Chưa có ai trả giá'}</span>
        <div className={styles.rowButtons}>
        {editable && (
          <button type="button" className={styles.secondaryAction} onClick={() => setEditing(true)}>Đổi thời gian</button>
        )}
        <Link className={styles.viewButton} to={item.won ? `${ROUTES.auctionOrder(a.id)}?from=mine` : ROUTES.auctionDetail(a.id)}>
          {payable
            ? 'Xem và thanh toán'
            : item.won ? 'Mở đơn đấu giá'
            : open && item.role === 'Bidder' && !item.leading
              ? 'Xem để trả tiếp'
              : waiting && item.role === 'Seller'
                ? 'Quản lý phiên'
                : 'Xem phiên'}{' '}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
        </div>
        {item.role === 'Seller' && a.version != null && (open || scheduled) && (
          <DemoSkipButton
            label={scheduled ? 'Mở phiên ngay · Demo' : 'Kết thúc phiên ngay · Demo'}
            note={scheduled
              ? 'Bỏ qua giờ hẹn mở và điều kiện số người đăng ký để mở phiên đấu giá ngay (chế độ demo).'
              : 'Chốt phiên ngay; hệ thống chọn người thắng và tạo đơn như khi hết giờ.'}
            run={(key) => advanceDemoAuction(a.id, a.version!, key)}
            onDone={onChanged}
          />
        )}
      </div>
      {editable && (
        <ScheduleAuctionDialog
          isOpen={editing}
          onClose={() => setEditing(false)}
          onDone={onChanged}
          title={a.title}
          serverTime={serverTime}
          target={{ kind: 'reschedule', auctionId: a.id, version: a.version!, live: !scheduled, startAt: a.startAt, endAt: a.endAt }}
        />
      )}
    </article>
  )
}

// Intakes before a session opens, plus books waiting to be collected back.
const WAITING_INTAKE_STATES = new Set<MyIntake['state']>(['AwaitingDropoff', 'Received', 'NeedsEvidence', 'Passed', 'ReclaimRequired'])
const INTAKE_STATES: Record<MyIntake['state'], string> = {
  AwaitingDropoff: 'Chờ bạn mang sách tới điểm',
  Received: 'Điểm đã nhận sách, chờ kiểm tra',
  NeedsEvidence: 'Điểm cần bạn bổ sung bằng chứng',
  Passed: 'Đã qua kiểm tra, bạn có thể đăng phiên',
  ReclaimRequired: 'Mời bạn tới điểm nhận lại sách',
  Auctioning: 'Đã tạo phiên đấu giá',
  Sold: 'Người thắng đã thanh toán',
  Cancelled: 'Đã hủy lần gửi sách',
  Reclaimed: 'Bạn đã nhận lại sách',
}
const RECLAIM: Record<string, string> = {
  SellerCancelled: 'Bạn đã rút sách khỏi đấu giá.',
  InspectionFailed: 'Sách chưa khớp mô tả khi kiểm tra.',
  Unsold: 'Phiên kết thúc mà chưa có người trả giá.',
  PaymentExpired: 'Người thắng không thanh toán đúng hạn.',
  AuctionCancelled: 'Phiên đã bị hủy.',
}
const intakeTime = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })

// N4-12: the point asked for evidence. One written answer before the deadline;
// another Staff member decides, and silence never counts as a Pass.
function EvidenceForm({ intake, onChanged }: { intake: MyIntake; onChanged: () => Promise<unknown> }) {
  const intent = useIntentKey()
  const pending = useRef<{ version: number; key: string; note: string } | null>(null)
  const [note, setNote] = useState('')
  const [confirmSend, setConfirmSend] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unknown, setUnknown] = useState(false)
  const trimmed = note.trim()
  if (intake.evidenceSubmittedAt)
    return <p>Bạn đã gửi bằng chứng lúc {intakeTime(intake.evidenceSubmittedAt)}. Một nhân viên khác tại điểm sẽ quyết định.</p>
  const send = async () => {
    if ([...trimmed].length < EVIDENCE_MIN_LENGTH && !pending.current) {
      setError(`Mô tả bằng chứng ít nhất ${EVIDENCE_MIN_LENGTH} ký tự.`)
      return
    }
    // A retry after an unknown outcome resends the same body with the same key.
    const attempt = pending.current ?? { version: intake.version, key: intent.keyFor(`evidence:${intake.id}:${intake.version}`), note: trimmed }
    pending.current = attempt
    let stillUnknown = false
    setBusy(true); setError(null)
    try {
      await submitIntakeEvidence(intake.id, attempt.version, attempt.note, attempt.key)
      intent.settle(); pending.current = null
    } catch (caught) {
      stillUnknown = commandOutcomeUnknown(caught)
      if (!stillUnknown) { intent.settle(); pending.current = null }
      setError(!stillUnknown && caught instanceof ApiError
        ? caught.message || 'Chưa gửi được bằng chứng.'
        : 'Chưa rõ bằng chứng đã được ghi hay chưa. Hãy thử lại đúng thao tác này.')
    } finally {
      setUnknown(stillUnknown); setBusy(false)
      if (!stillUnknown) void onChanged()
    }
  }
  return (
    <div className={styles.evidence}>
      {intake.inspectionNote && <p><b>Điểm cần:</b> {intake.inspectionNote}</p>}
      {intake.evidenceDeadline && (
        <p className={styles.evidenceDue}>
          Hạn bổ sung <b>{intakeTime(intake.evidenceDeadline)}</b>
          <InfoTip label="Hạn bổ sung">Quá hạn mà chưa gửi, <b>sách sẽ được trả lại</b> cho bạn. Im lặng không bao giờ được tính là đạt.</InfoTip>
        </p>
      )}
      <span className={styles.evidenceLabel}>
        <label htmlFor={`evidence-${intake.id}`}>Bằng chứng của bạn</label>
        <InfoTip label="Bằng chứng của bạn">
          Mô tả nguồn gốc, dấu riêng hoặc giấy tờ bạn có ({EVIDENCE_MIN_LENGTH}–2.000 ký tự). <b>Chỉ gửi được một lần</b>; một nhân viên khác tại điểm sẽ quyết định.
        </InfoTip>
      </span>
      <textarea
        id={`evidence-${intake.id}`}
        rows={3}
        maxLength={2000}
        value={note}
        disabled={busy || unknown}
        onChange={(event) => { setNote(event.target.value); setError(null) }}
      />
      <span className={styles.counter}>{[...trimmed].length}/2.000 ký tự · tối thiểu {EVIDENCE_MIN_LENGTH}</span>
      {error && <p className={styles.urgent} role="alert">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (unknown) {
            void send()
            return
          }
          if (note.trim().length < EVIDENCE_MIN_LENGTH) {
            setError(`Cần ít nhất ${EVIDENCE_MIN_LENGTH} ký tự để điểm đối chiếu.`)
            return
          }
          setError(null)
          setConfirmSend(true)
        }}
      >
        {unknown ? 'Thử lại gửi bằng chứng' : busy ? 'Đang gửi…' : 'Gửi bằng chứng'}
      </button>
      <ConfirmDialog
        isOpen={confirmSend}
        onClose={() => !busy && setConfirmSend(false)}
        title="Xác nhận gửi bằng chứng kiểm định?"
        description="Bằng chứng bổ sung chỉ được gửi một lần duy nhất và không thể chỉnh sửa sau khi gửi. Điểm kiểm định sẽ đối chiếu nội dung này để quyết định duyệt phiên."
        confirmText="Gửi bằng chứng"
        isBusy={busy}
        error={error}
        onConfirm={() => void send().then(() => setConfirmSend(false))}
      />
    </div>
  )
}

// The intake carries no photo, so the cover comes from the seller's own listing
// (the same owner-only reads /auctions/new uses). Any failure falls back to the
// placeholder; the row never waits on the picture.
function IntakeCover({ intake }: { intake: MyIntake }) {
  const auth = useSession()
  const ownerId = auth.status === 'authenticated' ? auth.user.id : undefined
  const [failedUrl, setFailedUrl] = useState<string>()
  const listing = useQuery({
    queryKey: ['my-listing', ownerId, intake.listingId],
    queryFn: () => getMyListing(intake.listingId),
    enabled: !!ownerId,
    retry: false,
    staleTime: 5 * 60_000,
  })
  const mediaId = listing.data?.currentRevision.content.mediaIds?.[0]
  const photo = useQuery({
    queryKey: ['my-photo', ownerId, intake.listingId, listing.data?.currentRevision.id, mediaId],
    queryFn: () => getMyPhoto(intake.listingId, mediaId!),
    enabled: !!ownerId && !!mediaId,
    retry: false,
    staleTime: 60_000,
  })
  const url = photo.data?.url
  return (
    <div className={styles.intakeCover}>
      {url && url !== failedUrl
        ? <img src={url} alt={`Ảnh bản sách ${intake.title}`} loading="lazy" decoding="async" onError={() => setFailedUrl(url)} />
        : <span className={styles.coverState}><BookOpen size={20} aria-hidden="true" />{listing.isPending || (mediaId && photo.isPending) ? 'Đang tải…' : 'Chưa có ảnh'}</span>}
    </div>
  )
}

function IntakeRow({ intake, pointName, onChanged }: { intake: MyIntake; pointName?: string; onChanged: () => Promise<unknown> }) {
  const intent = useIntentKey()
  const [publishing, setPublishing] = useState(false)
  // An unknown outcome keeps the same version and key so a retry replays the same intent.
  const pending = useRef<{ version: number; key: string } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unknown, setUnknown] = useState(false)
  const cancellable = intake.state === 'AwaitingDropoff' || intake.state === 'Received' || intake.state === 'Passed'
  const withdraw = async () => {
    const attempt = pending.current ?? { version: intake.version, key: intent.keyFor(`withdraw:${intake.id}:${intake.version}`) }
    pending.current = attempt
    let stillUnknown = false
    setBusy(true); setError(null)
    try {
      await withdrawIntake(intake.id, attempt.version, attempt.key)
      intent.settle(); pending.current = null
      setConfirming(false)
    } catch (caught) {
      stillUnknown = commandOutcomeUnknown(caught)
      if (!stillUnknown) { intent.settle(); pending.current = null }
      setError(!stillUnknown && caught instanceof ApiError
        ? caught.message || 'Chưa rút được sách khỏi đấu giá.'
        : 'Chưa rõ yêu cầu đã được ghi hay chưa. Hãy thử lại đúng thao tác này.')
    } finally {
      setUnknown(stillUnknown); setBusy(false)
      if (!stillUnknown) void onChanged()
    }
  }
  return (
    <li className={styles.intake} data-state={intake.state}>
      <IntakeCover intake={intake} />
      <div className={styles.intakeMain}>
        <span className={styles.intakeState}>{INTAKE_STATES[intake.state]}</span>
        <h3>{intake.title}</h3>
        <p>
          <span className={styles.place}><MapPin size={13} aria-hidden="true" /> {pointName ?? 'Điểm đã chọn'}</span>
          {intake.state === 'AwaitingDropoff' && <span className={styles.deadline}><Clock size={13} aria-hidden="true" /> Hạn gửi <b>{intakeTime(intake.dropoffDeadline)}</b></span>}
        </p>
        {intake.state === 'ReclaimRequired' && intake.reclaimReason && (
          <div className={styles.reclaim}>
            <strong>{RECLAIM[intake.reclaimReason] ?? 'Sách cần được nhận lại.'}</strong>
            {intake.inspectionNote && <span><em>Ghi chú kiểm tra:</em> {intake.inspectionNote}</span>}
          </div>
        )}
        {intake.state === 'NeedsEvidence' && <EvidenceForm intake={intake} onChanged={onChanged} />}
        {error && <p className={styles.urgent} role="alert">{error}</p>}
      </div>
      <div className={styles.intakeSide}>
        <span className={styles.priceLabel}>Khởi điểm</span>
        <strong>{formatVnd(intake.startPrice)}</strong>
        <span className={styles.terms}>
          <span>Bước <b>{formatVnd(intake.step)}</b></span>
          {intake.buyNowPrice !== null && <span>Mua ngay <b>{formatVnd(intake.buyNowPrice)}</b></span>}
        </span>
        {intake.auctionId && (
          <span className={styles.viewWithTip}>
            <Link className={styles.viewButton} to={ROUTES.auctionDetail(intake.auctionId)}>Xem phiên đấu giá <ArrowRight size={16} aria-hidden="true" /></Link>
            <InfoTip label="Xem phiên đấu giá">Mở phiên để xem <b>lịch</b>, <b>trạng thái</b> và <b>kết quả</b> đấu giá.</InfoTip>
          </span>
        )}
        {(intake.state === 'Passed' || cancellable) && (
          <div className={styles.intakeActions}>
            {cancellable && (
              <button type="button" disabled={busy} onClick={() => (unknown ? void withdraw() : setConfirming(true))}>
                {unknown ? 'Thử lại rút sách' : 'Rút khỏi đấu giá'}
              </button>
            )}
            {intake.state === 'Passed' && (
              <button type="button" className={styles.publish} disabled={busy} onClick={() => setPublishing(true)}>
                Đăng phiên
              </button>
            )}
          </div>
        )}
      </div>
      <ConfirmDialog
        isOpen={confirming}
        onClose={() => !busy && setConfirming(false)}
        title="Rút sách khỏi đấu giá?"
        // "Giữ lại" rather than "Hủy": next to a red withdraw button, "Hủy" reads as the same action.
        cancelText="Giữ lại"
        confirmText="Rút sách"
        isDanger
        isBusy={busy}
        error={error}
        onConfirm={() => void withdraw()}
      >
        <div className={styles.withdrawBook}>
          <IntakeCover intake={intake} />
          <span>
            <strong>{intake.title}</strong>
            <span className={styles.place}><MapPin size={13} aria-hidden="true" /> {pointName ?? 'Điểm đã chọn'}</span>
          </span>
        </div>
        <ul className={styles.consequences}>
          {intake.state === 'AwaitingDropoff' ? (
            <>
              <li data-kind="ok"><Check size={16} aria-hidden="true" /><span>Chỗ tại <b>{pointName ?? 'điểm đã chọn'}</b> được trả lại.</span></li>
              <li data-kind="ok"><Check size={16} aria-hidden="true" /><span>Bài đăng bán <b>không còn ở trạng thái Đang giữ</b>.</span></li>
            </>
          ) : (
            <li data-kind="go"><MapPin size={16} aria-hidden="true" /><span>Sách đang ở <b>{pointName ?? 'điểm đã chọn'}</b>: bạn cần <b>tới điểm để nhận lại sách</b>.</span></li>
          )}
          <li data-kind="warn"><TriangleAlert size={16} aria-hidden="true" /><span>Phiếu gửi này <b>không thể khôi phục</b> sau khi rút.</span></li>
        </ul>
      </ConfirmDialog>
      {intake.state === 'Passed' && (
        <ScheduleAuctionDialog
          isOpen={publishing}
          onClose={() => setPublishing(false)}
          onDone={onChanged}
          title={intake.title}
          target={{ kind: 'publish', intakeId: intake.id, version: intake.version }}
        />
      )}
    </li>
  )
}

function SellerIntakes({
  enabled,
  userId,
  hideWhenEmpty = false,
}: {
  enabled: boolean;
  userId: string | undefined;
  // "Tất cả" is for buyers too: show the seller block only when it has books.
  hideWhenEmpty?: boolean;
}) {
  const [params, setParams] = useSearchParams();

  const focusId = params.get("intakeId");
  const queryClient = useQueryClient();
  const focus = useQuery({
    queryKey: ["my-auction-intakes", userId, "focus", focusId],
    queryFn: () => getMyAuctionIntake(focusId!),
    enabled: enabled && !!focusId,
    retry: false,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
  const intakes = useQuery({
    queryKey: ["my-auction-intakes", userId],
    queryFn: () => getMyAuctionIntakes(),
    enabled: enabled && !focusId,
    retry: false,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
  const points = useQuery({
    queryKey: ["handover-points"],
    queryFn: listHandoverPoints,
    enabled,
    retry: false,
    staleTime: 60_000,
  });
  if (!enabled) return null;
  const current = focusId ? focus : intakes;
  if (current.isPending) return <p role="status">Đang mở lần gửi sách…</p>;
  if (current.isError)
    return (
      <div className={styles.refreshError} role="alert">
        <p>Chưa tải được sách đang chờ mở phiên.</p>
        <button type="button" onClick={() => void current.refetch()}>
          <RefreshCw size={16} aria-hidden="true" /> Thử lại
        </button>
        {focusId && <Link to="/my-auctions">Về danh sách đấu giá</Link>}
      </div>
    );
  const waiting = focusId
    ? focus.data
      ? [focus.data]
      : []
    : (intakes.data?.items ?? []).filter((i) => WAITING_INTAKE_STATES.has(i.state));
  if (hideWhenEmpty && !focusId && !waiting.length) return null;
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["my-auction-intakes"] }),
      queryClient.invalidateQueries({ queryKey: ["my-auctions"] }),
      queryClient.invalidateQueries({ queryKey: ["my-listings"] }),
    ]);
  return (
    <section className={styles.intakes} aria-labelledby="intakes-title">
      <img className={styles.intakesArt} src="/illustrations/my-auctions/parcel.svg" width="120" height="120" alt="" aria-hidden="true" loading="lazy" decoding="async" />
      <div className={styles.intakesHead}>
        <h2 id="intakes-title">
          {focusId ? 'Lần gửi sách của bạn' : 'Sách chờ đăng phiên'}
          {!focusId && waiting.length > 0 && <span className={styles.count}>{waiting.length}</span>}
          <InfoTip label="Sách chờ đăng phiên">
            Sách bạn đã gửi tới điểm. Điểm <b>nhận và kiểm tra</b> sách; khi sách <b>đạt kiểm tra</b>, bạn đăng phiên và chọn giờ mở.
          </InfoTip>
        </h2>
        {focusId && (
          <button type="button" onClick={() => setParams({})}>
            Xem tất cả lần gửi
          </button>
        )}
      </div>
      {waiting.length ? (
        <ul>
          {waiting.map((i) => (
            <IntakeRow
              key={i.id}
              intake={i}
              pointName={
                points.data?.items.find((p) => p.id === i.pointId)?.name
              }
              onChanged={refresh}
            />
          ))}
        </ul>
      ) : (
        <p className={styles.intakesEmpty}>
          Chưa có sách nào đang chờ. Chọn <b>một cuốn đang bán trên kệ</b> để đưa lên đấu giá.
        </p>
      )}
    </section>
  );
}

export function MyAuctionsPage() {
  const auth = useSession()
  const queryClient = useQueryClient()
  const userId = auth.status === 'authenticated' ? auth.user.id : undefined
  const [params, setParams] = useSearchParams()
  const navigation = useCursorNavigation(auth.status === "authenticated" ? auth.user.id : "guest")
  const view = views.some((v) => v.value === params.get('view'))
    ? params.get('view')!
    : 'all'
  const cursor = params.get('cursor') ?? undefined
  const query = useQuery({
    queryKey: ['my-auctions', userId, view, cursor],
    queryFn: () => listMyAuctions(view, cursor),
    enabled: !!userId,
    retry: false,
    refetchOnMount: 'always',
    refetchInterval: 8_000,
    refetchIntervalInBackground: false,
  })
  function select(next: string) {
    const p = new URLSearchParams()
    if (next !== 'all') p.set('view', next)
    setParams(p)
  }
  const stale = query.isError && !!query.data && outcomeUnknown(query.error)
  const readDenied = query.error instanceof ApiError && [401, 403].includes(query.error.status)
  const showData = !!query.data && (!query.isError || stale)
  return (
    <AuctionStage>
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <p className={styles.kicker}><Gavel size={14} aria-hidden="true" /> Bàn đấu giá của bạn</p>
          <h1 className={styles.title}>
            Đấu giá của tôi
            <InfoTip label="Đấu giá của tôi">
              Theo dõi các phiên <b>bạn tham gia</b> hoặc <b>đã mở bán</b>. Giá và trạng thái được <b>làm mới mỗi 8 giây</b>.
            </InfoTip>
          </h1>
          <div className={styles.headerActions}>
            <Link className={styles.primaryLink} to={ROUTES.auctions}>
              Khám phá phiên mới <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link className={styles.ghostLink} to={ROUTES.auctionCreate()}>
              <Plus size={15} aria-hidden="true" /> Đưa sách lên đấu giá
            </Link>
          </div>
        </div>
        <img className={styles.headerArt} src="/illustrations/my-auctions/paddle.svg" width="200" height="160" alt="" aria-hidden="true" decoding="async" />
      </header>
      <nav className={styles.tabs} aria-label="Lọc đấu giá của tôi">
        {views.map((v) => (
          <button
            type="button"
            key={v.value}
            aria-current={view === v.value ? 'page' : undefined}
            onClick={() => select(v.value)}
          >
            <v.icon size={16} aria-hidden="true" />
            {v.label}
          </button>
        ))}
      </nav>
      <SellerIntakes userId={userId} enabled={!!userId && (view === 'all' || view === 'selling') && !cursor} hideWhenEmpty={view === 'all'} />
      <div className={styles.results} id="my-auction-results" tabIndex={-1} aria-busy={query.isFetching}>
        {query.isPending && <p role="status">Đang tải các phiên của bạn…</p>}
        {query.isError && (
          <div className={stale ? styles.refreshError : styles.empty} role="alert">
            <h2>{stale ? 'Chưa làm mới được các phiên' : 'Chưa tải được các phiên của bạn'}</h2>
            <p>{query.error instanceof ApiError && [401, 403].includes(query.error.status) ? 'Tài khoản hiện không có quyền xem mục này. Kiểm tra phiên đăng nhập, trạng thái tài khoản hoặc liên hệ hỗ trợ.' : stale ? 'Giá và trạng thái bên dưới là lần tải gần nhất. Thử cập nhật trước khi quyết định trả giá hoặc thanh toán.' : 'Kiểm tra kết nối rồi thử lại.'}</p>
            <button type="button" onClick={() => void query.refetch()}>
              <RefreshCw size={16} aria-hidden="true" /> Thử lại
            </button>
          </div>
        )}
        {query.data && !query.isError && !query.data.items.length && (
          <div className={`${styles.empty} ${view === 'selling' ? styles.emptyCompact : ''}`}>
            {/* "Phiên của tôi" already shows the books waiting above with their
                next step; a second full-size illustration reads as "nothing here". */}
            {view !== 'selling' && <img className={styles.emptyArt} src="/illustrations/my-auctions/empty-rack.svg" width="232" height="150" alt="" aria-hidden="true" decoding="async" />}
            <h2>
              {view === 'payment'
                ? 'Bạn không có phiên cần thanh toán'
                : cursor
                  ? 'Không còn phiên ở trang này'
                  : 'Chưa có phiên trong mục này'}
            </h2>
            <p>
              {view === 'selling'
                ? 'Các phiên của bạn xuất hiện sau khi sách qua kiểm tra và bạn đăng phiên.'
                : view === 'upcoming' ? 'Chưa có phiên nào đang hẹn giờ mở.'
                : 'Ghé kệ đấu giá để tìm một cuốn sách bạn muốn đọc tiếp.'}
            </p>
            <Link to={ROUTES.auctions}>
              Xem các phiên đang mở <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        )}
        {query.data &&
          showData &&
          query.data.items.map((item) => (
            <AuctionRow
              key={item.auction.id}
              item={item}
              serverTime={query.data.serverTime}
              onChanged={() => Promise.all([
                queryClient.invalidateQueries({ queryKey: ['my-auctions'] }),
                queryClient.invalidateQueries({ queryKey: ['auctions'] }),
              ])}
            />
          ))}
      </div>
      {!readDenied && <CursorPager navigation={navigation} nextCursor={!query.isError ? query.data?.nextCursor : undefined}
        busy={query.isFetching} failed={query.isError} count={query.data?.items.length} label="Trang đấu giá của tôi" itemLabel="phiên" anchorId="my-auction-results" />}
    </div>
    </AuctionStage>
  )
}
