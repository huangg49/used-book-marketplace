# ADR 0014: Private address book and demo service areas

2026-09-27. Status: implemented, OpenAPI0.9.0. F0 of the transaction plan;
fulfillment, quotes, checkout and reservations remain planned.

Follow-up: [ADR0015](0015-listing-delivery-origin.md) implements DirectDelivery
origin references, adds per-contact content versions and identity-only history.
Quotes, checkout and reservations remain planned. The decision below records
the original address-book increment; no contact snapshots are added by ADR0015.

## Decision

Verified ACTIVE/RESTRICTED MEMBERs may maintain their own address book. Staff/Admin
need MEMBER and cannot access another person's book. Current LOCKED/DISABLED/session
rules remain unchanged. Address maintenance does not authorize a new transaction
or modify an existing agreement; locked-obligation capabilities remain future work.

Relational AddressBook/MemberAddress and ServiceArea/ServiceLocality use owner and
area/locality foreign keys. Migration adds HCM-DEMO-v1 with DEMO-A/B, explicitly
simulated service localities, not official wards, handover points or partners.
Directory is authenticated MEMBER-only for the private form. No admin geography UI,
geocoding or real-world address validation; a real dataset needs reviewed provenance
and a new version. Do not infer area from free text/IP.

All writes serialize on the existing User lock. expectedBookVersion starts at0,
advances once per command and is never reset after deleting all addresses. A maximum
of10 records and exactly one default when nonempty are enforced by service and SQL
partial unique index/deferred constraint triggers. First address becomes default;
deleting default promotes earliest remaining (createdAt,id). makeDefault=false does
not unset an existing default; selecting another address changes it. Book-wide
conflicts deliberately prevent silent overwrites of concurrent default changes.

The POST archive command deletes the live address row, not a tombstone retaining
contact data. Address book/version and ID-only receipt/audit remain for replay.
Future transaction snapshots must be independent immutable records; future listing
origin references must handle address deletion/version changes through their service.
Neither integration exists today. Preserve all earlier migration checks/triggers.

CommandService has a typed AddressBookReceipt adapter over its existing executor,
transaction, canonical hash, retry and receipt store. Existing MutationReceipt
discriminators remain unchanged. Add addressBookId FK to receipt/audit, keeping
exactly-one target. No recipient/phone/detail in receipt, audit or application logs.
No notification outbox needed. Replay authorizes current actor/session/member role
before checking scoped key/hash; deleted addresses may replay without recreation.

Phone syntax is ten ASCII digits starting0, not phone verification. Trim input,
validate Unicode code-point lengths and reject control characters. Existing errors:
401 session,403 role,404 ownership,409 version/key,422 fields/area,429 quota.
Reads are no-store. Default and quota checks happen inside the same transaction.

RN `/addresses` uses shared UI/query/session; no separate token or PII persistence.
Frozen in-memory intent retries identical body/key after unknown outcome. Once
acknowledged, retry only GET. Definitive errors require explicit reconciliation;
no auto-rebase. Navigation/web unload warn about unsaved/uncertain changes. Native
keyboard/Back/TalkBack still need device evidence. See [report](../features/ADDRESS_BOOK_REPORT.md).
