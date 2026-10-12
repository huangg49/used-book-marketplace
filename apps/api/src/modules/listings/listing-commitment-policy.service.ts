import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Tx } from '../../database/mongo/transaction.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { conflict, invalidState, notFound } from '../commands/domain-error.js';
import { checkListing } from './listing-projection.js';

@Injectable()
export class ListingCommitmentPolicy {
  constructor(private readonly catalog: CatalogService) {}
  // Catalog -> listing lock order, the same as every other listing writer.
  async lock(tx: Tx, id: string) {
    const before = await tx.c.listings.findOne({ _id: id });
    const revision = before?.currentRevisionId
      ? await tx.c.listing_revisions.findOne({ _id: before.currentRevisionId })
      : null;
    if (!before || !revision) throw notFound();
    await this.catalog.lockForReview(tx, revision.bookId);
    await tx.lock('listings', [id]);
    const current = (await tx.c.listings.findOne({ _id: id }))!;
    if (current.currentRevisionId !== before.currentRevisionId)
      throw conflict();
    return current;
  }
  async project(
    tx: Tx,
    id: string,
    expectedVersion: number,
    from: 'Available' | 'Reserved',
    // Sold or Exchanged only from Reserved (migration 0012, 0016).
    to: 'Reserved' | 'Available' | 'Sold' | 'Exchanged',
  ) {
    const listing = await tx.c.listings.findOne({ _id: id });
    if (!listing) throw notFound();
    if (listing.version !== expectedVersion) throw conflict();
    if (
      listing.trade !== from ||
      ((to === 'Sold' || to === 'Exchanged') && from !== 'Reserved')
    )
      throw invalidState();
    // Preserve moderation, visibility, ownership and accepted revision on release.
    const next = await tx.c.listings.findOneAndUpdate(
      { _id: id, version: expectedVersion, trade: from },
      {
        $set: { trade: to, updatedAt: new Date() },
        $inc: { version: 1 },
      },
      { returnDocument: 'after' },
    );
    tx.check(`listing:${id}`, () => checkListing(tx, id));
    return { ...next!, id: next!._id };
  }
  // FR-H08: a book that failed inspection or was found misdescribed comes
  // back to its owner with the listing in Draft (an unsubmitted copy of the
  // last revision and its photos), so it is corrected and reviewed again
  // before anyone can buy it. Caller holds the listing lock; trade must
  // already be Available (no commitment).
  async requireRevision(tx: Tx, id: string) {
    const l = await tx.c.listings.findOne({ _id: id });
    if (!l?.currentRevisionId) throw notFound();
    if (l.trade !== 'Available') throw invalidState();
    const r = (await tx.c.listing_revisions.findOne({
      _id: l.currentRevisionId,
    }))!;
    const revisionId = randomUUID();
    await tx.c.listing_revisions.insertOne({
      ...r,
      _id: revisionId,
      number: r.number + 1,
      submittedAt: null,
      ownershipDeclaredAt: null,
      createdAt: await tx.now(),
      lockSeq: 0,
    });
    const photos = await tx.c.revision_media
      .find({ revisionId: r._id }, { sort: { position: 1 } })
      .toArray();
    if (photos.length)
      await tx.c.revision_media.insertMany(
        photos.map((m) => ({
          ...m,
          _id: `${revisionId}:${m.mediaId}`,
          revisionId,
        })),
      );
    const next = await tx.c.listings.findOneAndUpdate(
      { _id: id, version: l.version, trade: 'Available' },
      {
        $set: {
          currentRevisionId: revisionId,
          moderation: 'Draft',
          updatedAt: new Date(),
        },
        $inc: { version: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!next) throw conflict();
    tx.check(`listing:${id}`, () => checkListing(tx, id));
    return next;
  }
}
