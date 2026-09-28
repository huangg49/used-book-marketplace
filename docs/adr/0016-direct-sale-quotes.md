# ADR 0016: Immutable DirectDelivery sale estimates

2026-09-27. Implemented in OpenAPI 0.11.0. This completes the direct-sale quote
part of F0; Order, reservation, funding and shipment workflows remain planned.
Business authority: SRS 1.1, ADR 0007 and the commitment design in ADR 0013.

## Decision

Add `POST /listings/{listingId}/quotes` and buyer-only `GET /me/quotes/{quoteId}`.
The authenticated Member selects an owned destination address/content version and
the listing version/revision they saw. The only method is DirectDelivery. The
server derives price, origin, area and policy. Closed request schemas reject client
amounts, payer overrides and unsupported methods. No quote UI or buy button yet.

Only an ACTIVE buyer, distinct from the seller, may create a new estimate. The
listing must satisfy the existing public eligibility predicate and Sale/Both mode,
with a current origin and destination in HCM-DEMO-v1. A quote never changes listing
version/trade, reserves stock, creates an Order, holds money or grants future
checkout authority. Multiple buyers can obtain estimates for the same copy.

Policy HCM-DIRECT-v1 uses S=30,000 VND (POL-22) and 500 basis points commission on
book price P only (POL-13). Commission rounds half up to integer VND (BR-20), using
integer arithmetic in TypeScript and SQL. Buyer total=P+S; proceeds on normal
completion=P+S−commission, including reimbursement of shipping advanced by Seller.
These are estimates, not ledger entries or proof of payment. All geography and
shipping amounts remain explicitly simulated.

The quote expires after five minutes and each buyer may have at most 20 unexpired
quotes, counted under that buyer's lock. These are technical defaults for estimate
freshness and write limiting, not the 15-minute Order reservation deadline in SRS.
Expired records remain immutable; no expiry worker is needed to release anything.
Retention/archival and global abuse limits require a separate decision before
production scale. The current limit is not a complete anti-abuse system.

## Storage and protocol

SaleQuote pins typed listing/revision/catalog, address identity/content-version,
area and immutable policy references plus computed amounts and deadline. It does
not retain address contact values. Identity-only references survive contact deletion.
SaleQuotePolicy is append-only; a locked selection row chooses the active policy.
Policy changes require a reviewed versioned data migration, not editing old rows.
No operational policy editor or external shipping provider is introduced.

Use the existing CommandService executor with a separate QuoteReceipt adapter and
typed quote foreign keys in receipt/audit. Authorization precedes replay; identical
committed requests replay the original receipt after expiry or address deletion.
Fresh work checks current eligibility. A Restricted buyer can read/replay their
own history, but cannot create a quote; Locked or revoked sessions cannot read it.
Another Member receives 404; a non-Member receives 403. No second receipt store.

Lock order: idempotency key → sorted buyer/seller users → session → policy selection
→ sorted selected addresses → catalog → listing → revision/media. Reads discover
the immutable seller and use the same sorted user locking path. User status, roles,
address changes and listing mutations serialize with creation. No provider calls
occur inside the database transaction. PostgreSQL `clock_timestamp()` is taken
after resource locks; session expiry is checked again then. Quote creation time,
receipt serverTime and TTL share this decision time.

Quote, receipt and audit commit together. No outbox event is emitted because no
downstream workflow is started. SQL protects immutable quotes/policies, typed
owners/revisions, amount bounds, balanced totals, rounding and source consistency.
API eligibility and the per-buyer quota remain service invariants under locks;
arbitrary SQL writers must obey the same protocol. Do not claim SQL checks alone
authorize a buyer or enforce all current listing eligibility.

## Reads and future checkout

GET returns the saved amounts and a current assessment, never silently reprices:
Expired first; otherwise Unavailable if buyer/listing eligibility fails; otherwise
Changed for listing/catalog/address/policy drift; otherwise Current. Assessment is
advisory at read time. Every future checkout must recheck all inputs, expiry and
eligibility atomically when acquiring the exclusive commitment.

Private projections exclude seller origin IDs and all contact values. Responses
use no-store. Audit and receipt exclude contact values and request bodies. No
public quote route exists. Stored addresses are copied into a separate immutable
agreement snapshot only when a future checkout really commits the transaction.

See [implementation and evidence](../features/DIRECT_SALE_QUOTE_REPORT.md).
