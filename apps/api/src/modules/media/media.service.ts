import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { Prisma, type ListingMedia } from '../../generated/prisma/client.js';
import {
  CommandService,
  member,
  requireActive,
  reviewer,
  type Actor,
  type CommandContext,
  type Tx,
} from '../commands/command.service.js';
import {
  conflict,
  DomainError,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import { PageService } from '../commands/page.service.js';
import { ImageUploadSlots } from './image-upload-slots.js';
import {
  digest,
  inputKey,
  MAX_IMAGE_BYTES,
  MediaStorage,
} from './media-storage.js';

export const mediaProjection = (m: ListingMedia): Wire['ListingMedia'] => ({
  id: m.id,
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

@Injectable()
export class MediaService {
  constructor(
    private readonly commands: CommandService,
    private readonly pages: PageService,
    private readonly storage: MediaStorage,
    private readonly config: ConfigService,
    private readonly uploadSlots: ImageUploadSlots,
  ) {}

  async own(tx: Tx, id: string, actorId: string, lock = false) {
    if (lock)
      await tx.$queryRaw`SELECT id FROM listings WHERE id=${id}::uuid FOR UPDATE`;
    const listing = await tx.listing.findUnique({ where: { id } });
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
    if (lock)
      await tx.$queryRaw`SELECT id FROM listing_media WHERE id=${id}::uuid FOR UPDATE`;
    const m = await tx.listingMedia.findUnique({ where: { id } });
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
        return this.own(tx, listingId, actor.id, true);
      },
      mutate: async (tx, actor, l) => {
        requireActive(actor);
        this.editable(l);
        if (l.version !== body.expectedVersion) throw conflict();
        const [pending, retained, recent] = await Promise.all([
          tx.listingMedia.count({
            where: {
              listingId,
              purgedAt: null,
              status: { in: ['Pending', 'Processing'] },
            },
          }),
          tx.listingMedia.count({ where: { listingId, purgedAt: null } }),
          tx.listingMedia.count({
            where: {
              listing: { ownerId: actor.id },
              createdAt: { gt: new Date(Date.now() - 3_600_000) },
            },
          }),
        ]);
        const packagingRecent = await tx.orderPackagingEvidence.count({
          where: {
            preparation: { order: { sellerId: actor.id } },
            createdAt: { gt: new Date(Date.now() - 3_600_000) },
          },
        });
        if (pending >= 8 || retained >= 80 || recent + packagingRecent >= 20)
          throw quota();
        // Serialized across actors/processes; never trust a client-side usage counter.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(781204991)::text`;
        const total = await tx.listingMedia.aggregate({
          _sum: { reservedBytes: true },
        });
        const packaging = await tx.orderPackagingEvidence.aggregate({
          _sum: { reservedBytes: true },
        });
        const reservedBytes = body.byteSize + 6_000_000;
        if (
          (total._sum.reservedBytes ?? 0) +
            (packaging._sum.reservedBytes ?? 0) +
            reservedBytes >
          this.config.get<number>('MEDIA_STORAGE_BUDGET_BYTES', 800_000_000)
        )
          throw quota();
        const id = randomUUID();
        const m = await tx.listingMedia.create({
          data: {
            id,
            listingId,
            stagingKey: `unused/${id}`,
            mimeType: body.mimeType,
            byteSize: body.byteSize,
            sha256: body.sha256,
            reservedBytes,
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        });
        return {
          entityType: 'Media',
          entityId: m.id,
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
      await this.own(tx, listingId, actor.id);
      const page = await this.pages.select(tx, {
        from: Prisma.sql`listing_media m`,
        id: Prisma.sql`m.id`,
        key: Prisma.sql`m.created_at`,
        kind: 'time',
        ascending: false,
        where: Prisma.sql`m.listing_id=${listingId}::uuid AND m.purged_at IS NULL`,
        scope: { operation: 'listMyListingMedia', actor: actor.id, listingId },
        limit: Number(query.limit),
        cursor: query.cursor as string | undefined,
      });
      const records = await tx.listingMedia.findMany({
        where: { id: { in: page.ids } },
      });
      return {
        items: page.ids.map((id) =>
          mediaProjection(records.find((m) => m.id === id)!),
        ),
        nextCursor: page.nextCursor,
        serverTime: page.serverTime,
      };
    });
  }
  detail(auth: Actor, listingId: string, id: string) {
    return this.commands.read(auth, async (tx, actor) => {
      member(actor);
      await this.own(tx, listingId, actor.id);
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
        this.editable(await this.own(tx, listingId, actor.id));
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
      await this.own(tx, listingId, actor.id);
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
          this.editable(await this.own(tx, listingId, actor.id));
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
            await this.own(tx, listingId, actor.id, true);
            return this.asset(tx, listingId, id, true);
          },
          mutate: async (tx, actor, current) => {
            requireActive(actor);
            this.editable(await this.own(tx, listingId, actor.id));
            this.pending(current);
            const next = current.pinnedKey
              ? current
              : await tx.listingMedia.update({
                  where: { id },
                  data: { pinnedKey: inputKey(id), version: { increment: 1 } },
                });
            return {
              entityType: 'Media',
              entityId: id,
              version: next.version,
              revisionId: null,
              state: next.status,
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
          await this.own(tx, listingId, actor.id, true);
          return this.asset(tx, listingId, id, true);
        },
        mutate: async (tx, actor, m) => {
          requireActive(actor);
          this.editable(await this.own(tx, listingId, actor.id));
          if (m.version !== body.expectedVersion) throw conflict();
          this.pending(m);
          if (!m.pinnedKey)
            throw new DomainError(
              409,
              'UploadIncomplete',
              'Ảnh chưa tải xong. Hãy thử lại.',
            );
          const next = await tx.listingMedia.update({
            where: { id },
            data: { status: 'Processing', version: { increment: 1 } },
          });
          await tx.mediaProcessingJob.create({ data: { mediaId: id } });
          return {
            entityType: 'Media',
            entityId: id,
            version: next.version,
            revisionId: null,
            state: next.status,
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
        await this.own(tx, listingId, actor.id);
      } else {
        reviewer(actor);
        const link = await tx.revisionMedia.findFirst({
          where: {
            listingId,
            mediaId: id,
            revision: {
              submittedAt: { not: null },
              listing: { deletedAt: null },
            },
          },
        });
        if (!link) throw notFound();
      }
      const asset = await this.asset(tx, listingId, id);
      if (asset.status !== 'Ready')
        throw new DomainError(422, 'MediaNotReady', 'Ảnh chưa sẵn sàng.');
      return asset;
    };
    const m = await this.commands.read(auth, async (tx, actor) => {
      const asset = await authorize(tx, actor);
      if (reviewRequestId)
        await tx.auditEvent.create({
          data: {
            actorId: actor.id,
            mediaId: id,
            action: 'getReviewMediaRead',
            requestId: reviewRequestId,
          },
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
