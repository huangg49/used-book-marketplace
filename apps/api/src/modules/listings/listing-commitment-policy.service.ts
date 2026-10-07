import { Injectable } from '@nestjs/common';
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
    // Sold only from Reserved, by the ViaPoint settlement (migration 0012).
    to: 'Reserved' | 'Available' | 'Sold',
  ) {
    const listing = await tx.c.listings.findOne({ _id: id });
    if (!listing) throw notFound();
    if (listing.version !== expectedVersion) throw conflict();
    if (listing.trade !== from || (to === 'Sold' && from !== 'Reserved'))
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
}
