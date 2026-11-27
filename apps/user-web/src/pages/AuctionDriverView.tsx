import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@used-books/session-client'
import { ArrowLeft, CircleAlert, PackageCheck, Truck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AuctionShipmentTimeline } from '../components/AuctionShipmentTimeline'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { commandOutcomeUnknown } from '../hooks/useAuctionClock'
import { useSession } from '../hooks/useSession'
import { commandError } from '../lib/auction-errors'
import { ROUTES } from '../lib/routes'
import {
  demoDeliverPointOrder, demoStartPointDelivery, getMyParticipation, getMyPointOrder,
  getPointDeliveryTracking, listMyAuctions, reportPointDelivery,
  type PointDeliveryEvent, type PointDeliveryTracking, type PointOrder,
} from '../services/auctions'
import { DriverCompleteAction, DriverParcelCard, DriverParcelRoute, DriverWorkspace } from './DriverWorkspace'
import styles from './DriverPage.module.css'

type Outcome = PointDeliveryEvent['outcome']
type DemoStep = 'Start' | 'Deliver'
type DemoAttempt = { step: DemoStep; orderId: string; version: number; key: string }
const titles: Record<PointDeliveryTracking['status'], string> = {
  InTransit: 'Sách đang được giao',
  Delivered: 'Sách đã giao thành công',
  Failed: 'Giao sách không thành công',
  Overdue: 'Đã quá hạn giao sách',
}
const trackingTime = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
})

function AuctionOperatorParcel({
  shipment, canAct, busy, onChoose, onDemoStart,
}: {
  shipment: PointDeliveryTracking; canAct: boolean; busy: boolean; onChoose: (outcome: Outcome) => void
  onDemoStart?: () => void
}) {
  const delivered = shipment.status === 'Delivered'
  const problem = shipment.status === 'Failed' || shipment.status === 'Overdue'
  const awaitingStart = !!onDemoStart && shipment.status === 'InTransit' && !shipment.demoOutForDeliveryAt
  const canDeliver = canAct && !awaitingStart
  return (
    <>
      <DriverParcelCard label="Mã vận đơn (Đấu giá)" trackingCode={shipment.trackingCode} summary={shipment.title}
        badge={<h2 className={`${styles.feeBadge} ${styles.parcelStatus}`}>{awaitingStart ? 'Hãng đã nhận sách' : titles[shipment.status]}</h2>}>
        <DriverParcelRoute
          pickup={{ label: 'Điểm lấy sách', name: shipment.pointName }}
          dropoff={{ label: 'Điểm giao sách', name: 'Người thắng đấu giá' }}
        />
      </DriverParcelCard>
      <h2 className={styles.sectionTitle}>Quy trình giao nhận kiện đấu giá</h2>
      <ol className={`${styles.actionGrid} ${styles.parcelSteps}`} aria-label="Tiến trình vận chuyển">
        <li className={`${styles.actionBtn} ${styles.actionBtnActive} ${styles.parcelStep}`}>
          <PackageCheck size={22} aria-hidden="true" />
          <div className={styles.actionBtnContent}>
            <p className={styles.actionBtnTitle}>1. Đã nhận sách từ điểm</p>
            <p className={styles.actionBtnDesc}>Bàn giao lúc <time dateTime={shipment.dispatchedAt}>{trackingTime.format(new Date(shipment.dispatchedAt))}</time></p>
          </div>
          <span className={styles.stepBadgeDone}>✓ Đã bàn giao</span>
        </li>
        {awaitingStart ? (
          <li aria-current="step">
            <button type="button" className={styles.actionBtn} disabled={busy || !canAct} onClick={onDemoStart}>
              <Truck size={22} aria-hidden="true" />
              <span className={styles.actionBtnContent}><strong className={styles.actionBtnTitle}>2. Bắt đầu đi giao</strong></span>
              <span className={styles.stepBadgeNext}>Chờ xuất phát</span>
            </button>
          </li>
        ) : <li className={`${styles.actionBtn} ${styles.parcelStep}`} aria-current={shipment.status === 'InTransit' ? 'step' : undefined}>
          <Truck size={22} aria-hidden="true" />
          <div className={styles.actionBtnContent}>
            <p className={styles.actionBtnTitle}>2. Vận chuyển đến người nhận</p>
            {shipment.demoOutForDeliveryAt
              ? <p className={styles.actionBtnDesc}>Bắt đầu đi giao lúc <time dateTime={shipment.demoOutForDeliveryAt}>{trackingTime.format(new Date(shipment.demoOutForDeliveryAt))}</time></p>
              : <p className={styles.actionBtnDesc}>Hạn giao <time dateTime={shipment.deliveryDeadline}>{trackingTime.format(new Date(shipment.deliveryDeadline))}</time></p>}
          </div>
          {shipment.status === 'InTransit' && <span className={styles.stepBadgeNext}>Đang giao</span>}
        </li>}
        <li>
          {problem ? (
            <div className={`${styles.actionBtn} ${styles.parcelStep}`}>
              <CircleAlert size={22} aria-hidden="true" />
              <p className={styles.actionBtnTitle}>3. {titles[shipment.status]}</p>
            </div>
          ) : (
            <DriverCompleteAction
              title={delivered ? 'Kiện này đã giao thành công' : '3. Giao thành công'}
              description={delivered && shipment.outcomeAt
                ? `Đã giao lúc ${trackingTime.format(new Date(shipment.outcomeAt))}`
                : 'Xác nhận đã giao sách đến người nhận'}
              badge={delivered ? '✓ Đã giao' : canDeliver ? 'Bấm hoàn tất' : awaitingStart ? 'Chờ đi giao' : 'Chờ kết quả'}
              delivered={delivered} waiting={!canDeliver} disabled={busy || !canDeliver}
              onClick={() => onChoose('Delivered')}
            />
          )}
        </li>
      </ol>
      {canAct && !onDemoStart && <button type="button" className={styles.failBtn} disabled={busy}
        onClick={() => onChoose('Failed')}>Giao không thành công</button>}
    </>
  )
}

