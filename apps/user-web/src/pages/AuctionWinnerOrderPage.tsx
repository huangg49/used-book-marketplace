import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@used-books/session-client'
import { ArrowLeft, ArrowUpRight, BookOpen, Check, CircleAlert, Clock3, Gavel, MapPin, PackageCheck, Wallet } from 'lucide-react'
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { AuctionPhoto } from '../components/AuctionGallery'
import { ReviewEntry } from '../features/reviews/ReviewEntry'
import { SupportLink } from '../features/support/SupportLink'
import { formatRemaining, outcomeUnknown, useCountdown } from '../hooks/useAuctionClock'
import { useAuctionLive } from '../hooks/useAuctionLive'
import { useSession } from '../hooks/useSession'
import { formatVnd, ROUTES } from '../lib/routes'
import { getAuction, getMyParticipation, getMyPointOrder, type PointOrder } from '../services/auctions'
import { AuctionOrderPayment } from './AuctionOrderPayment'
import { PointOrderSteps } from './AuctionPointOrder'
import styles from './AuctionWinnerOrderPage.module.css'

const phases = [
  { label: 'Thanh toán', icon: Wallet },
  { label: 'Nhận sách', icon: PackageCheck },
  { label: 'Kiểm tra & kết quả', icon: BookOpen },
] as const
const terminal = new Set<PointOrder['state']>(['Completed', 'Cancelled', 'PaymentExpired'])
const inaccessible = (error: unknown) => error instanceof ApiError && [403, 404].includes(error.status)
const dateTime = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh',
})
const stamp = (date: string) => dateTime.format(new Date(date))

