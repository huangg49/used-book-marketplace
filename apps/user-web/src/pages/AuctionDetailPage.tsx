import { useEffect, useId, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@used-books/session-client'
import { Link, useLocation, useParams } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, BookMarked, Check, ChevronRight, FileText, Gavel, Images, MapPin, Package, ShieldCheck, StickyNote, TrendingUp, Zap,
} from 'lucide-react'
import { AutoBidDialog } from '../components/AutoBidDialog'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { formatRemaining, outcomeUnknown, useCountdown, useIntentKey } from '../hooks/useAuctionClock'
import { useAuctionLive } from '../hooks/useAuctionLive'
import { useSession } from '../hooks/useSession'
import { formatVnd, ROUTES } from '../lib/routes'
import {
  AUCTION_MAX_PRICE, bidOptions, buyNow, disableAutoBid, getAuction, getMyAuctionIntakes, getMyParticipation, getMyPointOrder,
  payPointOrder, placeBid, setAutoBid, withdrawIntake, type MyIntake,
  type AuctionParticipation, type AuctionState, type AuctionSummary,
} from '../services/auctions'
import styles from './AuctionDetailPage.module.css'
import { AuctionGallery } from '../components/AuctionGallery'
import { conditions } from '../lib/listing-labels'
import { AuctionPrice } from '../components/AuctionPrice'
import { AuctionReceipt } from '../components/AuctionReceipt'
import { useAuctionChangeMotion } from '../hooks/useAuctionMotion'
import { rowFrames, standingFrames } from '../lib/auction-motion'

const HOUR = 3_600_000
// Only a won or bought auction has a final price; a held or cancelled one does not.
const CLOSED_PRICE: Partial<Record<AuctionState, string>> = {
  BuyNowPending: 'Giá mua ngay',
  AwaitingWinnerPayment: 'Giá chốt',
  Sold: 'Giá chốt',
  PaymentExpired: 'Giá thắng (chưa thanh toán)',
  OnHold: 'Giá khi tạm dừng',
  Cancelled: 'Giá khi hủy',
}
const TOP_BADGE: Partial<Record<AuctionState, string>> = {
  Active: 'Đang dẫn',
  AwaitingWinnerPayment: 'Giá chốt',
  Sold: 'Giá chốt',
  OnHold: 'Dẫn khi tạm dừng',
  Cancelled: 'Dẫn khi hủy',
  PaymentExpired: 'Giá thắng',
}
const STATE_LABEL: Record<AuctionState, string> = {
  Active: 'Đang nhận giá',
  BuyNowPending: 'Đã có người mua ngay',
  AwaitingWinnerPayment: 'Đã kết thúc, chờ người thắng thanh toán',
  Sold: 'Đã bán',
  Unsold: 'Kết thúc, không có lượt trả giá',
  OnHold: 'Tạm dừng',
  Cancelled: 'Đã hủy',
  PaymentExpired: 'Người thắng không thanh toán đúng hạn',
}

function when(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
}
const plain = (amount: number) => amount.toLocaleString('vi-VN')

function commandError(error: unknown) {
  if (!(error instanceof ApiError) || error.status === 0)
    return 'Không kết nối được máy chủ nên chưa rõ thao tác đã được ghi hay chưa. Hãy thử lại đúng thao tác này.'
  if (error.status >= 500) return 'Máy chủ đang gặp sự cố nên chưa rõ kết quả. Hãy thử lại đúng thao tác này.'
  if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
  if (error.code === 'IdempotencyConflict') return 'Thao tác trước chưa hoàn tất. Hãy tải lại trang để xem trạng thái mới nhất.'
  // Lỗi nghiệp vụ của API đấu giá đã có lời nhắn tiếng Việt cho người dùng.
  return error.message || 'Không thể thực hiện thao tác này. Hãy tải lại trang.'
}

/** Giá hợp lệ: giá khởi điểm + n·bước, trong [floor, 1.000.000]. */
function amountError(amount: number | null, floor: number, start: number, step: number) {
  if (!amount) return 'Nhập số tiền bạn muốn trả.'
  if (amount < floor) return `Tối thiểu ${formatVnd(floor)}.`
  if (amount > AUCTION_MAX_PRICE) return `Tối đa ${formatVnd(AUCTION_MAX_PRICE)}.`
  if ((amount - start) % step !== 0) {
    const up = start + Math.ceil((amount - start) / step) * step
    return `Giá đi theo bước ${formatVnd(step)}. Thử ${formatVnd(Math.min(up, AUCTION_MAX_PRICE))}.`
  }
  return null
}

type Intent = { kind: 'Manual' | 'Auto' | 'Disable' | 'BuyNow'; amount: number }

