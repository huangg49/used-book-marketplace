import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
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
import { MAX_DERIVATIVE_BYTES, MediaStorage } from '../media/media-storage.js';
import { IsbnBarcodeReader } from './isbn-barcode-reader.js';
import { CatalogRecoveryService } from './catalog-recovery.service.js';

@Injectable()
export class IsbnMatchesService {
  private activeReads = 0;
  private cache = new Map<
    string,
    { expires: number; value: Promise<string[] | null> }
  >();
  constructor(
    private readonly commands: MongoCommandService,
    private readonly storage: MediaStorage,
    private readonly decoder: IsbnBarcodeReader,
    private readonly catalog: CatalogRecoveryService,
  ) {}
  private photos(auth: Actor, listingId: string, ids: string[]) {
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
      const photos = await tx.c.listing_media
        .find({ _id: { $in: ids }, listingId, status: 'Ready', purgedAt: null })
        .toArray();
      const byId = new Map(photos.map((p) => [p._id, p]));
      if (ids.some((id) => !byId.get(id)?.derivativeKey))
        invalidField(
          '/mediaIds',
          'Chỉ chọn ảnh đã xử lý của bài đăng này.',
          'Unavailable',
        );
      return ids.map((id) => ({
        key: byId.get(id)!.derivativeKey!,
        hash: byId.get(id)!.sha256,
      }));
    });
  }
  async find(
    auth: Actor,
    listingId: string,
    body: Wire['AutofillSuggestionRequest'],
  ): Promise<Wire['ListingIsbnMatches']> {
    const ids = body.mediaIds.map((id) => id.toLowerCase());
    if (new Set(ids).size !== ids.length)
      invalidField('/mediaIds', 'Mỗi ảnh chỉ chọn một lần.');
    const photos = await this.photos(auth, listingId, ids);
    const identity = createHash('sha256')
      .update(JSON.stringify([listingId, photos]))
      .digest('hex');
    let entry = this.cache.get(identity);
    if (!entry || entry.expires <= Date.now()) {
      for (const [key, item] of this.cache)
        if (item.expires <= Date.now()) this.cache.delete(key);
      if (this.cache.size >= 256)
        this.cache.delete(this.cache.keys().next().value!);
      const value = (async () => {
        if (this.activeReads >= 2) return null;
        this.activeReads++;
        try {
          const found = new Set<string>();
          for (const photo of photos) {
            const bytes = await this.storage.read(
              photo.key,
              MAX_DERIVATIVE_BYTES,
            );
            try {
              for (const isbn of await this.decoder.read(bytes))
                found.add(isbn);
            } catch {
              return null;
            } // Decode unavailable must not masquerade as no barcode.
          }
          return [...found].sort().slice(0, 6);
        } finally {
          this.activeReads--;
        }
      })();
      entry = { expires: Date.now() + 120_000, value };
      this.cache.set(identity, entry);
    }
    let isbns: string[] | null;
    try {
      isbns = await entry.value;
    } catch (error) {
      this.cache.delete(identity);
      throw error;
    }
    if (isbns === null) this.cache.delete(identity);
    const current = await this.photos(auth, listingId, ids);
    if (JSON.stringify(photos) !== JSON.stringify(current))
      throw invalidState();
    const catalog =
      isbns?.length === 1
        ? await this.catalog.find(auth, listingId, {
            title: null,
            authors: [],
            isbn: isbns[0],
            publisher: null,
            publicationYear: null,
            edition: null,
            language: null,
          })
        : null;
    return {
      listingId,
      status:
        isbns === null
          ? 'Unavailable'
          : isbns.length > 1
            ? 'Ambiguous'
            : isbns.length === 1
              ? 'Found'
              : 'NotFound',
      isbns: isbns ?? [],
      catalog,
      serverTime: new Date().toISOString(),
    };
  }
}
