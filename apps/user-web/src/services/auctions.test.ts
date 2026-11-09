import { describe, expect, it } from 'vitest'
import { formatRemaining } from '../hooks/useAuctionClock'
import { AUCTION_MAX_PRICE, auctionDepositError, auctionDepositMaxFor, bidOptions, canWithdrawRegistration, type AuctionParticipation, type AuctionSummary } from './auctions'

describe('bidOptions', () => {
  it('steps up from the minimum bid on the price grid', () => {
    expect(bidOptions(300_000, 50_000)).toEqual([300_000, 350_000, 400_000])
  })
  it('offers prices above the old 1,000,000 cap', () => {
    expect(bidOptions(990_000, 10_000)).toEqual([990_000, 1_000_000, 1_010_000])
  })
  it('never offers more than the exact-integer limit', () => {
    expect(bidOptions(AUCTION_MAX_PRICE - 10_000, 10_000)).toEqual([AUCTION_MAX_PRICE - 10_000, AUCTION_MAX_PRICE])
    expect(bidOptions(AUCTION_MAX_PRICE + 10_000, 10_000)).toEqual([])
  })
})

describe('formatRemaining', () => {
  it('shows minutes and seconds in the last hour', () => {
    expect(formatRemaining(37 * 60_000 + 5_000)).toBe('37:05')
  })
  it('shows hours long-form or compact', () => {
    const ms = 3 * 3_600_000 + 7 * 60_000 + 26_000
    expect(formatRemaining(ms)).toBe('3 giờ 07 phút 26 giây')
    expect(formatRemaining(ms, true)).toBe('3:07:26')
  })
  it('reports a finished timer', () => {
    expect(formatRemaining(0)).toBe('Đã hết giờ')
  })
})

// ADR 0085 (N1): withdrawing is allowed below the minimum, or from a full
// auction until 72 h before its open time; never after the member bid.
describe('canWithdrawRegistration', () => {
  const now = Date.parse('2026-11-09T03:00:00.000Z')
  const auction = (over: Partial<AuctionSummary> = {}) =>
    ({ state: 'Active', phase: 'Scheduled', minBidders: 4, registeredCount: 3, fullWithdrawUntil: null, ...over }) as AuctionSummary
  const me = (over: Partial<AuctionParticipation> = {}) =>
    ({ registrationState: 'Registered', alias: null, ...over }) as AuctionParticipation
  it('is allowed below the minimum', () => {
    expect(canWithdrawRegistration(auction(), me(), now)).toBe(true)
  })
  it('is allowed from a full auction only before fullWithdrawUntil', () => {
    const full = auction({ registeredCount: 4, fullWithdrawUntil: new Date(now + 60_000).toISOString() })
    expect(canWithdrawRegistration(full, me(), now)).toBe(true)
    expect(canWithdrawRegistration(full, me(), now + 60_000)).toBe(false)
    expect(canWithdrawRegistration(auction({ registeredCount: 4 }), me(), now)).toBe(false)
  })
  it('is refused after a bid, when not registered, or once ended', () => {
    expect(canWithdrawRegistration(auction(), me({ alias: 1 }), now)).toBe(false)
    expect(canWithdrawRegistration(auction(), me({ registrationState: 'Withdrawn' }), now)).toBe(false)
    expect(canWithdrawRegistration(auction(), null, now)).toBe(false)
    expect(canWithdrawRegistration(auction({ phase: 'Ended' }), me(), now)).toBe(false)
  })
})

// ADR 0087: the seller-set deposit mirrors the server bounds.
describe('auctionDepositError', () => {
  it('accepts the default up to half the start price in whole thousands', () => {
    expect(auctionDepositMaxFor(200_000)).toBe(100_000)
    expect(auctionDepositError(200_000, null)).toBeUndefined()
    expect(auctionDepositError(200_000, 20_000)).toBeUndefined()
    expect(auctionDepositError(200_000, 100_000)).toBeUndefined()
    expect(auctionDepositError(200_000, 19_000)).toMatch(/20\.000đ đến 100\.000đ/)
    expect(auctionDepositError(200_000, 101_000)).toBeTruthy()
    expect(auctionDepositError(200_000, 25_500)).toBeTruthy()
    expect(auctionDepositError(10_000, 11_000)).toMatch(/là 10\.000đ/)
  })
})
