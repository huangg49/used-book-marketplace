import { z } from 'zod'
import { session } from '../lib/session'

// Auction reads and commands (OpenAPI 0.27.0, tag Auctions). Ceilings are never
// public; the caller's own ceiling only comes from /me/auctions/{id}/participation.
const money = z.number().int()
const auctionState = z.enum(['Active', 'BuyNowPending', 'AwaitingWinnerPayment', 'Sold', 'Unsold', 'OnHold', 'Cancelled', 'PaymentExpired'])
const auctionBookSchema = z.object({
  revisionId: z.string().uuid(), authors: z.array(z.string()), condition: z.enum(['LikeNew', 'Good', 'Fair', 'Worn']),
  pages: z.string(), coverNote: z.string(), notes: z.string(), accessories: z.string(), description: z.string(),
  hasMissingPages: z.boolean(), photos: z.array(z.object({ id: z.string().uuid(), width: z.number().positive(), height: z.number().positive() })),
})
export const auctionSummarySchema = z.object({
  id: z.string().uuid(), listingId: z.string().uuid(), title: z.string(), state: auctionState,
  startPrice: money, step: z.union([z.literal(10000), z.literal(50000)]), buyNowPrice: money.nullable(),
  currentPrice: money.nullable(), minimumBid: money.nullable(), bidderCount: z.number().int(),
  startAt: z.string(), endAt: z.string(), pointName: z.string(), demoOnly: z.literal(true),
  // ADR 0043: when Buy Now opened the 60-second window (endAt already shortened).
  buyNowAt: z.string().nullish(),
  // ADR 0047: Scheduled before startAt; version lets the seller edit the time.
  phase: z.enum(['Scheduled', 'Live', 'Ended']).nullish(),
  version: z.number().int().nullish(),
  scheduleRevision: z.number().int().nullish(),
  book: auctionBookSchema.nullish(),
})
const auctionListSchema = z.object({ items: z.array(auctionSummarySchema), serverTime: z.string() })
const myAuctionPageSchema = z.object({ items: z.array(z.object({ auction: auctionSummarySchema,
  role: z.enum(['Seller', 'Bidder']), leading: z.boolean(), won: z.boolean(), needsPayment: z.boolean(), paymentDeadline: z.string().nullable(),
})), nextCursor: z.string().nullable(), serverTime: z.string() })
export type MyAuctionItem = z.infer<typeof myAuctionPageSchema>['items'][number]
export function listMyAuctions(view = 'all', cursor?: string) {
  const params = new URLSearchParams({ limit: '12', view })
  if (cursor) params.set('cursor', cursor)
  return session.request(`/me/auctions?${params}`, myAuctionPageSchema)
}
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
const deliverySchema = z.object({
  recipientName: z.string(), phone: z.string(), localityCode: z.string(), detail: z.string(),
  outboundFee: z.number().int(), trackingCode: z.string().nullable(), dispatchedAt: z.string().nullable(),
  deliveryDeadline: z.string().nullable(), deliveredAt: z.string().nullable(),
})
const deliveryQuoteSchema = z.object({
  addressId: z.string().uuid(), addressVersion: z.number().int(), outboundFee: z.number().int(), buyerTotal: money,
})
const addressListSchema = z.object({
  items: z.array(z.object({
    id: z.string().uuid(), version: z.number().int(), recipientName: z.string(), detail: z.string(),
    serviceAreaCode: z.string(), isDefault: z.boolean(),
  }).passthrough()),
}).passthrough()
const pointOrderSchema = z.object({
  id: z.string().uuid(), auctionId: z.string().uuid().nullable(), title: z.string(), pointName: z.string(),
  role: z.enum(['Buyer', 'Seller']),
  state: z.enum(['AwaitingPayment', 'Fulfilling', 'ReadyForCollection', 'InTransit', 'Inspection', 'ResolutionPending', 'ReturnPending', 'Completed', 'Cancelled', 'PaymentExpired']),
  version: z.number().int(), amounts: z.object({ bookPrice: money, outboundFee: z.number().int().default(0), buyerTotal: money }),
  // ADR 0044: older servers had pickup only; only the buyer receives the address.
  fulfillmentMethod: z.enum(['SelfCollect', 'CarrierOutbound']).default('SelfCollect'),
  delivery: deliverySchema.nullable().default(null),
  paymentDeadline: z.string().nullable(), paidAt: z.string().nullable(), serverTime: z.string(),
  // Condition check at the point (FR-T02): never an authenticity claim.
  report: z.object({ outcome: z.literal('Pass'), inspectedAt: z.string(), note: z.string().nullable(), scope: z.string() }),
  acceptanceDeadline: z.string().nullable(), acceptedAt: z.string().nullable(),
  collectionDeadline: z.string().nullable(), collectedAt: z.string().nullable(),
  inspectionDeadline: z.string().nullable(), returnDeadline: z.string().nullable(), refunded: z.boolean(),
  resolution: z.object({
    reason: z.enum(['ReportRejected', 'RecipientDecisionOverdue', 'CollectionOverdue', 'InspectionClaim', 'ReturnOverdue', 'DeliveryFailed']),
    openedAt: z.string(),
  }).nullable(),
})

