import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Filter } from 'mongodb';
import type { WishlistItemDoc } from '../../database/mongo/documents.js';
import { MongoService } from '../../database/mongo/mongo.service.js';
import type { CurrentUser } from '../auth/auth.service.js';
import { publicBookOf } from '../catalog/catalog.service.js';
import { DomainError, notFound, type Wire } from '../commands/domain-error.js';
import { PublicListingService } from '../listings/public-listing.service.js';

function cursorFilter(cursor: string): Filter<WishlistItemDoc> {
  const [time, id, extra] = cursor.split('/');
  const createdAt = new Date(time);
  if (
    extra !== undefined ||
    !Number.isFinite(createdAt.getTime()) ||
    createdAt.toISOString() !== time ||
    (id !== undefined &&
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
  ) {
    throw new DomainError(
      400,
      'VALIDATION_ERROR',
      'Trang danh sách yêu thích không hợp lệ.',
    );
  }

  // Keep accepting the timestamp-only cursor issued before the ID tie-breaker.
  return id === undefined
    ? { createdAt: { $lt: createdAt } }
    : {
        $or: [
          { createdAt: { $lt: createdAt } },
          { createdAt, _id: { $lt: id } },
        ],
      };
}

@Injectable()
export class WishlistService {
  constructor(
    private readonly db: MongoService,
    private readonly listings: PublicListingService,
  ) {}

  async read(
    user: CurrentUser,
    query: { cursor?: string; limit: number; subjectType?: string },
  ): Promise<Wire['WishlistPage']> {
    const filter: Filter<WishlistItemDoc> = {
      userId: user.id,
      ...(query.subjectType
        ? { subjectType: query.subjectType as WishlistItemDoc['subjectType'] }
        : {}),
      ...(query.cursor === undefined ? {} : cursorFilter(query.cursor)),
    };
    return this.db.tx(async (tx) => {
      const rows = await tx.c.wishlist_items
        .find(filter, {
          sort: { createdAt: -1, _id: -1 },
          limit: query.limit + 1,
        })
        .toArray();
      const page = rows.slice(0, query.limit);
      const bookIds = page
        .filter((row) => row.subjectType === 'CATALOG_BOOK')
        .map((row) => row.subjectId);
      const listingIds = page
        .filter((row) => row.subjectType === 'LISTING')
        .map((row) => row.subjectId);
      const listings = await this.listings.publicViews(tx, listingIds);
      const books = bookIds.length
        ? await tx.c.catalog_books
            .find({ _id: { $in: bookIds }, status: 'Confirmed' })
            .toArray()
        : [];
      const revisionIds = books.flatMap((book) =>
        book.currentRevisionId ? [book.currentRevisionId] : [],
      );
      const revisions = revisionIds.length
        ? await tx.c.catalog_revisions
            .find({ _id: { $in: revisionIds } })
            .toArray()
        : [];
      const revisionById = new Map(
        revisions.map((revision) => [revision._id, revision]),
      );
      const bookViews = new Map(
        books.flatMap((book) => {
          const revision =
            book.currentRevisionId && revisionById.get(book.currentRevisionId);
          return revision
            ? [[book._id, publicBookOf(book._id, revision)] as const]
            : [];
        }),
      );
      const last = page.at(-1);
      return {
        items: page.map((row) => {
          const book =
            row.subjectType === 'CATALOG_BOOK'
              ? bookViews.get(row.subjectId)
              : undefined;
          const listing =
            row.subjectType === 'LISTING'
              ? listings.get(row.subjectId)
              : undefined;
          return {
            id: row._id,
            subjectType: row.subjectType,
            subjectId: row.subjectId,
            wantsToExchange: row.wantsToExchange,
            receiveNotifications: row.receiveNotifications,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            ...(book ? { book } : {}),
            ...(listing ? { listing } : {}),
          };
        }),
        nextCursor:
          rows.length > query.limit && last
            ? `${last.createdAt.toISOString()}/${last._id}`
            : null,
      };
    });
  }

  async save(
    user: CurrentUser,
    subjectType: 'CATALOG_BOOK' | 'LISTING',
    subjectId: string,
    data: Wire['SaveWishlistRequest'],
  ): Promise<Wire['WishlistItem']> {
    const identity = { userId: user.id, subjectType, subjectId };
    const result = await this.db.tx(async (tx) => {
      await tx.lock('users', [user.id]);
      const previous = await tx.c.wishlist_items.findOne(identity);
      if (!previous) {
        const eligible =
          subjectType === 'CATALOG_BOOK'
            ? await tx.c.catalog_books.findOne({
                _id: subjectId,
                status: 'Confirmed',
              })
            : (await this.listings.publicViews(tx, [subjectId])).get(subjectId);
        if (!eligible) throw notFound();
      }

      const now = await tx.now();
      return tx.c.wishlist_items.findOneAndUpdate(
        identity,
        {
          $set: {
            wantsToExchange: data.wantsToExchange,
            receiveNotifications: data.receiveNotifications,
            updatedAt: now,
          },
          $setOnInsert: { _id: randomUUID(), createdAt: now },
        },
        { upsert: true, returnDocument: 'after' },
      );
    });
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

  async remove(
    user: CurrentUser,
    subjectType: 'CATALOG_BOOK' | 'LISTING',
    subjectId: string,
  ): Promise<void> {
    await this.db.c.wishlist_items.deleteOne({
      userId: user.id,
      subjectType,
      subjectId,
    });
  }
}
