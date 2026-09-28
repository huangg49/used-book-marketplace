# ADR 0006: Transactional catalog and draft commands

Date: 2026-09-26. Status: implemented for catalog and owner listing drafts.

## Decision

Implement the first 14 catalog/draft operations in OpenAPI 0.4.0. Controllers validate
against the shared OpenAPI schemas with Ajv 2020 and delegate business decisions to
CatalogService/ListingDraftsService. Contract validation is a runtime dependency;
the deployed workspace must include `@used-books/api-contract/openapi.yaml`.
Normalize strings, ISBN, language and UUIDs before validation/fingerprinting.
ISBN-13 also requires a 978/979 prefix; migration
`20260926020000_catalog_isbn_prefix` enforces it without rewriting existing data.

CommandService owns the transaction and the stable receipt protocol. Lock the
actor/operation/key with a transaction advisory lock, then users in UUID order and
the actor session. Re-read session, verified status and roles inside that transaction.
Review also locks the requester user before the catalog. Mutation services lock
catalog before listing, then revision/media. Cross-module access uses an explicit
CatalogService method. No external side effect runs in these transactions.

Role writers participate through migration `20260926010000_role_mutation_lock`.
Administrative code should explicitly lock all affected users in sorted order
before a bulk role change; row triggers are a database backstop, not a replacement
for ordering across multiple rows. Status updates naturally lock the user row.
Session revocation must acquire the session row lock. Future writers must preserve
this protocol; a guard result alone is insufficient authorization for a mutation.

Authorize access to a prior result, compare the SHA-256 of canonical operationId,
target ID and normalized body, and return a matching receipt before version or
new-command state validation. OperationId uniquely identifies method/route.
Keys are scoped to actor and operation. Arrays retain order; object key order is
irrelevant. Losing role/session still blocks replay. A committed save can replay
after its previously eligible catalog is rejected. Receipts describe the original
commit; clients must GET current state after reconciliation.

Each successful command atomically commits state, one receipt and one audit record.
Catalog mutations also append an outbox event; draft saves have no event consumer
or notification. Outbox rows remain undelivered until a real consumer exists.
ReadCommitted plus explicit row locks protects these commands. Retry serialization/
deadlock failures at most three attempts; return 503 on exhaustion or transaction
timeout. Never create a different key on an automatic retry.

Private reads recheck session and role in a transaction. Cursor pagination uses
keyset ordering and an HMAC signature bound to filters, operation and caller.
Database timestamp text retains microsecond precision. JWT signing key rotation
also invalidates cursors; clients reload page one. Public projection excludes
requester/reviewer and all draft metadata.

## Consequences and limits

Media extension: [ADR 0008](0008-free-private-media-storage.md) reuses this command
protocol for Media receipts/audits. Database connections now explicitly use UTC;
worker lease tests compare against DB time to catch timezone errors.

[ADR0007](0007-hcm-handover-auction-scope.md) expands the product target, not this
implementation. Future point/auction writers must extend the lock protocol and
typed contract; current handlers do not implement those workflows.

Conservative user locks serialize simultaneous writes by an actor and can contend
on a busy reviewer. This increment establishes correctness, not throughput claims.
Search uses normalized title/author text and escaped literal LIKE; catalog sorting
normalizes title in SQL. Benchmark representative data before choosing search indexes
or relaxing locks. Reads do not promise a multi-page snapshot.

Runtime schema validation prevents a separate DTO schema drifting from OpenAPI.
Safe typed field errors are emitted only for domain validation; infrastructure errors
retain the generic envelope and request ID. No raw payload is written to audit/logs.

Upload/media delivery/worker and RN private drafts subsequently landed under ADR 0008;
submit/review and reviewer media reads under [ADR 0009](0009-listing-submission-moderation.md).
Public listing, RN submission form and operations UI remain separate increments.
SQL fixtures test constraints but are not product flows.
See [HTTP/DB evidence](../features/CATALOG_DRAFT_API_REPORT.md).

Next design: [ADR 0013](0013-exclusive-commitment-foundation.md) extends this protocol
for typed workflow contexts, worker principals and a separate transaction receipt.
Those extensions are planned; the current CommandService remains listing/catalog/media only.

Follow-up address increment: [ADR0014](0014-member-address-book.md) adds a typed
AddressBookReceipt adapter to the same executor/store without changing existing
MutationReceipt discriminators. Transaction/worker principal extensions remain planned.
