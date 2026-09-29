import { randomUUID } from 'node:crypto';
import { titleKey } from '../../src/database/mongo/migrations/0003-catalog-title-key.js';
import { runTransaction, Tx } from '../../src/database/mongo/transaction.js';
import { isbn13 } from '../../src/modules/commands/contract-input.service.js';
import { checkCatalog } from '../../src/modules/catalog/catalog.service.js';
import { checkListing } from '../../src/modules/listings/listing-projection.js';
import type { MongoFixtures } from './mongo-fixtures.js';

export const CHECKLIST = {
  catalogMatches: true,
  photosClear: true,
  conditionDisclosed: true,
  readable: true,
  pricingValid: true,
  contentAppropriate: true,
};
// Complete listing content, valid for submission once a confirmed book is set.
export const listingContent = {
  mode: 'Both' as const,
  condition: 'Good' as const,
  pages: 'Đủ trang',
  coverNote: 'Bìa sờn nhẹ',
  notes: 'Không có',
  accessories: 'Không có',
  readable: true,
  hasMissingPages: false,
  missingEssentialContent: false,
  description: 'Một cuốn sách đọc được, tình trạng đã được mô tả đầy đủ.',
  salePrice: 125000,
  exchangeValue: 150000,
};
export type ListingFixture = { id: string; revision: string; media: string };

// Asserts that an API command fails with 500 because a commit-time check
// (Tx.runChecks) rejected it with `message`, not for an unrelated reason.
export async function failsCommitCheck(
  call: () => PromiseLike<{ status: number }>,
  message: string,
) {
  const errors: string[] = [];
  const original = Tx.prototype.runChecks;
  const spy = vi
    .spyOn(Tx.prototype, 'runChecks')
    .mockImplementation(async function (this: Tx) {
      try {
        return await original.call(this);
      } catch (error) {
        errors.push((error as Error).message);
        throw error;
      }
    });
  try {
    expect((await call()).status).toBe(500);
  } finally {
    spy.mockRestore();
  }
  expect(errors).toContain(message);
}

// Catalog/listing aggregates written directly as the migrator (the former
// SQL factories). Each factory runs in one transaction that ends with the
// same commit-time checks the API registers, so fixtures are consistent.
export class ListingFixtures {
  readonly books: string[] = [];
  readonly listings: string[] = [];
  constructor(private readonly db: MongoFixtures) {}

  // A transaction on the fixture connection that runs checkListing /
  // checkCatalog before commit, like a writer using the command executor.
  commit<T>(
    fn: (tx: Tx) => Promise<T>,
    check: { listing?: string; book?: string } = {},
  ) {
    return runTransaction(this.db.client, this.db.client.db(), async (tx) => {
      const value = await fn(tx);
      if (check.listing)
        tx.check(`listing:${check.listing}`, () =>
          checkListing(tx, check.listing!),
        );
      if (check.book)
        tx.check(`catalog:${check.book}`, () => checkCatalog(tx, check.book!));
      return value;
    });
  }

  async book(
    requesterId: string,
    reviewerId: string,
    confirmed = true,
    isbn: string | null = null,
  ) {
    const id = randomUUID(),
      revision = randomUUID(),
      title = 'Một cuốn sách',
      now = new Date();
    this.books.push(id);
    await this.commit(
      async (tx) => {
        await tx.c.catalog_books.insertOne({
          _id: id,
          requesterId,
          status: 'Pending',
          version: 1,
          currentRevisionId: null,
          confirmedIsbn: null,
          searchText: title.toLowerCase(),
          titleKey: titleKey(title),
          createdAt: now,
          updatedAt: now,
          lockSeq: 0,
        });
        await tx.c.catalog_revisions.insertOne({
          _id: revision,
          bookId: id,
          number: 1,
          title,
          authors: ['Tác giả'],
          publisher: null,
          publicationYear: null,
          language: 'vi',
          edition: null,
          category: 'Văn học',
          isbn,
          submittedAt: now,
        });
        await tx.c.catalog_books.updateOne(
          { _id: id },
          { $set: { currentRevisionId: revision } },
        );
        if (confirmed) {
          await tx.c.catalog_decisions.insertOne({
            _id: randomUUID(),
            revisionId: revision,
            reviewerId,
            decision: 'Confirm',
            reason: null,
            decidedAt: now,
          });
          await tx.c.catalog_books.updateOne(
            { _id: id },
            {
              $set: {
                status: 'Confirmed',
                version: 2,
                confirmedIsbn: isbn ? isbn13(isbn) : null,
              },
            },
          );
        }
      },
      { book: id },
    );
    return { id, revision };
  }