export type AuctionState = z.infer<typeof auctionState>
export type AuctionSummary = z.infer<typeof auctionSummarySchema>
export type PublicAuction = z.infer<typeof auctionSchema>
export type AuctionParticipation = z.infer<typeof participationSchema>
export type PointOrder = z.infer<typeof pointOrderSchema>

export const AUCTION_MAX_PRICE = 1_000_000

export function listAuctions(phase: 'live' | 'upcoming' = 'live') {
  return session.publicRequest(phase === 'live' ? '/auctions' : `/auctions?phase=${phase}`, auctionListSchema)
}

export type AuctionPhase = 'Scheduled' | 'Live' | 'Ended'
/** ADR 0047 phase; older servers send none, so derive it from the server time. */
export function auctionPhase(a: Pick<AuctionSummary, 'phase' | 'state' | 'startAt' | 'endAt'>, serverTime?: string): AuctionPhase {
  if (a.phase) return a.phase
  const now = serverTime ? Date.parse(serverTime) : Date.now()
  if (a.state !== 'Active' || now >= Date.parse(a.endAt)) return 'Ended'
  return now < Date.parse(a.startAt) ? 'Scheduled' : 'Live'
}

// ADR 0047 limits, mirrored for the form; the server stays authoritative.
export const AUCTION_MIN_HOURS = 1
export const AUCTION_MAX_HOURS = 168
export const AUCTION_MIN_LEAD_MS = 5 * 60_000
export const AUCTION_SCHEDULE_HORIZON_MS = 7 * 24 * 3_600_000
export const AUCTION_MAX_SCHEDULE_EDITS = 5
export type ScheduleBody = { expectedVersion: number; startAt: string | null; durationHours: number }
/** The seller publishes a Passed intake now (startAt null) or at a later time. */
export function publishAuction(intakeId: string, body: ScheduleBody, key: string) {
  return command(`/auction-intakes/${intakeId}/publish`, key, body)
}
/** Before the first bid: move the start (scheduled) or the length (live). */
export function rescheduleAuction(auctionId: string, body: ScheduleBody, key: string) {
  return command(`/auctions/${auctionId}/schedule`, key, body)
}
export function getAuction(id: string) { return session.publicRequest(`/auctions/${id}`, auctionSchema) }
export function getAuctionPhoto(id: string, mediaId: string) {
  return session.publicRequest(`/auctions/${id}/photos/${mediaId}`, z.object({ id: z.string().uuid(), url: z.string().url(), expiresAt: z.string(), width: z.number(), height: z.number() }))
}
export function getMyParticipation(id: string) { return session.request(`/me/auctions/${id}/participation`, participationSchema) }
export function getMyPointOrder(id: string) { return session.request(`/me/point-orders/${id}`, pointOrderSchema) }

