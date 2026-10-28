# ADR 0049: Send an approved shelf book to auction without duplicating it

27/10/2026. The owner approved retaining the shelf-selection flow introduced on
main, explicitly including books offered for both sale and exchange (`Both`).
This replaces the source restriction in ADR 0042, DEC-07, FR-AU01, BR-02 and
AC-AU01. It does not waive intake, inspection, custody, compensation review or
the release gates in READINESS.

## Decision

- An ACTIVE, verified, unrestricted owning MEMBER can send an approved single
  Marketplace book to intake. Sale, Both and Exchange listings remain supported
  by the existing shelf picker; legacy approved Auction listings also work.
  Their immutable channel and accepted revision/mode/prices are preserved.
  Reuse the same listing rather than creating another listing for the same copy.
- Recheck eligibility inside the command transaction after point, catalog,
  listing and revision locks: Visible, published, Available, submitted and
  approved current revision, Confirmed catalog book and all linked photos Ready.
  Bundles remain excluded by ADR 0046; their manifest is on the revision.
  A stale version, wrong owner, active commitment or unavailable source cannot
  allocate a slot or leave partial workflow records.
- The intake obtains the existing shared exclusive commitment and a point slot
  atomically; the source becomes Reserved. An existing negotiation does not
  reserve stock and cannot keep an auction-held source on public shelf/detail/
  signed photo reads. AuctionIntake and the resulting PointOrder contexts are
  excluded even when an older purchase conversation remains Active. Normal
  checkout and Exchange still need the same listing lock and commitment.
- Inspection Pass is still required before seller publication (ADR 0047). An
  intake is not a public auction. Transition to its winning PointOrder transfers
  the commitment without a release gap. Drop-off expiry/cancel before receipt
  or actual Staff reclaim release as before; an unsold auction does not release
  a physical book that is still at the point.
- Cancellation/reclaim preserves the source channel. A Marketplace source may
  reappear once Available and still eligible; an Auction source stays excluded
  from the marketplace. Inspection failure still requires correction and review.
- Keep the existing optional `declaredValue` (10,000–1,000,000 VND) as the
  intake's snapshotted protective value. For compatible callers omitting it,
  retain salePrice → exchangeValue → startPrice fallback. It does not edit the
  shelf price, set a bid, guarantee market value or authorize compensation.
  Later bids/Buy Now do not increase this pre-sale snapshot; a sold auction's
  Order and incident/ledger rules continue to govern compensation.

## Compatibility and verification

OpenAPI 0.54.0 clarifies eligibility and the existing field; no new field, route,
collection or migration is introduced. ADR 0042's immutable channels and public
exclusion of Auction listings remain in force. Clients still using the separate
Auction draft flow continue to work; this change does not redesign RN/Flutter.

QA covers approved Marketplace modes, unchanged revision/channel/prices,
declared-value snapshot, replay/key-body conflict/stale intent, blocked premature
publish, cancel/reappearance and rejected hidden/draft/sold/unpublished/catalog/
photo/bundle sources. Real concurrent HTTP commands test two intake intents and
normal Order versus intake; only one commitment may win. An old negotiation
must not expose or buy a book while intake holds it. Tests use an isolated
replica set/database ending in `_test`; no production/local main data is reset.

Exclusive stock identity remains the listing ID. This does not claim to detect
the same physical copy fraudulently entered as different independent listings.
Storage fake, native acceptance, independent human review and release remain
separate gates.
