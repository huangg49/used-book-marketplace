# ADR 0018: Finite simulated funding and an immutable VND ledger

2026-09-28. F2a backend increment; OpenAPI 0.13.0. Sources: SRS 1.1 FR-W01–04,
AC-38, §9.1, §13; ADR 0013 and the transaction foundation plan. This is not the
whole F2, a production wallet, or permission to charge an Order.
Follow-up: [ADR 0019](0019-locked-existing-obligations.md) adds LOCKED wallet/history
reads with topupEnabled=false. The F2a baseline below predates that access increment.
[ADR 0020](0020-order-wallet-payment.md) subsequently adds typed OrderHold accounts,
payment/refund journals, posting sequence and hold-aware reconciliation. The source
is still the same finite 100M opening journal; no refill or balance adjustment.

## Scope and accounting

Implement a private wallet summary, topup intent create/read/list, posted history,
and an independent TEST_OPERATOR simulator event endpoint. Every response labels
the value `demoOnly: true`, `Mô phỏng đồ án`, VND. No payment/withdrawal/hold endpoints
or frontend are supplied. ACTIVE/RESTRICTED verified Members can request topups;
the LOCKED obligations capability remains a separate mandatory gate before payment.
An already valid intent can receive funds after its recipient loses account/role
eligibility: accepting a verified provider result does not grant a new user action.

Use logical transfer accounts with debit increasing UserAvailable/SimulatorClearing
and credit decreasing them. SimulatorCapital is the opposite normal balance. Money
is integer VND, stored as bigint entries; there is no mutable balance column/cache.
Return safe JSON numbers bounded by the finite source. Summary holds are explicitly
zero with payment/withdrawal capability false; this does not claim hold support.

Migration 11 creates a single immutable opening journal: credit SimulatorCapital
100,000,000 VND and debit SimulatorClearing 100,000,000 VND. This is an implementation
demo budget, not SRS POL-42's separate 2,000,000 VND point incident fund. No incident
account or automatic refill exists. Each topup is 1,000–10,000,000 VND; at most ten
Pending/Processing/ReviewRequired intents per owner. These bounded demo limits are
explicit implementation choices, not new business fees. No real payment is possible.

## Events and state

Member creates Pending without credit. Operator emits Processing/Succeeded/Failed
through the server adapter; Pending can accept a terminal event directly when an
earlier Processing delivery is absent/delayed. Only first matching success posts
SimulatorClearing → UserAvailable. New Processing after a terminal state is ignored;
same terminal outcome with another event ID does not credit again. New contradictory
terminal evidence or mismatched amount/currency/recipient/time makes ReviewRequired.
ReviewRequired is sticky and its subsequent events remain evidence only. Credited
money/journal remains recorded if a later contradiction is found: no silent reversal.
No automatic resolution/adjustment UI or journal exists in this increment.

There is no arbitrary UI expiry for topup intents. They do not reserve books and
are not linked to an Order; delayed valid funding only increases available. Provider
occurredAt must be at/after intent creation and no more than five minutes ahead of
DB receivedAt. Older events are allowed without an age cutoff; duplicate identity
and state checks enforce safety. Both timestamps and payload SHA-256 are retained.

Authentication: current ACTIVE TEST_OPERATOR, different from intent owner, rechecked
with user/session locks. ADMIN/STAFF do not imply this permission. Server adapter
HMAC-SHA256 signs the canonical envelope with a separate PAYMENT_SIMULATOR_SECRET;
the same processing path verifies it. Invalid signatures are rejected, never stored
as trusted evidence. No public callback endpoint is exposed. A real provider needs
its own authenticated adapter and reviewed integration, not a new public bypass.
Secret unset disables intent creation/emission; production boot rejects a configured
simulator. The secret/signature never reaches Member clients, receipts or logs.

HTTP command idempotency uses existing CommandService: current authorization before
replay, actor/operation/key and payload hash. Provider event IDs additionally dedupe
globally across operators and HTTP keys. Reuse with a different envelope returns 409
without new evidence/credit. A semantically duplicate event under a fresh HTTP key
gets a fresh command receipt, but leaves event count, version and journal unchanged.
`Idempotency-Replayed` describes the HTTP key, not the provider dedupe decision.

## Atomicity and database protections

Lock order: command advisory key → sorted actor/recipient users → session → intent
→ provider event advisory key → sorted wallet accounts. No transaction performs
network I/O. Sample PostgreSQL clock after funding locks; recheck session expiry
before effects. All writes (intent/event/journal/entries/receipt/audit/outbox) commit
together, or none do. Source exhaustion returns 503 and leaves the event unconsumed
for explicit retry; it cannot mint funds or mark a failed financial transfer complete.

LedgerService receives the caller Tx and exposes typed postTopup, not a general
client-supplied account transfer. A future hold/refund/settlement increment must
add reviewed business types/source invariants and tests before expanding it.

Database checks enforce exactly two balanced entries for the supported journal
types, bounded VND amounts, unique journal/intent/event, typed source/recipient
matching, nonnegative available/clearing, append-only accounts/journals/entries/
events, valid intent transitions, and event/version/receipt/audit/outbox consistency.
Account locks protect SQL writers too. Existing migration history and auth/listing/
Order invariants remain. Privileged database owners can disable triggers; application
authorization and restricted database operations remain necessary.

## Reconciliation and remaining gates

`pnpm --filter @used-books/api wallet:check` after build uses a read-only repeatable
snapshot to validate each journal source and each intent's event/receipt consistency,
then reports balanced totals and source/member sums. Nonzero exit on discrepancy;
it never edits entries. Daily scheduling, durable discrepancy cases, automated
settlement blocking and resolution remain FR-W08 work; do not call this complete
scheduled reconciliation. No settlement operation exists to enable in F2a.

Next: LOCKED obligations access, then atomic Order payment/hold vs cancellation/
expiry and fulfillment. Native wallet UI, operations simulator panel, refunds,
withdrawals and incident fund each need their own contracts and evidence. See
[wallet report](../features/SIMULATED_WALLET_REPORT.md) for actual verification.
