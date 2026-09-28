# ADR 0009: Listing submission and independent moderation

Date: 2026-09-27. Status: implemented API increment, OpenAPI 0.6.0.

Follow-up: approved replacements and lifecycle controls are implemented under
[ADR 0012](0012-listing-lifecycle.md), preserving this moderation/locking protocol.

## Decision

Extend the command protocol in [ADR 0006](0006-catalog-draft-commands.md) with
submitListing and decideListing. Submit validates the saved SubmittedContent,
the declaration, accessible catalog and 1–8 Ready images. Draft freezes in place;
resubmitting Rejected clones a new revision, attaches media, then freezes it.
Prior content, ordering and decisions stay immutable. Ownership is the immutable
listing owner; declaration time is on the revision and actor is in the command audit.

Review requires an ACTIVE STAFF/ADMIN independently of the owner, exact listing
version and revision ID. Approval requires all six checklist entries, a Confirmed
catalog and an ACTIVE, verified owner with MEMBER role. Rejection requires a
10–1000 character trimmed reason and remains possible for an ineligible owner.
Both decisions require PendingReview, Available and a nondeleted/nonremoved listing.

Discover the immutable owner before locking. Lock sorted actor/owner users,
actor session, catalog, listing, current revision and sorted media. Recheck the
discovered revision pointer and expected version after acquiring the listing lock;
never lock a replacement catalog in the opposite order. Owner eligibility is read
under its user lock, so role/status changes serialize with approval. Write the
decision before changing moderation, as required by existing SQL triggers.
No schema change or migration rewrite is necessary.

Commit moderation/version, receipt, audit and ListingSubmitted/Approved/Rejected
outbox event together. Matching receipt replay precedes new-command version/state
validation, while current role/session and target access are still required.
Review reads and receipts never imply notification delivery.

Operations queue/detail only expose submitted current revisions. A rejected
listing being edited has a private working draft: detail returns 404 until it is
submitted again. Operations revision history only contains submitted revisions,
including older rejected content. The queue accepts PendingReview/Approved/Rejected,
defaults to PendingReview, excludes deleted/Removed listings and orders by
submittedAt,id ascending. Removed submitted history is still readable.

Reviewer image reads require Ready nonpurged media linked to a submitted revision
of the nondeleted listing. Unattached uploads and working-draft-only images remain
private. Commit an access audit before signing outside the transaction, then
recheck current role/session and media scope before returning the URL. URL lifetime
remains 120 seconds; previously issued links cannot be instantly revoked.

## Consequences and limits

These endpoints provide a real shared backend for RN, Flutter and operations.
They do not constitute a completed screen flow. Public shelf/media, changes after
approval, visibility/delete/remove commands, operations web and RN submission UI
remain separate increments. Public reads must check current owner eligibility;
an old approval is not sufficient after owner restriction.

Follow-up 2026-09-27: the [RN submission form](../features/RN_LISTING_SUBMISSION_REPORT.md)
now consumes these endpoints. It retains separate save/submit keys and frozen
payloads through ambiguous failures, reconciles receipts with GET, and protects
unsaved edits from polling. Operations review UI is now implemented under
[ADR 0010](0010-operations-review-client.md); public shelf subsequently landed under
[ADR 0011](0011-public-shelf.md);
native form/picker verification is still pending.

Moderation is a human review of the supplied evidence. It does not prove that
photos are original or that a physical book is authentic. Point inspection and
auction intake remain planned under SRS 1.1.

See [HTTP/PostgreSQL verification](../features/LISTING_REVIEW_API_REPORT.md).
