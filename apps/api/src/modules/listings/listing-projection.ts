import type { Collections } from '../../database/mongo/collections.js';
import type {
  CatalogBookDoc,
  ListingDecisionDoc,
  ListingDoc,
  ListingRevisionDoc,
  RevisionMediaDoc,
} from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import type { Wire } from '../commands/domain-error.js';
import {
  originReference,
  originStatus,
} from './listing-fulfillment.service.js';

// A revision with what projections need: ordered photo links, its decision and
// the live version of its origin address (null once the contact is deleted).
export type Revision = ListingRevisionDoc & {
  media: RevisionMediaDoc[];
  decision: ListingDecisionDoc | null;
  originCurrentVersion: number | null;
};
export type Listing = ListingDoc & {
  currentRevision: (Revision & { book: CatalogBookDoc | null }) | null;
  // The latest decided revision (PostgreSQL: revisions with a decision, number desc, take 1).
  revisions: Revision[];
};

export async function loadRevisions(
  c: Collections,
  docs: ListingRevisionDoc[],
): Promise<Revision[]> {
  const ids = docs.map((r) => r._id);
  const links = await c.revision_media
    .find({ revisionId: { $in: ids } }, { sort: { position: 1 } })
    .toArray();
  const decisions = await c.listing_decisions
    .find({ revisionId: { $in: ids } })
    .toArray();
  const origins = await c.member_addresses
    .find({
      _id: { $in: docs.flatMap((r) => r.originAddressId ?? []) },
    })
    .toArray();
  return docs.map((r) => ({
    ...r,
    media: links.filter((m) => m.revisionId === r._id),
    decision: decisions.find((d) => d.revisionId === r._id) ?? null,
    originCurrentVersion:
      origins.find((a) => a._id === r.originAddressId)?.version ?? null,
  }));
}

export async function loadListing(
  c: Collections,
  id: string,
): Promise<Listing | null> {
  const l = await c.listings.findOne({ _id: id });
  if (!l) return null;
  const current = l.currentRevisionId
    ? await c.listing_revisions.findOne({
        _id: l.currentRevisionId,
        listingId: l._id,
      })
    : null;
  const decided = await c.listing_decisions
    .aggregate<{ number: number; revisionId: string }>([
      {
        $lookup: {
          from: 'listing_revisions',
          localField: 'revisionId',
          foreignField: '_id',
          as: 'r',
        },
      },
      { $unwind: '$r' },
      { $match: { 'r.listingId': l._id } },
      { $sort: { 'r.number': -1 } },
      { $limit: 1 },
      { $project: { revisionId: 1, number: '$r.number' } },
    ])
    .toArray();
  const latestDoc = decided[0]
    ? await c.listing_revisions.findOne({ _id: decided[0].revisionId })
    : null;
  const [currentRevision] = current ? await loadRevisions(c, [current]) : [];
  const latest = latestDoc ? await loadRevisions(c, [latestDoc]) : [];
  const book = current?.bookId
    ? await c.catalog_books.findOne({ _id: current.bookId })
    : null;
  return {
    ...l,
    currentRevision: currentRevision ? { ...currentRevision, book } : null,
    revisions: latest,
  };
}

function decision(r: Revision): Wire['ReviewDecision'] | null {
  const d = r.decision;
  return d
    ? {
        id: d._id,
        revisionId: d.revisionId,
        decision: d.decision,
        reason: d.reason,
        decidedAt: d.decidedAt.toISOString(),
      }
    : null;
}
// The validator's revision_mode_prices rule enforces the mode/price union.
export function revision(r: Revision): Wire['ListingRevision'] {
  return {
    id: r._id,
    number: r.number,
    submittedAt: r.submittedAt?.toISOString() ?? null,
    ownershipDeclaredAt: r.ownershipDeclaredAt?.toISOString() ?? null,
    decision: decision(r),
    fulfillmentStatus: originStatus(r),
    content: {
      ...(r.originAddressId ? { fulfillment: originReference(r) } : {}),
      bookId: r.bookId,
      mode: r.mode,
      condition: r.condition,
      pages: r.pages,
      coverNote: r.coverNote,
      notes: r.notes,
      accessories: r.accessories,
      readable: r.readable,
      hasMissingPages: r.hasMissingPages,
      missingEssentialContent: r.missingEssentialContent,
      description: r.description,
      salePrice: r.salePrice,
      exchangeValue: r.exchangeValue,
      mediaIds: r.media.map((m) => m.mediaId),
    } as Wire['DraftContent'],
  };
}
export const state = (l: ListingDoc): Wire['ListingState'] => ({
  moderation: l.moderation,
  visibility: l.visibility,
  trade: l.trade,
  deletedAt: l.deletedAt?.toISOString() ?? null,
});

