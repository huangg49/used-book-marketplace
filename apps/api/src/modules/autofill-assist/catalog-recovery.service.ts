import { Injectable } from '@nestjs/common';
import {
  MongoCommandService,
  member,
  requireActive,
  type Actor,
} from '../commands/mongo-command.service.js';
import {
  invalidField,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import { isbn13 } from '../commands/contract-input.service.js';
import { publicBookOf } from '../catalog/catalog.service.js';
import {
  catalogPrefixes,
  catalogVolumes,
  rankCatalog,
} from './catalog-ranking.js';
import type { CatalogBookDoc } from '../../database/mongo/documents.js';
import { titleKey } from '../../database/mongo/migrations/0003-catalog-title-key.js';

const WINDOW = 120;
@Injectable()
export class CatalogRecoveryService {
  constructor(private readonly commands: MongoCommandService) {}
  find(
    auth: Actor,
    listingId: string,
    hints: Wire['AutofillFields'],
  ): Promise<Wire['ListingCatalogMatches']> {
    return this.commands.read(auth, async (tx, actor) => {
      member(actor);
      requireActive(actor);
      const listing = await tx.c.listings.findOne({ _id: listingId });
      if (!listing || listing.ownerId !== actor._id || listing.deletedAt)
        throw notFound();
      if (
        !['Draft', 'Rejected', 'Approved'].includes(listing.moderation) ||
        listing.visibility === 'Removed' ||
        listing.trade !== 'Available'
      )
        throw invalidState();
      const revision = listing.currentRevisionId
        ? await tx.c.listing_revisions.findOne({
            _id: listing.currentRevisionId,
          })
        : null;
      if (revision?.bundle) throw invalidState();
      if (hints.isbn && !isbn13(hints.isbn))
        invalidField(
          '/isbn',
          'ISBN chưa đúng. Sửa hoặc xóa ISBN rồi tìm lại.',
          'Invalid',
        );
      if (
        catalogVolumes(`${hints.title ?? ''} ${hints.edition ?? ''}`).length > 1
      )
        invalidField(
          '/edition',
          'Số tập đang mâu thuẫn. Kiểm tra tên sách và tập trước khi tìm lại.',
          'Invalid',
        );
      const prefixes = catalogPrefixes(hints);
      if (!hints.isbn && !hints.title?.trim())
        invalidField(
          '/title',
          'Nhập tên sách hoặc ISBN để tìm trong danh mục.',
          'Required',
        );
      const books = new Map<string, CatalogBookDoc>();
      let truncated = false;
      const windows = hints.isbn
        ? [{ confirmedIsbn: hints.isbn }]
        : [
            { titleKey: titleKey(hints.title ?? '') },
            ...(prefixes.length > 1
              ? [{ recoveryKeys: { $all: prefixes } }]
              : []),
            { recoveryKeys: { $in: prefixes } },
          ];
      // Indexed normalized token windows, deterministic and capped; no regex/catalog scan.
      for (const window of windows) {
        for (const visibility of [
          { status: 'Confirmed' as const },
          { status: 'Pending' as const, requesterId: actor._id },
        ]) {
          // Pending has no confirmedIsbn, so its own bounded window is filtered by revision below.
          const search =
            hints.isbn && visibility.status === 'Pending'
              ? visibility
              : { ...visibility, ...window };
          const found = await tx.c.catalog_books
            .find(search, { maxTimeMS: 500 })
            .sort({ _id: 1 })
            .limit(WINDOW + 1)
            .toArray();
          if (found.length > WINDOW) truncated = true;
          for (const b of found.slice(0, WINDOW)) books.set(b._id, b);
        }
      }
      const ids = [...books.values()].flatMap((b) => b.currentRevisionId ?? []);
      const revisions = await tx.c.catalog_revisions
        .find({ _id: { $in: ids } }, { maxTimeMS: 500 })
        .toArray();
      const revs = new Map(revisions.map((r) => [r._id, r]));
      const ranked = rankCatalog(
        hints,
        [...books.values()].flatMap((b) => {
          const r = revs.get(b.currentRevisionId ?? '');
          return r
            ? [
                {
                  book: publicBookOf(b._id, r),
                  pending: b.status === 'Pending',
                },
              ]
            : [];
        }),
      );
      return {
        items: ranked.slice(0, 5),
        truncated: truncated || ranked.length > 5,
        serverTime: (await tx.now()).toISOString(),
      };
    });
  }
}
