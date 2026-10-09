import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { timeAgo, useOpenNotification } from '../hooks/useOpenNotification'
import { useSession } from '../hooks/useSession'
import { ROUTES } from '../lib/routes'
import { listNotifications, markNotificationsRead } from '../services/notifications'

export function NotificationsPage() {
  const session = useSession()
  const queryClient = useQueryClient()
  const openNotification = useOpenNotification()
  const pages = useInfiniteQuery({
    queryKey: ['notifications', 'page'],
    queryFn: ({ pageParam }) => listNotifications(pageParam, 20),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: session.status === 'authenticated',
    retry: false,
  })

  if (session.status !== 'authenticated')
    return (
      <main className="max-w-2xl mx-auto px-5 py-10">
        <h1 className="font-headline-md text-3xl font-bold text-primary">Thông báo</h1>
        <p>{session.status === 'loading' ? 'Đang kiểm tra đăng nhập…' : 'Đăng nhập để xem thông báo của bạn.'}</p>
        {session.status === 'anonymous' && <Link to={ROUTES.login} className="font-semibold text-primary-container underline">Đăng nhập</Link>}
      </main>
    )

  const items = pages.data?.pages.flatMap((p) => p.items) ?? []
  const unread = pages.data?.pages[0]?.unreadCount ?? 0
  const readAll = async () => {
    await markNotificationsRead({ all: true }).catch(() => undefined)
    void queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }
  return (
    <main className="max-w-2xl mx-auto px-5 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-outline-variant pb-4 mb-4">
        <div>
          <h1 className="font-headline-md text-3xl font-bold text-primary m-0">Thông báo</h1>
          <p className="m-0 mt-1 text-on-surface-variant">{unread ? `${unread} chưa đọc` : 'Bạn đã đọc hết thông báo.'}</p>
        </div>
        {unread > 0 && (
          <button type="button" className="min-h-[44px] px-4 border border-outline-variant rounded-full font-semibold" onClick={() => void readAll()}>
            Đánh dấu đã đọc hết
          </button>
        )}
      </header>
      {pages.isPending && <p>Đang tải thông báo…</p>}
      {pages.isError && (
        <div role="alert">
          <p>Chưa tải được thông báo.</p>
          <button type="button" className="min-h-[44px] px-4 border border-outline-variant rounded" onClick={() => void pages.refetch()}>Thử lại</button>
        </div>
      )}
      {pages.data && items.length === 0 && <p className="text-on-surface-variant">Chưa có thông báo nào. Khi bạn bị vượt giá, thắng phiên hoặc có thay đổi ở phiên của bạn, thông báo sẽ xuất hiện ở đây.</p>}
      <ul className="list-none m-0 p-0 flex flex-col gap-2">
        {items.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => openNotification(n)}
              className={`w-full text-left grid grid-cols-[10px_1fr] gap-3 p-4 rounded-xl border ${n.readAt ? 'bg-white border-[#ece4d5]' : 'bg-[#faf7f0] border-[#d9cfbd]'}`}
            >
              <span aria-hidden="true" className={`w-2 h-2 mt-2 rounded-full ${n.readAt ? '' : 'bg-[#b85c45]'}`} />
              <span className="grid gap-1 min-w-0">
                <strong className="text-on-surface">{n.title}</strong>
                <span className="text-sm text-on-surface-variant leading-snug [overflow-wrap:anywhere]">{n.body}</span>
                <small className="text-xs text-on-surface-variant">{timeAgo(n.createdAt)}{n.readAt ? '' : ' · chưa đọc'}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {pages.hasNextPage && (
        <button type="button" className="mt-4 min-h-[44px] px-5 border border-outline-variant rounded" disabled={pages.isFetchingNextPage} onClick={() => void pages.fetchNextPage()}>
          {pages.isFetchingNextPage ? 'Đang tải…' : 'Xem thêm'}
        </button>
      )}
    </main>
  )
}
