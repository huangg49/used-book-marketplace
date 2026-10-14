import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../lib/routes'
import { markNotificationsRead, type MemberNotification } from '../services/notifications'

export function timeAgo(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000))
  if (s < 60) return 'vừa xong'
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`
  if (s < 86_400) return `${Math.floor(s / 3600)} giờ trước`
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

/** Opens the notification's object and marks it read; the inbox stays the source of truth. */
export function useOpenNotification() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return (n: MemberNotification) => {
    if (!n.readAt)
      void markNotificationsRead({ ids: [n.id] })
        .catch(() => undefined)
        .finally(() => void queryClient.invalidateQueries({ queryKey: ['notifications'] }))
    if (n.targetType === 'Exchange') {
      navigate(`/exchange/${n.targetId}`)
    } else {
      navigate(ROUTES.auctionDetail(n.targetId))
    }
  }
}

