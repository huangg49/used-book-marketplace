import { describe, expect, it } from 'vitest'
import { formatRemaining } from '../hooks/useAuctionClock'
import { AUCTION_MAX_PRICE, bidOptions } from './auctions'

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
