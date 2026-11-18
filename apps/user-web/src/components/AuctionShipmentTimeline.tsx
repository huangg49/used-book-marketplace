import { Check, CircleAlert, Clock3, PackageCheck, Truck } from 'lucide-react'
import styles from './AuctionShipmentTimeline.module.css'

type ShipmentStatus = 'Waiting' | 'InTransit' | 'Delivered' | 'Failed' | 'Overdue'
const deliveryTime = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
})

export function AuctionShipmentTimeline({
  status, dispatchedAt, outForDeliveryAt, outcomeAt,
}: { status: ShipmentStatus; dispatchedAt?: string | null; outForDeliveryAt?: string | null; outcomeAt?: string | null }) {
  const finished = status === 'Delivered'
  const issue = status === 'Failed' || status === 'Overdue'
  return (
    <ol className={styles.timeline} aria-label="Tiến trình vận chuyển">
      <li data-state={status === 'Waiting' ? 'active' : 'done'} aria-current={status === 'Waiting' ? 'step' : undefined}>
        <span className={styles.marker} aria-hidden="true">{status === 'Waiting' ? <Clock3 size={17} /> : <Check size={17} />}</span>
        <div><strong>{status === 'Waiting' ? 'Chờ bàn giao cho hãng' : 'Đã bàn giao cho hãng'}</strong>
          {dispatchedAt && <time dateTime={dispatchedAt}>{deliveryTime.format(new Date(dispatchedAt))}</time>}
        </div>
      </li>
      <li data-state={status === 'InTransit' ? 'active' : finished || issue ? 'done' : 'pending'} aria-current={status === 'InTransit' ? 'step' : undefined}>
        <span className={styles.marker} aria-hidden="true"><Truck size={17} /></span>
        <div><strong>{outForDeliveryAt ? 'Bưu tá bắt đầu đi giao' : 'Đang vận chuyển'}</strong>
          {outForDeliveryAt ? <time dateTime={outForDeliveryAt}>{deliveryTime.format(new Date(outForDeliveryAt))}</time>
            : status === 'InTransit' && <span>Hãng đã nhận kiện từ điểm giao nhận</span>}
        </div>
      </li>
      <li data-state={issue ? 'issue' : finished ? 'done' : 'pending'} aria-current={issue || finished ? 'step' : undefined}>
        <span className={styles.marker} aria-hidden="true">{issue ? <CircleAlert size={17} /> : <PackageCheck size={17} />}</span>
        <div><strong>{status === 'Overdue' ? 'Quá hạn giao' : issue ? 'Giao không thành công' : finished ? 'Đã giao thành công' : 'Giao tới người nhận'}</strong>
          {outcomeAt && <time dateTime={outcomeAt}>{deliveryTime.format(new Date(outcomeAt))}</time>}
        </div>
      </li>
    </ol>
  )
}