function orderPresentation(order: PointOrder) {
  const delivery = order.fulfillmentMethod === 'CarrierOutbound'
  const phase = order.collectedAt ? 2 : order.paidAt ? 1 : 0
  switch (order.state) {
    case 'AwaitingPayment':
      return { phase: 0, tone: 'action', actor: 'Bạn cần thao tác', title: 'Chọn cách nhận và thanh toán', note: 'Chọn lấy tại điểm hoặc giao tận nơi. Giá và phí được xác nhận trước khi tiền được giữ trong đơn.', deadline: order.paymentDeadline }
    case 'Fulfilling':
      return { phase: 1, tone: 'action', actor: 'Bạn cần thao tác', title: 'Xem biên bản kiểm tra tại điểm', note: 'Đối chiếu tình trạng sách trước khi đồng ý để điểm tiến hành giao nhận.', deadline: order.acceptanceDeadline }
    case 'ReadyForCollection':
      return delivery
        ? { phase: 1, tone: 'waiting', actor: 'Đang chờ điểm giao nhận', title: 'Chờ bàn giao cho hãng', note: 'Nhân viên tại điểm sẽ bàn giao sách cho hãng. Bạn có thể theo dõi mã vận đơn tại đây khi sách bắt đầu được giao.', deadline: order.collectionDeadline }
        : { phase: 1, tone: 'action', actor: 'Bạn cần thao tác', title: 'Đến điểm nhận sách', note: 'Lấy mã khi bạn đã đến quầy. Nhân viên dùng mã để đối chiếu và giao đúng cuốn sách.', deadline: order.collectionDeadline }
    case 'InTransit':
      if (order.delivery?.deliveredAt) {
        return { phase: 1, tone: 'action', actor: 'Bạn cần thao tác', title: 'Hãng báo đã giao sách', note: 'Xác nhận đã nhận để bắt đầu 72 giờ kiểm tra. Nếu chưa có sách, hãy báo để quản trị viên đối chiếu.', deadline: order.delivery.deliveryDeadline }
      }
      return { phase: 1, tone: 'waiting', actor: 'Hãng đang vận chuyển',
        title: order.delivery?.demoOutForDeliveryAt ? 'Bưu tá đang đi giao sách cho bạn' : 'Sách đang trên đường đến bạn',
        note: 'Bạn sẽ xác nhận sau khi nhận sách để bắt đầu thời hạn kiểm tra.', deadline: order.delivery?.deliveryDeadline }
    case 'Inspection':
      return { phase: 2, tone: 'action', actor: 'Đã nhận sách', title: 'Kiểm tra sách bạn đã nhận', note: 'Nếu sách khác biên bản, hãy báo trong thời gian kiểm tra. Nếu mọi thứ ổn, hệ thống sẽ tự hoàn tất đơn khi hết hạn.', deadline: order.inspectionDeadline }
    case 'ResolutionPending': {
      const reasons = {
        ReportRejected: 'Bạn đã từ chối biên bản tại điểm.',
        RecipientDecisionOverdue: 'Đã hết thời hạn trả lời biên bản.',
        CollectionOverdue: 'Đã hết thời hạn giao hoặc nhận sách tại điểm.',
        InspectionClaim: 'Hệ thống đã nhận báo cáo về tình trạng sách.',
        DeliveryFailed: order.delivery?.deliveredAt ? 'Quản trị viên đang đối chiếu việc nhận sách.' : 'Hãng chưa giao được sách đến bạn.',
        ReturnOverdue: 'Đã hết thời hạn trả sách về điểm.',
      }
      return { phase, tone: 'issue', actor: 'Đang chờ quản trị viên', title: 'Đơn đang được xem xét', note: `${order.resolution ? reasons[order.resolution.reason] : 'Hệ thống đã chuyển đơn cho quản trị viên.'} Tiền vẫn được giữ trong đơn trong lúc xử lý.` }
    }
    case 'ReturnPending':
      return delivery && !order.collectedAt
        ? { phase, tone: 'issue', actor: 'Đang chờ hãng vận chuyển', title: 'Chờ hãng trả sách về điểm', note: 'Tiền được hoàn sau khi điểm nhận lại và đối chiếu sách.', deadline: order.returnDeadline }
        : { phase, tone: 'issue', actor: 'Bạn cần thao tác', title: 'Mang sách trả về điểm', note: `Mang sách về ${order.pointName} trong giờ mở cửa. Tiền được hoàn sau khi nhân viên nhận và đối chiếu sách.`, deadline: order.returnDeadline }
    case 'Completed':
      return { phase: 2, tone: 'success', actor: 'Đã hoàn tất', title: 'Đơn đã hoàn tất', note: 'Bạn có thể xem lại thông tin đơn và đánh giá giao dịch.' }
    case 'Cancelled':
      return order.paidAt && order.refunded
        ? { phase, tone: 'issue', actor: 'Đã hoàn tiền', title: 'Đơn đã đóng và tiền đã về ví', note: 'Bạn có thể đối chiếu giao dịch hoàn tiền trong ví.' }
        : { phase, tone: 'issue', actor: 'Đã hủy', title: 'Đơn đã bị hủy', note: 'Bạn có thể xem thông tin phiên và đối chiếu các khoản giữ trong ví.' }
    case 'PaymentExpired':
      return { phase: 0, tone: 'issue', actor: 'Đã quá hạn', title: 'Hết hạn thanh toán', note: 'Đơn này đã đóng. Bạn có thể kiểm tra các khoản giữ và hoàn trong ví.' }
  }
}

export function AuctionWinnerOrderPage() {
  const { id = '' } = useParams()
  const session = useSession()
  const location = useLocation()
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return <Navigate to="/404" replace />
  if (session.status === 'loading') return <p className={styles.page} role="status">Đang kiểm tra phiên đăng nhập…</p>
  if (session.status !== 'authenticated')
    return <Navigate to={`${ROUTES.login}?returnUrl=${encodeURIComponent(location.pathname + location.search)}`} replace />
  return <WinnerOrder key={`${session.user.id}:${id}`} id={id} ownerId={session.user.id} />
}

