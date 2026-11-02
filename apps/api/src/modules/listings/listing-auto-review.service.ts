import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Json } from '../../database/mongo/documents.js';
import { MongoService } from '../../database/mongo/mongo.service.js';
import { AutofillImages } from '../autofill-assist/autofill-images.js';
import { AutofillModel } from '../autofill-assist/autofill-model.js';
import { DomainError } from '../commands/domain-error.js';
import { AutoReviewBlocked, autoReviewFacts } from './auto-review-facts.js';
import {
  evaluateAutoReview,
  parseAssessment,
  precheckAutoReview,
  type AutoReviewAssessment,
} from './auto-review-policy.js';
import { AUTO_REVIEW_SYSTEM, autoReviewUser } from './auto-review-prompt.js';
import { loadListing, type Listing } from './listing-projection.js';
import { ListingReviewService } from './listing-review.service.js';

const MAX_PHOTOS_TO_MODEL = 4;
const DAY_MS = 24 * 3_600_000;
export type AutoReviewOutcome = 'Approved' | 'Escalated' | 'Skipped';

const stillPending = (l: Listing | null) =>
  Boolean(
    l &&
      !l.deletedAt &&
      l.moderation === 'PendingReview' &&
      l.visibility !== 'Removed' &&
      l.trade === 'Available' &&
      l.currentRevision,
  );

// ADR 0061. Provider calls run outside any transaction; publishing goes through
// ListingReviewService, which rechecks everything under locks. Staff keeps
// every listing this worker does not publish.
@Injectable()
export class ListingAutoReviewService {
  private readonly logger = new Logger(ListingAutoReviewService.name);

  constructor(
    private readonly mongo: MongoService,
    private readonly config: ConfigService,
    private readonly reviews: ListingReviewService,
    private readonly images: AutofillImages,
    // Null while the provider is unconfigured; a union type needs an explicit token.
    @Inject(AutofillModel) private readonly model: AutofillModel | null,
  ) {}

  private setting(key: string, fallback: number) {
    const value = this.config.get<unknown>(key);
    return value === undefined || value === null ? fallback : Number(value);
  }
  private get maxAutoPrice() {
    return this.setting('LISTING_AUTO_REVIEW_MAX_PRICE', 500_000);
  }

  async tick() {
    const result = {
      enabled: false,
      limited: false,
      processed: 0,
      approved: 0,
      escalated: 0,
      failed: 0,
    };
    if (
      this.config.get<unknown>('LISTING_AUTO_REVIEW_ENABLED') !== 'true' ||
      !this.model
    )
      return result;
    result.enabled = true;
    const used = await this.mongo.c.listing_auto_reviews.countDocuments({
      model: { $ne: null },
      decidedAt: { $gte: new Date(Date.now() - DAY_MS) },
    });
    const remaining = this.setting('LISTING_AUTO_REVIEW_DAILY_LIMIT', 200) - used;
    if (remaining <= 0) return { ...result, limited: true };
    const candidates = await this.mongo.c.listings
      .aggregate<{ _id: string }>([
        { $match: { moderation: 'PendingReview', deletedAt: null } },
        {
          $lookup: {
            from: 'listing_auto_reviews',
            localField: 'currentRevisionId',
            foreignField: 'revisionId',
            as: 'reviewed',
          },
        },
        { $match: { reviewed: { $size: 0 } } },
        { $sort: { updatedAt: 1, _id: 1 } },
        {
          $limit: Math.min(
            remaining,
            this.setting('LISTING_AUTO_REVIEW_BATCH_SIZE', 10),
          ),
        },
        { $project: { _id: 1 } },
      ])
      .toArray();
    for (const { _id } of candidates) {
      result.processed++;
      try {
        const outcome = await this.reviewOne(_id);
        if (outcome === 'Approved') result.approved++;
        if (outcome === 'Escalated') result.escalated++;
      } catch (e) {
        // No row was written, so the next cycle tries again; Staff can act meanwhile.
        result.failed++;
        this.logger.error(
          `Listing auto review failed for ${_id}: ${(e as Error).name}`,
        );
      }
    }
    return result;
  }

  async reviewOne(listingId: string): Promise<AutoReviewOutcome> {
    const c = this.mongo.c;
    const l = await loadListing(c, listingId);
    if (!stillPending(l)) return 'Skipped';
    const revisionId = l!.currentRevisionId!;
    if (await c.listing_auto_reviews.findOne({ revisionId })) return 'Skipped';

    const facts = await autoReviewFacts(c, l!, this.maxAutoPrice);
    const blockers = precheckAutoReview(facts);
    if (blockers.length) return this.escalate(l!, blockers, null, null);

    const assessment = await this.assess(l!);
    const decision = evaluateAutoReview(
      facts,
      assessment,
      this.setting('LISTING_AUTO_REVIEW_MIN_CONFIDENCE', 0.85),
    );
    const modelName = this.model?.model ?? null;
    if (decision.outcome === 'Escalate')
      return this.escalate(l!, decision.reasons, assessment, modelName);
    try {
      const { replayed } = await this.reviews.autoApprove({
        listingId,
        revisionId,
        expectedVersion: l!.version,
        checklist: decision.checklist,
        maxAutoPrice: this.maxAutoPrice,
        assessment: assessment as unknown as Json,
        model: modelName,
      });
      return replayed ? 'Skipped' : 'Approved';
    } catch (e) {
      const blocked = e instanceof AutoReviewBlocked;
      if (!blocked && !(e instanceof DomainError)) throw e;
      // A Staff decision, an edit or a removal got there first: nothing to add.
      const now = await loadListing(c, listingId);
      if (!stillPending(now) || now!.currentRevisionId !== revisionId)
        return 'Skipped';
      return this.escalate(
        now!,
        blocked ? e.reasons : ['CommitCheckFailed'],
        assessment,
        modelName,
      );
    }
  }

  // Provider and photo failures are no assessment, never an approval.
  private async assess(l: Listing): Promise<AutoReviewAssessment | null> {
    try {
      const ids = l
        .currentRevision!.media.slice(0, MAX_PHOTOS_TO_MODEL)
        .map((m) => m.mediaId);
      const docs = await this.mongo.c.listing_media
        .find({ _id: { $in: ids } })
        .toArray();
      const urls = await Promise.all(
        ids.map((id) =>
          this.images.dataUrl(docs.find((d) => d._id === id)!.derivativeKey!),
        ),
      );
      const book = await this.mongo.c.catalog_revisions.findOne({
        _id: l.currentRevision!.book?.currentRevisionId ?? '',
      });
      const draft = await this.model!.read(
        AUTO_REVIEW_SYSTEM,
        autoReviewUser(l, book),
        urls,
      );
      return parseAssessment(draft.output);
    } catch (e) {
      this.logger.warn(`Listing auto review assessment unavailable: ${(e as Error).name}`);
      return null;
    }
  }

  private async escalate(
    l: Listing,
    reasons: string[],
    assessment: AutoReviewAssessment | null,
    model: string | null,
  ): Promise<AutoReviewOutcome> {
    const revisionId = l.currentRevisionId!;
    return this.mongo.tx(async (tx) => {
      if (await tx.c.listing_auto_reviews.findOne({ revisionId }))
        return 'Skipped' as const;
      await tx.c.listing_auto_reviews.insertOne({
        _id: randomUUID(),
        revisionId,
        listingId: l._id,
        outcome: 'Escalated',
        reasons,
        assessment: assessment as unknown as Json,
        model,
        decidedAt: await tx.now(),
      });
      return 'Escalated' as const;
    });
  }
}
