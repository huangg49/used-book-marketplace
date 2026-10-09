import { useEffect, useId, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@used-books/session-client'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, ChevronRight, Gavel, MapPin, ShieldCheck, TrendingUp, Zap } from 'lucide-react'
import { AutoBidDialog } from '../components/AutoBidDialog'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { formatRemaining, outcomeUnknown, useCountdown, useIntentKey } from '../hooks/useAuctionClock'
import { useSession } from '../hooks/useSession'
import { formatVnd, ROUTES } from '../lib/routes'
import {
  AUCTION_MAX_PRICE, bidOptions, buyNow, disableAutoBid, getAuction, getMyParticipation, getMyPointOrder,
  payPointOrder, placeBid, setAutoBid,
  type AuctionParticipation, type AuctionState, type AuctionSummary,
} from '../services/auctions'
import styles from './AuctionDetailPage.module.css'

const HOUR = 3_600_000
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
  const session = useSession()
  const queryClient = useQueryClient()
  const valid = /^[0-9a-f-]{36}$/i.test(id)
  const authed = session.status === 'authenticated'
  const live = (data?: { auction?: AuctionSummary; state?: AuctionState }) =>
    (data?.auction?.state ?? data?.state) === 'Active' ? 10_000 : false
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
  const remaining = useCountdown(detail.data?.auction.endAt, detail.data?.serverTime)
  const refresh = () => Promise.all([
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
    return <main className={styles.state}><h1>Không tìm thấy phiên đấu giá</h1><Link to={ROUTES.auctions}>Về danh sách đấu giá</Link></main>
  if (detail.isError)
    return (
      <main className={styles.state} role="alert">
        <h1>Chưa tải được phiên đấu giá</h1>
        <p>Vui lòng kiểm tra kết nối rồi thử lại.</p>
        <button type="button" className={styles.secondary} onClick={() => void detail.refetch()}>Thử lại</button>
      </main>
    )
  if (!detail.data) return <main className={styles.state}>Đang mở phiên đấu giá…</main>

  const { auction, history, leaderAlias } = detail.data
  const open = auction.state === 'Active' && remaining > 0
  const me = participation.data ?? null
  const hasBids = auction.bidderCount > 0
  const priceLabel = !open && auction.currentPrice !== null ? 'Giá chốt' : hasBids ? 'Giá hiện tại' : 'Giá khởi điểm'

  let action
  if (me?.won) action = <WinnerPanel me={me} auction={auction} onChanged={refresh} />
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
        <Link className={styles.primaryBlock} to={ROUTES.login}>Đăng nhập <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
    )
  else if (participation.isPending) action = <p className={styles.muted}>Đang tải lượt trả giá của bạn…</p>
  else if (participation.isError)
    action = (
      <div className={styles.notice} role="alert">
        <p>Chưa tải được lượt trả giá của bạn.</p>
        <button type="button" className={styles.secondaryBlock} onClick={() => void participation.refetch()}>Thử lại</button>
      </div>
    )
  else action = <BidPanel auction={auction} me={me} onChanged={refresh} />

  return (
    <main className={styles.page}>
      <nav className={styles.crumbs} aria-label="Vị trí trang">
        <Link to={ROUTES.auctions}>Đấu giá</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{auction.title}</span>
      </nav>

      <div className={styles.layout}>
        <section className={styles.media} aria-label="Bìa sách">
          <span className={styles.mediaChip}><ShieldCheck size={14} aria-hidden="true" /> Đã kiểm tra tại điểm giao nhận</span>
          <div className={styles.book} aria-hidden="true">
            <span className={styles.bookTitle}>{auction.title}</span>
            <span className={styles.bookMark}>Lật lại · Đấu giá</span>
          </div>
          <p className={styles.mediaNote}>Phiên đấu giá chưa hiển thị ảnh bìa.</p>
        </section>

        <header className={styles.head}>
          <p className={styles.eyebrow}>Đấu giá · {auction.pointName}</p>
          <h1>{auction.title}</h1>
          <span className={`${styles.status} ${open ? '' : styles.statusClosed}`}>
            {open ? <Gavel size={14} aria-hidden="true" /> : null}
            {ended ? 'Đã hết giờ, đang chốt kết quả' : STATE_LABEL[auction.state]}
          </span>
        </header>

        <aside className={styles.side} aria-label="Trả giá">
          <Countdown ms={remaining} open={open} endAt={auction.endAt} />
          <section className={styles.bidCard} aria-live="polite">
            <p className={styles.priceLabel}>{priceLabel}</p>
            <p className={styles.price}>{formatVnd(auction.currentPrice ?? auction.startPrice)}</p>
            <p className={styles.priceMeta}>
              <TrendingUp size={14} aria-hidden="true" />
              {hasBids ? `${auction.bidderCount} người trả giá` : 'Chưa có lượt trả giá'}
              <span aria-hidden="true">•</span>
              bước giá {formatVnd(auction.step)}
            </p>
            {action}
          </section>
          <BidHistory history={history} leaderAlias={leaderAlias} myAlias={me?.alias ?? null} open={open} startPrice={auction.startPrice} />
        </aside>

        <div className={styles.body}>
          <dl className={styles.facts}>
            <div><dt>Giá khởi điểm</dt><dd>{formatVnd(auction.startPrice)}</dd></div>
            <div><dt>Bước giá</dt><dd>{formatVnd(auction.step)}</dd></div>
            <div><dt>Mở lúc</dt><dd>{when(auction.startAt)}</dd></div>
            <div><dt>Kết thúc</dt><dd>{when(auction.endAt)}</dd></div>
            <div className={styles.factWide}><dt><MapPin size={14} aria-hidden="true" /> Nhận sách tại</dt><dd>{auction.pointName}</dd></div>
          </dl>

          <footer className={styles.footer}>
            <p>Người trả giá được hiển thị bằng số thứ tự ẩn danh. Mức đặt giá tự động của mỗi người không bao giờ được công khai.</p>
            <p>Điểm giao nhận và phiên đấu giá đang chạy ở chế độ mô phỏng tại TP.HCM.</p>
          </footer>
        </div>
      </div>
    </main>
  )
}

function BidHistory({ history, leaderAlias, myAlias, open, startPrice }: {
  history: { price: number; bidderAlias: number; at: string }[]; leaderAlias: number | null; myAlias: number | null; open: boolean; startPrice: number
}) {
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
              <li key={`${event.at}-${index}`} className={top ? styles.historyTop : undefined}>
                <span className={`${styles.avatar} ${mine ? styles.avatarMine : ''}`} aria-hidden="true">#{event.bidderAlias}</span>
                <span className={styles.who}>
                  {mine ? 'Bạn' : `Người trả giá #${event.bidderAlias}`}
                  <small>{when(event.at)}</small>
                </span>
                <span className={styles.amount}>
                  {formatVnd(event.price)}
                  {top && <em>{open ? 'Đang dẫn' : 'Giá chốt'}</em>}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

function Countdown({ ms, open, endAt }: { ms: number; open: boolean; endAt: string }) {
  if (!open)
    return (
      <div className={styles.timerCard}>
        <span className={styles.timerClosed}>Phiên kết thúc lúc {when(endAt)}</span>
      </div>
    )
  const s = Math.floor(ms / 1000)
  const parts: [number, string][] = [
    [Math.floor(s / 86_400), 'ngày'], [Math.floor((s % 86_400) / 3600), 'giờ'],
    [Math.floor((s % 3600) / 60), 'phút'], [s % 60, 'giây'],
  ]
  const shown = parts[0]![0] > 0 ? parts : parts.slice(1)
  return (
    <div className={`${styles.timerCard} ${ms < HOUR ? styles.timerSoon : ''}`} role="timer" aria-label={`Còn lại ${formatRemaining(ms)}`}>
      {shown.map(([value, unit], index) => (
        <span key={unit} className={styles.timerPart} aria-hidden="true">
          {index > 0 && <span className={styles.timerSep}>:</span>}
          <strong>{String(value).padStart(2, '0')}</strong>
          <small>{unit}</small>
        </span>
      ))}
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
  const [unknown, setUnknown] = useState<Intent | null>(null)
  const intent = useIntentKey()
  const ids = useId()
  const locked = busy || !!unknown
  const manualError = manual === undefined ? null : amountError(manual, minimumBid, auction.startPrice, step)
  const manualCapped = minimumBid > AUCTION_MAX_PRICE
  const autoCapped = autoFloor > AUCTION_MAX_PRICE

  const run = async (next: Intent) => {
    const key = intent.keyFor(`${next.kind}:${next.amount}`)
    setBusy(true); setError(null); setNotice(null)
    try {
      const receipt =
        next.kind === 'Manual' ? await placeBid(auction.id, next.amount, key)
        : next.kind === 'Auto' ? await setAutoBid(auction.id, next.amount, key)
        : next.kind === 'Disable' ? await disableAutoBid(auction.id, key)
        : await buyNow(auction.id, key)
      intent.settle(); setUnknown(null); setManual(undefined)
      const price = receipt.currentPrice !== null ? formatVnd(receipt.currentPrice) : ''
      setNotice(
        next.kind === 'BuyNow' ? 'Bạn đã mua ngay. Hãy thanh toán trong 15 phút.'
        : next.kind === 'Disable' ? 'Đã tắt đặt giá tự động.'
        : receipt.leading ? `Bạn đang dẫn giá ở ${price}.`
        : `Đã ghi nhận, nhưng một mức tự động khác cao hơn. Giá hiện tại ${price}.`,
      )
    } catch (caught) {
      if (outcomeUnknown(caught)) setUnknown(next)
      else { intent.settle(); setUnknown(null) }
      setError(commandError(caught))
    } finally {
      setBusy(false); setConfirming(null); setAutoDialog(false)
      void onChanged()
    }
  }

  const dialog = confirming && dialogCopy(confirming, auction)
  return (
    <div className={styles.bidPanel}>
      {me && (
        <div className={`${styles.standing} ${leading ? styles.standingLead : styles.standingOut}`}>
          <strong>{leading ? 'Bạn đang dẫn giá' : 'Bạn đã bị vượt giá'}</strong>
          <span>
            {me.mode === 'Auto' && me.ownLevel !== null
              ? `Mức tự động tối đa của bạn: ${formatVnd(me.ownLevel)} (chỉ bạn thấy).`
              : me.ownLevel !== null ? `Lượt trả gần nhất của bạn: ${formatVnd(me.ownLevel)}.` : null}
          </span>
        </div>
      )}

      {notice && <p role="status" className={styles.success}>{notice}</p>}
      {error && <p role="alert" className={styles.fieldError}>{error}</p>}

      {unknown ? (
        <div className={styles.stack}>
          <button type="button" className={styles.primaryBlock} disabled={busy} onClick={() => void run(unknown)}>
            {busy ? 'Đang thử lại…' : 'Thử lại thao tác vừa rồi'}
          </button>
          <button type="button" className={styles.secondaryBlock} disabled={busy} onClick={() => { intent.settle(); setUnknown(null); setError(null); void onChanged() }}>
            Bỏ qua và xem giá mới
          </button>
        </div>
      ) : leading ? (
        <p className={styles.muted}>Bạn không cần trả thêm. Muốn giữ vị trí khi có người trả cao hơn, hãy đặt hoặc nâng mức tự động.</p>
      ) : manualCapped ? (
        <p className={styles.muted}>Giá đã chạm mức tối đa {formatVnd(AUCTION_MAX_PRICE)} của phiên.</p>
      ) : (
        <>
          <p className={styles.quickLabel}>Trả nhanh</p>
          <div className={styles.quick}>
            {bidOptions(minimumBid, step).map((value) => (
              <button key={value} type="button" disabled={locked} onClick={() => setConfirming({ kind: 'Manual', amount: value })}>
                {formatVnd(value)}
              </button>
            ))}
          </div>
          <div className={styles.or}><span>hoặc</span></div>
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
          <button type="button" className={styles.autoToggle} disabled={locked || autoCapped} onClick={() => setAutoDialog(true)} aria-haspopup="dialog">
            <span>
              <strong><Zap size={14} aria-hidden="true" /> {me?.mode === 'Auto' ? 'Nâng mức tự động' : 'Đặt giá tự động'}</strong>
              <small>
                {autoCapped
                  ? `Mức tự động của bạn đã ở mức tối đa ${formatVnd(AUCTION_MAX_PRICE)}.`
                  : 'Tự trả thay bạn từng bước khi có người trả cao hơn, không vượt mức tối đa bạn chọn.'}
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
        description: `Hệ thống chỉ trả vừa đủ để bạn dẫn, mỗi lần một bước ${formatVnd(auction.step)}, không vượt mức này. Chỉ bạn thấy mức tối đa và chỉ có thể nâng lên. ${pay}`,
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

  const pay = async () => {
    if (!order.data) return
    const key = intent.keyFor(`pay:${order.data.id}:${order.data.version}`)
    let pending = false
    setBusy(true); setError(null)
    try {
      await payPointOrder(order.data.id, order.data.version, key)
      intent.settle()
    } catch (caught) {
      pending = outcomeUnknown(caught)
      if (!pending) intent.settle()
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
        <strong>Đã thanh toán {formatVnd(o.amounts.buyerTotal)}</strong>
        <span>Tiền đang được giữ cho đơn này đến khi bạn nhận sách tại {o.pointName}. Bước tiếp theo là xác nhận biên bản kiểm tra rồi lấy mã nhận sách tại điểm.</span>
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
