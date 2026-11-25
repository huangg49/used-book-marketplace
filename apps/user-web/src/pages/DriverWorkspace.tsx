import type { ReactNode } from 'react'
import { BookOpen, Camera, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DriverTrackingSearch } from './DriverTrackingSearch'
import styles from './DriverPage.module.css'

export type DriverMode = 'exchange' | 'direct' | 'auction'

const DRIVER_MODES: Array<{ id: DriverMode; label: string; to: string }> = [
  { id: 'exchange', label: 'Trao đổi', to: '/driver?kind=exchange' },
  { id: 'direct', label: 'Mua ngay', to: '/driver?kind=direct' },
  { id: 'auction', label: 'Đấu giá', to: '/driver?kind=auction' },
]

export function DriverWorkspace({
  mode, subtitle, trackingCode, searchLocked, onSearch, refresh, back, children,
}: {
  mode?: DriverMode
  subtitle: string
  trackingCode: string
  searchLocked: boolean
  onSearch: (code: string) => void
  refresh?: { loading: boolean; disabled: boolean; run: () => void }
  back?: { to: string; label: string }
  children: ReactNode
}) {
  return (
    <div className={styles.container}>
      <main className={styles.mobileFrame}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.appTitle}>LẬT LẠI EXPRESS</h1>
            <p className={styles.driverName}>{subtitle}</p>
          </div>
          {refresh && <button type="button" className={`${styles.refreshBtn} ${styles.refreshControl}`}
            onClick={refresh.run} disabled={refresh.disabled || refresh.loading}>
            <RefreshCw size={15} aria-hidden="true" /> {refresh.loading ? 'Đang tải…' : 'Làm mới'}
          </button>}
        </header>
        {mode && (
          <nav className={styles.modeTabs} aria-label="Loại vận đơn">
            {DRIVER_MODES.map((item) => (
              <Link
                key={item.id}
                to={item.to}
                aria-current={mode === item.id ? 'page' : undefined}
                className={`${styles.modeTab} ${mode === item.id ? styles.modeTabActive : ''}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
        <DriverTrackingSearch key={trackingCode} initialCode={trackingCode} disabled={searchLocked} onSearch={onSearch} />
        {children}
        <Link to={back?.to ?? "/"} className={styles.backHomeLink}>← {back?.label ?? "Quay lại Trang chủ Lật Lại"}</Link>
      </main>
    </div>
  )
}

export function DriverParcelCard({
  label, trackingCode, badge, summary, children,
}: { label: string; trackingCode: string; badge: ReactNode; summary: string; children: ReactNode }) {
  return (
    <section className={styles.orderCard} aria-label="Thông tin kiện sách">
      <div className={styles.orderHeaderRow}>
        <div>
          <p className={styles.trackingLabel}>{label}</p>
          <p className={styles.trackingCode}>{trackingCode}</p>
        </div>
        {badge}
      </div>
      <div className={styles.divider} />
      <div className={styles.itemRow}>
        <BookOpen size={17} aria-hidden="true" />
        <p className={styles.itemSummary}>{summary}</p>
      </div>
      {children}
    </section>
  )
}

export function DriverParcelRoute({
  pickup, dropoff,
}: { pickup: { label: string; name: string; detail?: string }; dropoff: { label: string; name: string; detail?: string } }) {
  return (
    <div className={styles.routeContainer} role="group" aria-label="Lộ trình giao sách">
      <div className={styles.stopRow}>
        <span className={styles.stopDotPickup} aria-hidden="true" />
        <div>
          <p className={styles.stopType}>{pickup.label}</p>
          <p className={styles.personName}>{pickup.name}</p>
          {pickup.detail && <p className={styles.addressText}>{pickup.detail}</p>}
        </div>
      </div>
      <div className={styles.routeLine} aria-hidden="true" />
      <div className={styles.stopRow}>
        <span className={styles.stopDotDelivery} aria-hidden="true" />
        <div>
          <p className={styles.stopType}>{dropoff.label}</p>
          <p className={styles.personName}>{dropoff.name}</p>
          {dropoff.detail && <p className={styles.addressText}>{dropoff.detail}</p>}
        </div>
      </div>
    </div>
  )
}

export function DriverCompleteAction({
  title, description, badge, delivered, waiting, disabled, onClick,
}: {
  title: string; description: string; badge: string; delivered: boolean
  waiting?: boolean; disabled: boolean; onClick: () => void
}) {
  const badgeStyle = delivered ? styles.stepBadgeDoneWhite : waiting ? styles.stepBadgeWaitingWhite : styles.stepBadgeNextWhite
  return (
    <button type="button" aria-label={title} aria-description={description}
      className={`${styles.actionBtn} ${delivered ? styles.actionBtnFinishDelivered : styles.actionBtnFinish}`}
      disabled={disabled} onClick={onClick}>
      <Camera size={22} className={styles.actionBtnIcon} aria-hidden="true" />
      <span className={styles.actionBtnContent}>
        <span className={styles.actionBtnTitleWhite}>{title}</span>
        <span className={styles.actionBtnDescWhite}>{description}</span>
      </span>
      <span className={badgeStyle}>{badge}</span>
    </button>
  )
}
