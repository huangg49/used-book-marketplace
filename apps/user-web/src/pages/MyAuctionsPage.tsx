import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@used-books/session-client'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, Gavel, MapPin, Plus, RefreshCw } from 'lucide-react'
import { AuctionPhoto } from '../components/AuctionGallery'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useSession } from '../hooks/useSession'
import { formatRemaining, outcomeUnknown, useCountdown, useIntentKey } from '../hooks/useAuctionClock'
import {
  EVIDENCE_MIN_LENGTH, getMyAuctionIntakes, listHandoverPoints, listMyAuctions, submitIntakeEvidence, withdrawIntake,
  type MyAuctionItem, type MyIntake,
} from '../services/auctions'
import { ROUTES, formatVnd } from '../lib/routes'
import styles from './MyAuctionsPage.module.css'

const views = [
  { value: 'all', label: 'Tất cả' },
  { value: 'active', label: 'Đang diễn ra' },
  { value: 'payment', label: 'Cần thanh toán' },
  { value: 'selling', label: 'Phiên của tôi' },
]
const states: Record<string, string> = {
  BuyNowPending: 'Chờ thanh toán mua ngay',
  AwaitingWinnerPayment: 'Chờ người thắng thanh toán',
  Sold: 'Người thắng đã thanh toán',
  Unsold: 'Kết thúc, chưa có người trả giá',
  OnHold: 'Phiên tạm dừng',
  Cancelled: 'Phiên đã hủy',
  PaymentExpired: 'Đã quá hạn thanh toán',
}
function AuctionRow({
  item,
  serverTime,
}: {
  item: MyAuctionItem
  serverTime: string
}) {
  const { auction: a } = item
  const remaining = useCountdown(a.endAt, serverTime)
  const deadline = useCountdown(item.paymentDeadline ?? undefined, serverTime)
  const open = a.state === 'Active' && remaining > 0
  const payable = item.needsPayment && deadline > 0
  const status = payable
    ? 'Cần thanh toán'
    : item.needsPayment ? 'Đã hết thời gian thanh toán, đang cập nhật'
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
  return (
    <article className={styles.row}>
      <div className={styles.cover}>
        <AuctionPhoto auction={a} interactive={false} />
      </div>
      <div className={styles.info}>
        <h2>
          <Link to={ROUTES.auctionDetail(a.id)}>{a.title}</Link>
        </h2>
        <p>{a.pointName}</p>
        <span
          className={`${styles.status} ${payable ? styles.urgent : ''}`}
        >
          {status}
        </span>
        {item.needsPayment && (
          <p>
            Hạn thanh toán:{' '}
            {item.paymentDeadline
              ? new Date(item.paymentDeadline).toLocaleString('vi-VN')
              : '—'}{' '}
            · {deadline > 0 ? `còn ${formatRemaining(deadline)}` : 'Đã hết giờ'}
          </p>
        )}
        {open && <p>Còn {formatRemaining(remaining)}</p>}
      </div>
      <div className={styles.action}>
        <span>
          {a.currentPrice === null
            ? 'Giá khởi điểm'
            : 'Giá hiện tại / giá chốt'}
        </span>
        <strong>{formatVnd(a.currentPrice ?? a.startPrice)}</strong>
        <Link to={ROUTES.auctionDetail(a.id)}>
          {payable
            ? 'Xem và thanh toán'
            : open && item.role === 'Bidder' && !item.leading
              ? 'Xem để trả tiếp'
              : 'Xem phiên'}{' '}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </article>
  )
}