  async listing(
    ownerId: string,
    bookId: string,
    pending = false,
  ): Promise<ListingFixture> {
    const id = randomUUID(),
      revision = randomUUID(),
      media = randomUUID(),
      now = new Date();
    this.listings.push(id);
    await this.commit(
      async (tx) => {
        await tx.c.listing_revisions.insertOne({
          _id: revision,
          listingId: id,
          number: 1,
          bookId,
          ...listingContent,
          submittedAt: pending ? now : null,
          ownershipDeclaredAt: pending ? now : null,
          createdAt: now,
          originAddressId: null,
          originAddressVersion: null,
          originServiceAreaCode: null,
          lockSeq: 0,
        });
        // Test factory only: no assertion that uploading/decoding was implemented.
        await tx.c.listing_media.insertOne({
          _id: media,
          listingId: id,
          version: 1,
          status: 'Ready',
          stagingKey: `${media}/stage`,
          pinnedKey: `${media}/pinned`,
          derivativeKey: `${media}/view`,
          mimeType: 'image/jpeg',
          byteSize: 1024,
          sha256: 'a'.repeat(64),
          width: 800,
          height: 1200,
          failureCode: null,
          expiresAt: new Date(now.getTime() + 86_400_000),
          purgedAt: null,
          reservedBytes: 0,
          createdAt: now,
          updatedAt: now,
          lockSeq: 0,
        });
        await tx.c.revision_media.insertOne({
          _id: `${revision}:${media}`,
          listingId: id,
          revisionId: revision,
          mediaId: media,
          position: 0,
        });
        await tx.c.listings.insertOne({
          _id: id,
          ownerId,
          version: pending ? 2 : 1,
          moderation: pending ? 'PendingReview' : 'Draft',
          visibility: 'Visible',
          trade: 'Available',
          currentRevisionId: revision,
          removalReason: null,
          deletedAt: null,
          publishedAt: null,
          createdAt: now,
          updatedAt: now,
          lockSeq: 0,
        });
      },
      { listing: id },
    );
    return { id, revision, media };
  }

  // Removes every fixture and command record of the given listings/books.
  async remove(listings: string[], books: string[], users: string[]) {
    const c = this.db.c;
    const revisions = (
      await c.listing_revisions.find({ listingId: { $in: listings } }).toArray()
    ).map((r) => r._id);
    const catalogRevisions = (
      await c.catalog_revisions.find({ bookId: { $in: books } }).toArray()
    ).map((r) => r._id);
    const media = (
      await c.listing_media.find({ listingId: { $in: listings } }).toArray()
    ).map((m) => m._id);
    const audits = (
      await c.audit_events
        .find({
          $or: [
            { actorId: { $in: users } },
            { listingId: { $in: listings } },
            { bookId: { $in: books } },
          ],
        })
        .toArray()
    ).map((a) => a._id);
    await c.outbox_events.deleteMany({ auditId: { $in: audits } });
    await c.audit_events.deleteMany({ _id: { $in: audits } });
    await c.mutation_receipts.deleteMany({
      $or: [
        { actorId: { $in: users } },
        { listingId: { $in: listings } },
        { bookId: { $in: books } },
      ],
    });
    await c.listing_decisions.deleteMany({ revisionId: { $in: revisions } });
    await c.revision_media.deleteMany({ listingId: { $in: listings } });
    await c.media_processing_jobs.deleteMany({ mediaId: { $in: media } });
    await c.listing_media.deleteMany({ _id: { $in: media } });
    await c.listing_revisions.deleteMany({ _id: { $in: revisions } });
    await c.listings.deleteMany({ _id: { $in: listings } });
    await c.catalog_decisions.deleteMany({
      revisionId: { $in: catalogRevisions },
    });
    await c.catalog_revisions.deleteMany({ _id: { $in: catalogRevisions } });
    await c.catalog_books.deleteMany({ _id: { $in: books } });
  }
}