export function AuctionDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const location = useLocation()
  const session = useSession()
  const queryClient = useQueryClient()
  const valid = /^[0-9a-f-]{36}$/i.test(id)
  const authed = session.status === 'authenticated'
  // Pushes keep the page live; REST polling is only the fallback when the socket is down.
  const pushing = useAuctionLive(valid ? id : undefined)
  const live = (data?: { auction?: AuctionSummary; state?: AuctionState }) =>
    (data?.auction?.state ?? data?.state) === 'Active' ? (pushing ? 60_000 : 10_000) : false
  const detail = useQuery({
    queryKey: ['auction', id], queryFn: () => getAuction(id), enabled: valid, retry: false, staleTime: 0,
    refetchInterval: (query) => live(query.state.data),
  })
  const participation = useQuery({
    queryKey: ['auction-participation', id],
    queryFn: async () => {
      try { return await getMyParticipation(id) } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null // chưa tham gia phiên này
        throw error
      }
    },
    enabled: valid && authed, retry: false, staleTime: 0,
    refetchInterval: (query) => live(query.state.data ?? undefined),
  })
  // Public reads never name the seller; the caller's own intakes do.
  const intakes = useQuery({
    queryKey: ['my-auction-intakes'], queryFn: getMyAuctionIntakes, enabled: valid && authed, retry: false, staleTime: 30_000,
  })
  const sellerIntake = intakes.data?.items.find((i) => i.auctionId === id) ?? null
  const remaining = useCountdown(detail.data?.auction.endAt, detail.data?.serverTime)
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['my-auction-intakes'] }),
    queryClient.invalidateQueries({ queryKey: ['auction', id] }),
    queryClient.invalidateQueries({ queryKey: ['auction-participation', id] }),
    queryClient.invalidateQueries({ queryKey: ['auctions'] }),
  ])
  const ended = remaining === 0 && detail.data?.auction.state === 'Active'
  useEffect(() => {
    // Hết giờ trên đồng hồ máy chủ: đọc lại để thấy kết quả khi worker chốt phiên.
    if (!ended) return
    const timer = window.setTimeout(() => void refresh(), 2000)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended, detail.dataUpdatedAt])

  if (!valid || (detail.error instanceof ApiError && detail.error.status === 404))
    return <div className={styles.state}><h1>Không tìm thấy phiên đấu giá</h1><Link to={ROUTES.auctions}>Về danh sách đấu giá</Link></div>
  const stale = detail.isError && !!detail.data && outcomeUnknown(detail.error)
  if (detail.isError && !stale)
    return (
      <div className={styles.state} role="alert">
        <h1>Chưa tải được phiên đấu giá</h1>
        <p>{detail.error instanceof ApiError && [401, 403].includes(detail.error.status) ? 'Bạn không có quyền xem phiên này. Kiểm tra phiên đăng nhập hoặc trạng thái tài khoản.' : 'Vui lòng kiểm tra kết nối rồi thử lại.'}</p>
        <button type="button" className={styles.secondary} onClick={() => void detail.refetch()}>Thử lại</button>
      </div>
    )
  if (!detail.data) return <div className={styles.state}>Đang mở phiên đấu giá…</div>

  const { auction, history, leaderAlias } = detail.data
  const open = auction.state === 'Active' && remaining > 0
  const participationStale = participation.isError && participation.data !== undefined && outcomeUnknown(participation.error)
  const me = participation.isError && !participationStale ? null : participation.data ?? null
  const hasBids = auction.bidderCount > 0
  const priceLabel = open || auction.currentPrice === null
    ? hasBids ? 'Giá hiện tại' : 'Giá khởi điểm'
    : CLOSED_PRICE[auction.state] ?? 'Giá cuối'

  let action
  if (sellerIntake) action = <SellerPanel auction={auction} intake={sellerIntake} open={open} onChanged={refresh} />
  else if (me?.won) action = <WinnerPanel me={me} auction={auction} onChanged={refresh} />
  else if (auction.state === 'OnHold')
    action = (
      <div className={`${styles.standing} ${styles.standingOut}`}>
        <strong>Phiên tạm dừng</strong>
        <span>
          Quản trị viên đang xem xét vì người bán hoặc người đang dẫn giá không còn đủ điều kiện. Lượt trả giá được giữ
          nguyên, chưa có người thắng và không có khoản tiền nào bị trừ.
        </span>
      </div>
    )
  else if (!open)
    action = (
      <div className={styles.notice}>
        <strong>{ended ? 'Phiên vừa hết giờ' : 'Phiên đã đóng'}</strong>
        <p>
          {ended
            ? 'Hệ thống đang chốt người thắng. Trang sẽ tự cập nhật.'
            : me ? 'Bạn không thắng phiên này. Lượt trả giá không giữ tiền nên ví của bạn không thay đổi.' : STATE_LABEL[auction.state] + '.'}
        </p>
        <Link className={styles.secondaryBlock} to={ROUTES.auctions}>Xem các phiên khác</Link>
      </div>
    )
  else if (session.status === 'loading') action = <p className={styles.muted}>Đang kiểm tra đăng nhập…</p>
  else if (!authed)
    action = (
      <div className={styles.notice}>
        <strong>Đăng nhập để trả giá</strong>
        <p>Trả giá không giữ tiền trong ví. Nếu thắng, bạn thanh toán từ ví và nhận sách tại {auction.pointName}.</p>
        <Link className={styles.primaryBlock} to={`${ROUTES.login}?returnUrl=${encodeURIComponent(location.pathname + location.search)}`}>Đăng nhập để trả giá <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
    )
  else if (participation.isPending) action = <p className={styles.muted}>Đang tải lượt trả giá của bạn…</p>
  else if (participation.isError && !participationStale)
    action = (
      <div className={styles.notice} role="alert">
        <p>Chưa tải được lượt trả giá của bạn.</p>
        <button type="button" className={styles.secondaryBlock} onClick={() => void participation.refetch()}>Thử lại</button>
      </div>
    )
  else action = <BidPanel auction={auction} me={me} onChanged={refresh} />

  return (
    <div className={styles.page}>
      {stale && <div className={styles.notice} role="alert"><p>Chưa làm mới được phiên. Giá và trạng thái bên dưới là lần tải gần nhất; máy chủ sẽ kiểm tra lại khi bạn trả giá.</p><button type="button" className={styles.secondary} onClick={() => void detail.refetch()}>Thử cập nhật lại</button></div>}
      <nav className={styles.crumbs} aria-label="Vị trí trang">
        <Link to={ROUTES.auctions}>Đấu giá</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{auction.title}</span>
      </nav>

      <div className={styles.layout}>
        <div className={styles.media}><AuctionGallery key={auction.id} auction={auction} /></div>

        <header className={styles.head}>
          <h1>{auction.title}</h1>
          {!!auction.book?.authors.length && <p className={styles.authors}>{auction.book.authors.join(', ')}</p>}
          <span className={`${styles.status} ${open ? '' : styles.statusClosed}`}>
            {open ? <Gavel size={14} aria-hidden="true" /> : null}
            {ended ? 'Đã hết giờ, đang chốt kết quả' : STATE_LABEL[auction.state]}
          </span>
          {auction.book && <span className={styles.inspected}><ShieldCheck size={15} aria-hidden="true" /> Đã kiểm tra tại điểm giao nhận</span>}
        </header>

        <aside className={styles.side} aria-label="Trả giá">
          <Countdown ms={remaining} open={open} endAt={auction.endAt} live={pushing} state={auction.state} />
          <section className={styles.bidCard}>
            <p className={styles.priceLabel}>{priceLabel}</p>
            <p className={styles.price} aria-live="polite" aria-atomic="true"><span className="sr-only">{priceLabel}: </span><AuctionPrice auctionId={auction.id} amount={auction.currentPrice ?? auction.startPrice} /></p>
            <p className={styles.priceMeta}>
              <TrendingUp size={14} aria-hidden="true" />
              {hasBids ? `${auction.bidderCount} người trả giá` : 'Chưa có lượt trả giá'}
              <span aria-hidden="true">•</span>
              bước giá {formatVnd(auction.step)}
            </p>
            {participationStale && <p className={styles.fieldError} role="alert">Chưa làm mới được lượt trả giá của bạn. Mức đã hiển thị là lần tải gần nhất. <button type="button" className={styles.linkButton} onClick={() => void participation.refetch()}>Thử cập nhật lại lượt giá</button></p>}
            {action}
          </section>
        </aside>

        <div className={styles.body}>
          <BookCondition book={auction.book ?? null} />
          <SessionFacts auction={auction} remaining={remaining} open={open} />

          <BidHistory auctionId={auction.id} history={history} leaderAlias={leaderAlias} myAlias={me?.alias ?? null} badge={TOP_BADGE[auction.state] ?? null} startPrice={auction.startPrice} />

          <footer className={styles.footer}>
            <p>Người trả giá được hiển thị bằng số thứ tự ẩn danh. Mức đặt giá tự động của mỗi người không bao giờ được công khai.</p>
            <p>Điểm giao nhận và phiên đấu giá đang chạy ở chế độ mô phỏng tại TP.HCM.</p>
          </footer>
        </div>
      </div>
    </div>
  )
}