// Intakes before a session opens, plus books waiting to be collected back.
const INTAKE_STATES: Partial<Record<MyIntake['state'], string>> = {
  AwaitingDropoff: 'Chờ bạn mang sách tới điểm',
  Received: 'Điểm đã nhận sách, chờ kiểm tra',
  NeedsEvidence: 'Điểm cần bạn bổ sung bằng chứng',
  Passed: 'Đã qua kiểm tra, chờ mở phiên',
  ReclaimRequired: 'Mời bạn tới điểm nhận lại sách',
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
      stillUnknown = outcomeUnknown(caught)
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
      {intake.inspectionNote && <p>Điểm cần: {intake.inspectionNote}</p>}
      {intake.evidenceDeadline && <p>Hạn bổ sung: {intakeTime(intake.evidenceDeadline)}. Quá hạn, sách sẽ được trả lại cho bạn.</p>}
      <label htmlFor={`evidence-${intake.id}`}>Bằng chứng của bạn</label>
      <textarea
        id={`evidence-${intake.id}`}
        rows={3}
        maxLength={2000}
        value={note}
        disabled={busy || unknown}
        onChange={(event) => { setNote(event.target.value); setError(null) }}
      />
      <span>Mô tả nguồn gốc, dấu riêng hoặc giấy tờ bạn có ({EVIDENCE_MIN_LENGTH}–2.000 ký tự). Chỉ gửi được một lần.</span>
      {error && <p className={styles.urgent} role="alert">{error}</p>}
      <button type="button" disabled={busy} onClick={() => void send()}>
        {unknown ? 'Thử lại gửi bằng chứng' : busy ? 'Đang gửi…' : 'Gửi bằng chứng'}
      </button>
    </div>
  )
}

function IntakeRow({ intake, pointName, onChanged }: { intake: MyIntake; pointName?: string; onChanged: () => Promise<unknown> }) {
  const intent = useIntentKey()
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
    } catch (caught) {
      stillUnknown = outcomeUnknown(caught)
      if (!stillUnknown) { intent.settle(); pending.current = null }
      setError(!stillUnknown && caught instanceof ApiError
        ? caught.message || 'Chưa rút được sách khỏi đấu giá.'
        : 'Chưa rõ yêu cầu đã được ghi hay chưa. Hãy thử lại đúng thao tác này.')
    } finally {
      setUnknown(stillUnknown); setBusy(false); setConfirming(false)
      if (!stillUnknown) void onChanged()
    }
  }
  return (
    <li className={styles.intake}>
      <div>
        <span className={styles.intakeState}>{INTAKE_STATES[intake.state]}</span>
        <h3>{intake.title}</h3>
        <p>
          <MapPin size={13} aria-hidden="true" /> {pointName ?? 'Điểm đã chọn'}
          {intake.state === 'AwaitingDropoff' && <> · hạn gửi {intakeTime(intake.dropoffDeadline)}</>}
        </p>
        {intake.state === 'ReclaimRequired' && intake.reclaimReason && (
          <p>{RECLAIM[intake.reclaimReason] ?? 'Sách cần được nhận lại.'}{intake.inspectionNote ? ` Ghi chú kiểm tra: ${intake.inspectionNote}` : ''}</p>
        )}
        {intake.state === 'NeedsEvidence' && <EvidenceForm intake={intake} onChanged={onChanged} />}
        {error && <p className={styles.urgent} role="alert">{error}</p>}
      </div>
      <div className={styles.intakeSide}>
        <span>Khởi điểm</span>
        <strong>{formatVnd(intake.startPrice)}</strong>
        <span>Bước {formatVnd(intake.step)}{intake.buyNowPrice !== null ? ` · mua ngay ${formatVnd(intake.buyNowPrice)}` : ''}</span>
        {cancellable && (
          <button type="button" disabled={busy} onClick={() => (unknown ? void withdraw() : setConfirming(true))}>
            {unknown ? 'Thử lại rút sách' : 'Rút khỏi đấu giá'}
          </button>
        )}
      </div>
      <ConfirmDialog
        isOpen={confirming}
        onClose={() => !busy && setConfirming(false)}
        title="Rút cuốn sách này khỏi đấu giá?"
        description={intake.state === 'AwaitingDropoff'
          ? 'Chỗ tại điểm được trả lại và bài đăng bán không còn ở trạng thái Đang giữ.'
          : 'Sách đang ở điểm. Sau khi rút, bạn cần tới điểm để nhận lại sách.'}
        confirmText="Rút sách"
        isDanger
        isBusy={busy}
        onConfirm={() => void withdraw()}
      />
    </li>
  )
}

