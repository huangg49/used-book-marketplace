import { z } from 'zod'
import type { components } from '@used-books/api-contract'
import { session } from '../lib/session'
import { exchangeHandoverAnchor } from '../lib/exchange-handover'

// Durable inbox (FR-N03/N04, OpenAPI 0.30.0). The server writes rows in the same
// transaction as the event; pages only read and mark them read.
export const notificationSchema = z.object({
  id: z.string().uuid(),
  // Every kind in the contract: one unknown kind would fail the whole page.
  kind: z.enum([
    'AuctionOutbid',
    'AuctionFundsHeld',
    'AuctionFundsReleased',
    'AuctionBiddingStarted',
    'AuctionNotEnoughBidders',
    'AuctionDepositForfeited',
    'AuctionRescheduled',
    'AuctionResumed',
    'AuctionSecondChanceOffered',
    'AuctionDepositShareReceived',
    'AuctionWon',
    'AuctionSold',
    'AuctionBoughtNow',
    'AuctionUnsold',
    'AuctionCancelled',
    'AuctionOnHold',
    'AuctionPaymentExpired',
    'AuctionPaid',
    'OrderBuyNowPaid',
    'ExchangeProposed',
    'ExchangeAccepted',
    'ExchangeFunded',
    'ExchangeShipped',
    'ExchangeReceived',
    'ExchangeCompleted',
    'ExchangeCancelled',
    'ExchangeRejected',
    'ExchangeDisputed',
    'WithdrawalUpdated',
    'SupportUpdated',
    'ReviewModerated',
  ]),
  title: z.string(),
  body: z.string(),
  targetType: z.enum(['Auction', 'Exchange', 'Order', 'SupportCase', 'TransactionReview', 'Withdrawal']),
  targetId: z.string().uuid(),
  createdAt: z.string(),
  readAt: z.string().nullable(),
})
const pageSchema = z.object({ items: z.array(notificationSchema), unreadCount: z.number().int(), nextCursor: z.string().nullable() })
const unreadSchema = z.object({ unreadCount: z.number().int() })

export type MemberNotification = z.infer<typeof notificationSchema>
// Fails to compile when the contract gains or drops a kind this list lacks.
type ContractKind = components['schemas']['MemberNotification']['kind']
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
export const notificationKindsMatchContract: Same<MemberNotification['kind'], ContractKind> = true
export type NotificationPage = z.infer<typeof pageSchema>
export const notificationKeys={
  pages:(owner:string|undefined)=>['notifications',owner,'pages'] as const,
  bell:(owner:string|undefined)=>['notifications',owner,'bell'] as const,
};
// All compact previews share the same first eight rows and authoritative count.
// Infinite inbox pages keep a separate key and response shape.
export function notificationPreviewQuery(owner: string | undefined) {
  return {
    queryKey: notificationKeys.bell(owner),
    queryFn: () => listNotifications(undefined, 8),
    enabled: Boolean(owner),
    retry: false as const,
  };
}
export function notificationPath(n:Pick<MemberNotification,'targetType'|'targetId'> & Partial<Pick<MemberNotification,'kind'>>){
  switch(n.targetType){
    case 'Withdrawal':return `/wallet?withdrawal=${n.targetId}`;
    case 'SupportCase':return `/support/${n.targetId}`;
    case 'TransactionReview':return `/reviews?reviewId=${encodeURIComponent(n.targetId)}`;
    case 'Order':return `/orders/${n.targetId}`;
    case 'Exchange': {
      const path = `/exchange/${n.targetId}`;
      if (n.kind === 'ExchangeShipped') return `${path}#${exchangeHandoverAnchor.incoming}`;
      // Carrier updates can notify both members with the same kind.
      if (n.kind === 'ExchangeReceived') return `${path}#${exchangeHandoverAnchor.overview}`;
      return path;
    }
    case 'Auction':return `/auctions/${n.targetId}`;
    default:return '/notifications';
  }
}

export function listNotifications(cursor?: string, limit = 20) {
  const query = new URLSearchParams({ limit: String(limit) })
  if (cursor) query.set('cursor', cursor)
  return session.request(`/me/notifications?${query}`, pageSchema)
}
export function markNotificationsRead(input: { ids: string[] } | { all: true }) {
  return session.request('/me/notifications/read', unreadSchema, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(input) })
}
