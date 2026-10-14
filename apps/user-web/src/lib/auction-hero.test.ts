import { describe, expect, it } from 'vitest'
import { selectHeroAuctions } from './auction-hero'
import type { AuctionSummary } from '../services/auctions'

const auction = (id: string, endAt = '2026-10-14T08:00:00Z', overrides: Partial<AuctionSummary> = {}): AuctionSummary => ({
  id, listingId: id, title: `Sách ${id}`, state: 'Active', startPrice: 100000,
  step: 10000, buyNowPrice: null, currentPrice: null, minimumBid: 100000,
  bidderCount: 0, startAt: '2026-10-13T08:00:00Z', endAt, pointName: 'Điểm demo', demoOnly: true,
  book: { revisionId: id, authors: ['Tác giả'], condition: 'Good', pages: '', coverNote: '', notes: '',
    accessories: '', description: '', hasMissingPages: false, photos: [{ id, width: 600, height: 900 }] },
  ...overrides,
})

describe('auction hero selects a usable, stable public session', () => {
  it('does not feature missing metadata, images, titles, invalid dates or non-active states', () => {
    const valid = auction('valid')
    const rows = [auction('legacy', undefined, { book: null }), auction('untitled', undefined, { title: '  ' }),
      auction('closed', undefined, { state: 'Sold' }), auction('pending', undefined, { state: 'BuyNowPending' }),
      auction('invalid', 'not-a-date'), auction('no-photo', undefined, { book: { ...valid.book!, photos: [] } }), valid]
    expect(selectHeroAuctions(rows).primary?.id).toBe('valid')
    expect(selectHeroAuctions(rows).companions).toEqual([])
  })
  it('orders eligible sessions by closing time and ID without sorting the shared query array', () => {
    const rows = [auction('z'), auction('late', '2026-10-15T08:00:00Z'), auction('a')]
    expect(selectHeroAuctions(rows).primary?.id).toBe('a')
    expect(rows.map(a => a.id)).toEqual(['z', 'late', 'a'])
  })
  it('retains the featured identity through refresh/reordering while exposing the latest price', () => {
    const updated = auction('featured', '2026-10-15T08:00:00Z', { currentPrice: 180000, bidderCount: 2 })
    const selected = selectHeroAuctions([auction('new-earlier'), updated], 'featured')
    expect(selected.primary).toBe(updated)
    expect(selected.primary?.currentPrice).toBe(180000)
    expect(selected.companions.map(a => a.id)).toEqual(['new-earlier'])
  })
  it('compares closing instants correctly across valid ISO timezone offsets', () => {
    const rows = [auction('utc', '2026-10-14T08:00:00Z'), auction('earlier', '2026-10-14T09:00:00+07:00')]
    expect(selectHeroAuctions(rows).primary?.id).toBe('earlier')
  })
  it('replaces a removed/closed retained session with the next eligible one', () => {
    expect(selectHeroAuctions([auction('old', undefined, { state: 'Sold' }), auction('next')], 'old').primary?.id).toBe('next')
    expect(selectHeroAuctions([auction('next')], 'absent').primary?.id).toBe('next')
  })
  it('supports empty, one-book and large shelves with at most two distinct companions', () => {
    expect(selectHeroAuctions([])).toEqual({ primary: undefined, companions: [] })
    expect(selectHeroAuctions([auction('one')]).companions).toEqual([])
    const selected = selectHeroAuctions(['a', 'b', 'c', 'd'].map(id => auction(id)))
    expect(selected.companions.map(a => a.id)).toEqual(['b', 'c'])
  })
  it('preserves buy-now presence and server-active expiry; it never invents a winner using the device clock', () => {
    const a = auction('buy', '2020-01-01T00:00:00Z', { buyNowPrice: 300000 })
    expect(selectHeroAuctions([a]).primary).toBe(a)
    expect(selectHeroAuctions([auction('bid-only')]).primary?.buyNowPrice).toBeNull()
  })
})
