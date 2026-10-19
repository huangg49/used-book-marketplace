# ADR 0040: Free listings with five public or pending listings per owner

19/10/2026. Owner request replaces the 20,000 VND submission fee with a limit
of five listings: those displayed on the homepage plus those sent for review.
Hidden approved listings do not count. This supersedes the listing-fee portion
of [WALLET_CHECKOUT](../features/WALLET_CHECKOUT.md); checkout fees and funding
are unchanged.

## Decision

- New submissions, rejected resubmissions and approved edits are free. No wallet
  balance, fee record, ledger charge or wallet lookup is needed to submit.
  `WalletSummary.listingSubmissionFee` remains compatible and always returns 0.
  Obsolete `LISTING_SUBMISSION_FEE_VND` configuration is ignored, including 20000.
- Count once per physical listing owned by the Member: nondeleted/nonremoved,
  trade Available or Reserved, and either PendingReview or Approved + Visible.
  Hidden PendingReview still counts because it was sent for review. Draft,
  Rejected, Hidden Approved, archived, removed, Sold, Exchanged and
  ClosedUnavailable listings do not count. Sale/Exchange/Both share one cap.
- Submit and rejected resubmit acquire a slot. Reopening Hidden Approved and
  revising Hidden Approved into PendingReview acquire a slot too. Revising a
  visible approved listing retains its slot. Approval of a hidden pending listing
  releases its review slot; rejection, hide, archive, removal and terminal trade
  transitions release slots according to the same predicate.
- At five or more, a command that needs another slot returns HTTP409
  `ListingLimitReached`, preserving content, photos, revision and version. It
  creates no mutation receipt/audit/outbox. Retry after freeing a slot keeps the
  original key/body. Successful replay works even at capacity; current
  authorization always runs before replay.
- The shared command executor write-locks the owner before the count and state
  transition, serializing commands across listing IDs and sessions. Use the
  existing transaction protocol; no new counter, schema or migration is needed.
- Existing accounts over five keep their listings. They cannot acquire an
  additional slot until below five. No automatic hiding, deletion or money
  mutation is performed on existing records. Historical held listing fees keep
  their original approve/settle or reject/refund chain. Immutable fee history and
  wallet reconciliation remain readable and unchanged.

## Rollout and verification

Build and restart API/worker from the new source; there is no app-DB migration
or environment edit. Web/RN explain free posting and which listings count, and
display the server quota error while retaining the draft and retry intent.

HTTP/Mongo QA covers empty-wallet submission despite obsolete fee config,
mixed visible/pending capacity, owner isolation, rejection/resubmission,
hide/reopen/hidden edits, rollback, replay/current auth, and competing submit,
reopen and hidden-edit commands at the fifth slot. Historical fee outcomes and
ledger reconciliation remain covered. Browser QA uses a disposable `_test`
database and fake storage; it exercises quota rejection, hide, pinned retry and
lost response at 390/1440px. Native-device and release gates remain separate.
