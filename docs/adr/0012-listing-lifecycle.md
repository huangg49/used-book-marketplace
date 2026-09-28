# ADR 0012 — Listing lifecycle after approval

Date: 2026-09-27. Status: implemented, OpenAPI 0.8.0.

Follow-up: [ADR0015](0015-listing-delivery-origin.md) adds delivery origins to
revision content. Approved origin changes use this same replacement flow; reopen
checks that a configured origin still exists at its selected content version.

## Decision

Implement `reviseApprovedListing`, `setListingVisibility`, `archiveListing` and
`removeListing` in the listings module using the existing CommandService receipt,
audit, user/session lock and version protocol. No schema migration is required.
Do not alter migration triggers or introduce transaction/commitment stubs.

Approved replacement validates SubmittedContent and declaration, an accessible
catalog and 1–8 Ready derivative images belonging to the listing. Create and
attach media to a new revision before freezing it. Move currentRevision and
moderation to PendingReview atomically, preserving visibility and old revisions.
Emit ListingSubmitted in that transaction. Prior approved content immediately
fails the public predicate on the next read; neither upload nor local form editing
alone changes the published revision. Pending catalog may be submitted but still
blocks later approval until confirmed, as in the existing submission workflow.

Hide requires Approved/Visible/Available; reopen requires Approved/Hidden/Available
and an ACTIVE verified member plus Confirmed catalog and valid Ready derivatives.
The same visibility requested with a new key is an invalid transition, not another
version increment. A matching prior key replays its original receipt. Hiding and
archiving permit RESTRICTED members; creating content or reopening does not.

Archive sets deletedAt without deleting files or history. It applies to Available
nonremoved listings, including pending review. Receipt authorization checks the
current member/session/ownership but permits a deleted target so an acknowledged
archive can be replayed. New commands and all private/public content reads reject
deleted targets. No restore endpoint is offered.

Removal requires an independent ACTIVE STAFF/ADMIN and a trimmed reason of
10–1000 Unicode code points. Limit operations access to a submitted current
revision, consistent with review reads: unpublished working drafts cannot be
removed through this operations workflow. Set Removed/removalReason, retaining
moderation/trade/content. Commit ListingRemoved and audit/receipt atomically.
Owners see the reason but cannot revise, reopen or archive a Removed listing.
Reviewer history remains available for a nondeleted removed listing. Operations
UI offers removal after a review outcome; pending review has approve/reject.

All commands reject Reserved/Sold/Exchanged/ClosedUnavailable; none releases a
reservation or handles a transaction obligation. Future commitment/custody
services must extend eligibility and locking before transactional listings exist.

## Concurrency

Command lock ordering remains advisory intent → sorted actor/owner users → actor
session → catalog (when needed) → listing → revision → sorted images. Removal
discovers/locks the immutable owner like review. Reopen locks the discovered
catalog before the listing and rejects pointer/version changes after the wait.
Replacement locks its explicitly requested catalog before the listing. Hide,
archive and removal need no catalog mutation/eligibility lock.

Authorize target access before receipt replay; check version and state only for
a new command under the listing lock. Recheck account/roles under user locks.
Version increments and append-only records commit together. Race and audit
failpoint tests verify no partial revisions, deletes or visibility changes.

## UI and retry

RN reuses the existing four-step editor after an explicit “Sửa bài đã duyệt”.
Full replacement has one frozen POST intent, with declaration and confirmation;
it never saves through draft or sends a second submit command. The local form is
not a durable draft of an approved replacement; leaving/restarting may discard it.
Uploads remain unattached until the replacement is submitted. Existing orphan
cleanup applies; submitted revision images remain retained.

Hide/reopen/archive use ConfirmDialog with the consequence stated. Keep the exact
body/key across unknown network outcomes. After acknowledgement, refresh only;
archive can return to the list without GET of deleted content. Definitive errors
freeze the intent for reconciliation, never silently rebase its expectedVersion.
Dismissed dialogs retain an explicit reconciliation action; leaving with an
unresolved command warns the user. Disable competing editor commands while one
is unresolved. Reconcile owner caches and invalidate shelf/detail after success.

Operations reuses its existing decision panel, reason validation, confirmation,
leave guards and immutable intent retry for removal. Do not report a removal as
an inspection result. No notification delivery is claimed from an outbox row.

## Evidence

See [lifecycle report](../features/LISTING_LIFECYCLE_REPORT.md). Native runtime,
picker/font scaling, iOS build and production performance remain separate QA.
The [acceptance audit](../features/LISTING_ACCEPTANCE_REPORT.md) adds deterministic
commit barriers for competing lifecycle commands and a browser publishing journey;
it does not close the native gate.
