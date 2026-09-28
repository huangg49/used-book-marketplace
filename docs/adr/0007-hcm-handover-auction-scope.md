# ADR 0007: TP.HCM, managed handover points and bounded auctions

Date: 2026-09-26. Status: product scope accepted by project owner; specification
baseline completed; implementation planned. No claim of instructor approval.

## Decision

Use [SRS 1.1](../SRS_V1_1.md) and its normative annex
[LOCAL-AUCTION-01](../features/LOCAL_HANDOVER_AUCTION.md) as the current business
baseline. Preserve the original SRS/HTML/PlantUML/PNG/SVG/ZIP v1.0 as historical
artifacts; the new index points to v1.1. React Native remains the first Member
client, operations web serves assigned Staff/Admin; the API remains Flutter-compatible.

Serve one configurable area representing TP.HCM. The demo uses two explicitly
simulated, internally managed points. Do not invent partner businesses or pretend
the demo addresses are operational. Keep direct shipping. Point fulfillment is
optional for ordinary Sale/Exchange, mandatory before opening an auction.
One transaction uses one point; no inter-point transfers or indefinite consignment.

Point inspection establishes documented condition observations, not authenticity.
Separate listing approval, physical inspection, custody, transfer and financial
settlement. Assigned Staff must be independent of the case participants. Recheck
assignment, account, session, capacity and blockers inside atomic commands.

Each chosen carrier leg has an explicit payer and funding source. Direct Order
retains seller advance and buyer reimbursement; point routes use separate carrier
fee holds and never reimburse that same fee to the seller again. Point service
fees are zero in the demo; exchange deposits remain 100% of the value to receive.
A finite simulated platform fund covers independently determined point custody
incidents; this narrowly changes the old exclusion of all platform-funded compensation.

Auctions use approved Sale listings already held and inspected at a point. Manual
bids and private Auto ceilings follow one price grid and deterministic tie rules.
BuyNow disappears at first valid bid. Auction close forms one ordinary Order;
winner nonpayment ends the attempt, with no automatic runner-up or relisting.
One exclusive commitment protects a listing across purchase, exchange and auction.

## Consequences

New point assignment/capacity, custody receipts, inspection reports, recipient
acceptance, collection codes, incidents and auctions require contract-first feature
increments. Extend the current schema via reviewed migrations; do not replace
existing SQL invariants or synthesize working APIs from this document.

Conservative capacity reserves a slot throughout the transaction, including outbound
inspection, so returns have space. It lowers utilization but makes a two-point demo
predictable. No-show never authorizes confiscation. No-report/no-funding/no-consent
never authorizes handover. Two-book exchange requires both books and both acceptances.

No new third-party integrations are authorized by this ADR. Payments/carrier remain
simulated; real books may be used at a permitted demonstration desk. No GPS/routing
optimization, legal authenticity certification, commercial auction operation or
real-money guarantee is claimed. These boundaries preserve a demonstrable workflow.

Implementation evidence remains the [catalog/draft report](../features/CATALOG_DRAFT_API_REPORT.md).
Future evidence must cover [the new acceptance matrix](../features/LOCAL_TRANSACTION_ACCEPTANCE.md)
as well as inherited transaction requirements. Schema-only and happy-path demos do
not satisfy ownership, funds, custody, deadline and concurrency obligations.

Follow-up 2026-09-27: [ADR 0013](0013-exclusive-commitment-foundation.md) refines the
shared commitment design and implementation gates without changing the accepted
shipping, point or auction scope. It does not implement transaction APIs.
