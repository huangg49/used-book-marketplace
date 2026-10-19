import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CurrentUser } from '../auth/auth.service.js';
import { MongoService } from '../../database/mongo/mongo.service.js';
import type { Wire } from '../commands/domain-error.js';
import { DomainError } from '../commands/domain-error.js';

@Injectable()
export class WishlistService {
  constructor(private readonly db: MongoService) {}

  async read(
    user: CurrentUser,
    query: { cursor?: string; limit: number; subjectType?: string },
  ): Promise<Wire['WishlistPage']> {
    const filter: Record<string, unknown> = { userId: user.id };
    if (query.subjectType) filter.subjectType = query.subjectType;
    if (query.cursor) filter.createdAt = { $lt: new Date(query.cursor) };

    const items = await this.db.c.wishlist_items
      .find(filter, { sort: { createdAt: -1 }, limit: query.limit + 1 })
      .toArray();

    const hasNext = items.length > query.limit;
    const pageItems = items.slice(0, query.limit);

    // Fetch related books/listings (Optional: batch fetch for better performance)
    const resultItems: Wire['WishlistItem'][] = [];
    for (const item of pageItems) {
      let book: Wire['PublicBook'] | undefined;
      let listing: Wire['PublicListing'] | undefined;
      
      if (item.subjectType === 'CATALOG_BOOK') {
        // Find public book view
        const doc = await this.db.c.catalog_books.findOne({ _id: item.subjectId });
        if (doc && doc.currentRevisionId) {
          const rev = await this.db.c.catalog_revisions.findOne({ _id: doc.currentRevisionId });
          if (rev) {
            book = {
              id: doc._id,
              title: rev.title,
              authors: rev.authors,
              publisher: rev.publisher,
              publicationYear: rev.publicationYear,
              language: rev.language,
              edition: rev.edition,
              category: rev.category,
              isbn: rev.isbn,
            } as unknown as Wire['PublicBook'];
          }
        }
      } else if (item.subjectType === 'LISTING') {
        const doc = await this.db.c.listings.findOne({ _id: item.subjectId });
        if (doc && doc.currentRevisionId) {
          const rev = await this.db.c.listing_revisions.findOne({ _id: doc.currentRevisionId });
          if (rev) {
            const bookDoc = rev.bookId ? await this.db.c.catalog_books.findOne({ _id: rev.bookId }) : null;
            let listingBook: Wire['PublicBook'] | undefined;
            if (bookDoc && bookDoc.currentRevisionId) {
               const bookRev = await this.db.c.catalog_revisions.findOne({ _id: bookDoc.currentRevisionId });
               if (bookRev) {
                  listingBook = {
                    id: bookDoc._id,
                    title: bookRev.title,
                    authors: bookRev.authors,
                    publisher: bookRev.publisher,
                    publicationYear: bookRev.publicationYear,
                    language: bookRev.language,
                    edition: bookRev.edition,
                    category: bookRev.category,
                    isbn: bookRev.isbn,
                  } as unknown as Wire['PublicBook'];
               }
            }
            const revMedia = await this.db.c.revision_media.findOne({ revisionId: doc.currentRevisionId, position: 0 });
            const photos = revMedia ? [{ id: revMedia.mediaId }] : [];

            listing = {
              id: doc._id,
              revisionId: doc.currentRevisionId,
              version: doc.version,
              book: listingBook,
              photos: photos,
              mode: rev.mode,
              price: rev.salePrice || rev.exchangeValue || 0,
              condition: rev.condition,
              sellerId: doc.ownerId,
            } as unknown as Wire['PublicListing'];
          }
        }
      }

      resultItems.push({
        id: item._id,
        subjectType: item.subjectType,
        subjectId: item.subjectId,
        wantsToExchange: item.wantsToExchange,
        receiveNotifications: item.receiveNotifications,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        ...(book ? { book } : {}),
        ...(listing ? { listing } : {}),
      });
    }

    return {
      items: resultItems,
      nextCursor: hasNext ? pageItems[pageItems.length - 1].createdAt.toISOString() : null,
    };
  }

  async save(
    user: CurrentUser,
    subjectType: 'CATALOG_BOOK' | 'LISTING',
    subjectId: string,
    data: Wire['SaveWishlistRequest'],
  ): Promise<Wire['WishlistItem']> {
    // Validate subject exists
    if (subjectType === 'CATALOG_BOOK') {
      const book = await this.db.c.catalog_books.findOne({ _id: subjectId, status: 'Confirmed' });
      if (!book) throw new DomainError(404, 'NOT_FOUND', 'Book not found.');
    } else {
      // Auction listings are not marketplace subjects (ADR 0042).
      const listing = await this.db.c.listings.findOne({
        _id: subjectId,
        visibility: 'Visible',
        channel: { $ne: 'Auction' },
      });
      if (!listing) throw new DomainError(404, 'NOT_FOUND', 'Listing not found.');
    }

    const now = new Date();
    const result = await this.db.c.wishlist_items.findOneAndUpdate(
      { userId: user.id, subjectType, subjectId },
      {
        $set: {
          wantsToExchange: data.wantsToExchange,
          receiveNotifications: data.receiveNotifications,
          updatedAt: now,
        },
        $setOnInsert: {
          _id: randomUUID(),
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );

    if (!result) throw new Error('Failed to upsert wishlist item');

    return {
      id: result._id,
      subjectType: result.subjectType,
      subjectId: result.subjectId,
      wantsToExchange: result.wantsToExchange,
      receiveNotifications: result.receiveNotifications,
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
    };
  }

  async remove(user: CurrentUser, subjectType: 'CATALOG_BOOK' | 'LISTING', subjectId: string): Promise<void> {
    await this.db.c.wishlist_items.deleteOne({
      userId: user.id,
      subjectType,
      subjectId,
    });
  }
}
