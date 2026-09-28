import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import type { OrderPackagingEvidence } from '../../generated/prisma/client.js';
import {
  CommandService,
  member,
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
import { MediaStorage, digest } from '../media/media-storage.js';
import { processImage, ImageFailure } from '../media/image-processor.js';
import { ImageUploadSlots } from '../media/image-upload-slots.js';
import { OrderClock } from './order-clock.js';

const originalKey = (id: string) => `order-evidence/${id}/original`;
const previewKey = (id: string) => `order-evidence/${id}/preview-v1.webp`;
const quota = () =>
  new DomainError(
    429,
    'MediaQuotaExceeded',
    'Ảnh đã đạt giới hạn lưu trữ. Vui lòng thử lại sau.',
  );
const projection = (m: OrderPackagingEvidence): Wire['PackagingEvidence'] => ({
  id: m.id,
  orderId: m.orderId,
  version: m.version as 1 | 2,
  status: m.status as 'Pending' | 'Ready',
  mimeType: m.mimeType as Wire['PackagingEvidence']['mimeType'],
  byteSize: m.byteSize,
  sha256: m.sha256,
  createdAt: m.createdAt.toISOString(),
  uploadedAt: m.uploadedAt?.toISOString() ?? null,
  purpose: 'Packaging',
});

@Injectable()
export class PackagingEvidenceService {
  constructor(
    private readonly commands: CommandService,
    private readonly config: ConfigService,
    private readonly storage: MediaStorage,
    private readonly slots: ImageUploadSlots,
    private readonly clock: OrderClock,
  ) {}
  private async own(
    tx: Tx,
    orderId: string,
    userId: string,
    sellerOnly = false,
    lock = false,
  ) {
    const o = await tx.directOrder.findUnique({
      where: { id: orderId },
      include: { context: true, preparation: true },
    });
    if (!o || (o.sellerId !== userId && (sellerOnly || o.buyerId !== userId)))
      throw notFound();
    if (lock) {
      await tx.$queryRaw`SELECT id FROM workflow_contexts WHERE id=${o.context!.id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM direct_orders WHERE id=${orderId}::uuid FOR UPDATE`;
      return tx.directOrder.findUniqueOrThrow({
        where: { id: orderId },
        include: { context: true, preparation: true },
      });
    }
    return o;
  }
  private eligible(o: Awaited<ReturnType<PackagingEvidenceService['own']>>) {
    if (!o.preparation || !['Preparing', 'ResolutionPending'].includes(o.state))
      throw invalidState();
  }
  private async asset(tx: Tx, orderId: string, id: string, lock = false) {
    if (lock)
      await tx.$queryRaw`SELECT id FROM order_packaging_evidence WHERE id=${id}::uuid FOR UPDATE`;
    const e = await tx.orderPackagingEvidence.findUnique({ where: { id } });
    if (!e || e.orderId !== orderId) throw notFound();
    return e;
  }
  private async decision(tx: Tx, auth: Actor) {
    const now = await this.clock.now(tx);
    const s = await tx.authSession.findUnique({
      where: { id: auth.sessionId },
    });
    if (!s || s.revokedAt || s.expiresAt <= now)
      throw new DomainError(
        401,
        'SESSION_EXPIRED',
        'Phiên đăng nhập đã hết hạn.',
      );
    return now;
  }
  private discover(orderId: string, auth: Actor, sellerOnly = false) {
    return async (tx: Tx) => {
      const o = await this.own(tx, orderId, auth.user.id, sellerOnly);
      return [o.buyerId, o.sellerId];
    };
  }
  create(
    context: CommandContext,
    orderId: string,
    body: Wire['CreatePackagingEvidence'],
  ) {
    return this.commands.runPackaging(
      context,
      'createPackagingEvidence',
      orderId,
      body,
      {
        discover: this.discover(orderId, context.auth, true),
        authorize: async (tx, actor) => {
          member(actor);
          const o = await this.own(tx, orderId, actor.id, true, true);
          await this.decision(tx, context.auth);
          return o;
        },
        mutate: async (tx, actor, o, receiptId) => {
          this.eligible(o);
          if (o.version !== body.expectedVersion) throw conflict();
          if (
            await tx.orderPackagingEvidence.findUnique({
              where: { orderId_sha256: { orderId, sha256: body.sha256 } },
            })
          )
            throw conflict(); // Recover the existing intent through the private list.
          // Same advisory budget as listing media; a reservation includes both objects.
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(781204991)::text`;
          const now = await this.decision(tx, context.auth);
          const since = new Date(now.getTime() - 3600000);
          const count = await tx.orderPackagingEvidence.count({
            where: { orderId },
          });
          const recent = await tx.orderPackagingEvidence.count({
            where: {
              preparation: { order: { sellerId: actor.id } },
              createdAt: { gt: since },
            },
          });
          const listingRecent = await tx.listingMedia.count({
            where: { listing: { ownerId: actor.id }, createdAt: { gt: since } },
          });
          const listings = await tx.listingMedia.aggregate({
            _sum: { reservedBytes: true },
          });
          const evidence = await tx.orderPackagingEvidence.aggregate({
            _sum: { reservedBytes: true },
          });
          const reservedBytes = body.byteSize + 2000000;
          if (
            count >= 32 ||
            recent + listingRecent >= 20 ||
            (listings._sum.reservedBytes ?? 0) +
              (evidence._sum.reservedBytes ?? 0) +
              reservedBytes >
              this.config.get<number>('MEDIA_STORAGE_BUDGET_BYTES', 800000000)
          )
            throw quota();
          const e = await tx.orderPackagingEvidence.create({
            data: {
              id: randomUUID(),
              orderId,
              mimeType: body.mimeType,
              byteSize: body.byteSize,
              sha256: body.sha256,
              reservedBytes,
              createdAt: now,
              createReceiptId: receiptId,
            },
          });
          return {
            entityType: 'OrderPackagingEvidence',
            entityId: e.id,
            orderId,
            contextId: o.context!.id,
            version: 1,
            state: 'Pending',
            decidedAt: now,
            event: 'PackagingEvidenceReserved',
          };
        },
      },
    );
  }
  list(auth: Actor, orderId: string): Promise<Wire['PackagingEvidenceList']> {
    return this.commands.readObligation(auth, async (tx, actor) => {
      member(actor);
      await this.own(tx, orderId, actor.id);
      const items = await tx.orderPackagingEvidence.findMany({
        where: { orderId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 32,
      });
      return {
        items: items.map(projection),
        serverTime: (await this.decision(tx, auth)).toISOString(),
      };
    });
  }
  async upload(
    context: CommandContext,
    orderId: string,
    id: string,
    req: Request,
  ) {
    const m = await this.commands.readObligation(
      context.auth,
      async (tx, actor) => {
        member(actor);
        const o = await this.own(tx, orderId, actor.id, true);
        const e = await this.asset(tx, orderId, id);
        if (e.status === 'Pending') this.eligible(o);
        return e;
      },
    );
    if (req.header('content-type')?.split(';')[0] !== m.mimeType)
      throw new DomainError(
        415,
        'UnsupportedMediaType',
        'Loại ảnh không khớp khai báo.',
      );
    if (Number(req.header('content-length')) > m.byteSize)
      throw new DomainError(
        413,
        'PayloadTooLarge',
        'Ảnh vượt dung lượng khai báo.',
      );
    const release = this.slots.claim();
    const deadline = Date.now() + 120000;
    const timeout = setTimeout(() => req.destroy(), 120000);
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
            'Ảnh vượt dung lượng khai báo.',
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
      let image: Awaited<ReturnType<typeof processImage>> | undefined;
      if (m.status === 'Pending') {
        try {
          image = await processImage(bytes, m);
        } catch (error) {
          if (error instanceof ImageFailure)
            throw new DomainError(
              422,
              'VALIDATION_ERROR',
              'Ảnh không hợp lệ hoặc vượt giới hạn xử lý.',
            );
          throw error;
        }
        await this.storage.check();
        // Two fixed create-only keys. Retries cannot overwrite originals or add attempts.
        // Reserve remains charged even when storage succeeds but DB acknowledgement fails.
        await this.storage.put(originalKey(id), bytes, m.mimeType);
        await this.storage.put(previewKey(id), image.bytes, 'image/webp');
      }
      return await this.commands.runPackaging(
        context,
        'uploadPackagingEvidence',
        id,
        { orderId, sha256: m.sha256 },
        {
          discover: this.discover(orderId, context.auth, true),
          authorize: async (tx, actor) => {
            member(actor);
            const o = await this.own(tx, orderId, actor.id, true, true);
            const e = await this.asset(tx, orderId, id, true);
            await this.decision(tx, context.auth);
            return { o, e };
          },
          mutate: async (tx, _actor, { o, e }, receiptId) => {
            this.eligible(o);
            if (e.status !== 'Pending' || !image) throw invalidState();
            if (Date.now() >= deadline)
              throw new DomainError(
                503,
                'UNAVAILABLE',
                'Lượt tải ảnh quá lâu. Hãy thử lại cùng yêu cầu.',
              );
            const now = await this.decision(tx, context.auth);
            await tx.orderPackagingEvidence.update({
              where: { id },
              data: {
                status: 'Ready',
                version: 2,
                uploadedAt: now,
                uploadReceiptId: receiptId,
                derivativeBytes: image.bytes.length,
                derivativeSha256: digest(image.bytes),
                width: image.width,
                height: image.height,
              },
            });
            return {
              entityType: 'OrderPackagingEvidence',
              entityId: id,
              orderId,
              contextId: o.context!.id,
              version: 2,
              state: 'Ready',
              decidedAt: now,
              event: 'PackagingEvidenceSubmitted',
            };
          },
        },
      );
    } finally {
      clearTimeout(timeout);
      release();
    }
  }
  async read(
    auth: Actor,
    orderId: string,
    id: string,
    requestId: string,
  ): Promise<Wire['MediaRead']> {
    const authorize = async (tx: Tx, actor: Parameters<typeof member>[0]) => {
      member(actor);
      const o = await this.own(tx, orderId, actor.id);
      const m = await this.asset(tx, orderId, id);
      if (m.status !== 'Ready')
        throw new DomainError(
          422,
          'MediaNotReady',
          'Ảnh chưa được nộp thành công.',
        );
      return { o, m };
    };
    const { m } = await this.commands.readObligation(auth, authorize);
    await this.storage.check();
    const signed = await this.storage.signedRead(previewKey(id));
    await this.commands.readObligation(auth, async (tx, actor) => {
      const { o } = await authorize(tx, actor);
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          contextId: o.context!.id,
          action: 'readPackagingEvidence',
          requestId,
          after: { evidenceId: id, representation: 'NormalizedPreview' },
        },
      });
    });
    return { id, ...signed, width: m.width!, height: m.height! };
  }
}
