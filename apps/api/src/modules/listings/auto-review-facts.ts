import type { Collections } from '../../database/mongo/collections.js';
import { evaluate, type RawSource } from '../price-assist/evidence.js';
import { activeOnlineOffers } from '../price-assist/online/price-lookup.service.js';
import type { AutoReviewFacts, AutoReviewSettings } from './auto-review-policy.js';
import { sellerTextSignals } from './auto-review-signals.js';
import type { Listing } from './listing-projection.js';

// listing_decisions.reviewerId for a system approval. Reserved, not a user:
// it can never equal a listing owner and never signs in.
export const AUTO_REVIEWER_ID = '00000000-0000-4000-8000-00000000a1a1';
const DAY_MS = 24 * 3_600_000;

export class AutoReviewBlocked extends Error {
  constructor(readonly reasons: string[]) {
    super('Listing no longer meets the automatic review criteria');
  }
}

export const sellerFields = (r: NonNullable<Listing['currentRevision']>) => ({
  pages: r.pages,
  coverNote: r.coverNote,
  notes: r.notes,
  accessories: r.accessories,
  description: r.description,
});

// BR-09: Staff-entered references and allowed-shop prices only. Other sellers'
// asking prices are never a standard, so they are not even loaded here.
async function trustedBounds(
  c: Collections,
  l: Listing,
  now: Date,
): Promise<AutoReviewFacts['priceBounds']> {
  const r = l.currentRevision!;
  const bookId = r.bookId;
  if (!bookId || r.book?.status !== 'Confirmed' || !r.book.currentRevisionId) return null;
  const book = await c.catalog_revisions.findOne({ _id: r.book.currentRevisionId });
  if (!book) return null;
  const refs = await c.price_references
    .find({ bookId, retiredAt: null })
    .sort({ observedAt: -1 })
    .limit(30)
    .toArray();
  const offers = await c.online_price_offers
    .find(activeOnlineOffers(bookId, book._id, true))
    .sort({ observedAt: -1 })
    .limit(10)
    .toArray();
  const raw: RawSource[] = [
    ...refs.map((s) => ({
      id: s._id,
      kind: s.kind,
      amount: s.amount,
      condition: s.condition,
      label: s.sourceLabel,
      sourceGroup: s.sourceGroup ?? null,
      url: s.sourceUrl,
      observedAt: s.observedAt,
      isbn: s.isbn,
    })),
    ...offers.map((o) => ({
      id: `online:${o._id}`,
      kind: 'OnlineRetail' as const,
      amount: o.amount,
      condition: null,
      label: o.shop,
      url: o.url,
      observedAt: o.observedAt,
      isbn: null,
    })),
  ];
  const evidence = evaluate(
    {
      bookId,
      condition: r.condition,
      readable: r.readable,
      hasMissingPages: r.hasMissingPages,
      missingEssentialContent: r.missingEssentialContent,
      conditionNote: '',
    },
    {
      id: bookId,
      title: book.title,
      authors: book.authors,
      publisher: book.publisher,
      publicationYear: book.publicationYear,
      language: book.language,
      edition: book.edition,
      category: book.category,
      isbn: book.isbn,
      confirmed: true,
    },
    raw,
    now,
  );
  return evidence.status === 'Proceed' ? evidence.bounds : null;
}

// Read before the provider call and again under locks at commit: a fact that
// changes during the call must block publication.
export async function autoReviewFacts(
  c: Collections,
  l: Listing,
  now: Date,
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
  const ownListings = await c.listings
    .find({ ownerId: l.ownerId }, { projection: { _id: 1 } })
    .toArray();
  const recentSubmissions = await c.listing_revisions.countDocuments({
    listingId: { $in: ownListings.map((o) => o._id) },
    submittedAt: { $gte: new Date(now.getTime() - DAY_MS) },
  });
  return {
    channel: l.channel,
    bundle: Boolean(r.bundle),
    catalogConfirmed: r.book?.status === 'Confirmed',
    ownerEligible:
      owner?.status === 'ACTIVE' &&
      Boolean(owner.emailVerifiedAt) &&
      owner.roles.some((role) => role.role === 'MEMBER'),
    ownerAccountAgeDays: owner
      ? Math.floor((now.getTime() - owner.createdAt.getTime()) / DAY_MS)
      : 0,
    recentSubmissions,
    readable: r.readable,
    hasMissingPages: r.hasMissingPages,
    missingEssentialContent: r.missingEssentialContent,
    condition: r.condition,
    conditionDisclosed: Boolean(
      r.condition && r.pages.trim() && r.coverNote.trim(),
    ),
    photoCount: photos.length,
    previouslyDecided: l.revisions.some((d) => d._id !== l.currentRevisionId),
    hasListingFee: Boolean(await c.listing_fees.findOne({ _id: r._id })),
    duplicatePhoto: Boolean(duplicate),
    salePrice: r.salePrice,
    exchangeValue: r.exchangeValue,
    priceBounds: await trustedBounds(c, l, now),
    textSignals: sellerTextSignals(Object.values(sellerFields(r))),
  };
}

export const settingsFrom = (
  get: (key: string, fallback: number) => number,
): AutoReviewSettings => ({
  maxAutoPrice: get('LISTING_AUTO_REVIEW_MAX_PRICE', 500_000),
  minAccountAgeDays: get('LISTING_AUTO_REVIEW_MIN_ACCOUNT_AGE_DAYS', 7),
  maxSubmissionsPerDay: get('LISTING_AUTO_REVIEW_MAX_SUBMISSIONS_PER_DAY', 5),
});
