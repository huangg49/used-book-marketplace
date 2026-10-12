import { useQuery } from '@tanstack/react-query'
import { ApiError } from '@used-books/session-client'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, Gavel, RefreshCw } from 'lucide-react'
import { AuctionPhoto } from '../components/AuctionGallery'
import { useSession } from '../hooks/useSession'
import { formatRemaining, outcomeUnknown, useCountdown } from '../hooks/useAuctionClock'
import { listMyAuctions, type MyAuctionItem } from '../services/auctions'
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