export function AuctionDriverView({
  code, onSearch, demoMode,
}: { code: string; onSearch: (code: string) => void; demoMode: boolean }) {
  const session = useSession()
  const ownerId = session.status === 'authenticated' ? session.user.id : undefined
  return <AuctionDriverSession key={ownerId ?? session.status} code={code} ownerId={ownerId}
    loadingSession={session.status === 'loading'} onSearch={onSearch} demoMode={demoMode} />
}

function AuctionDriverSession({
  code, ownerId, loadingSession, onSearch, demoMode,
}: { code: string; ownerId?: string; loadingSession: boolean; onSearch: (code: string) => void; demoMode: boolean }) {
  const queryClient = useQueryClient()
  const recentTracked = useQuery({
    queryKey: ['auction-driver-recent', ownerId],
    queryFn: async () => {
      const page = await listMyAuctions('won')
      const candidates = page.items.filter((item) => item.won).slice(0, 6)
      const participations = await Promise.allSettled(candidates.map((item) => getMyParticipation(item.auction.id)))
      const orderIds = participations
        .filter((res): res is PromiseFulfilledResult<Awaited<ReturnType<typeof getMyParticipation>>> => res.status === 'fulfilled')
        .map((res) => res.value.orderId)
        .filter((id): id is string => Boolean(id))
      const orders = await Promise.allSettled(orderIds.map((id) => getMyPointOrder(id)))
      return orders
        .filter((res): res is PromiseFulfilledResult<PointOrder> => res.status === 'fulfilled')
        .map((res) => res.value)
        .filter((item) => Boolean(item.delivery?.trackingCode) && ['InTransit', 'Inspection'].includes(item.state))
    },
    enabled: !!ownerId,
    refetchInterval: 4_000,
    retry: false,
  })
  const recentItems = recentTracked.data ?? []
  const activeCode = code || recentItems[0]?.delivery?.trackingCode || ''
  const tracking = useQuery({
    queryKey: ['point-order-delivery-tracking', ownerId, activeCode],
    queryFn: () => getPointDeliveryTracking(activeCode),
    enabled: !!ownerId && !!activeCode,
    staleTime: 0,
    refetchInterval: (query) => query.state.data?.status === 'InTransit' ? 4_000 : false,
  })
  const [chosen, setChosen] = useState<Outcome | null>(null)
  const [pending, setPending] = useState<PointDeliveryEvent | null>(null)
  const [demoPending, setDemoPending] = useState<DemoAttempt | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)
  const busyRef = useRef(false)
  const shipment = tracking.isError ? undefined : tracking.data
  const demoDriver = shipment?.canDemoControl === true && (demoMode || shipment.viewer === 'Buyer')

  async function runDemo(step: DemoStep) {
    if (busyRef.current || !demoDriver || !shipment?.version) return
    const intent = demoPending ?? { step, orderId: shipment.orderId, version: shipment.version, key: crypto.randomUUID() }
    const send = intent.step === 'Start' ? demoStartPointDelivery : demoDeliverPointOrder
    busyRef.current = true
    setBusy(true)
    setMessage(null)
    try {
      await send(intent.orderId, intent.version, intent.key)
      setDemoPending(null)
      setMessage({ error: false, text: intent.step === 'Start'
        ? 'Bưu tá đã bắt đầu đi giao. Đơn đang ở bước Nhận sách.'
        : 'Đã ghi nhận hãng giao thành công trong mô phỏng. Quay lại đơn để người mua xác nhận đã nhận sách.' })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['point-order', intent.orderId] }),
        recentTracked.refetch(),
        tracking.refetch(),
      ])
    } catch (error) {
      const unknown = commandOutcomeUnknown(error)
      setDemoPending(unknown ? intent : null)
      setMessage({ error: true, text: unknown ? 'Chưa rõ hệ thống đã ghi nhận. Hãy thử lại cùng thao tác.' : commandError(error) })
      void tracking.refetch()
    } finally {
      setChosen(null)
      setBusy(false)
      busyRef.current = false
    }
  }

  async function report(outcome: Outcome) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setMessage(null)
    let event = pending
    try {
      if (!event) {
        const current = await getPointDeliveryTracking(activeCode)
        if (!current.canReport) {
          await tracking.refetch()
          setMessage({ error: true, text: 'Vận đơn đã đổi trạng thái. Kiểm tra lại thông tin ở trên.' })
          return
        }
        event = {
          eventId: crypto.randomUUID(), orderId: current.orderId, trackingCode: current.trackingCode,
          carrier: 'LatLaiSimulator', outcome, occurredAt: current.serverTime,
        }
      }
      await reportPointDelivery(event)
      setPending(null)
      setMessage({
        error: false,
        text: outcome === 'Delivered' ? 'Đã ghi nhận hãng giao thành công. Đơn đang chờ người mua xác nhận đã nhận.'
          : 'Đã ghi nhận giao không thành công. Đơn chuyển quản trị viên xử lý.',
      })
      void queryClient.invalidateQueries({ queryKey: ['point-order', event.orderId] })
      void recentTracked.refetch()
      await tracking.refetch()
    } catch (error) {
      const unknown = !!event && commandOutcomeUnknown(error)
      setPending(unknown ? event : null)
      setMessage({ error: true, text: unknown ? 'Chưa rõ hệ thống đã ghi nhận kết quả. Thử lại cùng lần báo này.' : commandError(error) })
      if (!unknown) void tracking.refetch()
    } finally {
      setChosen(null)
      setBusy(false)
      busyRef.current = false
    }
  }

  return (
    <DriverWorkspace
      mode="auction"
      subtitle={demoDriver ? 'Mô phỏng bưu tá · Đấu giá' : shipment?.viewer === 'Operator' ? 'Điều phối bưu tá · Đấu giá' : 'Theo dõi vận đơn · Đấu giá'}
      trackingCode={activeCode}
      searchLocked={busy || !!pending || !!demoPending}
      refresh={ownerId ? {
        loading: tracking.isFetching || recentTracked.isFetching,
        disabled: busy,
        run: () => {
          void recentTracked.refetch()
          if (activeCode) void tracking.refetch()
        },
      } : undefined}
      onSearch={(value) => {
          if (value.toUpperCase() === activeCode) {
            void recentTracked.refetch()
            if (ownerId && activeCode) void tracking.refetch()
          } else {
            onSearch(value)
          }
      }}
    >
        {ownerId && recentItems.length > 0 && (
          <div className={styles.chipsSection}>
            <p className={styles.chipsLabel}>Chọn nhanh đơn đấu giá đang giao</p>
            <div className={styles.chipsRow}>
              {recentItems.map((item) => {
                const itemCode = item.delivery?.trackingCode ?? ''
                if (!itemCode) return null
                const isActive = itemCode === activeCode
                const statusLabel = item.delivery?.deliveredAt || item.state === 'Inspection'
                  ? '✓ Đã giao'
                  : item.delivery?.demoOutForDeliveryAt
                    ? '🛵 Đang giao'
                    : '📦 Chờ đi giao'
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.chip} ${isActive ? styles.chipActive : ''}`}
                    onClick={() => onSearch(itemCode)}
                  >
                    <span className={styles.chipCode}>{itemCode}</span>
                    <span className={styles.chipStatus}>{statusLabel}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {!ownerId && !loadingSession ? (
          <section className={styles.auctionShipment}>
            <h2>Đăng nhập để xem vận đơn</h2>
            <p>Vận đơn đấu giá chỉ hiển thị cho người nhận hoặc người vận hành mô phỏng được cấp quyền.</p>
            <Link className={styles.auctionAction} to={`${ROUTES.login}?returnUrl=${encodeURIComponent(activeCode ? ROUTES.driver(activeCode, demoMode) : '/driver?kind=auction&demo=1')}`}>Đăng nhập</Link>
          </section>
        ) : !activeCode ? (
          <div className={styles.emptyBox}>
            <p className={styles.emptyTitle}>Chưa có đơn đấu giá nào đang giao</p>
            <p className={styles.emptyDesc}>Khi đơn thắng đấu giá chọn giao tận nơi đã bàn giao hãng, vận đơn sẽ tự hiện tại đây hoặc bạn có thể nhập mã (dạng LL-...) vào ô phía trên.</p>
          </div>
        ) : tracking.isError ? (
          <section className={styles.auctionShipment} role="alert">
            <h2>{tracking.error instanceof ApiError && [403, 404].includes(tracking.error.status)
              ? 'Không tìm thấy vận đơn trong tài khoản này' : 'Chưa tải được vận đơn'}</h2>
            <p>Kiểm tra mã vận đơn, tài khoản đăng nhập hoặc thử làm mới.</p>
            {tracking.error instanceof ApiError && tracking.error.status === 404 &&
              <Link className={styles.auctionBack} to={`${ROUTES.driver(activeCode)}&kind=exchange`}>Tra cứu mã của phiếu trao đổi</Link>}
          </section>
        ) : !shipment ? (
          <p className={styles.loadingBox} role="status">Đang tra cứu vận đơn…</p>
        ) : demoDriver ? (
          <>
            <Link className={styles.auctionBack} to={ROUTES.auctionOrder(shipment.auctionId)}>
              <ArrowLeft size={16} aria-hidden="true" /> Về đơn đấu giá
            </Link>
            <AuctionOperatorParcel shipment={shipment}
              canAct={shipment.status === 'InTransit' && !demoPending}
              busy={busy} onChoose={setChosen} onDemoStart={() => void runDemo('Start')} />
          </>
        ) : shipment.viewer === 'Operator' ? (
          <AuctionOperatorParcel shipment={shipment} canAct={shipment.canReport && !pending && message?.error !== false}
            busy={busy} onChoose={setChosen} />
        ) : (
            <section className={styles.auctionShipment} aria-labelledby="auction-shipment-title">
              <p className={styles.auctionTrackingMeta}>Đấu giá <strong>{shipment.trackingCode}</strong></p>
              <h2 id="auction-shipment-title">{titles[shipment.status]}</h2>
              <p>{shipment.title} · {shipment.pointName}</p>
              <AuctionShipmentTimeline status={shipment.status} dispatchedAt={shipment.dispatchedAt}
                outForDeliveryAt={shipment.demoOutForDeliveryAt} outcomeAt={shipment.outcomeAt} />
              <Link className={styles.auctionBack} to={ROUTES.auctionOrder(shipment.auctionId)}>
                <ArrowLeft size={16} aria-hidden="true" /> Về đơn đấu giá
              </Link>
            </section>
        )}
        {message && <p className={styles.auctionFeedback} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
        {pending && <button type="button" className={styles.auctionAction} disabled={busy}
          onClick={() => void report(pending.outcome)}>Thử lại báo kết quả</button>}
        {demoPending && <button type="button" className={styles.auctionAction} disabled={busy}
          onClick={() => void runDemo(demoPending.step)}>Thử lại thao tác demo</button>}
        <ConfirmDialog
          isOpen={!!chosen}
          onClose={() => { if (!busy) setChosen(null) }}
          title={chosen === 'Failed' ? 'Ghi nhận giao không thành công?' : 'Ghi nhận giao thành công?'}
          description={chosen === 'Failed' ? 'Đơn đấu giá sẽ được chuyển cho quản trị viên xử lý.'
            : 'Thời hạn kiểm tra bắt đầu khi người mua xác nhận đã nhận sách.'}
          confirmText="Ghi nhận kết quả"
          isBusy={busy}
          onConfirm={() => {
            if (chosen && demoDriver) void runDemo('Deliver')
            else if (chosen) void report(chosen)
          }}
        />
    </DriverWorkspace>
  )
}
