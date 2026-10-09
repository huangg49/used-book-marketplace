import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@used-books/session-client'
import { Link, useParams } from 'react-router-dom'
import { Gavel, Minus, Plus, Timer, Zap } from 'lucide-react'
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

function commandError(error: unknown) {
  if (!(error instanceof ApiError) || error.status === 0)
    return 'Không kết nối được máy chủ nên chưa rõ thao tác đã được ghi hay chưa. Hãy thử lại đúng thao tác này.'
  if (error.status >= 500) return 'Máy chủ đang gặp sự cố nên chưa rõ kết quả. Hãy thử lại đúng thao tác này.'
  if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
  if (error.code === 'IdempotencyConflict') return 'Thao tác trước chưa hoàn tất. Hãy tải lại trang để xem trạng thái mới nhất.'
  // Lỗi nghiệp vụ của API đấu giá đã có lời nhắn tiếng Việt cho người dùng.
  return error.message || 'Không thể thực hiện thao tác này. Hãy tải lại trang.'
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
  return (
    <main className={styles.page}>
      <Link className={styles.back} to={ROUTES.auctions}>← Về danh sách đấu giá</Link>
      <div className={styles.grid}>
        <section className={styles.coverPanel} aria-label="Thông tin phiên">
          <div className={styles.plate}>
            <span className={styles.plateTitle}>{auction.title}</span>
            <span className={styles.plateNote}>Phiên đấu giá chưa hiển thị ảnh bìa. Sách đã được nhân viên kiểm tra tại {auction.pointName}.</span>
          </div>
          <dl className={styles.facts}>
            <div><dt>Giá khởi điểm</dt><dd>{formatVnd(auction.startPrice)}</dd></div>
            <div><dt>Bước giá</dt><dd>{formatVnd(auction.step)}</dd></div>
            <div><dt>Mở lúc</dt><dd>{when(auction.startAt)}</dd></div>
            <div><dt>Kết thúc</dt><dd>{when(auction.endAt)}</dd></div>
            <div><dt>Nhận sách tại</dt><dd>{auction.pointName}</dd></div>
          </dl>
        </section>

        <article className={styles.content}>
          <p className={styles.eyebrow}>Đấu giá · Đã kiểm tra tại điểm</p>
          <h1>{auction.title}</h1>
          <span className={`${styles.status} ${open ? '' : styles.statusClosed}`}>
            {open ? <Gavel size={14} aria-hidden="true" /> : null}
            {ended ? 'Đã hết giờ, đang chốt kết quả' : STATE_LABEL[auction.state]}
          </span>

          <div className={styles.board} aria-live="polite">
            <p className={styles.boardPrice}>
              <span>{!open && auction.currentPrice !== null ? 'Giá chốt' : hasBids ? 'Giá hiện tại' : 'Giá khởi điểm'}</span>
              <strong>{formatVnd(auction.currentPrice ?? auction.startPrice)}</strong>
            </p>
            <p>
              <span>{open ? 'Còn lại' : 'Kết thúc lúc'}</span>
              <strong className={open && remaining < HOUR ? styles.soon : undefined}>
                {open ? formatRemaining(remaining) : when(auction.endAt)}
              </strong>
            </p>
            <p>
              <span>Người trả giá</span>
              <strong>{auction.bidderCount}</strong>
            </p>
          </div>
          {open && auction.minimumBid !== null && (
            <p className={styles.nextBid}>
              Lượt tiếp theo từ <strong>{formatVnd(auction.minimumBid)}</strong> · bước giá {formatVnd(auction.step)}
            </p>
          )}

          {me?.won ? (
            <WinnerPanel me={me} auction={auction} onChanged={refresh} />
          ) : !open ? (
            <section className={styles.panel}>
              <h2>{ended ? 'Phiên vừa hết giờ' : 'Phiên đã đóng'}</h2>
              <p>
                {ended
                  ? 'Hệ thống đang chốt người thắng. Trang sẽ tự cập nhật.'
                  : me ? 'Bạn không thắng phiên này. Lượt trả giá không giữ tiền nên ví của bạn không thay đổi.' : STATE_LABEL[auction.state] + '.'}
              </p>
              <Link className={styles.secondary} to={ROUTES.auctions}>Xem các phiên khác</Link>
            </section>
          ) : session.status === 'loading' ? (
            <section className={styles.panel}><p>Đang kiểm tra đăng nhập…</p></section>
          ) : !authed ? (
            <SignInPanel auction={auction} />
          ) : participation.isPending ? (
            <section className={styles.panel}><p>Đang tải lượt trả giá của bạn…</p></section>
          ) : participation.isError ? (
            <section className={styles.panel} role="alert">
              <p>Chưa tải được lượt trả giá của bạn.</p>
              <button type="button" className={styles.secondary} onClick={() => void participation.refetch()}>Thử lại</button>
            </section>
          ) : (
            <BidPanel auction={auction} me={me} onChanged={refresh} />
          )}

          <section className={styles.history} aria-labelledby="history-title">
            <h2 id="history-title">Diễn biến giá</h2>
            {history.length === 0 ? (
              <p className={styles.note}>Chưa có lượt trả giá nào. Giá khởi điểm là {formatVnd(auction.startPrice)}.</p>
            ) : (
              <ol>
                {history.map((event, index) => (
                  <li key={`${event.at}-${index}`} className={index === 0 && event.bidderAlias === leaderAlias ? styles.leaderRow : undefined}>
                    <span className={styles.who}>
                      Người trả giá #{event.bidderAlias}
                      {me?.alias === event.bidderAlias && <span className={styles.you}>Bạn</span>}
                    </span>
                    <span className={styles.when}>{when(event.at)}{index === 0 && open ? ' · đang dẫn' : ''}</span>
                    <span className={styles.amount}>{formatVnd(event.price)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <footer className={styles.footer}>
            <p className={styles.note}>Người trả giá được hiển thị bằng số thứ tự ẩn danh. Mức đặt giá tự động của mỗi người không bao giờ được công khai.</p>
            <p className={styles.note}>Điểm giao nhận và phiên đấu giá đang chạy ở chế độ mô phỏng tại TP.HCM.</p>
          </footer>
        </article>
      </div>
    </main>
  )
}

function SignInPanel({ auction }: { auction: AuctionSummary }) {
  return (
    <section className={styles.panel}>
      <h2>Đăng nhập để trả giá</h2>
      <p>
        Trả giá không giữ tiền trong ví. Nếu thắng, bạn thanh toán từ ví và nhận sách tại {auction.pointName}.
      </p>
      <Link className={styles.primary} to={ROUTES.login}>Đăng nhập</Link>
    </section>
  )
}

function BidPanel({ auction, me, onChanged }: { auction: AuctionSummary; me: AuctionParticipation | null; onChanged: () => Promise<unknown> }) {
  const leading = me?.leading ?? false
  const [picked, setMode] = useState<'Manual' | 'Auto'>(me?.mode === 'Auto' ? 'Auto' : 'Manual')
  const mode = leading ? 'Auto' : picked
  const step = auction.step
  const minimumBid = auction.minimumBid ?? AUCTION_MAX_PRICE + step
  // Người dẫn chỉ được nâng mức tự động; mọi mức mới phải cao hơn mức của chính mình.
  const floor = mode === 'Auto' && me?.ownLevel != null
    ? Math.max(leading ? 0 : minimumBid, me.ownLevel + step)
    : minimumBid
  const [chosen, setChosen] = useState(floor)
  const amount = chosen < floor ? floor : chosen
  const [confirming, setConfirming] = useState<Intent | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [unknown, setUnknown] = useState<Intent | null>(null)
  const intent = useIntentKey()
  const capped = floor > AUCTION_MAX_PRICE

  const run = async (next: Intent) => {
    const key = intent.keyFor(`${next.kind}:${next.amount}`)
    setBusy(true); setError(null); setNotice(null)
    try {
      const receipt =
        next.kind === 'Manual' ? await placeBid(auction.id, next.amount, key)
        : next.kind === 'Auto' ? await setAutoBid(auction.id, next.amount, key)
        : next.kind === 'Disable' ? await disableAutoBid(auction.id, key)
        : await buyNow(auction.id, key)
      intent.settle(); setUnknown(null)
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
      setBusy(false); setConfirming(null)
      void onChanged()
    }
  }

  const options = capped ? [] : bidOptions(floor, step)
  const dialog = confirming && dialogCopy(confirming, auction)
  return (
    <section className={`${styles.panel} ${leading ? styles.panelLead : ''}`} aria-labelledby="bid-title">
      <h2 id="bid-title">
        {leading ? 'Bạn đang dẫn giá' : me ? 'Bạn đã bị vượt giá' : auction.bidderCount === 0 ? 'Trả giá đầu tiên' : 'Trả giá'}
      </h2>
      {me && (
        <p>
          {me.mode === 'Auto' && me.ownLevel !== null
            ? `Mức tự động tối đa của bạn: ${formatVnd(me.ownLevel)} (chỉ bạn thấy).`
            : me.ownLevel !== null ? `Lượt trả gần nhất của bạn: ${formatVnd(me.ownLevel)}.` : null}
          {leading && ' Bạn không cần trả thêm; chỉ có thể nâng mức tự động.'}
        </p>
      )}

      {capped ? (
        <p>Giá đã chạm mức tối đa {formatVnd(AUCTION_MAX_PRICE)} của phiên đấu giá.</p>
      ) : (
        <>
          {!leading && (
            <div className={styles.modes} role="group" aria-label="Cách trả giá">
              <button type="button" aria-pressed={mode === 'Manual'} disabled={busy || !!unknown} onClick={() => setMode('Manual')}>Trả một lần</button>
              <button type="button" aria-pressed={mode === 'Auto'} disabled={busy || !!unknown} onClick={() => setMode('Auto')}>
                <Zap size={14} aria-hidden="true" style={{ display: 'inline', marginRight: 4 }} />Tự động
              </button>
            </div>
          )}
          <p className={styles.hint} id="amount-hint" style={{ marginTop: 0, marginBottom: 8 }}>
            {mode === 'Manual'
              ? 'Số tiền bạn trả cho lượt này.'
              : 'Mức tối đa bạn chấp nhận. Hệ thống trả thay bạn từng bước khi có người trả cao hơn.'}
          </p>
          <div className={styles.amountRow}>
            <button type="button" aria-label="Giảm một bước giá" disabled={busy || !!unknown || amount - step < floor} onClick={() => setChosen(amount - step)}><Minus size={18} aria-hidden="true" /></button>
            <output aria-live="polite" aria-describedby="amount-hint">{formatVnd(amount)}</output>
            <button type="button" aria-label="Tăng một bước giá" disabled={busy || !!unknown || amount + step > AUCTION_MAX_PRICE} onClick={() => setChosen(amount + step)}><Plus size={18} aria-hidden="true" /></button>
          </div>
          <div className={styles.quick} role="group" aria-label="Chọn nhanh">
            {options.map((value) => (
              <button key={value} type="button" aria-pressed={value === amount} disabled={busy || !!unknown} onClick={() => setChosen(value)}>{formatVnd(value)}</button>
            ))}
          </div>
        </>
      )}

      {notice && <p role="status" style={{ marginTop: 12, fontWeight: 700, color: '#173c2e' }}>{notice}</p>}
      {error && <p role="alert" className={styles.error} style={{ marginTop: 12 }}>{error}</p>}

      <div className={styles.actions}>
        {unknown ? (
          <>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => void run(unknown)}>
              {busy ? 'Đang thử lại…' : 'Thử lại thao tác vừa rồi'}
            </button>
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => { intent.settle(); setUnknown(null); setError(null); void onChanged() }}>
              Bỏ qua và xem giá mới
            </button>
          </>
        ) : (
          <>
            {!capped && (
              <button type="button" className={styles.primary} disabled={busy} onClick={() => setConfirming({ kind: mode, amount })}>
                <Gavel size={16} aria-hidden="true" />
                {mode === 'Manual' ? `Trả ${formatVnd(amount)}` : `Đặt tối đa ${formatVnd(amount)}`}
              </button>
            )}
            {me?.mode === 'Auto' && (
              <button type="button" className={styles.secondary} disabled={busy} onClick={() => setConfirming({ kind: 'Disable', amount: 0 })}>
                Tắt đặt giá tự động
              </button>
            )}
          </>
        )}
      </div>

      {auction.buyNowPrice !== null && !unknown && (
        <div className={styles.buyNow}>
          <p>Không muốn chờ? <strong>Mua ngay {formatVnd(auction.buyNowPrice)}</strong><br /><span className={styles.hint}>Chỉ có trước lượt trả giá đầu tiên.</span></p>
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
    </section>
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
  const price = me.finalPrice ?? auction.currentPrice

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

  if (!me.orderId) return <section className={`${styles.panel} ${styles.panelLead}`}><h2>{headline}</h2><p>Đơn nhận sách đang được tạo. Trang sẽ tự cập nhật.</p></section>
  if (order.isPending) return <section className={`${styles.panel} ${styles.panelLead}`}><h2>{headline}</h2><p>Đang tải đơn thanh toán…</p></section>
  if (order.isError)
    return (
      <section className={`${styles.panel} ${styles.panelLead}`} role="alert">
        <h2>{headline}</h2><p>Chưa tải được đơn thanh toán.</p>
        <button type="button" className={styles.secondary} onClick={() => void order.refetch()}>Thử lại</button>
      </section>
    )

  const o = order.data
  if (o.state === 'PaymentExpired' || o.state === 'Cancelled')
    return (
      <section className={`${styles.panel} ${styles.panelWarn}`}>
        <h2>{o.state === 'PaymentExpired' ? 'Đã quá hạn thanh toán' : 'Đơn đã bị hủy'}</h2>
        <p>{o.state === 'PaymentExpired' ? 'Sách được trả lại người bán. Lượt không thanh toán đã được ghi nhận vào tài khoản.' : 'Đơn nhận sách này không còn hiệu lực.'}</p>
      </section>
    )
  if (o.state !== 'AwaitingPayment')
    return (
      <section className={`${styles.panel} ${styles.panelLead}`}>
        <h2>Đã thanh toán {formatVnd(o.amounts.buyerTotal)}</h2>
        <p>
          Tiền đang được giữ cho đơn này đến khi bạn nhận sách. Sách ở {o.pointName}; bước tiếp theo là xác nhận biên bản
          kiểm tra rồi lấy mã nhận sách tại điểm.
        </p>
      </section>
    )

  return (
    <section className={`${styles.panel} ${styles.panelLead}`} aria-labelledby="win-title">
      <h2 id="win-title">{headline}</h2>
      <p>
        Giá chốt <strong>{price !== null ? formatVnd(price) : '—'}</strong>. Thanh toán <strong>{formatVnd(o.amounts.buyerTotal)}</strong> từ
        ví trước <strong>{o.paymentDeadline ? when(o.paymentDeadline) : '—'}</strong>
        {o.paymentDeadline && <> (còn <span className={remaining < HOUR ? styles.soon : undefined}><Timer size={14} aria-hidden="true" style={{ display: 'inline' }} /> {formatRemaining(remaining)}</span>)</>}
        , rồi nhận sách tại {o.pointName}.
      </p>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button type="button" className={styles.primary} disabled={busy || remaining === 0} onClick={() => (unknown ? void pay() : setConfirming(true))}>
          {unknown ? 'Thử lại thanh toán' : `Thanh toán ${formatVnd(o.amounts.buyerTotal)}`}
        </button>
      </div>
      <ConfirmDialog
        isOpen={confirming}
        onClose={() => !busy && setConfirming(false)}
        title={`Thanh toán ${formatVnd(o.amounts.buyerTotal)} từ ví?`}
        description={`Số tiền được giữ cho đơn này đến khi bạn nhận sách tại ${o.pointName}. Ví cần đủ số dư khả dụng; không nhận thanh toán một phần.`}
        confirmText="Thanh toán"
        onConfirm={() => void pay()}
        isBusy={busy}
      />
    </section>
  )
}