function WinnerOrder({ id, ownerId }: { id: string; ownerId: string }) {
  const [params] = useSearchParams()
  const fromChat = params.get('from') === 'chat'
  const back = fromChat ? '/chat?tab=auction' : ROUTES.myAuctions
  const queryClient = useQueryClient()
  const participation = useQuery({
    queryKey: ['auction-participation', id, ownerId],
    queryFn: () => getMyParticipation(id),
    retry: false,
    refetchInterval: (query) => query.state.data?.won && !query.state.data.orderId ? 4_000 : false,
    staleTime: 0,
  })
  const orderId = participation.data?.won ? participation.data.orderId : null
  const auction = useQuery({
    queryKey: ['auction', id],
    queryFn: () => getAuction(id),
    retry: false,
  })
  useAuctionLive(id)
  const order = useQuery({
    queryKey: ['point-order', orderId, ownerId],
    queryFn: () => getMyPointOrder(orderId!),
    enabled: !!orderId,
    retry: false,
    staleTime: 0,
    refetchInterval: (query) => query.state.data && !terminal.has(query.state.data.state) ? 12_000 : false,
  })
  const current = order.data
  const step = current && orderPresentation(current)
  const remaining = useCountdown(step?.deadline ?? undefined, current?.serverTime)
  const expired = !!step?.deadline && remaining === 0
  const refresh = async () => Promise.all([
    order.refetch(),
    queryClient.invalidateQueries({ queryKey: ['my-auctions'] }),
  ])

  const denied = inaccessible(participation.error) || inaccessible(order.error) ||
    current && (current.role !== 'Buyer' || current.auctionId !== id)
  const pendingResult = !participation.data?.orderId && !!participation.data?.won
  const unavailable = participation.isError && (!participation.data || !outcomeUnknown(participation.error)) ||
    order.isError && (!current || !outcomeUnknown(order.error))
  const stale = !!current && (order.isError || participation.isError)
  const actionable = step?.tone === 'action' && expired
  const expiredMessage = current?.state === 'Inspection'
    ? 'Hạn kiểm tra đã hết. Hệ thống đang cập nhật kết quả đơn.'
    : 'Hạn của thao tác này đã hết. Hệ thống đang cập nhật trạng thái đơn.'

  return (
    <div className={styles.page}>
      <nav className={styles.nav} aria-label="Điều hướng đơn đấu giá">
        <Link to={back}><ArrowLeft size={17} aria-hidden="true" /> {fromChat ? 'Về giao dịch' : 'Về đấu giá của tôi'}</Link>
        <Link to={ROUTES.auctionDetail(id)}>Xem phiên <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </nav>
      {denied || (!participation.isPending && !participation.isError && !orderId && !pendingResult) ? (
        <section className={styles.state}><h1>Không tìm thấy đơn đấu giá của bạn</h1><p>Xem kết quả tại trang phiên hoặc trở về danh sách đấu giá của bạn.</p></section>
      ) : unavailable ? (
        <section className={styles.state} role="alert">
          <h1>Chưa tải được đơn đấu giá</h1><p>Kiểm tra kết nối rồi tải lại để xem trạng thái mới nhất.</p>
          <button type="button" onClick={() => void (orderId ? order.refetch() : participation.refetch())}>Tải lại đơn</button>
        </section>
      ) : !current || !step ? (
        <section className={styles.state} role="status">
          <h1>{pendingResult ? 'Đang tạo đơn đấu giá' : 'Đang tải đơn đấu giá'}</h1>
          <p>{pendingResult ? 'Trang sẽ tự cập nhật khi hệ thống tạo xong đơn.' : 'Đang kiểm tra kết quả và thông tin nhận sách của bạn.'}</p>
        </section>
      ) : (
        <>
          <header className={styles.header}>
            <div className={styles.cover}>
              {auction.data ? <AuctionPhoto auction={auction.data.auction} interactive={false} eager /> : <BookOpen size={28} aria-hidden="true" />}
            </div>
            <div className={styles.identity}>
              <p><Gavel size={16} aria-hidden="true" /> {current.state === 'AwaitingPayment'
                ? participation.data?.boughtNow ? 'Bạn đã mua ngay cuốn sách này' : 'Bạn đã thắng phiên đấu giá'
                : 'Đơn đấu giá'} <span>#{current.id.slice(0, 8).toUpperCase()}</span></p>
              <h1>{current.title || auction.data?.auction.title || 'Đơn đấu giá của bạn'}</h1>
              <p><MapPin size={16} aria-hidden="true" /> {current.pointName}</p>
            </div>
          </header>
          <ol className={styles.progress} aria-label="Tiến trình đơn đấu giá">
            {phases.map(({ label, icon: Icon }, index) => {
              const active = index === step.phase && !terminal.has(current.state)
              const done = index < step.phase || current.state === 'Completed'
              return (
                <li key={label} aria-current={active ? 'step' : undefined} data-state={active ? 'current' : done ? 'done' : 'pending'}>
                  <span className={styles.phaseIcon}>{done ? <Check size={17} aria-hidden="true" /> : <Icon size={17} aria-hidden="true" />}</span>
                  <span>{label}<small>{active ? 'Đang diễn ra' : done ? 'Đã xong' : current.state === 'Cancelled' || current.state === 'PaymentExpired' ? 'Đơn đã đóng' : 'Sắp tới'}</small></span>
                </li>
              )
            })}
          </ol>
          <div className={styles.columns}>
            <section className={styles.task} aria-labelledby="auction-order-task">
              <div className={styles.taskHeader} key={current.state}>
                <p className={styles.actor} data-tone={step.tone}>{step.tone === 'issue' ? <CircleAlert size={16} aria-hidden="true" /> : <Clock3 size={16} aria-hidden="true" />} {step.actor}</p>
                <h2 id="auction-order-task">{step.title}</h2>
                <p>{step.note}</p>
                {step.deadline && <p className={styles.deadline}><Clock3 size={16} aria-hidden="true" /> <time dateTime={step.deadline}>{stamp(step.deadline)}</time><span>· {expired ? 'Đã hết hạn' : `Còn ${formatRemaining(remaining, true)}`}</span></p>}
              </div>
              {stale && <p role="alert" className={styles.warning}>Chưa cập nhật được đơn. Tải lại trước khi thao tác. <button type="button" onClick={() => void Promise.all([participation.refetch(), order.refetch()])}>Tải lại</button></p>}
              {actionable && <p role="status" className={styles.warning}>{expiredMessage}</p>}
              {current.state === 'AwaitingPayment' && (
                <AuctionOrderPayment order={current} ownerId={ownerId} onChanged={refresh} paused={stale} />
              )}
              {!terminal.has(current.state) && current.state !== 'AwaitingPayment' && (
                <PointOrderSteps order={current} onChanged={refresh} paused={stale || expired} />
              )}
              {current.state === 'Cancelled' && current.paidAt && current.refunded &&
                <Link className={styles.textLink} to={ROUTES.wallet}>Đối chiếu trong ví <ArrowUpRight size={16} aria-hidden="true" /></Link>}
              {['Inspection', 'Completed'].includes(current.state) && !stale && (
                <div className={styles.review}><ReviewEntry type="PointOrder" id={current.id} version={current.version} /></div>
              )}
            </section>
            <aside className={styles.summary} aria-labelledby="auction-order-summary">
              <h2 id="auction-order-summary">Thông tin đơn</h2>
              <dl>
                <div><dt>Giá thắng</dt><dd>{formatVnd(current.amounts.bookPrice)}</dd></div>
                {current.paidAt && current.fulfillmentMethod === 'CarrierOutbound' && <div><dt>Phí giao</dt><dd>{formatVnd(current.amounts.outboundFee)}</dd></div>}
                {current.paidAt && <div><dt>Tổng đã thanh toán</dt><dd>{formatVnd(current.amounts.buyerTotal)}</dd></div>}
                <div><dt>Cách nhận</dt><dd>{!current.paidAt ? 'Chọn khi thanh toán' : current.fulfillmentMethod === 'CarrierOutbound' ? 'Giao tận nơi' : 'Nhận tại điểm'}</dd></div>
                {terminal.has(current.state) && current.delivery?.trackingCode &&
                  <div><dt>Mã vận đơn</dt><dd><Link to={ROUTES.driver(current.delivery.trackingCode)}>{current.delivery.trackingCode}</Link></dd></div>}
                {current.collectedAt && <div><dt>Đã nhận lúc</dt><dd>{stamp(current.collectedAt)}</dd></div>}
                {current.closedAt && <div><dt>Đơn đóng lúc</dt><dd>{stamp(current.closedAt)}</dd></div>}
              </dl>
              {current.paidAt && current.state !== 'Fulfilling' && (
                <details className={styles.report}><summary>Biên bản tại điểm</summary>
                  <p>Đã kiểm tra lúc {stamp(current.report.inspectedAt)}.</p>
                  {current.report.note && <p>{current.report.note}</p>}
                  <p>{current.report.scope}</p>
                </details>
              )}
              <div className={styles.support}><SupportLink type="PointOrder" id={current.id} /></div>
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
