import { z } from 'zod'
import { session } from '../lib/session'

// Auction reads and commands (OpenAPI 0.27.0, tag Auctions). Ceilings are never
// public; the caller's own ceiling only comes from /me/auctions/{id}/participation.
const money = z.number().int()
const auctionState = z.enum(['Active', 'BuyNowPending', 'AwaitingWinnerPayment', 'Sold', 'Unsold', 'OnHold', 'Cancelled', 'PaymentExpired'])
export const auctionSummarySchema = z.object({
  id: z.string().uuid(), listingId: z.string().uuid(), title: z.string(), state: auctionState,
  startPrice: money, step: z.union([z.literal(10000), z.literal(50000)]), buyNowPrice: money.nullable(),
  currentPrice: money.nullable(), minimumBid: money.nullable(), bidderCount: z.number().int(),
  startAt: z.string(), endAt: z.string(), pointName: z.string(), demoOnly: z.literal(true),
})
const auctionListSchema = z.object({ items: z.array(auctionSummarySchema), serverTime: z.string() })
export const auctionSchema = z.object({
  auction: auctionSummarySchema, leaderAlias: z.number().int().nullable(),
  history: z.array(z.object({ price: money, bidderAlias: z.number().int(), at: z.string() })), serverTime: z.string(),
})
const participationSchema = z.object({
  auctionId: z.string().uuid(), alias: z.number().int().nullable(), mode: z.enum(['Manual', 'Auto']).nullable(),
  ownLevel: money.nullable(), boughtNow: z.boolean(), leading: z.boolean(), state: auctionState,
  currentPrice: money.nullable(), minimumBid: money.nullable(), fulfillmentMethod: z.literal('SelfCollect'),
  won: z.boolean(), orderId: z.string().uuid().nullable(), finalPrice: money.nullable(),
  paymentDeadline: z.string().nullable(), serverTime: z.string(),
})
const receiptSchema = z.object({
  id: z.string().uuid(), entityType: z.enum(['AuctionIntake', 'Auction', 'PointOrder']), entityId: z.string().uuid(),
  auctionId: z.string().uuid().nullable(), orderId: z.string().uuid().nullable(), version: z.number().int(),
  state: z.string(), currentPrice: money.nullable(), minimumBid: money.nullable(), leading: z.boolean().nullable(), serverTime: z.string(),
})
const pointOrderSchema = z.object({
  id: z.string().uuid(), auctionId: z.string().uuid().nullable(), title: z.string(), pointName: z.string(),
  role: z.enum(['Buyer', 'Seller']),
  state: z.enum(['AwaitingPayment', 'Fulfilling', 'ReadyForCollection', 'Inspection', 'ResolutionPending', 'ReturnPending', 'Completed', 'Cancelled', 'PaymentExpired']),
  version: z.number().int(), amounts: z.object({ bookPrice: money, buyerTotal: money }),
  paymentDeadline: z.string().nullable(), paidAt: z.string().nullable(), serverTime: z.string(),
})

export type AuctionState = z.infer<typeof auctionState>
export type AuctionSummary = z.infer<typeof auctionSummarySchema>
export type PublicAuction = z.infer<typeof auctionSchema>
export type AuctionParticipation = z.infer<typeof participationSchema>
export type PointOrder = z.infer<typeof pointOrderSchema>

export const AUCTION_MAX_PRICE = 1_000_000

export function listAuctions() { return session.publicRequest('/auctions', auctionListSchema) }
export function getAuction(id: string) { return session.publicRequest(`/auctions/${id}`, auctionSchema) }
export function getMyParticipation(id: string) { return session.request(`/me/auctions/${id}/participation`, participationSchema) }
export function getMyPointOrder(id: string) { return session.request(`/me/point-orders/${id}`, pointOrderSchema) }

function command(path: string, key: string, body: object, method = 'POST') {
  return session.request(path, receiptSchema, { method, headers: { 'Idempotency-Key': key }, body: JSON.stringify(body) })
}
export function placeBid(id: string, amount: number, key: string) { return command(`/auctions/${id}/bids`, key, { amount, fulfillmentMethod: 'SelfCollect' }) }
export function setAutoBid(id: string, maxAmount: number, key: string) { return command(`/auctions/${id}/auto-bid`, key, { maxAmount, fulfillmentMethod: 'SelfCollect' }, 'PUT') }
export function disableAutoBid(id: string, key: string) { return command(`/auctions/${id}/auto-bid/disable`, key, {}) }
export function buyNow(id: string, key: string) { return command(`/auctions/${id}/buy-now`, key, { fulfillmentMethod: 'SelfCollect' }) }
export function payPointOrder(orderId: string, expectedVersion: number, key: string) { return command(`/point-orders/${orderId}/pay`, key, { expectedVersion }) }

/** Amounts a bidder may enter: start + n·step, from the minimum bid up to the cap. */
export function bidOptions(minimum: number, step: number, count = 3) {
  const values: number[] = []
  for (let v = minimum; v <= AUCTION_MAX_PRICE && values.length < count; v += step) values.push(v)
  return values
}
