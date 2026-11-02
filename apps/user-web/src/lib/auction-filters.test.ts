import { describe, expect, it } from 'vitest'
import { activeFilterCount, fold, matches, readFilters } from './auction-filters'
import type { AuctionSummary } from '../services/auctions'

const now = Date.parse('2026-11-03T10:00:00Z')
const auction = (over: Partial<AuctionSummary> = {}): AuctionSummary =>
  ({
    id: 'a', title: 'Dế Mèn phiêu lưu ký', pointName: 'Điểm A', startPrice: 50_000, currentPrice: 120_000,
    buyNowPrice: 300_000, bidderCount: 2, endAt: '2026-11-03T12:00:00Z',
    book: { authors: ['Tô Hoài'], condition: 'Good' },
    ...over,
  }) as AuctionSummary
const f = (query: string) => readFilters(new URLSearchParams(query))

describe('auction filters', () => {
  it('search ignores accents, case and word order across title and authors', () => {
    expect(fold('Đường Dế Mèn')).toBe('duong de men')
    expect(matches(auction(), f('q=de men'), now)).toBe(true)
    expect(matches(auction(), f('q=hoai men'), now)).toBe(true)
    expect(matches(auction(), f('q=nam cao'), now)).toBe(false)
  })

  it('narrows by condition, price range, ending time, bids and Buy Now', () => {
    expect(matches(auction(), f('cond=Good,Fair'), now)).toBe(true)
    expect(matches(auction(), f('cond=LikeNew'), now)).toBe(false)
    expect(matches(auction({ book: null }), f('cond=Good'), now)).toBe(false)
    expect(matches(auction(), f('price=100-300'), now)).toBe(true)
    expect(matches(auction(), f('price=lt100'), now)).toBe(false)
    expect(matches(auction({ currentPrice: null }), f('price=lt100'), now)).toBe(true)
    expect(matches(auction(), f('ends=6h'), now)).toBe(true)
    expect(matches(auction(), f('ends=1h'), now)).toBe(false)
    expect(matches(auction(), f('noBids=1'), now)).toBe(false)
    expect(matches(auction({ bidderCount: 0 }), f('noBids=1'), now)).toBe(true)
    expect(matches(auction({ buyNowPrice: null }), f('buyNow=1'), now)).toBe(false)
  })

  it('ignores unknown values and counts active filters without the search', () => {
    const filters = f('q=x&cond=Bad,Good&price=huge&ends=2d&point=Điểm A&buyNow=1')
    expect(filters).toMatchObject({ conditions: ['Good'], price: '', ending: '' })
    expect(activeFilterCount(filters)).toBe(3)
  })
})
