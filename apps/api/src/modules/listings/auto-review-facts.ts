import type { Collections } from '../../database/mongo/collections.js';
import type { AutoReviewFacts } from './auto-review-policy.js';
import type { Listing } from './listing-projection.js';

// listing_decisions.reviewerId for a system approval. Reserved, not a user:
// it can never equal a listing owner and never signs in.
export const AUTO_REVIEWER_ID = '00000000-0000-4000-8000-00000000a1a1';

export class AutoReviewBlocked extends Error {
  constructor(readonly reasons: string[]) {
    super('Listing no longer meets the automatic review criteria');
  }
}

// Read before the provider call and again under locks at commit: a fact that
// changes during the call must block publication.
export async function autoReviewFacts(
  c: Collections,
  l: Listing,
  maxAutoPrice: number,
): Promise<AutoReviewFacts> {
  const r = l.currentRevision!;
  const owner = await c.users.findOne({ _id: l.ownerId });
  const mediaIds = r.media.map((m) => m.mediaId);
  const photos = await c.listing_media
    .find({ _id: { $in: mediaIds }, status: 'Ready', purgedAt: null })
    .toArray();
  const duplicate = await c.listing_media.findOne({
    sha256: { $in: photos.map((p) => p.sha256) },
    listingId: { $ne: l._id },
    purgedAt: null,
  });
  return {
    channel: l.channel,
    bundle: Boolean(r.bundle),
    catalogConfirmed: r.book?.status === 'Confirmed',
    ownerEligible:
      owner?.status === 'ACTIVE' &&
      Boolean(owner.emailVerifiedAt) &&
      owner.roles.some((role) => role.role === 'MEMBER'),
    readable: r.readable,
    hasMissingPages: r.hasMissingPages,
    missingEssentialContent: r.missingEssentialContent,
    conditionDisclosed: Boolean(
      r.condition && r.pages.trim() && r.coverNote.trim(),
    ),
    photoCount: photos.length,
    previouslyDecided: l.revisions.length > 0,
    hasListingFee: Boolean(await c.listing_fees.findOne({ _id: r._id })),
    duplicatePhoto: Boolean(duplicate),
    salePrice: r.salePrice,
    exchangeValue: r.exchangeValue,
    maxAutoPrice,
  };
}
