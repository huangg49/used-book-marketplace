import type {
  ExchangeDoc,
  ListingDoc,
  UserDoc,
} from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import { invalidState, type Wire } from '../commands/domain-error.js';
import { requireMarketplace } from '../listings/listing-channel.js';

export type ExchangeAgreement = Wire['ExchangeAgreement'];
export type ExchangeBookSnapshot = Wire['ExchangeBookSnapshot'];

export const eligibleExchangeMember = (user: UserDoc | null) =>
  Boolean(
    user?.status === 'ACTIVE' &&
    user.emailVerifiedAt &&
    user.roles.some((role) => role.role === 'MEMBER'),
  );

// Caller locks users and listings first. Submitted listing and catalog revisions
// are immutable; copy their facts, never resolve history through today's shelf.
export async function snapshotExchangeBook(
  tx: Tx,
  listing: ListingDoc,
  ownerId: string,
): Promise<ExchangeBookSnapshot> {
  requireMarketplace(listing);
  if (
    listing.ownerId !== ownerId ||
    listing.trade !== 'Available' ||
    listing.moderation !== 'Approved' ||
    listing.visibility !== 'Visible' ||
    listing.deletedAt ||
    !listing.publishedAt ||
    !listing.currentRevisionId
  )
    throw invalidState();
  const revision = await tx.c.listing_revisions.findOne({
    _id: listing.currentRevisionId,
    listingId: listing._id,
  });
  if (
    !revision?.bookId ||
    !revision.submittedAt ||
    !revision.condition ||
    !['Exchange', 'Both'].includes(revision.mode ?? '') ||
    revision.bundle ||
    !revision.exchangeValue ||
    revision.exchangeValue < 1 ||
    revision.readable === null ||
    revision.hasMissingPages === null ||
    revision.missingEssentialContent === null
  )
    throw invalidState();
  const catalog = await tx.c.catalog_books.findOne({
    _id: revision.bookId,
    status: 'Confirmed',
  });
  const owner = await tx.c.users.findOne({ _id: ownerId });
  if (!owner) throw invalidState();
  const metadata = catalog?.currentRevisionId
    ? await tx.c.catalog_revisions.findOne({
        _id: catalog.currentRevisionId,
        bookId: revision.bookId,
      })
    : null;
  if (!metadata) throw invalidState();
  const links = await tx.c.revision_media
    .find(
      { revisionId: revision._id, listingId: listing._id },
      { sort: { position: 1 } },
    )
    .toArray();
  const media = await tx.c.listing_media
    .find({
      _id: { $in: links.map((m) => m.mediaId) },
      listingId: listing._id,
      status: 'Ready',
      purgedAt: null,
      derivativeKey: { $ne: null },
    })
    .toArray();
  if (!links.length || links.length > 8 || media.length !== links.length)
    throw invalidState();
  const {
    title,
    authors,
    publisher,
    publicationYear,
    language,
    edition,
    category,
    isbn,
    categoryId,
    attributes,
    series,
  } = metadata;
  return {
    listingId: listing._id,
    listingVersion: listing.version,
    revisionId: revision._id,
    ownerId,
    ownerDisplayName: owner.displayName,
    bookId: revision.bookId,
    catalogRevisionId: metadata._id,
    book: {
      title,
      authors,
      publisher,
      publicationYear,
      language,
      edition,
      category,
      isbn,
      ...(categoryId !== undefined ? { categoryId } : {}),
      ...(attributes ? { attributes } : {}),
      ...(series !== undefined ? { series } : {}),
    },
    condition: revision.condition,
    description: revision.description,
    pages: revision.pages,
    coverNote: revision.coverNote,
    notes: revision.notes,
    accessories: revision.accessories,
    readable: revision.readable,
    hasMissingPages: revision.hasMissingPages,
    missingEssentialContent: revision.missingEssentialContent,
    exchangeValue: revision.exchangeValue,
    mediaIds: links.map((m) => m.mediaId),
  };
}

export function exchangeAmounts(
  agreement: ExchangeAgreement,
  initiatorId: string,
  recipientId: string,
) {
  const initiatorValue = agreement.initiatorBooks.reduce(
    (sum, book) => sum + book.exchangeValue,
    0,
  );
  const recipientValue = agreement.recipientBook.exchangeValue;
  return {
    initiatorDeposit: recipientValue,
    recipientDeposit: initiatorValue,
    diffAmount: Math.abs(initiatorValue - recipientValue),
    diffPayerId:
      initiatorValue === recipientValue
        ? null
        : initiatorValue < recipientValue
          ? initiatorId
          : recipientId,
  };
}

export function agreementBooks(agreement: ExchangeAgreement) {
  return [...agreement.initiatorBooks, agreement.recipientBook];
}

// A version change (including a hide/show cycle) requires a new proposal; do not
// silently refresh the terms while the other Member presses Accept/Counter.
export function agreementMatches(
  exchange: ExchangeDoc,
  listings: Map<string, ListingDoc>,
) {
  const agreement = exchange.agreement;
  if (!agreement) return false;
  const ids = exchange.initiatorListingIds?.length
    ? exchange.initiatorListingIds
    : [exchange.initiatorListingId];
  if (
    agreement.initiatorBooks.length !== ids.length ||
    agreement.initiatorBooks.some(
      (book, i) =>
        book.listingId !== ids[i] || book.ownerId !== exchange.initiatorId,
    ) ||
    agreement.recipientBook.listingId !== exchange.recipientListingId ||
    agreement.recipientBook.ownerId !== exchange.recipientId
  )
    return false;
  const amounts = exchangeAmounts(
    agreement,
    exchange.initiatorId,
    exchange.recipientId,
  );
  if (
    Object.entries(amounts).some(
      ([key, value]) => exchange[key as keyof typeof amounts] !== value,
    )
  )
    return false;
  return agreementBooks(agreement).every((book) => {
    const listing = listings.get(book.listingId);
    return (
      listing &&
      listing.ownerId === book.ownerId &&
      listing.version === book.listingVersion &&
      listing.currentRevisionId === book.revisionId &&
      listing.channel !== 'Auction' &&
      listing.moderation === 'Approved' &&
      listing.visibility === 'Visible' &&
      listing.trade === 'Available' &&
      !listing.deletedAt &&
      listing.publishedAt
    );
  });
}
