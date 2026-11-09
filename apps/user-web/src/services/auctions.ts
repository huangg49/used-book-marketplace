import { z } from 'zod'
import { session } from '../lib/session'

// Auction reads and commands (OpenAPI 0.27.0, tag Auctions). Ceilings are never
// public; the caller's own ceiling only comes from /me/auctions/{id}/participation.
// ADR 0068: bid steps a Seller may choose before the auction opens.
export const AUCTION_STEPS = [10_000, 20_000, 50_000, 100_000] as const
// A Seller may also enter their own step: a multiple of 1.000đ in this range.
export const AUCTION_STEP_MIN = 1_000
export const AUCTION_STEP_MAX = 10_000_000
export const AUCTION_STEP_UNIT = 1_000
export type AuctionStep = number

const auctionStepSchema = z.number().int().min(AUCTION_STEP_MIN).max(AUCTION_STEP_MAX).multipleOf(AUCTION_STEP_UNIT)
const money = z.number().int()
const auctionState = z.enum(['Active', 'BuyNowPending', 'AwaitingWinnerPayment', 'Sold', 'Unsold', 'OnHold', 'Cancelled', 'PaymentExpired', 'SecondChanceOffered'])
const auctionBookSchema = z.object({
  revisionId: z.string().uuid(), authors: z.array(z.string()), condition: z.enum(['LikeNew', 'Good', 'Fair', 'Worn']),
  pages: z.string(), coverNote: z.string(), notes: z.string(), accessories: z.string(), description: z.string(),
  hasMissingPages: z.boolean(), photos: z.array(z.object({ id: z.string().uuid(), width: z.number().positive(), height: z.number().positive() })),
})
export const auctionTypeSchema = z.enum(['English', 'Dutch', 'SealedFirst', 'SealedSecond'])
export type AuctionType = z.infer<typeof auctionTypeSchema>
/** ADR 0076: the formats a seller can choose. */
// ADR 0086: SealedSecond is retired for new auctions (a draft keeps its label).
export const AUCTION_TYPES: { value: AuctionType; label: string; short: string; hint: string; retired?: boolean }[] = [
  { value: 'English', label: 'Trả giá lên', short: 'Kiểu Anh', hint: 'Người mua trả giá tăng dần, có đặt giá tự động và có thể bật mua ngay. Giá cao nhất khi hết giờ thắng.' },
  { value: 'Dutch', label: 'Giá giảm dần', short: 'Kiểu Hà Lan', hint: 'Giá bắt đầu cao và giảm một bước sau mỗi khoảng thời gian tới giá sàn. Người đầu tiên chấp nhận thắng ngay.' },
  { value: 'SealedFirst', label: 'Giá kín · giá thứ nhất', short: 'Kín', hint: 'Mỗi người gửi một giá kín, chỉ được nâng. Giá cao nhất thắng và trả đúng giá đã gửi.' },
  { value: 'SealedSecond', label: 'Giá kín · giá thứ hai', short: 'Vickrey', hint: 'Mỗi người gửi một giá kín. Giá cao nhất thắng nhưng trả bằng giá cao thứ hai (hoặc giá khởi điểm nếu chỉ một người).', retired: true },
]
export const buyNowModeSchema = z.enum(['Challenge', 'Instant'])
export type BuyNowMode = z.infer<typeof buyNowModeSchema>
/** ADR 0074: the seller's choice of what Buy Now does. */
export const BUY_NOW_MODES: { value: BuyNowMode; label: string; short: string; hint: string }[] = [
  { value: 'Challenge', label: 'Chờ thách đấu', short: '60 giây / 5 phút', hint: 'Khi có người mua ngay, người khác còn 5 phút để trả cao hơn (60 giây nếu người bấm đang dẫn).' },
  { value: 'Instant', label: 'Kết thúc ngay', short: 'Bán ngay', hint: 'Người mua ngay thắng luôn và phiên kết thúc. Không ai trả được cao hơn giá mua ngay.' },
]
export const auctionSummarySchema = z.object({
  id: z.string().uuid(), listingId: z.string().uuid(), title: z.string(), state: auctionState,
  startPrice: money, step: auctionStepSchema, buyNowPrice: money.nullable(),
  currentPrice: money.nullable(), minimumBid: money.nullable(), bidderCount: z.number().int(),
  startAt: z.string(), endAt: z.string(), pointName: z.string(), demoOnly: z.literal(true),
  // ADR 0043: when Buy Now opened the 60-second window (endAt already shortened).
  buyNowAt: z.string().nullish(),
  // ADR 0074: absent on older servers means Challenge.
  buyNowMode: buyNowModeSchema.nullish(),
  // ADR 0076: format; absent means English. Dutch price fields only while live.
  auctionType: auctionTypeSchema.nullish(),
  dutchTopPrice: money.nullish(),
  dutchIntervalSeconds: z.number().int().nullish(),
  dutchPrice: money.nullish(),
  dutchNextDropAt: z.string().nullish(),
  // ADR 0077: registration gate; null/absent means no registration needed.
  minBidders: z.number().int().nullish(),
  depositAmount: money.nullish(),
  registeredCount: z.number().int().nullish(),
  closeReason: z.enum(['NotEnoughBidders', 'RegistrationExpired', 'SellerClosed', 'HoldExpired', 'Reported']).nullish(),
  // ADR 0079: open mode and the fixed ceilings (null/absent on older auctions).
  openMode: z.enum(['WhenReady', 'Scheduled', 'ScheduledGrace']).nullish(),
  // ADR 0081: the seller's open time; startAt is the deadline until enough register.
  opensAt: z.string().nullish(),
  latestStartAt: z.string().nullish(),
  // ADR 0086: while the runner-up offer runs.
  secondChanceDeadline: z.string().nullish(),
  // ADR 0085: a full auction still refunds a withdrawal until this time.
  fullWithdrawUntil: z.string().nullish(),
  holdExpiresAt: z.string().nullish(),
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
  ownLevel: money.nullable(),
  // ADR 0075: wallet amount held for this auction (absent on older servers).
  heldAmount: z.number().int().min(0).optional(),
  // ADR 0077: the caller's registration (absent on older servers).
  registrationState: z.enum(['Registered', 'Withdrawn', 'Refunded', 'Applied', 'Forfeited']).nullish(),
  deposit: money.nullish(),
  // ADR 0086: the caller's runner-up offer (absent on older servers).
  secondChance: z.object({
    price: money, offeredAt: z.string(), deadline: z.string(),
    outcome: z.enum(['Offered', 'Accepted', 'Declined', 'Expired', 'Cancelled']),
  }).nullish(),
  boughtNow: z.boolean(), leading: z.boolean(), state: auctionState,
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

export function auctionStepError(step: number | null) {
  if (!step) return 'Nhập bước giá.'
  if (step < AUCTION_STEP_MIN || step > AUCTION_STEP_MAX) return 'Bước giá từ 1.000đ đến 10.000.000đ.'
  if (step % AUCTION_STEP_UNIT !== 0) return 'Bước giá phải là bội số của 1.000đ.'
  return undefined
}

// ADR 0067: auction prices and declared values have no business ceiling, only
// the exact-integer limit. Inputs accept 15 digits, which always stay below it.
export const AUCTION_MAX_PRICE = Number.MAX_SAFE_INTEGER
export const AUCTION_PRICE_DIGITS = 15

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
// ADR 0069: the length is sent in whole seconds within these bounds.
export const AUCTION_MIN_DURATION_S = 3_600
export const AUCTION_MAX_DURATION_S = 168 * 3_600
export const AUCTION_MIN_LEAD_MS = 5 * 60_000
export const AUCTION_SCHEDULE_HORIZON_MS = 7 * 24 * 3_600_000
export const AUCTION_MAX_SCHEDULE_EDITS = 5
export type ScheduleBody = { expectedVersion: number; startAt: string | null; durationSeconds: number }
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
// ADR 0076: Dutch acceptance at the price the member saw, and sealed bids.
export function acceptDutch(id: string, price: number, key: string) { return command(`/auctions/${id}/dutch-accept`, key, { price, fulfillmentMethod: 'SelfCollect' }) }
export function placeSealedBid(id: string, amount: number, key: string) { return command(`/auctions/${id}/sealed-bid`, key, { amount, fulfillmentMethod: 'SelfCollect' }) }
// ADR 0077: registration with the deposit the member saw, and its withdrawal.
export function registerForAuction(id: string, deposit: number, key: string) { return command(`/auctions/${id}/registration`, key, { deposit }) }
export function withdrawAuctionRegistration(id: string, key: string) { return command(`/auctions/${id}/registration/withdraw`, key, {}) }
// ADR 0086: the runner-up's answer to the offer.
export function acceptSecondChance(id: string, expectedVersion: number, key: string) { return command(`/auctions/${id}/second-chance/accept`, key, { expectedVersion }) }
export function declineSecondChance(id: string, expectedVersion: number, key: string) { return command(`/auctions/${id}/second-chance/decline`, key, { expectedVersion }) }
// ADR 0079: seller commands while the auction waits for registrants (ADR 0081: no open-now).
export function setAuctionMinBidders(id: string, expectedVersion: number, minBidders: number, key: string) { return command(`/auctions/${id}/min-bidders`, key, { expectedVersion, minBidders }) }
export function closeAuctionBeforeStart(id: string, expectedVersion: number, key: string) { return command(`/auctions/${id}/close`, key, { expectedVersion }) }
/** ADR 0079: a bounded-lifecycle auction still waiting for registrants. */
export function waitingForRegistrants(a: AuctionSummary) {
  return a.openMode != null && a.state === 'Active' && a.phase === 'Scheduled'
}
const at = (iso: string) => new Date(iso).toLocaleString('vi-VN', { weekday: 'short', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
/** ADR 0079: one sentence on when a waiting auction opens or is cancelled. */
export function openRuleText(a: AuctionSummary) {
  const need = a.minBidders ?? AUCTION_MIN_BIDDERS_FLOOR
  if (a.openMode === 'ScheduledGrace' && a.opensAt) {
    const reached = (a.registeredCount ?? 0) >= need
    if (reached) return `Phiên đã đủ ${need} người đăng ký và mở lúc ${at(a.startAt)}.`
    // ADR 0085: reached after the open time, it opens after a short notice.
    return Date.parse(a.opensAt) > Date.now()
      ? `Phiên mở lúc ${at(a.opensAt)} nếu đủ ${need} người đăng ký. Chưa đủ thì phiên chờ thêm tới ${at(a.startAt)} và mở 10 phút sau khi đủ (đủ trong khung 23:00–07:00 thì mở lúc 07:00); hết hạn vẫn chưa đủ thì phiên bị hủy và hoàn cọc.`
      : `Đã qua giờ mở nhưng chưa đủ ${need} người đăng ký. Phiên mở 10 phút sau khi đủ (đủ trong khung 23:00–07:00 thì mở lúc 07:00); tới ${at(a.startAt)} vẫn chưa đủ thì bị hủy và hoàn cọc.`
  }
  return a.openMode === 'WhenReady'
    ? `Phiên tự mở ngay khi đủ ${need} người đăng ký. Hạn đăng ký: ${at(a.startAt)}; quá hạn chưa đủ người thì phiên bị hủy và hoàn cọc.`
    : `Phiên mở lúc ${at(a.startAt)} nếu đủ ${need} người đăng ký; không đủ thì phiên bị hủy và hoàn cọc.`
}
/** ADR 0081: the open time to show and edit (opensAt, else the stored start). */
export const openTimeOf = (a: AuctionSummary) => a.opensAt ?? a.startAt
/**
 * ADR 0081: what a waiting auction shows - its open time, or the
 * registration deadline once that time passed (or on older WhenReady rows).
 * The end is only known once the minimum is reached.
 */
export function waitingTime(a: AuctionSummary, nowMs: number) {
  const reached = (a.registeredCount ?? 0) >= (a.minBidders ?? AUCTION_MIN_BIDDERS_FLOOR)
  if (a.openMode === 'WhenReady' && !reached) return { label: 'Hạn đăng ký', at: a.startAt, endKnown: false }
  if (a.openMode === 'ScheduledGrace' && a.opensAt && !reached)
    return Date.parse(a.opensAt) > nowMs
      ? { label: 'Mở lúc', at: a.opensAt, endKnown: false }
      : { label: 'Hạn đăng ký', at: a.startAt, endKnown: false }
  return { label: 'Mở lúc', at: a.startAt, endKnown: true }
}
/** ADR 0079: why a cancelled or unsold auction ended, for every viewer. */
export function closeReasonText(a: AuctionSummary): string | null {
  switch (a.closeReason) {
    case 'NotEnoughBidders': return `Phiên kết thúc mà chưa đủ người trả giá nên không bán. Mọi tiền cọc và khoản giữ đã về lại ví.`
    case 'RegistrationExpired': return a.opensAt
      ? `Phiên không đủ ${a.minBidders ?? AUCTION_MIN_BIDDERS_FLOOR} người đăng ký trong 24 giờ sau giờ mở nên đã bị hủy. Mọi tiền cọc đã về lại ví.`
      : `Phiên không đủ ${a.minBidders ?? AUCTION_MIN_BIDDERS_FLOOR} người đăng ký trước giờ mở nên đã bị hủy. Mọi tiền cọc đã về lại ví.`
    case 'SellerClosed': return 'Người bán đã đóng phiên trước giờ mở. Mọi tiền cọc đã về lại ví.'
    case 'HoldExpired': return 'Phiên hết thời gian tạm dừng mà chưa được xử lý nên đã tự hủy. Mọi tiền cọc và khoản giữ đã về lại ví.'
    case 'Reported': return 'Quản trị viên đã đóng phiên sau khi xem xét báo cáo. Mọi tiền cọc và khoản giữ đã về lại ví.'
    default: return null
  }
}
/**
 * ADR 0077/0085: a registrant who has not bid may withdraw while the auction
 * is below its minimum, or while a full auction is more than 72 h before its
 * open time (fullWithdrawUntil). The server decides at its own clock.
 */
export function canWithdrawRegistration(a: AuctionSummary, me: AuctionParticipation | null, nowMs: number) {
  if (me?.registrationState !== 'Registered' || me.alias != null || a.state !== 'Active' || a.phase === 'Ended') return false
  if ((a.registeredCount ?? 0) < (a.minBidders ?? AUCTION_MIN_BIDDERS_FLOOR)) return true
  return !!a.fullWithdrawUntil && nowMs < Date.parse(a.fullWithdrawUntil)
}
/** ADR 0077: true while a registration gate keeps this member from bidding. */
export function registrationBlocks(a: AuctionSummary, me: AuctionParticipation | null) {
  if (a.minBidders == null) return false
  return me?.registrationState !== 'Registered' || (a.registeredCount ?? 0) < a.minBidders
}
/** ADR 0077: an Instant end would sell to this member alone (no other bidder yet). */
export function instantNeedsRival(a: AuctionSummary, me: AuctionParticipation | null) {
  return a.minBidders != null && a.buyNowMode === 'Instant' && a.bidderCount - (me?.alias != null ? 1 : 0) < 1
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
  startPrice: money, step: auctionStepSchema, buyNowPrice: money.nullable(), protectiveValue: money,
  buyNowMode: buyNowModeSchema.nullish(),
  auctionType: auctionTypeSchema.nullish(), dutchTopPrice: money.nullish(), dutchIntervalSeconds: z.number().int().nullish(),
  // ADR 0087: the deposit bidders will pay (absent on older servers).
  depositAmount: money.nullish(),
  createdAt: z.string(), dropoffDeadline: z.string(), receivedAt: z.string().nullable(), inspectedAt: z.string().nullable(),
  inspectionOutcome: z.enum(['Pass', 'Fail', 'NeedsEvidence']).nullable(), inspectionNote: z.string().nullable(),
  reclaimReason: z.string().nullable(), closedAt: z.string().nullable(),
  evidenceDeadline: z.string().nullable(), evidenceNote: z.string().nullable(), evidenceSubmittedAt: z.string().nullable(),
})
export type IntakeState = z.infer<typeof intakeState>
export type MyIntake = z.infer<typeof myIntakeSchema>
export function getMyAuctionIntakes(auctionId?: string) {
  return session.request('/me/auction-intakes' + (auctionId ? `?auctionId=${encodeURIComponent(auctionId)}` : ''), z.object({ items: z.array(myIntakeSchema) }))
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
  startPrice: number; step: AuctionStep; buyNowPrice: number | null
  buyNowMode?: BuyNowMode
  auctionType?: AuctionType
  dutchTopPrice?: number | null
  dutchIntervalSeconds?: number | null
  // ADR 0077/0079: registered bidders needed before it opens (at least 4).
  minBidders?: number
  // ADR 0087: the seller's registration deposit; omitted = the 10% default.
  depositAmount?: number | null
  declaredValue?: number | null
}
// ADR 0079: at least 4, no business maximum (1000 is the server's technical guard).
export const AUCTION_MIN_BIDDERS_FLOOR = 4
export const AUCTION_MIN_BIDDERS_CAP = 1000
export const MIN_BIDDER_OPTIONS = [4, 5, 6, 8, 10] as const
// ADR 0079 ceilings, mirrored for the forms; the server stays authoritative.
// ADR 0081: past the open time a registration auction waits 24 h more.
export const AUCTION_OPEN_GRACE_MS = 24 * 3_600_000
// ADR 0082: a registration auction opens at most 30 days after publishing
// and its open time changes at most twice.
export const AUCTION_OPEN_CEILING_MS = 30 * 24 * 3_600_000
export const AUCTION_MAX_OPEN_CHANGES = 2
export const AUCTION_RESCHEDULE_FREEZE_MS = 30 * 60_000
/** ADR 0077: the refundable deposit the server will ask for (10%, ≥ 10.000đ). */
export const auctionDepositFor = (startPrice: number) => Math.max(10_000, Math.ceil(startPrice / 10 / 1000) * 1000)
/** ADR 0087: the seller may raise the deposit up to half the start price (whole 1.000đ). */
export const auctionDepositMaxFor = (startPrice: number) =>
  Math.max(auctionDepositFor(startPrice), Math.floor(startPrice / 2 / 1000) * 1000)
/** ADR 0087: client mirror of the server's deposit bounds; the server stays authoritative. */
export function auctionDepositError(startPrice: number | null, deposit: number | null) {
  if (deposit === null || startPrice === null) return undefined
  const min = auctionDepositFor(startPrice), max = auctionDepositMaxFor(startPrice)
  if (deposit % 1000 !== 0 || deposit < min || deposit > max)
    return min === max
      ? `Tiền cọc của giá khởi điểm này là ${min.toLocaleString('vi-VN')}đ.`
      : `Tiền cọc từ ${min.toLocaleString('vi-VN')}đ đến ${max.toLocaleString('vi-VN')}đ, theo bội số 1.000đ.`
  return undefined
}
export function createAuctionIntake(body: CreateIntakeBody, key: string) {
  return command('/auction-intakes', key, body)
}
export const AUCTION_MIN_PRICE = 10_000

/** Client mirror of the server's POL-39 checks; the server stays authoritative. */
export function intakePriceErrors(
  startPrice: number | null,
  step: number,
  buyNowPrice: number | null,
  declaredValue?: number | null,
) {
  const errors: { startPrice?: string; buyNowPrice?: string; declaredValue?: string } = {}
  if (!startPrice) errors.startPrice = 'Nhập giá khởi điểm.'
  else if (startPrice < AUCTION_MIN_PRICE || startPrice > AUCTION_MAX_PRICE) errors.startPrice = 'Giá khởi điểm tối thiểu 10.000đ.'
  if (declaredValue !== undefined) {
    if (!declaredValue) errors.declaredValue = 'Nhập giá trị khai báo của sách.'
    else if (declaredValue < AUCTION_MIN_PRICE || declaredValue > AUCTION_MAX_PRICE) errors.declaredValue = 'Giá trị khai báo tối thiểu 10.000đ.'
  }
  if (buyNowPrice !== null) {
    if (buyNowPrice <= (startPrice ?? 0) || buyNowPrice > AUCTION_MAX_PRICE) errors.buyNowPrice = 'Giá mua ngay phải lớn hơn giá khởi điểm.'
    else if (startPrice && (buyNowPrice - startPrice) % step !== 0) {
      const up = Math.min(startPrice + Math.ceil((buyNowPrice - startPrice) / step) * step, AUCTION_MAX_PRICE)
      errors.buyNowPrice = `Giá mua ngay phải bằng giá khởi điểm cộng một số bước giá. Thử ${up.toLocaleString('vi-VN')}đ.`
    }
  }
  return errors
}
