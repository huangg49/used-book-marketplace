import { Injectable } from '@nestjs/common';
import type { ListingMediaDoc } from '../../database/mongo/documents.js';
import { MongoService } from '../../database/mongo/mongo.service.js';
import { MediaStorage, inputKey, outputKey } from './media-storage.js';
import { ImageFailure, processImage } from './image-processor.js';

const LEASE_MS = 60_000;

@Injectable()
export class MediaWorker {
  constructor(
    private readonly mongo: MongoService,
    private readonly storage: MediaStorage,
  ) {}
  // Media state changes: version +1 and Prisma's @updatedAt equivalent.
  private mediaChange(set: Partial<ListingMediaDoc>) {
    return {
      $set: { ...set, updatedAt: new Date() },
      $inc: { version: 1 },
    };
  }
  async tick(): Promise<boolean> {
    // Claim the next due job. Two workers selecting the same job both write
    // it; one gets a write conflict and retries on the next candidate (the
    // FOR UPDATE SKIP LOCKED equivalent). The lease, not a lock, protects work.
    const claim = await this.mongo.tx(async (tx) => {
      const now = await tx.now();
      const job = await tx.c.media_processing_jobs.findOne(
        {
          finishedAt: null,
          availableAt: { $lte: now },
          $or: [{ leaseUntil: null }, { leaseUntil: { $lt: now } }],
        },
        { sort: { availableAt: 1, _id: 1 } },
      );
      if (!job) return null;
      if (job.attempts >= 3) {
        await tx.c.listing_media.updateOne(
          { _id: job.mediaId, status: 'Processing' },
          this.mediaChange({
            status: 'Failed',
            failureCode: 'ProcessingFailed',
          }),
        );
        await tx.c.media_processing_jobs.updateOne(
          { _id: job._id, attempts: job.attempts },
          { $set: { finishedAt: new Date(), leaseUntil: null } },
        );
        return null;
      }
      const claimed = await tx.c.media_processing_jobs.findOneAndUpdate(
        { _id: job._id, attempts: job.attempts, finishedAt: null },
        {
          $inc: { attempts: 1 },
          $set: { leaseUntil: new Date(Date.now() + LEASE_MS) },
        },
        { returnDocument: 'after' },
      );
      const media = await tx.c.listing_media.findOne({ _id: job.mediaId });
      return claimed && media ? { ...claimed, media } : null;
    });
    if (!claim) return false;
    const held = {
      _id: claim._id,
      attempts: claim.attempts,
      finishedAt: null,
    };
    let lost = false;
    const heartbeat = setInterval(() => {
      void this.mongo.c.media_processing_jobs
        .updateOne(
          { ...held, leaseUntil: { $gt: new Date() } },
          { $set: { leaseUntil: new Date(Date.now() + LEASE_MS) } },
        )
        .then((r) => {
          if (r.matchedCount !== 1) lost = true;
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
      await this.mongo.tx(async (tx) => {
        const lease = await tx.c.media_processing_jobs.updateOne(
          { ...held, leaseUntil: { $gt: new Date() } },
          { $set: { finishedAt: new Date(), leaseUntil: null } },
        );
        if (!lease.matchedCount) return;
        // Processing -> Ready once, with the bounded reservation of this attempt.
        await tx.c.listing_media.updateOne(
          { _id: claim.mediaId, status: 'Processing' },
          this.mediaChange({
            status: 'Ready',
            derivativeKey: key,
            width: result.width,
            height: result.height,
            reservedBytes:
              claim.media.byteSize +
              (claim.attempts - 1) * 2_000_000 +
              result.bytes.length,
          }),
        );
      });
    } catch (error) {
      await this.mongo.tx(async (tx) => {
        const terminal = error instanceof ImageFailure || claim.attempts >= 3;
        const lease = await tx.c.media_processing_jobs.updateOne(
          { ...held, leaseUntil: { $gt: new Date() } },
          {
            $set: {
              ...(terminal
                ? { finishedAt: new Date() }
                : {
                    availableAt: new Date(Date.now() + claim.attempts * 10_000),
                  }),
              leaseUntil: null,
            },
          },
        );
        if (lease.matchedCount && terminal)
          await tx.c.listing_media.updateOne(
            { _id: claim.mediaId, status: 'Processing' },
            this.mediaChange({
              status: 'Failed',
              failureCode:
                error instanceof ImageFailure ? error.code : 'ProcessingFailed',
            }),
          );
      });
    } finally {
      clearInterval(heartbeat);
    }
    return true;
  }
  async cleanup() {
    // Bound each sweep. No referenced image is removed, including saved drafts/history.
    const expired = await this.mongo.c.listing_media
      .find(
        { status: 'Pending', expiresAt: { $lt: new Date() }, purgedAt: null },
        { limit: 20 },
      )
      .toArray();
    for (const m of expired)
      await this.mongo.c.listing_media.updateOne(
        { _id: m._id, status: 'Pending', version: m.version },
        this.mediaChange({ status: 'Failed', failureCode: 'UploadExpired' }),
      );
    const candidates = await this.mongo.c.listing_media
      .aggregate<ListingMediaDoc>([
        {
          $match: {
            reservedBytes: { $gt: 0 },
            createdAt: { $lt: new Date(Date.now() - 86_700_000) },
            updatedAt: { $lt: new Date(Date.now() - 300_000) },
          },
        },
        {
          $lookup: {
            from: 'revision_media',
            localField: '_id',
            foreignField: 'mediaId',
            pipeline: [{ $limit: 1 }],
            as: 'links',
          },
        },
        { $match: { links: { $size: 0 } } },
        {
          $lookup: {
            from: 'media_processing_jobs',
            localField: '_id',
            foreignField: 'mediaId',
            as: 'jobs',
          },
        },
        {
          $match: {
            $or: [{ jobs: { $size: 0 } }, { 'jobs.finishedAt': { $ne: null } }],
          },
        },
        { $limit: 20 },
        { $project: { links: 0, jobs: 0 } },
      ])
      .toArray();
    for (const candidate of candidates) {
      const marked = await this.mongo.tx(async (tx) => {
        await tx.lock('listings', [candidate.listingId]);
        await tx.lock('listing_media', [candidate._id]);
        const m = await tx.c.listing_media.findOne({ _id: candidate._id });
        const linked = await tx.c.revision_media.countDocuments({
          mediaId: candidate._id,
        });
        const job = await tx.c.media_processing_jobs.findOne({
          mediaId: candidate._id,
        });
        if (
          !m ||
          linked ||
          (job && !job.finishedAt) ||
          m.updatedAt.getTime() > Date.now() - 300_000
        )
          return false;
        // The purge tombstone is permanent (never cleared once set).
        if (!m.purgedAt)
          await tx.c.listing_media.updateOne(
            { _id: m._id, purgedAt: null },
            this.mediaChange({ purgedAt: new Date() }),
          );
        return true;
      });
      if (!marked) continue;
      // Tombstone prevents reattachment while deletion is retried after a crash.
      await this.storage.check();
      await this.storage.remove([
        inputKey(candidate._id),
        ...Array.from({ length: 3 }, (_, i) => outputKey(candidate._id, i + 1)),
      ]);
      await this.mongo.c.listing_media.updateOne(
        {
          _id: candidate._id,
          purgedAt: { $ne: null },
          reservedBytes: { $gt: 0 },
        },
        this.mediaChange({ reservedBytes: 0 }),
      );
    }
  }
}