function command(path: string, key: string, body: object, method = 'POST') {
  return session.request(path, receiptSchema, { method, headers: { 'Idempotency-Key': key }, body: JSON.stringify(body) })
}
export function placeBid(id: string, amount: number, key: string) { return command(`/auctions/${id}/bids`, key, { amount, fulfillmentMethod: 'SelfCollect' }) }
export function setAutoBid(id: string, maxAmount: number, key: string) { return command(`/auctions/${id}/auto-bid`, key, { maxAmount, fulfillmentMethod: 'SelfCollect' }, 'PUT') }
export function disableAutoBid(id: string, key: string) { return command(`/auctions/${id}/auto-bid/disable`, key, {}) }
export function buyNow(id: string, key: string) { return command(`/auctions/${id}/buy-now`, key, { fulfillmentMethod: 'SelfCollect' }) }
// ADR 0044: delivery carries the address version and the fee the buyer saw.
export type DeliveryChoice = { addressId: string; addressVersion: number; fee: number }
export function payPointOrder(orderId: string, expectedVersion: number, key: string, delivery?: DeliveryChoice) {
  return command(`/point-orders/${orderId}/pay`, key, delivery
    ? {
        expectedVersion, fulfillmentMethod: 'CarrierOutbound', destinationAddressId: delivery.addressId,
        expectedDestinationAddressVersion: delivery.addressVersion, expectedOutboundFee: delivery.fee,
      }
    : { expectedVersion })
}
export function getPointOrderDeliveryQuote(orderId: string, addressId: string) {
  return session.request(`/me/point-orders/${orderId}/delivery-quote?addressId=${addressId}`, deliveryQuoteSchema)
}
export function getMyAddresses() { return session.request('/me/addresses', addressListSchema) }
// Buyer steps after payment (FR-H09/H11, FR-T03). The server checks every deadline.
export function acceptPointOrderReport(orderId: string, expectedVersion: number, key: string) {
  return command(`/point-orders/${orderId}/accept-report`, key, { expectedVersion })
}
export function rejectPointOrderReport(orderId: string, expectedVersion: number, reason: string, key: string) {
  return command(`/point-orders/${orderId}/reject-report`, key, { expectedVersion, reason })
}
export function claimPointOrder(orderId: string, expectedVersion: number, description: string, key: string) {
  return command(`/point-orders/${orderId}/claim`, key, { expectedVersion, description })
}
const codeIssuedSchema = z.object({
  receipt: receiptSchema.extend({ codeExpiresAt: z.string().nullable() }),
  // Null on a replay: a code is shown once and never stored in receipts.
  code: z.string().regex(/^[0-9]{6}$/).nullable(),
})
export type CodeIssued = z.infer<typeof codeIssuedSchema>
export function requestCollectionCode(orderId: string, expectedVersion: number, key: string) {
  return session.request(`/point-orders/${orderId}/collection-code`, codeIssuedSchema, {
    method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ expectedVersion }),
  })
}
export const CLAIM_MIN_LENGTH = 30

/** Amounts a bidder may enter: start + n·step, from the minimum bid up to the cap. */
export function bidOptions(minimum: number, step: number, count = 3) {
  const values: number[] = []
  for (let v = minimum; v <= AUCTION_MAX_PRICE && values.length < count; v += step) values.push(v)
  return values
}

