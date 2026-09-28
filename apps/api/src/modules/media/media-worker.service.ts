import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { MediaStorage, inputKey, outputKey } from './media-storage.js';
import { ImageFailure, processImage } from './image-processor.js';

@Injectable()
export class MediaWorker {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: MediaStorage,
  ) {}
  async tick(): Promise<boolean> {
    const claim = await this.db.$transaction(async (tx) => {
      const ids = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM media_processing_jobs WHERE finished_at IS NULL AND available_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!ids[0]) return null;
      const job = await tx.mediaProcessingJob.findUniqueOrThrow({
        where: { id: ids[0].id },
      });
      if (job.attempts >= 3) {
        await tx.listingMedia.update({
          where: { id: job.mediaId },
          data: {
            status: 'Failed',
            failureCode: 'ProcessingFailed',
            version: { increment: 1 },
          },
        });
        await tx.mediaProcessingJob.update({
          where: { id: job.id },
          data: { finishedAt: new Date(), leaseUntil: null },
        });
        return null;
      }
      return tx.mediaProcessingJob.update({
        where: { id: job.id },
        data: {
          attempts: { increment: 1 },
          leaseUntil: new Date(Date.now() + 60_000),
        },
        include: { media: true },
      });
    });
    if (!claim) return false;
    let lost = false;
    const heartbeat = setInterval(() => {
      void this.db.mediaProcessingJob
        .updateMany({
          where: {
            id: claim.id,
            attempts: claim.attempts,
            finishedAt: null,
            leaseUntil: { gt: new Date() },
          },
          data: { leaseUntil: new Date(Date.now() + 60_000) },
        })
        .then((r) => {
          if (r.count !== 1) lost = true;
        })
        .catch(() => {
          lost = true;
        });
    }, 15_000);
    try {
      await this.storage.check();
      const bytes = await this.storage.read(
        claim.media.pinnedKey!,
        claim.media.byteSize,
      );
      const result = await processImage(bytes, claim.media);
      if (lost) return true;
      const key = outputKey(claim.mediaId, claim.attempts);
      await this.storage.put(key, result.bytes, 'image/webp');
      await this.db.$transaction(async (tx) => {
        const held = await tx.mediaProcessingJob.updateMany({
          where: {
            id: claim.id,
            attempts: claim.attempts,
            finishedAt: null,
            leaseUntil: { gt: new Date() },
          },
          data: { finishedAt: new Date(), leaseUntil: null },
        });
        if (!held.count) return;
        await tx.listingMedia.update({
          where: { id: claim.mediaId },
          data: {
            status: 'Ready',
            derivativeKey: key,
            width: result.width,
            height: result.height,
            reservedBytes:
              claim.media.byteSize +
              (claim.attempts - 1) * 2_000_000 +
              result.bytes.length,
            version: { increment: 1 },
          },
        });
      });
    } catch (error) {
      await this.db.$transaction(async (tx) => {
        const terminal = error instanceof ImageFailure || claim.attempts >= 3;
        const held = await tx.mediaProcessingJob.updateMany({
          where: {
            id: claim.id,
            attempts: claim.attempts,
            finishedAt: null,
            leaseUntil: { gt: new Date() },
          },
          data: {
            ...(terminal
              ? { finishedAt: new Date() }
              : {
                  availableAt: new Date(Date.now() + claim.attempts * 10_000),
                }),
            leaseUntil: null,
          },
        });
        if (held.count && terminal)
          await tx.listingMedia.update({
            where: { id: claim.mediaId },
            data: {
              status: 'Failed',
              failureCode:
                error instanceof ImageFailure ? error.code : 'ProcessingFailed',
              version: { increment: 1 },
            },
          });
      });
    } finally {
      clearInterval(heartbeat);
    }
    return true;
  }
  async cleanup() {
    // Bound each sweep. No referenced image is removed, including saved drafts/history.
    const expired = await this.db.listingMedia.findMany({
      where: {
        status: 'Pending',
        expiresAt: { lt: new Date() },
        purgedAt: null,
      },
      take: 20,
    });
    for (const m of expired)
      await this.db.listingMedia.updateMany({
        where: { id: m.id, status: 'Pending', version: m.version },
        data: {
          status: 'Failed',
          failureCode: 'UploadExpired',
          version: { increment: 1 },
        },
      });
    const candidates = await this.db.listingMedia.findMany({
      where: {
        reservedBytes: { gt: 0 },
        createdAt: { lt: new Date(Date.now() - 86_700_000) },
        updatedAt: { lt: new Date(Date.now() - 300_000) },
        revisions: { none: {} },
        OR: [
          { processingJob: { is: null } },
          { processingJob: { is: { finishedAt: { not: null } } } },
        ],
      },
      take: 20,
    });
    for (const candidate of candidates) {
      const marked = await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM listings WHERE id=${candidate.listingId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM listing_media WHERE id=${candidate.id}::uuid FOR UPDATE`;
        const m = await tx.listingMedia.findUniqueOrThrow({
          where: { id: candidate.id },
          include: { revisions: true, processingJob: true },
        });
        if (
          m.revisions.length ||
          (m.processingJob && !m.processingJob.finishedAt) ||
          m.updatedAt.getTime() > Date.now() - 300_000
        )
          return false;
        if (!m.purgedAt)
          await tx.listingMedia.update({
            where: { id: m.id },
            data: { purgedAt: new Date(), version: { increment: 1 } },
          });
        return true;
      });
      if (!marked) continue;
      // Tombstone prevents reattachment while deletion is retried after a crash.
      await this.storage.check();
      await this.storage.remove([
        inputKey(candidate.id),
        ...Array.from({ length: 3 }, (_, i) => outputKey(candidate.id, i + 1)),
      ]);
      await this.db.listingMedia.updateMany({
        where: {
          id: candidate.id,
          purgedAt: { not: null },
          reservedBytes: { gt: 0 },
        },
        data: { reservedBytes: 0, version: { increment: 1 } },
      });
    }
  }
}
