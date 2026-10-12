import { Injectable } from '@nestjs/common';
import type { AuctionDoc } from '../../database/mongo/documents.js';
import { MongoService } from '../../database/mongo/mongo.service.js';
import type { Tx } from '../../database/mongo/transaction.js';
import { notFound, type Wire } from '../commands/domain-error.js';
import { MediaStorage } from '../media/media-storage.js';

// Auction custody intentionally excludes the ordinary public shelf. Read only
// the revision that was approved and inspected for this specific intake.
@Injectable()
export class AuctionBookService {
  constructor(
    private readonly mongo: MongoService,
    private readonly storage: MediaStorage,
  ) {}

  private async eligible(tx: Tx, a: AuctionDoc) {
    if (
      !['Active', 'BuyNowPending', 'AwaitingWinnerPayment', 'Sold'].includes(
        a.state,
      )
    )
      return null;
    const c = tx.c;
    const intake = await c.auction_intakes.findOne({
      _id: a.intakeId,
      auctionId: a._id,
      listingId: a.listingId,
      sellerId: a.sellerId,
      contextId: a.contextId,
      inspectionOutcome: 'Pass',
    });
    if (!intake) return null;
    const listing = await c.listings.findOne({
      _id: a.listingId,
      ownerId: a.sellerId,
      currentRevisionId: intake.listingRevisionId,
      moderation: 'Approved',
      visibility: 'Visible',
      deletedAt: null,
    });
    const owner = await c.users.findOne({
      _id: a.sellerId,
      status: 'ACTIVE',
      emailVerifiedAt: { $ne: null },
      'roles.role': 'MEMBER',
    });
    if (!listing || !owner) return null;
    const item = await c.workflow_items.findOne({
      _id: `${a.contextId}:${a.listingId}`,
      listingRevisionId: intake.listingRevisionId,
    });
    const revision = await c.listing_revisions.findOne({
      _id: intake.listingRevisionId,
      listingId: a.listingId,
      submittedAt: { $ne: null },
    });
    const approved = await c.listing_decisions.findOne({
      revisionId: intake.listingRevisionId,
      decision: 'Approve',
    });
    if (!item || !revision?.condition || !approved) return null;
    const catalog = await c.catalog_revisions.findOne({
      _id: item.catalogRevisionId,
    });
    const book = revision.bookId
      ? await c.catalog_books.findOne({
          _id: revision.bookId,
          status: 'Confirmed',
        })
      : null;
    if (!catalog || !book || catalog.bookId !== book._id) return null;
    const links = await c.revision_media
      .find(
        { revisionId: revision._id, listingId: a.listingId },
        { sort: { position: 1 } },
      )
      .toArray();
    const media = await c.listing_media
      .find({
        _id: { $in: links.map((l) => l.mediaId) },
        listingId: a.listingId,
        status: 'Ready',
        purgedAt: null,
        derivativeKey: { $ne: null },
        width: { $gt: 0 },
        height: { $gt: 0 },
      })
      .toArray();
    const photos = links.flatMap((link) => {
      const m = media.find((m) => m._id === link.mediaId);
      return m ? [m] : [];
    });
    return { revision, catalog, photos };
  }

  book(a: AuctionDoc): Promise<Wire['PublicAuctionBook'] | null> {
    return this.mongo.tx(async (tx) => {
      const row = await this.eligible(tx, a);
      if (!row) return null;
      const r = row.revision;
      return {
        revisionId: r._id,
        authors: row.catalog.authors,
        condition: r.condition!,
        pages: r.pages,
        coverNote: r.coverNote,
        notes: r.notes,
        accessories: r.accessories,
        description: r.description,
        hasMissingPages: !!r.hasMissingPages,
        photos: row.photos.map((m) => ({
          id: m._id,
          width: m.width!,
          height: m.height!,
        })),
      };
    });
  }

  async photo(auctionId: string, mediaId: string): Promise<Wire['MediaRead']> {
    const authorize = () =>
      this.mongo.tx(async (tx) => {
        const a = await tx.c.auctions.findOne({ _id: auctionId });
        const row = a ? await this.eligible(tx, a) : null;
        const media = row?.photos.find((m) => m._id === mediaId);
        if (!row || !media) throw notFound();
        return {
          revisionId: row.revision._id,
          key: media.derivativeKey!,
          width: media.width!,
          height: media.height!,
        };
      });
    const before = await authorize();
    await this.storage.check();
    const signed = await this.storage.signedRead(before.key);
    const after = await authorize();
    if (before.revisionId !== after.revisionId || before.key !== after.key)
      throw notFound();
    return { id: mediaId, ...signed, width: after.width, height: after.height };
  }
}