// Seller side: the caller's own intakes tell the detail page that this auction
// is theirs (public reads never expose the seller).
const intakeState = z.enum(['AwaitingDropoff', 'Received', 'NeedsEvidence', 'Passed', 'Auctioning', 'ReclaimRequired', 'Reclaimed', 'Cancelled', 'Sold'])
const myIntakeSchema = z.object({
  id: z.string().uuid(), auctionId: z.string().uuid().nullable(), state: intakeState, version: z.number().int(),
  listingId: z.string().uuid(), title: z.string(), pointId: z.string().uuid(),
  startPrice: money, step: z.union([z.literal(10000), z.literal(50000)]), buyNowPrice: money.nullable(), protectiveValue: money,
  createdAt: z.string(), dropoffDeadline: z.string(), receivedAt: z.string().nullable(), inspectedAt: z.string().nullable(),
  inspectionOutcome: z.enum(['Pass', 'Fail', 'NeedsEvidence']).nullable(), inspectionNote: z.string().nullable(),
  reclaimReason: z.string().nullable(), closedAt: z.string().nullable(),
  evidenceDeadline: z.string().nullable(), evidenceNote: z.string().nullable(), evidenceSubmittedAt: z.string().nullable(),
})
export type IntakeState = z.infer<typeof intakeState>
export type MyIntake = z.infer<typeof myIntakeSchema>
export function getMyAuctionIntakes() {
  return session.request('/me/auction-intakes', z.object({ items: z.array(myIntakeSchema) }))
}
const intakeReceiptSchema = z.object({ id: z.string().uuid(), entityType: z.string(), state: z.string(), version: z.number().int() })
/** FR-AU02: withdraw before the first bid; the server rechecks under the auction lock. */
export function withdrawIntake(intakeId: string, expectedVersion: number, key: string) {
  return session.request(`/auction-intakes/${intakeId}/cancel`, intakeReceiptSchema, {
    method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ expectedVersion }),
  })
}

// N4-12 (FR-T02, POL-09): one written answer before the 48-hour deadline.
export const EVIDENCE_MIN_LENGTH = 20
export function submitIntakeEvidence(intakeId: string, expectedVersion: number, note: string, key: string) {
  return session.request(`/me/auction-intakes/${intakeId}/evidence`, intakeReceiptSchema, {
    method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ expectedVersion, note }),
  })
}

export function getMyAuctionIntake(id: string) { return session.request(`/me/auction-intakes/${id}`, myIntakeSchema) }

// Seller intake (FR-AU01, POL-39/41): an approved, visible, available Sale listing
// is snapshotted with its price grid and one point slot; self drop-off within 72h.
const handoverPointSchema = z.object({
  id: z.string().uuid(), code: z.string(), name: z.string(), displayAddress: z.string(),
  status: z.enum(['Active', 'Paused', 'Closed']), capacity: z.number().int(), availableSlots: z.number().int(), demoOnly: z.literal(true),
})
export type HandoverPoint = z.infer<typeof handoverPointSchema>
export function listHandoverPoints() {
  return session.request('/handover-points', z.object({ items: z.array(handoverPointSchema) }))
}
export type CreateIntakeBody = {
  listingId: string; expectedListingVersion: number; pointId: string
  startPrice: number; step: 10000 | 50000; buyNowPrice: number | null
}
export function createAuctionIntake(body: CreateIntakeBody, key: string) {
  return command('/auction-intakes', key, body)
}
export const AUCTION_MIN_PRICE = 10_000

/** Client mirror of the server's POL-39 checks; the server stays authoritative. */
export function intakePriceErrors(startPrice: number | null, step: number, buyNowPrice: number | null) {
  const errors: { startPrice?: string; buyNowPrice?: string } = {}
  if (!startPrice) errors.startPrice = 'Nhập giá khởi điểm.'
  else if (startPrice < AUCTION_MIN_PRICE || startPrice > AUCTION_MAX_PRICE) errors.startPrice = 'Giá khởi điểm từ 10.000đ đến 1.000.000đ.'
  else if (buyNowPrice !== null) {
    if (buyNowPrice <= startPrice || buyNowPrice > AUCTION_MAX_PRICE) errors.buyNowPrice = 'Giá mua ngay phải lớn hơn giá khởi điểm và không quá 1.000.000đ.'
    else if ((buyNowPrice - startPrice) % step !== 0) {
      const up = Math.min(startPrice + Math.ceil((buyNowPrice - startPrice) / step) * step, AUCTION_MAX_PRICE)
      errors.buyNowPrice = `Giá mua ngay phải bằng giá khởi điểm cộng một số bước giá. Thử ${up.toLocaleString('vi-VN')}đ.`
    }
  }
  return errors
}
