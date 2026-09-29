import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { ListingMediaDoc } from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import {
  MongoCommandService,
  member,
  requireActive,
  reviewer,
  type Actor,
  type CommandContext,
} from '../commands/mongo-command.service.js';
import {
  conflict,
  DomainError,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import { MongoPageService } from '../commands/mongo-page.service.js';
import { ImageUploadSlots } from './image-upload-slots.js';
import {
  digest,
  inputKey,
  MAX_IMAGE_BYTES,
  MediaStorage,
} from './media-storage.js';

type ListingMedia = ListingMediaDoc;
export const mediaProjection = (m: ListingMedia): Wire['ListingMedia'] => ({
  id: m._id,
  listingId: m.listingId,
  version: m.version,
  status: m.status,
  mimeType: m.mimeType as Wire['ListingMedia']['mimeType'],
  byteSize: m.byteSize,
  failureCode: m.failureCode as Wire['ListingMedia']['failureCode'],
  createdAt: m.createdAt.toISOString(),
});
const quota = () =>
  new DomainError(
    429,
    'MediaQuotaExceeded',
    'Kho ảnh đã đạt giới hạn. Vui lòng thử lại sau.',
  );

// Global serialization point for the shared storage budget (the former
// pg_advisory_xact_lock(781204991)). Packaging evidence uploads take it too.
export async function lockStorageBudget(tx: Tx) {
  await tx.c.counters.updateOne(
    { _id: 'media-storage-budget-lock' },
    { $inc: { value: 1 } },
    { upsert: true },
  );
}
export async function reservedStorage(tx: Tx) {
  let total = 0;
  for (const collection of [
    'listing_media',
    'order_packaging_evidence',
  ] as const) {
    const [row] = await tx.c[collection]
      .aggregate<{ total: number }>([
        { $group: { _id: null, total: { $sum: '$reservedBytes' } } },
      ])
      .toArray();
    total += row?.total ?? 0;
  }
  return total;
}
// Hourly admission counts both pipelines of one seller. Listing uploads use
// the wall clock; packaging evidence passes its Order decision time.
export async function recentUploads(tx: Tx, userId: string, now = new Date()) {
  const hourAgo = new Date(now.getTime() - 3_600_000);
  const [media] = await tx.c.listing_media
    .aggregate<{ n: number }>([
      { $match: { createdAt: { $gt: hourAgo } } },
      {
        $lookup: {
          from: 'listings',
          localField: 'listingId',
          foreignField: '_id',
          as: 'l',
        },
      },
      { $match: { 'l.ownerId': userId } },
      { $count: 'n' },
    ])
    .toArray();
  const [packaging] = await tx.c.order_packaging_evidence
    .aggregate<{ n: number }>([
      { $match: { createdAt: { $gt: hourAgo } } },
      {
        $lookup: {
          from: 'direct_orders',
          localField: 'orderId',
          foreignField: '_id',
          as: 'o',
        },
      },
      { $match: { 'o.sellerId': userId } },
      { $count: 'n' },
    ])
    .toArray();
  return (media?.n ?? 0) + (packaging?.n ?? 0);
}

@Injectable()
export class MediaService {
  constructor(
    private readonly commands: MongoCommandService,
    private readonly pages: MongoPageService,
    private readonly storage: MediaStorage,
    private readonly config: ConfigService,
    private readonly uploadSlots: ImageUploadSlots,
  ) {}

  async own(tx: Tx, id: string, actorId: string, lock = false) {
    if (lock) await tx.lock('listings', [id]);
    const listing = await tx.c.listings.findOne({ _id: id });
    if (!listing || listing.ownerId !== actorId || listing.deletedAt)
      throw notFound();
    return listing;
  }
  editable(l: Awaited<ReturnType<MediaService['own']>>) {
    if (
      !['Draft', 'Rejected', 'Approved'].includes(l.moderation) ||
      l.visibility === 'Removed' ||
      l.trade !== 'Available'
    )
      throw invalidState();
  }
  async asset(tx: Tx, listingId: string, id: string, lock = false) {
    if (lock) await tx.lock('listing_media', [id]);
    const m = await tx.c.listing_media.findOne({ _id: id });
    if (!m || m.listingId !== listingId || m.purgedAt) throw notFound();
    return m;
  }
  pending(m: ListingMedia) {
    if (m.status !== 'Pending') throw invalidState();
    if (m.expiresAt.getTime() <= Date.now())
      throw new DomainError(
        409,
        'UploadExpired',
        'Lượt tải ảnh đã hết hạn. Hãy chọn lại ảnh.',
      );
  }
  async create(
    context: CommandContext,
    listingId: string,
    body: Wire['CreateUpload'],
  ) {
    // Reserve the intent independently of remote availability. Receipt replay must
    // remain possible during a storage outage; upload itself fails closed.
    return this.commands.run(context, 'createListingUpload', listingId, body, {
      authorize: async (tx, actor) => {
        member(actor);
        return this.own(tx, listingId, actor._id, true);
      },
      mutate: async (tx, actor, l) => {
        requireActive(actor);
        this.editable(l);
        if (l.version !== body.expectedVersion) throw conflict();
        const pending = await tx.c.listing_media.countDocuments({
          listingId,
          purgedAt: null,
          status: { $in: ['Pending', 'Processing'] },
        });
        const retained = await tx.c.listing_media.countDocuments({
          listingId,
          purgedAt: null,
        });
        if (
          pending >= 8 ||
          retained >= 80 ||
          (await recentUploads(tx, actor._id)) >= 20
        )
          throw quota();
        await lockStorageBudget(tx);
        const reservedBytes = body.byteSize + 6_000_000;
        if (
          (await reservedStorage(tx)) + reservedBytes >
          this.config.get<number>('MEDIA_STORAGE_BUDGET_BYTES', 800_000_000)
        )
          throw quota();
        const id = randomUUID();
        const m: ListingMedia = {
          _id: id,
          listingId,
          version: 1,
          status: 'Pending',
          stagingKey: `unused/${id}`,
          pinnedKey: null,
          derivativeKey: null,
          mimeType: body.mimeType,
          byteSize: body.byteSize,
          sha256: body.sha256,
          width: null,
          height: null,
          failureCode: null,
          expiresAt: new Date(Date.now() + 86_400_000),
          purgedAt: null,
          reservedBytes,
          createdAt: await tx.now(),
          updatedAt: new Date(),
          lockSeq: 0,
        };
        await tx.c.listing_media.insertOne(m);
        return {
          entityType: 'Media',
          entityId: m._id,
          version: m.version,
          revisionId: null,
          state: m.status,
        };
      },
    });
  }
  list(auth: Actor, listingId: string, query: Record<string, string | number>) {
    return this.commands.read(auth, async (tx, actor) => {
      member(actor);
      await this.own(tx, listingId, actor._id);
      const page = await this.pages.page(
        tx.c.listing_media,
        [
          { $match: { listingId, purgedAt: null } },
          { $project: { key: '$createdAt' } },
        ],
        {
          kind: 'time',
          ascending: false,
          scope: {
            operation: 'listMyListingMedia',
            actor: actor._id,
            listingId,
          },
          limit: Number(query.limit),
          cursor: query.cursor as string | undefined,
        },
      );
      const records = await tx.c.listing_media
        .find({ _id: { $in: page.ids } })
        .toArray();
      return {
        items: page.ids.map((id) =>
          mediaProjection(records.find((m) => m._id === id)!),
        ),
        nextCursor: page.nextCursor,
        serverTime: page.serverTime,
      };
    });
  }
  detail(auth: Actor, listingId: string, id: string) {
    return this.commands.read(auth, async (tx, actor) => {
      member(actor);
      await this.own(tx, listingId, actor._id);
      return mediaProjection(await this.asset(tx, listingId, id));
    });
  }
  private signature(auth: Actor, id: string, expiry: string) {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    )
      .update(
        JSON.stringify([
          'media-upload-v1',
          auth.user.id,
          auth.sessionId,
          id,
          expiry,
        ]),
      )
      .digest('hex');
  }
  ticket(auth: Actor, listingId: string, id: string) {
    return this.commands.read(
      auth,
      async (tx, actor): Promise<Wire['UploadTicket']> => {
        member(actor, true);
        this.editable(await this.own(tx, listingId, actor._id));
        const m = await this.asset(tx, listingId, id);
        this.pending(m);
        const expiry = String(
          Math.min(Date.now() + 600_000, m.expiresAt.getTime()),
        );
        return {
          mediaId: id,
          method: 'PUT',
          path: `/listings/${listingId}/media/${id}/content`,
          headers: {
            'Content-Type': m.mimeType,
            'Upload-Token': `${expiry}.${this.signature(auth, id, expiry)}`,
          },
          expiresAt: new Date(Number(expiry)).toISOString(),
          maxBytes: MAX_IMAGE_BYTES,
        };
      },
    );
  }
  async upload(
    context: CommandContext,
    listingId: string,
    id: string,
    req: Request,
  ) {
    const token = req.header('Upload-Token') ?? '';
    const [expiry, sig] = token.split('.');
    if (
      !/^\d{13}\.[a-f0-9]{64}$/.test(token) ||
      Number(expiry) <= Date.now() ||
      !timingSafeEqual(
        Buffer.from(sig),
        Buffer.from(this.signature(context.auth, id, expiry)),
      )
    )
      throw new DomainError(
        403,
        'FORBIDDEN',
        'Quyền tải ảnh đã hết hạn. Hãy thử lại.',
      );
    const m = await this.commands.read(context.auth, async (tx, actor) => {
      member(actor, true);
      await this.own(tx, listingId, actor._id);
      return this.asset(tx, listingId, id);
    });
    if (req.header('content-type')?.split(';')[0] !== m.mimeType)
      throw new DomainError(
        415,
        'UnsupportedMediaType',
        'Chọn ảnh JPEG, PNG hoặc WebP.',
      );
    if (Number(req.header('content-length')) > m.byteSize)
      throw new DomainError(
        413,
        'PayloadTooLarge',
        'Ảnh vượt dung lượng đã khai báo.',
      );
    const release = this.uploadSlots.claim();
    const timeout = setTimeout(() => req.destroy(), 120_000);
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        const part = Buffer.from(chunk);
        size += part.length;
        if (size > m.byteSize)
          throw new DomainError(
            413,
            'PayloadTooLarge',
            'Ảnh vượt dung lượng đã khai báo.',
          );
        chunks.push(part);
      }
      const bytes = Buffer.concat(chunks);
      if (size !== m.byteSize || digest(bytes) !== m.sha256)
        throw new DomainError(
          422,
          'VALIDATION_ERROR',
          'Ảnh đã thay đổi. Hãy chọn lại ảnh.',
        );
      // A completed upload may replay after processing; only new writes need Pending.
      if (!m.pinnedKey) {
        await this.commands.read(context.auth, async (tx, actor) => {
          member(actor, true);
          this.editable(await this.own(tx, listingId, actor._id));
          this.pending(await this.asset(tx, listingId, id));
        });
        await this.storage.check();
        await this.storage.put(inputKey(id), bytes, m.mimeType);
      }
      return await this.commands.run(
        context,
        'uploadListingContent',
        id,
        { listingId, sha256: m.sha256 },
        {
          authorize: async (tx, actor) => {
            member(actor);
            await this.own(tx, listingId, actor._id, true);
            return this.asset(tx, listingId, id, true);
          },
          mutate: async (tx, actor, current) => {
            requireActive(actor);
            this.editable(await this.own(tx, listingId, actor._id));
            this.pending(current);
            // Identity/input fields never change; the pin is set once.
            const next = current.pinnedKey
              ? current
              : await tx.c.listing_media.findOneAndUpdate(
                  { _id: id, version: current.version, pinnedKey: null },
                  {
                    $set: { pinnedKey: inputKey(id), updatedAt: new Date() },
                    $inc: { version: 1 },
                  },
                  { returnDocument: 'after' },
                );
            return {
              entityType: 'Media',
              entityId: id,
              version: next!.version,
              revisionId: null,
              state: next!.status,
            };
          },
        },
      );
    } finally {
      clearTimeout(timeout);
      release();
    }
  }
  finalize(
    context: CommandContext,
    listingId: string,
    id: string,
    body: Wire['VersionCommand'],
  ) {
    return this.commands.run(
      context,
      'finalizeListingUpload',
      id,
      { listingId, ...body },
      {
        authorize: async (tx, actor) => {
          member(actor);
          await this.own(tx, listingId, actor._id, true);
          return this.asset(tx, listingId, id, true);
        },
        mutate: async (tx, actor, m) => {
          requireActive(actor);
          this.editable(await this.own(tx, listingId, actor._id));
          if (m.version !== body.expectedVersion) throw conflict();
          this.pending(m);
          if (!m.pinnedKey)
            throw new DomainError(
              409,
              'UploadIncomplete',
              'Ảnh chưa tải xong. Hãy thử lại.',
            );
          const next = await tx.c.listing_media.findOneAndUpdate(
            { _id: id, version: m.version, status: 'Pending' },
            {
              $set: { status: 'Processing', updatedAt: new Date() },
              $inc: { version: 1 },
            },
            { returnDocument: 'after' },
          );
          await tx.c.media_processing_jobs.insertOne({
            _id: randomUUID(),
            mediaId: id,
            attempts: 0,
            availableAt: await tx.now(),
            leaseUntil: null,
            finishedAt: null,
          });
          return {
            entityType: 'Media',
            entityId: id,
            version: next!.version,
            revisionId: null,
            state: next!.status,
          };
        },
      },
    );
  }
  async read(
    auth: Actor,
    listingId: string,
    id: string,
    reviewRequestId?: string,
  ): Promise<Wire['MediaRead']> {
    const authorize = async (tx: Tx, actor: Parameters<typeof member>[0]) => {
      if (!reviewRequestId) {
        member(actor);
        await this.own(tx, listingId, actor._id);
      } else {
        reviewer(actor);
        // A submitted revision of a non-deleted listing references the photo.
        const listing = await tx.c.listings.findOne({
          _id: listingId,
          deletedAt: null,
        });
        const links = await tx.c.revision_media
          .find({ listingId, mediaId: id })
          .toArray();
        const frozen = listing
          ? await tx.c.listing_revisions.countDocuments({
              _id: { $in: links.map((link) => link.revisionId) },
              submittedAt: { $ne: null },
            })
          : 0;
        if (!frozen) throw notFound();
      }
      const asset = await this.asset(tx, listingId, id);
      if (asset.status !== 'Ready')
        throw new DomainError(422, 'MediaNotReady', 'Ảnh chưa sẵn sàng.');
      return asset;
    };
    const m = await this.commands.read(auth, async (tx, actor) => {
      const asset = await authorize(tx, actor);
      if (reviewRequestId)
        await tx.c.audit_events.insertOne({
          _id: randomUUID(),
          actorId: actor._id,
          systemActor: null,
          receiptId: null,
          listingId: null,
          bookId: null,
          mediaId: id,
          addressBookId: null,
          quoteId: null,
          contextId: null,
          topupId: null,
          action: 'getReviewMediaRead',
          before: null,
          after: null,
          reason: null,
          requestId: reviewRequestId,
          createdAt: await tx.now(),
        });
      return asset;
    });
    await this.storage.check();
    const signed = await this.storage.signedRead(m.derivativeKey!);
    // Recheck after the remote operation; authorization changes must not issue a new URL.
    await this.commands.read(auth, async (tx, actor) => {
      await authorize(tx, actor);
    });
    return { id, ...signed, width: m.width!, height: m.height! };
  }
}
