# ADR 0015: Revision-bound delivery origins

2026-09-27. Implemented in OpenAPI 0.10.0. F0 fulfillment increment;
quotes, reservations, orders, shipping and ViaPoint remain unimplemented.

Follow-up: DirectDelivery quotes are now implemented by
[ADR 0016](0016-direct-sale-quotes.md); reservations/Order/shipment/ViaPoint remain planned.

## Decision

Reuse listing create/save/submit/review/approved-replacement commands and their
receipts. `content.fulfillment` selects one owned address ID/content version and
the only supported method, `DirectDelivery`. The server derives the service area.
Clients cannot supply contact snapshots, regions, point IDs or eligibility flags.
No new routes or new receipt discriminators are needed.

The nullable choice lives on ListingRevision as three checked columns: address
identity, address version and service area. A complete choice means DirectDelivery
in this increment; no second boolean can contradict it. Future methods need a
reviewed contract/schema change. Submitted revisions retain their existing SQL
immutability. Approved replacement creates a new PendingReview revision and
withdraws public content through the existing lifecycle.

An omitted field preserves an existing choice on draft/approved replacement;
explicit null clears it. New/legacy unconfigured listings may still be saved,
submitted, approved and read. This is deliberately content moderation, not checkout
eligibility. A configured stale/deleted origin blocks save, submit, approval and
reopen until corrected/cleared through the normal revision flow. Review rejection,
hide and archive remain possible. No purchase button is introduced.

## Address changes and privacy

MemberAddress gains a content version. SQL advances it only when recipient, phone,
area/locality or detail changes. Default changes, another address and no-op saves
do not invalidate selections. Existing book-wide command versions remain unchanged.

AddressIdentity retains only ID and owner with a typed FK. Live address rows and
revision references point to it; deleting a contact does not rewrite old revisions
or retain its name/phone/detail. Identities are immutable and cannot be reused.
Migration backfills identities/version1 for existing contacts, never listing origins.

Private projections return the saved reference plus current status NotConfigured,
Current or NeedsUpdate. Current is not transaction eligibility. Operations receives
references/status but no contact values. Public reads return only TP.HCM, demoOnly
and DirectDelivery when the origin is current; otherwise null. No IDs, address
version, locality, phone, name or detail appear in that public object. The book
remains visible after an address change; its delivery preference becomes unavailable.
Ordinary bounded refresh still applies, not instant push invalidation.

22/10/2026 follow-up: [ADR0039](0039-book-circulation-regions.md) now permits the
configured coarse circulation zone `{ code, label }` on public cards when the
selected origin version is current. This supersedes the locality exclusion above
only for TP.HCM/Bình Dương/Vũng Tàu directory zones; contact data and address
references remain private, with unchanged stale/deleted-origin invalidation.

Changing an address never rewrites the accepted listing revision. There is no Order
snapshot yet. Future quote/checkout must check this reference under the same locks,
then copy the current private contact into the immutable agreement snapshot.

## Locking and validation

HTTP writers follow advisory command key → sorted users → session → selected address
FOR SHARE → catalog → listing → revision/media. Review locks the owner as before.
Address writers hold that owner's user lock before changing/deleting contacts.
ListingFulfillmentService prepares/validates in the caller transaction; no nested
command or cross-module mutation. Version/ownership/region are server checks.

Authorization precedes receipt replay; replay precedes current-origin validation.
Thus a matching committed request replays after its origin is deleted, but a new
command cannot select it. 404 conceals foreign/missing addresses, 409 means stale
version, 422 rejects unsupported fields/methods. Existing active/account rules apply.
SQL checks reinforce all-or-none columns, owner/version/region matching at revision
write, immutable identities and submitted revisions. Raw SQL must still obey lock
ordering; the triggers do not make arbitrary multi-row writers deadlock-free.

## Clients and evidence

RN uses the shared query/session/UI, chooses an explicit address (no implicit default)
and preserves the frozen reference on retry. Returning from the address book keeps
the listing form; fresh data shows a stale choice but never silently replaces it.
Review UI explains the missing/stale origin and blocks approval for NeedsUpdate.
Public detail discloses the simulated region and unavailable transaction workflow.

See [verification and limitations](../features/LISTING_FULFILLMENT_REPORT.md).
