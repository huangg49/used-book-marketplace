# ADR 0005: Versioned listing contract and PostgreSQL invariants

Date: 2026-09-26. Status: contract/schema implemented; catalog/draft handlers implemented
under [ADR 0006](0006-catalog-draft-commands.md). Media/worker implemented under ADR 0008;
submission/moderation under ADR 0009; public listing under [ADR 0011](0011-public-shelf.md).
Approved edit/visibility/archive/removal handlers are implemented under [ADR 0012](0012-listing-lifecycle.md).

## Decision

Keep the React Native-first listing slice in the shared OpenAPI contract. Planned
operations carry an explicit implementation-status extension and description so
Swagger and generated types are not mistaken for running endpoints. Public,
owner and operations reads have separate routes and closed projections. Domain
mutations return stable receipts and require idempotency keys and entity versions.

CatalogBook is the stable identity throughout a catalog request. Immutable
CatalogRevision and CatalogDecision hold submissions and decisions; a second
CatalogRequest table duplicating book metadata is unnecessary. Confirmed ISBNs
are canonical ISBN-13 and unique; private pending requests do not reserve ISBNs.

Listing owns independent moderation, visibility and trade states. A working
ListingRevision freezes at submission. Changes after review create a new revision.
ListingMedia belongs to exactly one listing; composite foreign keys prevent a
revision from referring to another listing's assets. Ready derivatives and
submitted media ordering cannot be overwritten.

PostgreSQL owns constraints, decisions, receipts, append-only audit and durable
outbox/media jobs. Reviewed SQL extends Prisma with checks, immutable-row triggers
and deferred aggregate validation. Aggregate creation must set the current revision
within the same transaction. Prisma schema alone or db push does not reproduce
the complete database behavior.

## Consequences and boundaries

Media update: [ADR 0008](0008-free-private-media-storage.md) supersedes the planned
MinIO transport with private Supabase Storage and authenticated API uploads. Owner
media/worker code now exists; live-provider validation passed (see media report).
Native picker/upload remains a separate pending check.

Scope update: [ADR0007](0007-hcm-handover-auction-scope.md) accepts point/auction
requirements in SRS1.1. This ADR still describes the existing catalog/listing schema;
future fulfillment/commitment/custody changes require new reviewed migrations.

Creation/review writes follow the order documented in the
[implementation design](../features/LISTING_DATA_CONTRACT.md). Services must still
authenticate, check role/account/ownership/eligibility, use stable lock ordering,
validate canonical payloads, and commit state/receipt/audit/outbox together.
Constraints do not replace authorization, nor do they implement the entire state
machine. Test fixtures may use direct SQL; product workflows must use services.

Media upload uses private staging and immutable pinned input; processing and
delivery are outside database transactions with durable recovery records. Workers
were not part of the original schema increment; current Supabase implementation is
documented in ADR 0008. Reservation,
money and custody workflows remain out of scope.

Migrations and constraint tests are checked against PostgreSQL; API unit tests
validate schemas and wire-boundary examples. A schema-only increment cannot claim
the listing acceptance matrix, native readiness or production performance.
