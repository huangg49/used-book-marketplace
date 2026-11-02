import type { AuctionSummary } from '../services/auctions'

// Client-side search and filters for the live auction shelf. The API returns
// every live auction (at most 50), so the page narrows them here; the URL keeps
// the choices so a filtered view can be shared or reloaded.

export type Condition = 'LikeNew' | 'Good' | 'Fair' | 'Worn'
export const CONDITIONS: Condition[] = ['LikeNew', 'Good', 'Fair', 'Worn']

export const PRICE_RANGES = {
  lt100: { label: 'Dưới 100.000 ₫', min: 0, max: 99_999 },
  '100-300': { label: '100.000–300.000 ₫', min: 100_000, max: 300_000 },
  '300-1m': { label: '300.000 ₫–1 triệu', min: 300_001, max: 1_000_000 },
  gt1m: { label: 'Trên 1 triệu', min: 1_000_001, max: Number.POSITIVE_INFINITY },
} as const
export type PriceRange = keyof typeof PRICE_RANGES

export const ENDING = {
  '1h': { label: 'Trong 1 giờ', ms: 3_600_000 },
  '6h': { label: 'Trong 6 giờ', ms: 6 * 3_600_000 },
  '24h': { label: 'Trong 24 giờ', ms: 24 * 3_600_000 },
} as const
export type Ending = keyof typeof ENDING

export interface AuctionFilters {
  q: string
  point: string
  buyNow: boolean
  noBids: boolean
  conditions: Condition[]
  price: PriceRange | ''
  ending: Ending | ''
}

const isPrice = (v: string | null): v is PriceRange => !!v && v in PRICE_RANGES
const isEnding = (v: string | null): v is Ending => !!v && v in ENDING

export function readFilters(params: URLSearchParams): AuctionFilters {
  return {
    q: params.get('q') ?? '',
    point: params.get('point') ?? '',
    buyNow: params.get('buyNow') === '1',
    noBids: params.get('noBids') === '1',
    conditions: (params.get('cond') ?? '').split(',').filter((c): c is Condition => CONDITIONS.includes(c as Condition)),
    price: isPrice(params.get('price')) ? (params.get('price') as PriceRange) : '',
    ending: isEnding(params.get('ends')) ? (params.get('ends') as Ending) : '',
  }
}

// Keys this module owns; clearing filters removes exactly these (sort stays).
export const FILTER_KEYS = ['q', 'point', 'buyNow', 'noBids', 'cond', 'price', 'ends'] as const

export const activeFilterCount = (f: AuctionFilters) =>
  [f.point, f.buyNow, f.noBids, f.conditions.length > 0, f.price, f.ending].filter(Boolean).length

// Lower-case, accents and đ removed, so "de men" finds "Dế Mèn".
export function fold(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim()
}

export function matches(a: AuctionSummary, f: AuctionFilters, now: number) {
  const price = a.currentPrice ?? a.startPrice
  if (f.q) {
    const haystack = fold([a.title, ...(a.book?.authors ?? [])].join(' '))
    if (!fold(f.q).split(/\s+/).every((word) => haystack.includes(word))) return false
  }
  if (f.point && a.pointName !== f.point) return false
  if (f.buyNow && a.buyNowPrice === null) return false
  if (f.noBids && a.bidderCount > 0) return false
  if (f.conditions.length && !(a.book && f.conditions.includes(a.book.condition))) return false
  if (f.price) {
    const range = PRICE_RANGES[f.price]
    if (price < range.min || price > range.max) return false
  }
  if (f.ending && Date.parse(a.endAt) - now > ENDING[f.ending].ms) return false
  return true
}
