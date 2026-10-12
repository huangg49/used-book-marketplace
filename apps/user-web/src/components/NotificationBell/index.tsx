import { useEffect, useId, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import { timeAgo, useOpenNotification } from '../../hooks/useOpenNotification'
import { listNotifications, markNotificationsRead } from '../../services/notifications'
import styles from './NotificationBell.module.css'

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const queryClient = useQueryClient()
  const openNotification = useOpenNotification()
  // Realtime is supplementary (FR-N03): the inbox is polled and refreshed on auction pushes.
  const inbox = useQuery({ queryKey: ['notifications', 'bell'], queryFn: () => listNotifications(undefined, 8), refetchInterval: 30_000, retry: false })
  const unread = inbox.data?.unreadCount ?? 0

  useEffect(() => {
    if (!open) return
    const outside = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape) }
  }, [open])

  const readAll = async () => {
    await markNotificationsRead({ all: true }).catch(() => undefined)
    void queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={styles.bell}
        aria-label={unread ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => { setOpen((v) => !v); if (!open) void inbox.refetch() }}
      >
        <Bell size={20} aria-hidden="true" />
        {unread > 0 && <span className={styles.badge} aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div id={panelId} className={styles.panel} role="region" aria-label="Thông báo gần đây">
          <div className={styles.head}>
            <strong>Thông báo</strong>
            {unread > 0 && <button type="button" className={styles.link} onClick={() => void readAll()}>Đánh dấu đã đọc hết</button>}
          </div>
          {inbox.isPending ? (
            <p className={styles.empty}>Đang tải…</p>
          ) : inbox.isError ? (
            <p className={styles.empty}>Chưa tải được thông báo. <button type="button" className={styles.link} onClick={() => void inbox.refetch()}>Thử lại</button></p>
          ) : inbox.data.items.length === 0 ? (
            <p className={styles.empty}>Chưa có thông báo nào.</p>
          ) : (
            <ul className={styles.list}>
              {inbox.data.items.map((n) => (
                <li key={n.id}>
                  <button type="button" className={`${styles.item} ${n.readAt ? '' : styles.unread}`} onClick={() => { setOpen(false); openNotification(n) }}>
                    <span className={styles.dot} aria-hidden="true" />
                    <span className={styles.text}>
                      <strong>{n.title}</strong>
                      <span>{n.body}</span>
                      <small>{timeAgo(n.createdAt)}{n.readAt ? '' : ' · chưa đọc'}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link className={styles.all} to={ROUTES.notifications} onClick={() => setOpen(false)}>Xem tất cả thông báo</Link>
        </div>
      )}
    </div>
  )
}