const CONDITION_SCALE = ['LikeNew', 'Good', 'Fair', 'Worn'] as const
type AuctionBook = NonNullable<AuctionSummary['book']>

// Condition first (what bidders weigh most), the seller's own words next, then
// the per-part notes as scannable tiles. Empty notes are left out.
function BookCondition({ book }: { book: AuctionBook | null }) {
  if (!book)
    return (
      <section className={styles.bookCard} aria-labelledby="auction-condition-title">
        <h2 id="auction-condition-title">Về bản sách này</h2>
        <p className={styles.muted}>Thông tin bản sách hiện chưa được hiển thị công khai. Bạn vẫn có thể xem trạng thái phiên và các lượt giá.</p>
      </section>
    )
  const level = CONDITION_SCALE.indexOf(book.condition)
  const parts = ([
    ['Bìa sách', book.coverNote, BookMarked], ['Ruột sách', book.pages, FileText],
    ['Phụ kiện', book.accessories, Package], ['Ghi chú', book.notes, StickyNote],
  ] as const).filter(([, value]) => !!value.trim())
  return (
    <section className={styles.bookCard} aria-labelledby="auction-condition-title">
      <h2 id="auction-condition-title">Về bản sách này</h2>
      <div className={styles.conditionRow}>
        <div className={styles.conditionLead}>
          <span className={styles.eyebrow}>Tình trạng</span>
          <strong>{conditions[book.condition]}</strong>
          <span>Người bán khai báo; nhân viên đã đối chiếu khi nhận sách tại điểm.</span>
        </div>
        <ol className={styles.conditionScale} aria-label={`Thang tình trạng: ${conditions[book.condition]}, bậc ${level + 1} trên 4`}>
          {CONDITION_SCALE.map((c, i) => (
            <li key={c} className={i === level ? styles.scaleOn : i < level ? styles.scalePast : undefined} aria-current={i === level ? 'true' : undefined}>
              <span aria-hidden="true" />{conditions[c]}
            </li>
          ))}
        </ol>
      </div>
      <ul className={styles.chips} aria-label="Điểm chính">
        <li className={book.hasMissingPages ? styles.chipWarn : styles.chipOk}>
          {book.hasMissingPages ? <AlertTriangle size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
          {book.hasMissingPages ? 'Có thiếu trang, xem ghi chú' : 'Không thiếu trang'}
        </li>
        {book.photos.length > 0 && <li><Images size={14} aria-hidden="true" /> {book.photos.length} ảnh của chính bản sách này</li>}
      </ul>
      {book.description.trim() && (
        <figure className={styles.sellerNote}>
          <figcaption>Người bán mô tả</figcaption>
          <blockquote>{book.description}</blockquote>
        </figure>
      )}
      {parts.length > 0 && (
        <dl className={styles.partGrid}>
          {parts.map(([label, value, Icon]) => (
            <div key={label}>
              <dt><Icon size={16} aria-hidden="true" />{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
const day = (iso: string) => new Date(iso).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })

// Prices as tiles, the session window as a track (progress from the server-aligned
// countdown, never the device clock), and the pickup point as its own callout.
function SessionFacts({ auction, remaining, open }: { auction: AuctionSummary; remaining: number; open: boolean }) {
  const span = Date.parse(auction.endAt) - Date.parse(auction.startAt)
  const progress = !open ? 100 : span > 0 ? Math.min(100, Math.max(0, (1 - remaining / span) * 100)) : 0
  return (
    <section className={styles.sessionCard} aria-labelledby="auction-session-title">
      <h2 id="auction-session-title">Thông tin phiên</h2>
      <dl className={styles.priceTiles}>
        <div><dt>Giá khởi điểm</dt><dd>{formatVnd(auction.startPrice)}</dd></div>
        <div><dt>Bước giá</dt><dd>+{formatVnd(auction.step)}</dd></div>
        <div className={auction.buyNowPrice !== null ? styles.tileAccent : undefined}>
          <dt>Mua ngay</dt>
          {/* The API withholds buy-now after the first bid or once closed, so null is not "never offered". */}
          <dd>
            {auction.buyNowPrice !== null ? formatVnd(auction.buyNowPrice) : auction.bidderCount > 0 || !open ? 'Không còn' : 'Không áp dụng'}
            {auction.buyNowPrice === null && (auction.bidderCount > 0 || !open) && <small>Chỉ có trước lượt trả giá đầu tiên</small>}
          </dd>
        </div>
      </dl>
      <div className={styles.window}>
        <div className={styles.windowEnds}>
          <p><span>Mở phiên</span><strong>{clock(auction.startAt)}</strong><small>{day(auction.startAt)}</small></p>
          <p><span>Kết thúc</span><strong>{clock(auction.endAt)}</strong><small>{day(auction.endAt)}</small></p>
        </div>
        <div className={styles.track} role="progressbar" aria-label="Thời gian phiên đã trôi qua" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <p className={styles.windowNote}>{open ? `Còn ${formatRemaining(remaining)} · phiên kéo dài ${Math.round(span / HOUR)} giờ` : 'Phiên đã đóng'}</p>
      </div>
      <div className={styles.pickup}>
        <span className={styles.pickupIcon}><MapPin size={18} aria-hidden="true" /></span>
        <div>
          <span className={styles.eyebrow}>Nhận sách tại</span>
          <strong>{auction.pointName}</strong>
          <small>Người thắng thanh toán từ ví rồi tự đến lấy sách · điểm mô phỏng tại TP.HCM</small>
        </div>
      </div>
    </section>
  )
}

function BidHistory({ auctionId, history, leaderAlias, myAlias, badge, startPrice }: {
  auctionId: string;
  history: { price: number; bidderAlias: number; at: string }[]; leaderAlias: number | null; myAlias: number | null; badge: string | null; startPrice: number
}) {
  const latest = useRef<HTMLLIElement>(null)
  const event = history[0]
  useAuctionChangeMotion(auctionId, event ? `${event.at}:${event.bidderAlias}:${event.price}` : 'empty', latest, rowFrames)
  return (
    <section className={styles.historyCard} aria-labelledby="history-title">
      <h2 id="history-title">Diễn biến giá</h2>
      {history.length === 0 ? (
        <p className={styles.muted}>Chưa có lượt trả giá nào. Giá khởi điểm là {formatVnd(startPrice)}.</p>
      ) : (
        <ol className={styles.historyList} tabIndex={0} aria-label="Các lần giá thay đổi, mới nhất trước">
          {history.map((event, index) => {
            const top = index === 0 && event.bidderAlias === leaderAlias
            const mine = myAlias === event.bidderAlias
            return (
              <li key={`${event.at}:${event.bidderAlias}:${event.price}`} ref={index === 0 ? latest : undefined} className={top ? styles.historyTop : undefined}>
                <span className={`${styles.avatar} ${mine ? styles.avatarMine : ''}`} aria-hidden="true">#{event.bidderAlias}</span>
                <span className={styles.who}>
                  {mine ? 'Bạn' : `Người trả giá #${event.bidderAlias}`}
                  <small>{when(event.at)}</small>
                </span>
                <span className={styles.amount}>
                  {formatVnd(event.price)}
                  {top && badge && <em>{badge}</em>}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

function Countdown({ ms, open, endAt, live, state }: { ms: number; open: boolean; endAt: string; live: boolean; state: AuctionState }) {
  if (!open)
    return (
      <div className={styles.timerCard}>
        <span className={styles.timerClosed}>
          {state === 'OnHold' ? 'Phiên tạm dừng, không nhận giá' : state === 'Cancelled' ? 'Phiên đã hủy' : `Phiên kết thúc lúc ${when(endAt)}`}
        </span>
      </div>
    )
  const s = Math.floor(ms / 1000)
  const parts: [number, string][] = [
    [Math.floor(s / 86_400), 'ngày'], [Math.floor((s % 86_400) / 3600), 'giờ'],
    [Math.floor((s % 3600) / 60), 'phút'], [s % 60, 'giây'],
  ]
  const shown = parts[0]![0] > 0 ? parts : parts.slice(1)
  return (
    <div className={`${styles.timerCard} ${ms < HOUR ? styles.timerSoon : ''}`}>
      <div className={styles.timerParts} role="timer" aria-label={`Còn lại ${formatRemaining(ms)}`}>
        {shown.map(([value, unit], index) => (
          <span key={unit} className={styles.timerPart} aria-hidden="true">
            {index > 0 && <span className={styles.timerSep}>:</span>}
            <strong>{String(value).padStart(2, '0')}</strong>
            <small>{unit}</small>
          </span>
        ))}
      </div>
      <span className={`${styles.liveBadge} ${live ? styles.liveOn : ''}`}>
        <span aria-hidden="true" />
        {live ? 'Trực tiếp' : 'Cập nhật mỗi 10 giây'}
      </span>
    </div>
  )
}

function AmountField({ id, label, value, onChange, disabled, hint, error }: {
  id: string; label: string; value: number | null; onChange: (value: number | null) => void; disabled: boolean; hint: string; error: string | null
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <div className={`${styles.inputWrap} ${error ? styles.inputInvalid : ''}`}>
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={value ? plain(value) : ''}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={`${id}-hint`}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, '').slice(0, 7)
            onChange(digits ? Number(digits) : null)
          }}
        />
        <span className={styles.currency} aria-hidden="true">₫</span>
      </div>
      <p id={`${id}-hint`} className={error ? styles.fieldError : styles.fieldHint}>{error ?? hint}</p>
    </div>
  )
}

function BidPanel({ auction, me, onChanged }: { auction: AuctionSummary; me: AuctionParticipation | null; onChanged: () => Promise<unknown> }) {
  const leading = me?.leading ?? false
  const step = auction.step
  const minimumBid = auction.minimumBid ?? AUCTION_MAX_PRICE + step
  // Người dẫn chỉ được nâng mức tự động; mọi mức tự động mới phải cao hơn mức của chính mình.
  const autoFloor = me?.ownLevel != null ? Math.max(leading ? 0 : minimumBid, me.ownLevel + step) : minimumBid
  // undefined = chưa sửa (theo mức tối thiểu mới nhất); null = ô đang trống.
  const [manual, setManual] = useState<number | null | undefined>(undefined)
  const manualAmount = manual === undefined ? minimumBid : manual
  const [autoDialog, setAutoDialog] = useState(false)
  const [confirming, setConfirming] = useState<Intent | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // The price a bid notice describes; a later price change makes it stale.
  const [noticePrice, setNoticePrice] = useState<number | null>(null)
  const [receipt, setReceipt] = useState<{ sequence: number; bid: boolean } | null>(null)
  const receiptSequence = useRef(0)
  const standing = useRef<HTMLDivElement>(null)
  useAuctionChangeMotion(auction.id, me ? leading : undefined, standing, standingFrames, 270)
  const [unknown, setUnknown] = useState<Intent | null>(null)
  const intent = useIntentKey()
  const ids = useId()
  const locked = busy || !!unknown
  // Someone else's bid arrives by push; say so when the lead is lost.
  const [wasLeading, setWasLeading] = useState(leading)
  if (wasLeading !== leading) {
    setWasLeading(leading)
    if (wasLeading && !leading && !busy) { setReceipt(null); setNoticePrice(null); setNotice(`Bạn vừa bị vượt giá. Giá hiện tại ${formatVnd(auction.currentPrice ?? auction.startPrice)}.`) }
  }
  const currentPrice = auction.currentPrice ?? auction.startPrice
  // FR-AU04: equal commitments rank by who reached the level first, so an equal
  // bid that does not lead is a tie lost on order, not a higher rival amount.
  const tied = !!me && !leading && me.ownLevel !== null && me.ownLevel === auction.currentPrice
  const staleNotice = noticePrice !== null && noticePrice !== currentPrice
  const manualError = manual === undefined ? null : amountError(manual, minimumBid, auction.startPrice, step)
  const manualCapped = minimumBid > AUCTION_MAX_PRICE
  const autoCapped = autoFloor > AUCTION_MAX_PRICE

  const run = async (next: Intent) => {
    const key = intent.keyFor(`${next.kind}:${next.amount}`)
    setBusy(true); setError(null); setNotice(null); setReceipt(null)
    try {
      const receipt =
        next.kind === 'Manual' ? await placeBid(auction.id, next.amount, key)
        : next.kind === 'Auto' ? await setAutoBid(auction.id, next.amount, key)
        : next.kind === 'Disable' ? await disableAutoBid(auction.id, key)
        : await buyNow(auction.id, key)
      intent.settle(); setUnknown(null); setManual(undefined); setAutoDialog(false)
      const price = receipt.currentPrice !== null ? formatVnd(receipt.currentPrice) : ''
      setNotice(
        next.kind === 'BuyNow' ? 'Đã tạo đơn mua ngay. Hãy thanh toán trong 15 phút để tiếp tục.'
        : next.kind === 'Disable' ? 'Đã tắt đặt giá tự động.'
        : receipt.leading ? `Bạn đang dẫn giá ở ${price}.`
        : receipt.currentPrice === next.amount
          ? `Đã ghi nhận ${price}, nhưng một người khác đã cam kết mức này trước bạn nên vẫn dẫn giá.`
          : `Đã ghi nhận, nhưng một mức tự động khác cao hơn. Giá hiện tại ${price}.`,
      )
      setNoticePrice(next.kind === 'Manual' || next.kind === 'Auto' ? receipt.currentPrice : null)
      setReceipt({ sequence: ++receiptSequence.current, bid: next.kind === 'Manual' || next.kind === 'Auto' })
    } catch (caught) {
      if (outcomeUnknown(caught)) { setUnknown(next); setAutoDialog(false) }
      else { intent.settle(); setUnknown(null) }
      setError(commandError(caught))
    } finally {
      setBusy(false); setConfirming(null)
      void onChanged()
    }
  }

  const dialog = confirming && dialogCopy(confirming, auction)
  return (
    <div className={styles.bidPanel}>
      {me && (
        <div ref={standing} role="status" className={`${styles.standing} ${leading ? styles.standingLead : styles.standingOut}`}>
          <strong>{leading ? 'Bạn đang dẫn giá' : tied ? 'Bạn trả bằng người dẫn giá' : 'Bạn đã bị vượt giá'}</strong>
          <span>
            {tied
              ? `Một người khác đã cam kết ${formatVnd(currentPrice)} trước bạn. Khi hai mức bằng nhau, người đặt trước dẫn giá. Trả từ ${formatVnd(minimumBid)} để vượt lên.`
              : me.mode === 'Auto' && me.ownLevel !== null
              ? `Mức tự động tối đa của bạn: ${formatVnd(me.ownLevel)} (chỉ bạn thấy).`
              : me.ownLevel !== null ? `Lượt trả gần nhất của bạn: ${formatVnd(me.ownLevel)}.` : null}
          </span>
        </div>
      )}

      {notice && !staleNotice && (receipt ? <AuctionReceipt key={receipt.sequence} message={notice} bid={receipt.bid} /> : <p role="status" className={styles.fieldError}>{notice}</p>)}
      {error && !autoDialog && <p role="alert" className={styles.fieldError}>{error}</p>}

      {unknown ? (
        <div className={styles.stack}>
          <button type="button" className={styles.primaryBlock} disabled={busy} onClick={() => void run(unknown)}>
            {busy ? 'Đang thử lại…' : 'Thử lại thao tác vừa rồi'}
          </button>
          <button type="button" className={styles.secondaryBlock} disabled={busy} onClick={() => void onChanged()}>
            Cập nhật trạng thái phiên
          </button>
        </div>
      ) : leading ? (
        <p className={styles.muted}>Bạn không cần trả thêm. Muốn giữ vị trí khi có người trả cao hơn, hãy đặt hoặc nâng mức tự động.</p>
      ) : manualCapped ? (
        <p className={styles.muted}>Giá đã chạm mức tối đa {formatVnd(AUCTION_MAX_PRICE)} của phiên.</p>
      ) : (
        <>
          <p className={styles.quickLabel}>Chọn nhanh mức trả</p>
          <div className={styles.quick}>
            {bidOptions(minimumBid, step).map((value) => (
              <button key={value} type="button" disabled={locked} aria-pressed={manualAmount === value} onClick={() => setManual(value)}>
                {formatVnd(value)}
              </button>
            ))}
          </div>
          <div className={styles.customBid}>
            <AmountField
              id={`${ids}-manual`} label="Số tiền trả lượt này" value={manualAmount} onChange={setManual} disabled={locked}
              hint={`Lượt tiếp theo tối thiểu ${formatVnd(minimumBid)}`} error={manualError}
            />
            <button
              type="button" className={styles.continue} disabled={locked || !!manualError}
              onClick={() => manualAmount && setConfirming({ kind: 'Manual', amount: manualAmount })}
            >
              {manualAmount ? `Tiếp tục trả ${formatVnd(manualAmount)}` : 'Tiếp tục'} <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </>
      )}

      {!unknown && (
        <div className={styles.autoBid}>
          <button type="button" className={styles.autoToggle} disabled={locked || autoCapped} onClick={() => { setError(null); setAutoDialog(true) }} aria-haspopup="dialog">
            <span>
              <strong><Zap size={14} aria-hidden="true" /> {me?.mode === 'Auto' ? 'Nâng mức tự động' : 'Đặt giá tự động'}</strong>
              <small>
                {autoCapped
                  ? `Mức tự động của bạn đã ở mức tối đa ${formatVnd(AUCTION_MAX_PRICE)}.`
                  : 'Khi có người trả cao hơn, tự trả hơn họ một bước giá, không vượt mức tối đa bạn chọn.'}
              </small>
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          {me?.mode === 'Auto' && (
            <button type="button" className={styles.linkButton} disabled={locked} onClick={() => setConfirming({ kind: 'Disable', amount: 0 })}>
              Tắt đặt giá tự động
            </button>
          )}
        </div>
      )}

      <AutoBidDialog
        isOpen={autoDialog}
        onClose={() => setAutoDialog(false)}
        title={auction.title}
        pointName={auction.pointName}
        currentPrice={auction.currentPrice ?? auction.startPrice}
        startPrice={auction.startPrice}
        step={step}
        floor={autoFloor}
        currentMax={me?.mode === 'Auto' ? me.ownLevel : null}
        busy={busy}
        submissionError={error}
        onConfirm={(maxAmount) => run({ kind: 'Auto', amount: maxAmount })}
      />

      {auction.buyNowPrice !== null && !unknown && (
        <div className={styles.buyNow}>
          <span>Mua ngay <strong>{formatVnd(auction.buyNowPrice)}</strong><small>Chỉ có trước lượt trả giá đầu tiên.</small></span>
          <button type="button" className={styles.secondary} disabled={busy} onClick={() => setConfirming({ kind: 'BuyNow', amount: auction.buyNowPrice! })}>
            Mua ngay
          </button>
        </div>
      )}

      {dialog && (
        <ConfirmDialog
          isOpen
          onClose={() => !busy && setConfirming(null)}
          title={dialog.title}
          description={dialog.description}
          confirmText={dialog.confirm}
          onConfirm={() => void run(confirming)}
          isBusy={busy}
        />
      )}
    </div>
  )
}

function dialogCopy(intent: Intent, auction: AuctionSummary) {
  const pay = `Nếu thắng, bạn thanh toán từ ví trong 24 giờ sau khi phiên kết thúc và tự nhận sách tại ${auction.pointName}. Không thanh toán đúng hạn sẽ bị ghi nhận vi phạm.`
  switch (intent.kind) {
    case 'Manual':
      return { title: `Trả ${formatVnd(intent.amount)}?`, description: `Lượt trả giá không thể rút lại. ${pay}`, confirm: 'Xác nhận trả giá' }
    case 'Auto':
      return {
        title: `Đặt giá tự động tối đa ${formatVnd(intent.amount)}?`,
        description: `Hệ thống chỉ trả vừa đủ để bạn dẫn: cao hơn người khác một bước ${formatVnd(auction.step)}, không vượt mức này. Chỉ bạn thấy mức tối đa và chỉ có thể nâng lên. ${pay}`,
        confirm: 'Đặt giá tự động',
      }
    case 'Disable':
      return {
        title: 'Tắt đặt giá tự động?',
        description: 'Hệ thống ngừng trả thay bạn. Nếu bạn đang dẫn, bạn vẫn cam kết mua ở giá hiện tại.',
        confirm: 'Tắt tự động',
      }
    case 'BuyNow':
      return {
        title: `Mua ngay với ${formatVnd(intent.amount)}?`,
        description: `Phiên kết thúc ngay cho bạn. Bạn có 15 phút để thanh toán từ ví, sau đó nhận sách tại ${auction.pointName}. Quá hạn, sách được trả lại người bán và bạn bị ghi nhận vi phạm.`,
        confirm: 'Mua ngay',
      }
  }
}

const SELLER_STATE: Partial<Record<AuctionState, string>> = {
  BuyNowPending: 'Đã có người mua ngay; đang chờ người mua thanh toán.',
  AwaitingWinnerPayment: 'Phiên đã kết thúc; đang chờ người thắng thanh toán.',
  Sold: 'Người thắng đã thanh toán. Tiền được giữ đến khi người mua nhận sách.',
  Unsold: 'Phiên kết thúc không có lượt trả giá. Sách được trả lại cho bạn tại điểm.',
  Cancelled: 'Phiên đã hủy. Sách được trả lại cho bạn tại điểm.',
  PaymentExpired: 'Người thắng không thanh toán đúng hạn. Sách được trả lại cho bạn tại điểm.',
  OnHold: 'Phiên tạm dừng để quản trị viên xem xét; phiên không nhận thêm giá.',
}

// FR-AU02: the seller follows their own auction and may withdraw it only
// before the first bid; the server rechecks that under the auction lock.
function SellerPanel({ auction, intake, open, onChanged }: { auction: AuctionSummary; intake: MyIntake; open: boolean; onChanged: () => Promise<unknown> }) {
  const intent = useIntentKey()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unknown, setUnknown] = useState(false)
  const canWithdraw = open && auction.bidderCount === 0
  const withdraw = async () => {
    const key = intent.keyFor(`withdraw:${intake.id}:${intake.version}`)
    let pending = false
    setBusy(true); setError(null)
    try {
      await withdrawIntake(intake.id, intake.version, key)
      intent.settle()
    } catch (caught) {
      pending = outcomeUnknown(caught)
      if (!pending) intent.settle()
      setError(commandError(caught))
    } finally {
      setUnknown(pending); setBusy(false); setConfirming(false)
      void onChanged()
    }
  }
  return (
    <div className={styles.bidPanel}>
      <div className={`${styles.standing} ${styles.standingLead}`}>
        <strong>Đây là phiên của bạn</strong>
        <span>
          {open
            ? auction.bidderCount === 0
              ? 'Chưa có lượt trả giá. Bạn có thể rút phiên trước lượt trả giá đầu tiên.'
              : `Đã có ${auction.bidderCount} người trả giá nên phiên không thể rút. Người bán không tham gia trả giá.`
            : SELLER_STATE[auction.state] ?? STATE_LABEL[auction.state]}
        </span>
      </div>
      {error && <p role="alert" className={styles.fieldError}>{error}</p>}
      {(canWithdraw || unknown) && (
        <button type="button" className={styles.secondaryBlock} disabled={busy} onClick={() => (unknown ? void withdraw() : setConfirming(true))}>
          {unknown ? 'Thử lại rút phiên' : 'Rút phiên'}
        </button>
      )}
      <ConfirmDialog
        isOpen={confirming}
        onClose={() => !busy && setConfirming(false)}
        title="Rút phiên đấu giá?"
        description={`Phiên đóng ngay và sách được trả lại cho bạn tại ${auction.pointName}. Chỉ rút được khi chưa có lượt trả giá; nếu có người vừa trả giá, yêu cầu sẽ bị từ chối.`}
        confirmText="Rút phiên"
        onConfirm={() => void withdraw()}
        isBusy={busy}
        isDanger
      />
    </div>
  )
}

function WinnerPanel({ me, auction, onChanged }: { me: AuctionParticipation; auction: AuctionSummary; onChanged: () => Promise<unknown> }) {
  const queryClient = useQueryClient()
  const order = useQuery({
    queryKey: ['point-order', me.orderId], queryFn: () => getMyPointOrder(me.orderId!), enabled: !!me.orderId, retry: false, staleTime: 0,
  })
  const remaining = useCountdown(order.data?.paymentDeadline ?? undefined, order.data?.serverTime)
  const intent = useIntentKey()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unknown, setUnknown] = useState(false)
  const headline = me.boughtNow ? 'Bạn đã mua ngay cuốn sách này' : 'Bạn đã thắng phiên đấu giá'
  const pendingPayment = useRef<{ id: string; version: number; key: string } | null>(null)

  const pay = async () => {
    if (!order.data) return
    const payment = pendingPayment.current ?? {
      id: order.data.id,
      version: order.data.version,
      key: intent.keyFor(`pay:${order.data.id}:${order.data.version}`),
    }
    pendingPayment.current = payment
    let pending = false
    setBusy(true); setError(null)
    try {
      await payPointOrder(payment.id, payment.version, payment.key)
      intent.settle()
      pendingPayment.current = null
    } catch (caught) {
      pending = outcomeUnknown(caught)
      if (!pending) { intent.settle(); pendingPayment.current = null }
      setError(commandError(caught))
    } finally {
      setUnknown(pending); setBusy(false); setConfirming(false)
      // Chưa rõ kết quả thì giữ version đang có để lần thử lại gửi đúng khóa và nội dung.
      if (!pending) void queryClient.invalidateQueries({ queryKey: ['point-order', me.orderId] })
      void onChanged()
    }
  }

  if (!me.orderId) return <div className={`${styles.standing} ${styles.standingLead}`}><strong>{headline}</strong><span>Đơn nhận sách đang được tạo. Trang sẽ tự cập nhật.</span></div>
  if (order.isPending) return <div className={`${styles.standing} ${styles.standingLead}`}><strong>{headline}</strong><span>Đang tải đơn thanh toán…</span></div>
  if (order.isError)
    return (
      <div className={styles.notice} role="alert">
        <strong>{headline}</strong><p>Chưa tải được đơn thanh toán.</p>
        <button type="button" className={styles.secondaryBlock} onClick={() => void order.refetch()}>Thử lại</button>
      </div>
    )

  const o = order.data
  if (o.state === 'PaymentExpired' || o.state === 'Cancelled')
    return (
      <div className={`${styles.standing} ${styles.standingOut}`}>
        <strong>{o.state === 'PaymentExpired' ? 'Đã quá hạn thanh toán' : 'Đơn đã bị hủy'}</strong>
        <span>{o.state === 'PaymentExpired' ? 'Sách được trả lại người bán. Lượt không thanh toán đã được ghi nhận vào tài khoản.' : 'Đơn nhận sách này không còn hiệu lực.'}</span>
      </div>
    )
  if (o.state !== 'AwaitingPayment')
    return (
      <div className={`${styles.standing} ${styles.standingLead}`}>
        <strong>{o.state === 'Completed' ? 'Đơn nhận sách đã hoàn tất' : `Đã thanh toán ${formatVnd(o.amounts.buyerTotal)}`}</strong>
        <span>{({
          Fulfilling: `Đơn đang được xử lý tại ${o.pointName}. Hãy theo dõi thông báo về thời điểm nhận sách.`,
          ReadyForCollection: `Sách sẵn sàng tại ${o.pointName}. Bạn cần xác nhận biên bản kiểm tra và lấy mã nhận sách trước khi nhận. Các thao tác nhận sách chưa có trên màn hình này.`,
          Inspection: 'Đang trong bước kiểm tra khi nhận sách. Hãy thực hiện theo hướng dẫn của nhân viên tại điểm.',
          ResolutionPending: 'Đơn đang chờ xử lý vấn đề. Theo dõi thông báo; đây chưa phải giao dịch hoàn tất.',
          ReturnPending: 'Đơn đang trong quy trình trả sách. Theo dõi thông báo để biết bước tiếp theo.',
          Completed: 'Quy trình nhận sách đã hoàn tất. Cảm ơn bạn đã cho cuốn sách một chương mới.',
        } as Record<string, string>)[o.state]}</span>
      </div>
    )

  return (
    <div className={styles.bidPanel}>
      <div className={`${styles.standing} ${styles.standingLead}`}>
        <strong>{headline}</strong>
        <span>
          Thanh toán từ ví trước {o.paymentDeadline ? when(o.paymentDeadline) : '—'}
          {o.paymentDeadline && <> (còn <b className={remaining < HOUR ? styles.soon : undefined}>{formatRemaining(remaining)}</b>)</>}, rồi nhận sách tại {o.pointName}.
        </span>
      </div>
      {error && <p role="alert" className={styles.fieldError}>{error}</p>}
      <button type="button" className={styles.continue} disabled={busy || remaining === 0} onClick={() => (unknown ? void pay() : setConfirming(true))}>
        {unknown ? 'Thử lại thanh toán' : `Thanh toán ${formatVnd(o.amounts.buyerTotal)}`} <ArrowRight size={16} aria-hidden="true" />
      </button>
      <p className={styles.fieldHint}>Giá chốt {formatVnd(me.finalPrice ?? auction.currentPrice ?? o.amounts.bookPrice)}. Không nhận thanh toán một phần.</p>
      <ConfirmDialog
        isOpen={confirming}
        onClose={() => !busy && setConfirming(false)}
        title={`Thanh toán ${formatVnd(o.amounts.buyerTotal)} từ ví?`}
        description={`Số tiền được giữ cho đơn này đến khi bạn nhận sách tại ${o.pointName}. Ví cần đủ số dư khả dụng; không nhận thanh toán một phần.`}
        confirmText="Thanh toán"
        onConfirm={() => void pay()}
        isBusy={busy}
      />
    </div>
  )
}