export function projection(l: Listing): Wire['PrivateListing'] {
  const latest = l.revisions[0];
  return {
    id: l._id,
    ownerId: l.ownerId,
    version: l.version,
    state: state(l),
    currentRevision: revision(l.currentRevision!),
    latestDecision: latest ? decision(latest) : null,
    removalReason: l.removalReason,
    catalogStatus: l.currentRevision?.book?.status ?? null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

// Draft content fields stored on a revision (everything but photos/origin).
export function revisionContent(
  content: Omit<Wire['DraftContent'], 'mediaIds' | 'fulfillment'>,
) {
  return {
    bookId: content.bookId?.toLowerCase() ?? null,
    mode: content.mode ?? null,
    condition: content.condition ?? null,
    pages: content.pages ?? '',
    coverNote: content.coverNote ?? '',
    notes: content.notes ?? '',
    accessories: content.accessories ?? '',
    readable: content.readable ?? null,
    hasMissingPages: content.hasMissingPages ?? null,
    missingEssentialContent: content.missingEssentialContent ?? null,
    description: content.description ?? '',
    salePrice: content.salePrice ?? null,
    exchangeValue: content.exchangeValue ?? null,
  };
}

// Commit-time replacement for latlai_check_listing, the frozen-revision photo
// rule of latlai_check_aggregate_trigger and latlai_check_commitment_projection.
export async function checkListing(tx: Tx, listingId: string) {
  const l = await tx.c.listings.findOne({ _id: listingId });
  if (!l) return;
  const r = l.currentRevisionId
    ? await tx.c.listing_revisions.findOne({
        _id: l.currentRevisionId,
        listingId,
      })
    : null;
  if (!r) throw new Error('Listing requires its own current revision');
  // Ownership part of latlai_revision_origin_check. Address identities are
  // append-only, so this holds for stale/deleted origins too (version currency
  // is checked under lock by ListingFulfillmentService.prepare).
  if (
    r.originAddressId &&
    (await tx.c.address_identities.findOne({ _id: r.originAddressId }))
      ?.ownerId !== l.ownerId
  )
    throw new Error('Origin is not an address of the listing owner');
  const decision = await tx.c.listing_decisions.findOne({ revisionId: r._id });
  const d = decision?.decision;
  // latlai_guard_decision: nobody reviews their own listing.
  if (decision && decision.reviewerId === l.ownerId)
    throw new Error('Stale revision or self-review');
  if (
    (l.moderation === 'Draft' && (r.submittedAt || d)) ||
    (l.moderation === 'PendingReview' && (!r.submittedAt || d)) ||
    (l.moderation === 'Approved' && (!r.submittedAt || d !== 'Approve')) ||
    (l.moderation === 'Rejected' && (!r.submittedAt || d !== 'Reject'))
  )
    throw new Error('Moderation does not match current revision/decision');
  if (r.submittedAt) {
    const links = await tx.c.revision_media
      .find({ revisionId: r._id })
      .toArray();
    const ready = await tx.c.listing_media.countDocuments({
      _id: { $in: links.map((m) => m.mediaId) },
      listingId,
      status: 'Ready',
      purgedAt: null,
    });
    if (links.length < 1 || links.length > 8 || ready !== links.length)
      throw new Error('Submission requires 1-8 Ready photos');
  }
  if (
    l.moderation === 'Approved' &&
    !(await tx.c.catalog_books.findOne({ _id: r.bookId!, status: 'Confirmed' }))
  )
    throw new Error('Approval requires confirmed catalog');
  const active = await tx.c.exclusive_commitments.findOne({
    listingId,
    status: 'Active',
  });
  const exchange = await tx.c.exchanges.findOne({
    $or: [
      { initiatorListingId: listingId },
      { initiatorListingIds: listingId },
      { recipientListingId: listingId },
    ],
    status: {
      $in: [
        'AcceptedAwaitingFunding',
        'Preparing',
        'InTransit',
        'Delivered',
      ],
    },
  });
  const legacyPurchase =
    l.trade === 'Reserved' && !active && !exchange
      ? await tx.c.purchase_conversations.findOne({ listingId, status: 'Active', expiresAt: { $ne: null } })
      : null;
  // New conversations do not reserve inventory. This temporary projection
  // still recognizes reservations created by the previous 24-hour behavior.
  const reserverCount =
    (active ? 1 : 0) + (legacyPurchase ? 1 : 0) + (exchange ? 1 : 0);
  if ((l.trade === 'Reserved') !== (reserverCount === 1) || reserverCount > 1)
    throw new Error('Listing/commitment projection mismatch');
  if (active) {
    const item = await tx.c.workflow_items.findOne({
      _id: `${active.currentContextId}:${listingId}`,
    });
    if (item?.listingRevisionId !== l.currentRevisionId)
      throw new Error('Reserved listing revision cannot change');
  }
  if (legacyPurchase && (legacyPurchase.sellerId !== l.ownerId || legacyPurchase.listingVersion >= l.version))
    throw new Error('Purchase conversation/listing mismatch');
}
