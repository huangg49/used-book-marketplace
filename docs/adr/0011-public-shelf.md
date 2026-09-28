# ADR 0011 — Public shelf and separate image authorization

Date: 2026-09-27. Status: implemented, OpenAPI 0.7.0.

Follow-up: lifecycle commands/UI subsequently implemented under [ADR 0012](0012-listing-lifecycle.md).
The limits below describe this public-read increment when originally delivered.

## Decision

Implement anonymous `GET /listings`, `/listings/{id}` and
`/listings/{id}/media/{mediaId}/read` in the existing listings module. All use
one eligibility predicate: current submitted revision approved, catalog Confirmed,
listing Approved/Visible/Available, not deleted, published, owner ACTIVE/verified
with MEMBER role, and every attached image Ready with an unpurged derivative.
Ineligible detail/image requests return the same 404 even to the owner.
Authenticated owner/reviewer routes retain their own access rules.

List and detail select eligibility and hydrate the closed projection in a
PostgreSQL RepeatableRead transaction. A concurrent state change cannot cause
the second query to return a different private revision. Reads represent their
transaction snapshot; they cannot promise immediate revocation of data already
sent to a client. Future commitment/custody invariants must extend this predicate.

`PublicListing.photos` contains only `{id,width,height}`. Clients request signed
derivative URLs separately. Recheck the full predicate and current revision/key
after remote signing, before returning the URL. Do not hold database locks across
storage calls. URLs already issued remain valid for up to the existing 120-second
TTL; no claim of instant revocation or prevention of screenshots/downloads.
List/detail/media JSON responses use `Cache-Control: no-store`.

Reuse normalized catalog title/author search and canonical ISBN-10/13 matching.
Escape SQL LIKE wildcards. Sort columns come from a whitelist. Keyset cursors use
the existing HMAC protocol bound to normalized filters and sort. Null prices are
excluded for the corresponding price sort/filter. Both price filters combine with
AND; Sale/Exchange mode filters include Both; Both selects only Both. A cursor is
not a frozen multi-page snapshot while listings change.

## Clients

RN `/` becomes the guest shelf, `/account` contains auth/profile, and `/book?id=...`
composes the public detail screen. Shared `SessionClient.publicRequest` performs a
validated no-store GET without bearer tokens or refresh. No second transport or
token store. The same HTTP projection remains usable by Flutter.

TanStack Query owns public data. Shelf pages render at most 12 listings; a cursor
stack supports previous/next without signing every image in an unbounded feed.
Foreground shelf/detail refresh every 30 seconds and on returning to the screen.
Images refresh every 90 seconds, expire locally, and use no persistent image cache.
Retry remounts a failed image even if a provider returns the same URL. A fresh 404
removes cached detail; transient network errors label prior data and hide photos.
This is bounded refresh, not a realtime withdrawal guarantee.

Brand typography, forest/terracotta/paper colors, reusable controls and explicit
condition disclosures carry the interface. Moderation is not physical inspection
or proof of authenticity. No rating/inspection badges or functioning checkout are
invented. `/design` remains fixtures and `/ui` demonstrates shared controls.

## Verification and remaining work

See [public shelf report](../features/PUBLIC_SHELF_REPORT.md) for actual test/build
evidence. No migration or provider configuration change. Lifecycle commands for
approved edits, visibility, archive and staff removal remain planned. Native
runtime/picker QA, iOS build, load testing and business transactions are not
completed by this increment.

Follow-up 27/09/2026: lifecycle is implemented by [ADR 0012](0012-listing-lifecycle.md).
The static web `/book` route hydrates a shared loading shell before consuming its
query string, since build-time HTML has no listing ID. Direct URL navigation is
covered by the [acceptance audit](../features/LISTING_ACCEPTANCE_REPORT.md).
