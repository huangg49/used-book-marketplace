import type { AuctionSummary } from '../services/auctions'

/** A public, photographed book can lead the stage; malformed legacy rows cannot. */
export function selectHeroAuctions(items: readonly AuctionSummary[], retainedId?: string | null) {
  const eligible = items.filter((auction) =>
    auction.state === 'Active' && auction.title.trim().length > 0 &&
    !!auction.book?.photos.length && Number.isFinite(Date.parse(auction.endAt)),
  ).sort((a, b) => Date.parse(a.endAt) - Date.parse(b.endAt) || a.id.localeCompare(b.id))
  const primary = eligible.find((auction) => auction.id === retainedId) ?? eligible[0]
  return { primary, companions: eligible.filter((auction) => auction.id !== primary?.id).slice(0, 2) }
}
