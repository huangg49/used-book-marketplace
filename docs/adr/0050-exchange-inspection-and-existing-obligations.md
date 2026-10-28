# ADR 0050: Preserve each Exchange inspection window and existing obligations

28/10/2026. The owner approved the repository audit follow-up, then explicitly
excluded GHN/carrier changes pending a team decision. This correction implements
the existing SRS POL-08, FR-X08/X09, BR-18 and existing-obligation rules; it does
not authorize a new completion/dispute product or close READINESS gates.

## Decision

- Each participant's valid receipt pins a separate 72-hour inspection deadline.
  The compatibility `inspectionDeadline` is the later deadline once both books
  were received. Receiving the second book never changes the first deadline.
- `completeExchange` records inspection acknowledgement. Even two acknowledgements
  do not waive either deadline or release money early. Worker/command settlement
  requires both receipts, both elapsed deadlines and no retained dispute evidence.
  `ResolutionPending` and any retained dispute fields remain blockers even if
  another legacy writer changes the state to `Delivered`.
- The obsolete `EXCHANGE_INSPECTION_HOURS` setting cannot shorten these windows.
  Migration `0039-exchange-inspection-deadlines` adds participant deadline fields
  and backfills active received records from receipt times, preserving a longer
  historically promised common window. It preserves terminal
  history, applied checksums, versions, ledger entries and reservations. Deploy
  API and worker together after migration, with workers stopped during upgrade;
  do not run old workers against the upgraded protocol.
- LOCKED/RESTRICTED participants may read an existing Exchange, send its book,
  receive, acknowledge inspection, cancel within existing allowed states, or
  dispute it. Current session, membership, participant, state and version checks
  still apply before a command/replay. No new proposal, acceptance, funding or
  counter-offer is enabled. LOCKED cannot cancel a merely Proposed exchange.
- Paid point-order read/report/code/claim HTTP handlers receive the method-level
  ExistingObligation annotation already supported by their services/command
  allowlist. New payment and delivery method selection remain restricted.

## Compatibility and boundaries

OpenAPI 0.56.0 adds two nullable response fields and clarifies acknowledgement and
LOCKED access. Existing command intent/key/body/version semantics are preserved.
Clients show both deadline information and that acknowledgements do not release
funds early. Existing records without the fields use a conservative 72-hour
receipt-time fallback for decisions until migrated.

GHN adapter, carrier controller/service, driver portal and carrier request schemas
are unchanged at the owner's request. Their public lookup/webhook/provider risks
remain pending the team decision; the settlement dispute check is a separate
Exchange invariant, not evidence that the carrier surface is secure.

DirectDelivery completion source is still ahead of the F2h readiness gate.
Ordinary ViaPoint, full dispute adjudication/return, funded mutual cancellation,
native acceptance and independent human review retain their existing limitations.
No migration, seed or automated test is authorized against the main local DB.

## Verification

Use isolated Mongo QA (`*_test`). Cover separate receipt times, no settlement at
48h/before the later 72h deadline, acknowledgement holds, migration/restart,
LOCKED/foreign/revoked-session access, and a contended dispute-versus-worker race.
Exact run evidence and remaining checks belong in SESSION_STATE.
