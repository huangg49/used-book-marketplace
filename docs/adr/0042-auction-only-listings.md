# ADR 0042: Auction books use their own auction-only listing

27/10/2026 follow-up: [ADR 0048](0048-auction-intake-from-shelf.md) supersedes
the intake source restriction below: an approved single Marketplace book may
also enter intake, without changing its channel. Immutable channels and the
exclusion of Auction listings from marketplace commands/reads remain in force.
The original decision below records the19/10 behavior.

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