function SellerIntakes({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient()
  const intakes = useQuery({ queryKey: ['my-auction-intakes'], queryFn: getMyAuctionIntakes, enabled, retry: false, refetchInterval: 30_000 })
  const points = useQuery({ queryKey: ['handover-points'], queryFn: listHandoverPoints, enabled, retry: false, staleTime: 60_000 })
  if (!enabled || intakes.isPending) return null
  if (intakes.isError)
    return (
      <div className={styles.refreshError} role="alert">
        <p>Chưa tải được sách đang chờ mở phiên.</p>
        <button type="button" onClick={() => void intakes.refetch()}><RefreshCw size={16} aria-hidden="true" /> Thử lại</button>
      </div>
    )
  const waiting = intakes.data.items.filter((i) => i.state in INTAKE_STATES)
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['my-auction-intakes'] }),
    queryClient.invalidateQueries({ queryKey: ['my-auctions'] }),
    queryClient.invalidateQueries({ queryKey: ['my-listings'] }),
  ])
  return (
    <section className={styles.intakes} aria-labelledby="intakes-title">
      <div className={styles.intakesHead}>
        <h2 id="intakes-title">Sách chờ mở phiên</h2>
        <Link to={ROUTES.auctionCreate()}><Plus size={15} aria-hidden="true" /> Đưa sách lên đấu giá</Link>
      </div>
      {waiting.length ? (
        <ul>
          {waiting.map((i) => (
            <IntakeRow key={i.id} intake={i} pointName={points.data?.items.find((p) => p.id === i.pointId)?.name} onChanged={refresh} />
          ))}
        </ul>
      ) : (
        <p className={styles.intakesEmpty}>Chưa có sách nào đang chờ. Chọn một cuốn đang bán trên kệ để đưa lên đấu giá.</p>
      )}
    </section>
  )
}

export function MyAuctionsPage() {
  const auth = useSession()
  const userId = auth.status === 'authenticated' ? auth.user.id : undefined
  const [params, setParams] = useSearchParams()
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
    refetchInterval: 20_000,
  })
  function select(next: string) {
    const p = new URLSearchParams()
    if (next !== 'all') p.set('view', next)
    setParams(p)
  }
  const stale = query.isError && !!query.data && outcomeUnknown(query.error)
  const showData = !!query.data && (!query.isError || stale)
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Đấu giá của tôi</h1>
          <p>
            Theo dõi các phiên bạn tham gia hoặc đã mở bán. Giá và trạng thái
            được làm mới mỗi 20 giây.
          </p>
        </div>
        <Link to={ROUTES.auctions}>
          Khám phá phiên mới <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </header>
      <nav className={styles.tabs} aria-label="Lọc đấu giá của tôi">
        {views.map((v) => (
          <button
            type="button"
            key={v.value}
            aria-current={view === v.value ? 'page' : undefined}
            onClick={() => select(v.value)}
          >
            {v.label}
          </button>
        ))}
      </nav>
      <SellerIntakes enabled={!!userId && (view === 'all' || view === 'selling') && !cursor} />
      <div className={styles.results} aria-busy={query.isFetching}>
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
          <div className={styles.empty}>
            <Gavel size={32} aria-hidden="true" />
            <h2>
              {view === 'payment'
                ? 'Bạn không có phiên cần thanh toán'
                : cursor
                  ? 'Không còn phiên ở trang này'
                  : 'Chưa có phiên trong mục này'}
            </h2>
            <p>
              {view === 'selling'
                ? 'Các phiên của bạn sẽ xuất hiện sau khi sách qua kiểm tra và phiên được mở.'
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
            />
          ))}
      </div>
      {(cursor || (!query.isError && query.data?.nextCursor)) && (
        <nav className={styles.pagination} aria-label="Trang đấu giá của tôi">
          {cursor && (
            <button
              type="button"
              onClick={() => {
                const p = new URLSearchParams(params)
                p.delete('cursor')
                setParams(p)
              }}
            >
              Về trang đầu
            </button>
          )}
          {!query.isError && query.data?.nextCursor && (
            <button
              type="button"
              onClick={() => {
                const p = new URLSearchParams(params)
                p.set('cursor', query.data!.nextCursor!)
                setParams(p)
              }}
            >
              Trang tiếp <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
        </nav>
      )}
    </div>
  )
}
