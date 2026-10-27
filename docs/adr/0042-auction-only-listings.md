# ADR 0042: Auction books use their own auction-only listing

19/10/2026. Owner request: when a Member sends a book to auction, the auction
flow creates and uses its own listing. It no longer picks an approved
marketplace listing. This supersedes the "listing Sale Approved/Visible/Available"
source in DEC-07, FR-AU01, FR-C05 and BR-02 of
[LOCAL-AUCTION-01](../features/LOCAL_HANDOVER_AUCTION.md) and
[SRS 1.1](../SRS_V1_1.md); the rest of the auction workflow is unchanged.

## Decision

- A listing has an immutable `channel`: `Marketplace` (default) or `Auction`.
  It is chosen when the draft is created and no command changes it. Existing
  listings are `Marketplace`; migration 0032 backfills them and the PostgreSQL
  import maps imported listings to `Marketplace`.
- An `Auction` listing reuses the listing pipeline: draft, photos, catalog
  book, ownership declaration, Staff review and revisions. Its content must use
  mode `Sale` with `salePrice` and no fulfillment origin. `salePrice` is the
  seller's declared value: the approved value becomes the intake's protective
  value (FR-H/POL compensation cap). It is not a fixed shop price and is never
  offered to buyers.
- `Auction` listings never appear in marketplace reads or commands: public
  shelf, search, public detail, public photo reads, quotes, purchase
  conversations, Buy now, seller-selected orders, Exchange (either side) and
  wishlist. These reads use `channel: Marketplace`; each command rechecks the
  channel under its existing locks, so a hidden button is not the guard.
- `CreateAuctionIntake` accepts only an `Auction` listing that is Approved,
  Visible, Available, published, owned by the caller and has Ready photos.
  A `Marketplace` listing returns 409 `InvalidState`. Intakes created before
  this ADR keep their marketplace listing until they close; invariants do not
  reject them.
- Unsold, Cancelled, PaymentExpired and reclaimed intakes return the listing to
  its existing post-auction state on the same `Auction` channel; the Member can
  send it to auction again. They never move it onto the marketplace shelf.
- The five-listing cap of ADR 0040 keeps one count across channels. A pending or
  visible approved auction listing uses a slot, which also limits the review
  queue. The two-open-auction limit of FR-AU01 still applies at intake.
- `GET /me/listings` accepts an optional `channel` filter and every private
  listing projection returns `channel`. Without the filter, both channels are
  returned for compatibility. Marketplace screens filter `Marketplace`; the
  auction flow filters `Auction`.

## Consequences

- One physical book is entered once per channel. A Member who wants both
  marketplace sale and auction for the same copy must choose; the exclusive
  commitment (BR-03) still prevents two active workflows on one listing.
- Staff review an auction listing with the same checklist; the review detail
  shows `channel` so the reviewer knows the book will go to a point for
  inspection before any public auction page.
- Clients must accept `channel` on listing payloads and send `channel` when
  creating an auction draft. Older clients that omit it create marketplace
  drafts as before.

## Verification

Mongo/HTTP tests cover: draft creation per channel and immutability on save;
auction content validation (mode Sale, no origin); exclusion from shelf, search,
detail, photo reads, quotes, purchase conversations and exchanges; intake
rejection for marketplace listings and success for approved auction listings;
the five-slot cap across channels; replay with the same key/body; and the
migration backfill. Web/RN cover creating an auction draft from the send-to-
auction flow, review status, and sending an approved auction listing.

## Update 27/10/2026: shelf books may also go to auction

Commit `0bda2ff` (branch `feat/web-auction-select-from-shelf`, merged in PR #73)
let sellers pick an approved book from their own shelf on `/auctions/new`
instead of creating a separate auction listing. It changed the code but not this
ADR or the auction e2e test. On 27/10 the person running this package chose to
keep that behaviour; this section records it. It is not an owner request like
the original decision above, so the owner should still confirm it.

- `CreateAuctionIntake` accepts a listing owned by the caller that is Approved,
  Visible, Available, published, not a bundle and has a submitted revision, on
  **either channel and in any mode** (`Sale`, `Exchange`, `Both`). Other
  listings still return 409 `InvalidState`.
- Optional `declaredValue` (10.000–1.000.000 đ) sets the protective value. If
  it is omitted, the value falls back to the listing's `salePrice`, then
  `exchangeValue`, then the start price.
- The intake reserves the shelf listing with an `AuctionIntake` exclusive
  commitment. Public shelf, search and detail reads only show Reserved listings
  held by a purchase, order or exchange, so the book leaves the marketplace
  while the intake is open. Cancelling before drop-off puts it back on the
  shelf as Available.
- `Auction`-channel listings are unchanged: they still never appear in
  marketplace reads or commands, and the auction-listing flow still works.

Not covered by this update: the old eligibility filter also required Ready
photos, and the new one does not check them. Unsold, payment-expired and
reclaimed intakes for a marketplace listing are expected to return it to the
shelf, but only the cancel path is tested
(`auctions.e2e-spec.ts` AC-AU01/02).
