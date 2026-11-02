import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import type { Json } from '../../database/mongo/documents.js';
import { MongoService } from '../../database/mongo/mongo.service.js';
import { AutofillImages } from '../autofill-assist/autofill-images.js';
import { AutofillModel } from '../autofill-assist/autofill-model.js';
import { IsbnBarcodeReader } from '../autofill-assist/isbn-barcode-reader.js';
import { DomainError } from '../commands/domain-error.js';
import {
  AutoReviewBlocked,
  autoReviewFacts,
  sellerFields,
  settingsFrom,
} from './auto-review-facts.js';
import { bytesOf, photoSignal } from './auto-review-photos.js';
import {
  runAutoReviewPipeline,
  type PipelineResult,
} from './auto-review-pipeline.js';
import {
  checklist,
  POLICY_VERSION,
  precheckAutoReview,
  type AutoReviewFacts,
  type Condition,
} from './auto-review-policy.js';
import { nearDuplicate, photoReasons } from './auto-review-signals.js';
import { loadListing, type Listing } from './listing-projection.js';
import { ListingReviewService } from './listing-review.service.js';

const MAX_PHOTOS_TO_MODEL = 4;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const DUPLICATE_WINDOW_MS = 180 * DAY_MS;
const BUCKETS = 10_000;
// A provider that did not answer gets this many worker cycles (about a minute
// apart) before the listing goes to Staff; a refusal or a malformed answer is
// an answer and goes to Staff at once.
const MAX_PROVIDER_ATTEMPTS = 3;
const ATTEMPTS_TTL_MS = 7 * DAY_MS;
const TRANSIENT = new Set(['Timeout', 'ProviderError']);
export type AutoReviewOutcome = 'Approved' | 'Escalated' | 'Skipped' | 'Deferred';

const stillPending = (l: Listing | null) =>
  Boolean(
    l &&
      !l.deletedAt &&
      l.moderation === 'PendingReview' &&
      l.visibility !== 'Removed' &&
      l.trade === 'Available' &&
      l.currentRevision,
  );

// A stable share of revisions, unrelated between the two uses.
const bucket = (use: 'recheck' | 'audit', revisionId: string) =>
  createHash('sha256')
    .update(`${use}:${revisionId}`)
    .digest()
    .readUInt32BE(0) % BUCKETS;

interface Inspection {
  reasons: string[];
  facts: AutoReviewFacts;
  photoHashes: string[];
  pipeline: PipelineResult | null;
}

const assessmentOf = (p: PipelineResult | null) =>
  p
    ? ({
        stages: p.stages,
        criteria: p.criteria,
        extraction: p.extraction,
        comparison: p.comparison,
        damage: p.damage,
      } as unknown as Json)
    : null;
// Every reason is a stage the provider never assessed, for want of an answer.
const providerSilent = (seen: Inspection) =>
  Boolean(seen.pipeline) &&
  seen.reasons.length > 0 &&
  seen.reasons.every((r) => r.endsWith(':AssessmentUnavailable')) &&
  seen.pipeline!.failures.length > 0 &&
  seen.pipeline!.failures.every((f) => TRANSIENT.has(f));
const usageOf = (p: PipelineResult | null) => ({
  inputTokens: p?.usage.inputTokens ?? 0,
  outputTokens: p?.usage.outputTokens ?? 0,
  costMicroUsd: p?.usage.costMicroUsd ?? 0,
});

// ADR 0061, 0063. Provider calls run outside any transaction; publishing goes
// through ListingReviewService, which rechecks every fact under locks. Staff keeps
// every listing this worker does not publish.
@Injectable()
export class ListingAutoReviewService {
  private readonly logger = new Logger(ListingAutoReviewService.name);

  constructor(
    private readonly mongo: MongoService,
    private readonly config: ConfigService,
    private readonly reviews: ListingReviewService,
    private readonly images: AutofillImages,
    private readonly barcode: IsbnBarcodeReader,
    // Null while the provider is unconfigured; a union type needs an explicit token.
    @Inject(AutofillModel) private readonly model: AutofillModel | null,
  ) {}

  private setting = (key: string, fallback: number) => {
    const value = this.config.get<unknown>(key);
    return value === undefined || value === null ? fallback : Number(value);
  };
  private get settings() {
    return settingsFrom(this.setting);
  }
  // Turning the flag on is not enough: the owner names the policy version they
  // accepted evaluation evidence for, so a changed prompt or rule turns it off.
  private get policyApproved() {
    return (
      this.config.get<unknown>('LISTING_AUTO_REVIEW_APPROVED_POLICY') === POLICY_VERSION
    );
  }
  private get active() {
    return (
      this.config.get<unknown>('LISTING_AUTO_REVIEW_ENABLED') === 'true' &&
      Boolean(this.model) &&
      this.policyApproved
    );
  }
  private async callsLeft() {
    const since = new Date(Date.now() - DAY_MS);
    const [reviews, checks] = await Promise.all([
      this.mongo.c.listing_auto_reviews.countDocuments({
        model: { $ne: null },
        decidedAt: { $gte: since },
      }),
      this.mongo.c.listing_auto_review_checks.countDocuments({
        model: { $ne: null },
        createdAt: { $gte: since },
      }),
    ]);
    return this.setting('LISTING_AUTO_REVIEW_DAILY_LIMIT', 200) - reviews - checks;
  }
  // The one daily AI budget shared with the price and photo assistants.
  private async budgetSpent() {
    const day = new Date().toISOString().slice(0, 10);
    const usage = await this.mongo.c.price_assist_usage.findOne({ _id: `global:${day}` });
    return (
      (usage?.costMicroUsd ?? 0) >=
      this.setting('PRICE_ASSIST_DAILY_BUDGET_USD', 2) * 1e6
    );
  }
  // Counts provider-silent cycles per revision without writing a decision, so
  // the next cycle picks the listing up again. Kept with the daily counters
  // (same shape, own key, removed by TTL); no decision reads it.
  private async retryLater(use: 'review' | 'recheck', revisionId: string) {
    const counter = await this.mongo.c.price_assist_usage.findOneAndUpdate(
      { _id: `autoreview:${use}:${revisionId}` },
      {
        $inc: { calls: 1 },
        $setOnInsert: {
          costMicroUsd: 0,
          expiresAt: new Date(Date.now() + ATTEMPTS_TTL_MS),
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
    return (counter?.calls ?? 0) < MAX_PROVIDER_ATTEMPTS;
  }
  private async recordSpend(p: PipelineResult) {
    if (!p.usage.calls) return;
    const day = new Date().toISOString().slice(0, 10);
    await this.mongo.c.price_assist_usage.updateOne(
      { _id: `global:${day}` },
      {
        $inc: { calls: p.usage.calls, costMicroUsd: p.usage.costMicroUsd },
        $setOnInsert: { expiresAt: new Date(Date.parse(day) + 2 * DAY_MS) },
      },
      { upsert: true },
    );
  }

  async tick() {
    const result = {
      enabled: false,
      policyApproved: this.policyApproved,
      limited: false,
      processed: 0,
      approved: 0,
      escalated: 0,
      deferred: 0,
      failed: 0,
    };
    if (!this.active) return result;
    result.enabled = true;
    const remaining = await this.callsLeft();
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
      // Checked per listing, so a batch overruns by at most one listing's calls.
      if (await this.budgetSpent()) return { ...result, limited: true };
      result.processed++;
      try {
        const outcome = await this.reviewOne(_id);
        if (outcome === 'Approved') result.approved++;
        if (outcome === 'Escalated') result.escalated++;
        if (outcome === 'Deferred') result.deferred++;
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

    const seen = await this.inspect(l!);
    if (providerSilent(seen) && (await this.retryLater('review', revisionId)))
      return 'Deferred';
    if (seen.reasons.length) return this.escalate(l!, seen.reasons, seen);
    const auditRate = this.setting('LISTING_AUTO_REVIEW_AUDIT_RATE', 0.1);
    try {
      const { replayed } = await this.reviews.autoApprove({
        listingId,
        revisionId,
        expectedVersion: l!.version,
        checklist: checklist(),
        settings: this.settings,
        assessment: assessmentOf(seen.pipeline),
        facts: seen.facts as unknown as Json,
        photoHashes: seen.photoHashes,
        sampleBucket: bucket('recheck', revisionId),
        humanAudit: bucket('audit', revisionId) < auditRate * BUCKETS,
        model: this.model?.model ?? null,
        ...usageOf(seen.pipeline),
        latencyMs: seen.pipeline?.latencyMs ?? null,
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
        seen,
      );
    }
  }

  // Cheapest first: stored facts, then local photo checks, then paid model calls.
  private async inspect(l: Listing): Promise<Inspection> {
    const facts = await autoReviewFacts(this.mongo.c, l, new Date());
    const blockers = precheckAutoReview(facts, this.settings);
    const none = { facts, photoHashes: [] as string[], pipeline: null };
    if (blockers.length) return { ...none, reasons: blockers };
    let urls: string[];
    try {
      urls = await this.photos(l);
    } catch (e) {
      this.logger.warn(`Listing auto review photo unavailable: ${(e as Error).name}`);
      return { ...none, reasons: ['PhotoUnavailable'] };
    }
    const buffers = urls.map(bytesOf);
    let signals;
    try {
      signals = await Promise.all(buffers.map(photoSignal));
    } catch (e) {
      this.logger.warn(`Listing auto review photo unreadable: ${(e as Error).name}`);
      return { ...none, reasons: ['PhotoUnavailable'] };
    }
    const photoHashes = signals.map((s) => s.hash);
    const reasons = photoReasons(signals);
    if (await this.seenElsewhere(l._id, photoHashes)) reasons.push('PhotoNearDuplicate');
    if (reasons.length) return { facts, photoHashes, pipeline: null, reasons };

    const r = l.currentRevision!;
    const book = await this.mongo.c.catalog_revisions.findOne({
      _id: r.book?.currentRevisionId ?? '',
    });
    if (!book) return { facts, photoHashes, pipeline: null, reasons: ['CatalogNotConfirmed'] };
    const pipeline = await runAutoReviewPipeline(this.model!, {
      condition: r.condition as Condition,
      seller: sellerFields(r),
      images: urls,
      catalog: {
        title: book.title,
        authors: book.authors,
        isbn: book.isbn,
        edition: book.edition,
        publisher: book.publisher,
      },
      barcodes: await this.barcodes(buffers),
      minConfidence: this.setting('LISTING_AUTO_REVIEW_MIN_CONFIDENCE', 0.85),
    });
    await this.recordSpend(pipeline);
    // Failure kinds, status and network code; never photo bytes, seller text or the key.
    if (pipeline.failures.length)
      this.logger.warn(
        JSON.stringify({
          listingId: l._id,
          autoReviewFailures: pipeline.failureDetails,
        }),
      );
    return { facts, photoHashes, pipeline, reasons: pipeline.reasons };
  }

  private async photos(l: Listing) {
    const ids = l
      .currentRevision!.media.slice(0, MAX_PHOTOS_TO_MODEL)
      .map((m) => m.mediaId);
    const docs = await this.mongo.c.listing_media
      .find({ _id: { $in: ids } })
      .toArray();
    return Promise.all(
      ids.map((id) =>
        this.images.dataUrl(docs.find((d) => d._id === id)!.derivativeKey!),
      ),
    );
  }

  // A barcode is optional evidence: failing to decode one proves nothing.
  private async barcodes(buffers: Buffer[]) {
    const found = new Set<string>();
    for (const bytes of buffers)
      try {
        for (const code of await this.barcode.read(bytes)) found.add(code);
      } catch {
        // Reader busy, deadline or undecodable photo.
      }
    return [...found];
  }

  private async seenElsewhere(listingId: string, hashes: string[]) {
    const rows = await this.mongo.c.listing_auto_reviews
      .find(
        {
          listingId: { $ne: listingId },
          decidedAt: { $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
          'photoHashes.0': { $exists: true },
        },
        { projection: { photoHashes: 1 } },
      )
      .toArray();
    return nearDuplicate(
      hashes,
      rows.flatMap((row) => row.photoHashes),
    );
  }

  private async escalate(
    l: Listing,
    reasons: string[],
    seen: Inspection,
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
        assessment: assessmentOf(seen.pipeline),
        model: seen.pipeline ? (this.model?.model ?? null) : null,
        decidedAt: await tx.now(),
        policyVersion: POLICY_VERSION,
        facts: seen.facts as unknown as Json,
        photoHashes: seen.photoHashes,
        sampleBucket: null,
        ...usageOf(seen.pipeline),
        latencyMs: seen.pipeline?.latencyMs ?? null,
      });
      return 'Escalated' as const;
    });
  }

  // Post-publication sampling (ADR 0063). A fixed share of AI approvals is looked
  // at again once facts had time to change. A flag asks a person to look; nothing
  // here unpublishes. The same model agreeing with itself is weak evidence, which
  // is why a separate random share goes straight to people (HumanAudit).
  async recheckTick() {
    const result = {
      enabled: false,
      limited: false,
      closed: await this.closeStaleChecks(),
      processed: 0,
      passed: 0,
      flagged: 0,
      skipped: 0,
      deferred: 0,
      failed: 0,
    };
    if (!this.active) return result;
    result.enabled = true;
    const remaining = await this.callsLeft();
    if (remaining <= 0) return { ...result, limited: true };
    const rate = this.setting('LISTING_AUTO_REVIEW_RECHECK_RATE', 0.2);
    const after = this.setting('LISTING_AUTO_REVIEW_RECHECK_AFTER_HOURS', 24) * HOUR_MS;
    const due = await this.mongo.c.listing_auto_reviews
      .aggregate<{ revisionId: string; listingId: string }>([
        {
          $match: {
            outcome: 'Approved',
            sampleBucket: { $ne: null, $lt: rate * BUCKETS },
            decidedAt: { $lte: new Date(Date.now() - after) },
          },
        },
        {
          $lookup: {
            from: 'listing_auto_review_checks',
            localField: 'revisionId',
            foreignField: 'revisionId',
            as: 'checks',
          },
        },
        { $match: { 'checks.selection': { $ne: 'AiRecheck' } } },
        { $sort: { decidedAt: 1, _id: 1 } },
        {
          $limit: Math.min(
            remaining,
            this.setting('LISTING_AUTO_REVIEW_BATCH_SIZE', 10),
          ),
        },
        { $project: { revisionId: 1, listingId: 1 } },
      ])
      .toArray();
    for (const row of due) {
      if (await this.budgetSpent()) return { ...result, limited: true };
      result.processed++;
      try {
        const status = await this.recheckOne(row.listingId, row.revisionId);
        if (status === 'Passed') result.passed++;
        else if (status === 'Open') result.flagged++;
        else if (status === 'Deferred') result.deferred++;
        else result.skipped++;
      } catch (e) {
        result.failed++;
        this.logger.error(
          `Listing recheck failed for ${row.listingId}: ${(e as Error).name}`,
        );
      }
    }
    return result;
  }

  // A seller's edit or a removal retires the flagged version: buyers no longer see
  // it and the dossier offers actions on the current revision only, so an open
  // flag would otherwise sit in the lane forever. Runs with the flag off too.
  private async closeStaleChecks() {
    const open = await this.mongo.c.listing_auto_review_checks
      .aggregate<{ _id: string; revisionId: string }>([
        { $match: { status: 'Open' } },
        {
          $lookup: {
            from: 'listings',
            localField: 'listingId',
            foreignField: '_id',
            as: 'listing',
          },
        },
        { $unwind: '$listing' },
        {
          $match: {
            $or: [
              { $expr: { $ne: ['$listing.currentRevisionId', '$revisionId'] } },
              { 'listing.visibility': 'Removed' },
              { 'listing.deletedAt': { $ne: null } },
            ],
          },
        },
        { $limit: 100 },
        { $project: { _id: 1, revisionId: 1 } },
      ])
      .toArray();
    for (const { _id } of open)
      await this.mongo.tx(async (tx) => {
        await tx.lock('listing_auto_review_checks', [_id]);
        await tx.c.listing_auto_review_checks.updateOne(
          { _id, status: 'Open' },
          {
            $set: { status: 'Skipped', updatedAt: await tx.now() },
            $addToSet: { reasons: 'NoLongerPublished' },
            $inc: { version: 1 },
          },
        );
      });
    return open.length;
  }

  async recheckOne(listingId: string, revisionId: string) {
    const l = await loadListing(this.mongo.c, listingId);
    const published =
      l &&
      !l.deletedAt &&
      l.visibility !== 'Removed' &&
      l.moderation === 'Approved' &&
      l.currentRevisionId === revisionId;
    // Edited or taken down since: that version is no longer what buyers see.
    const seen = published ? await this.inspect(l) : null;
    if (seen && providerSilent(seen) && (await this.retryLater('recheck', revisionId)))
      return 'Deferred' as const;
    const status = !seen ? 'Skipped' : seen.reasons.length ? 'Open' : 'Passed';
    const pipeline = seen?.pipeline ?? null;
    return this.mongo.tx(async (tx) => {
      const existing = await tx.c.listing_auto_review_checks.findOne({
        revisionId,
        selection: 'AiRecheck',
      });
      if (existing) return existing.status;
      const now = await tx.now();
      await tx.c.listing_auto_review_checks.insertOne({
        _id: randomUUID(),
        revisionId,
        listingId,
        selection: 'AiRecheck',
        status,
        reasons: seen ? seen.reasons : ['NoLongerPublished'],
        assessment: assessmentOf(pipeline),
        facts: (seen?.facts ?? null) as unknown as Json,
        model: pipeline ? (this.model?.model ?? null) : null,
        policyVersion: POLICY_VERSION,
        ...usageOf(pipeline),
        resolvedBy: null,
        resolvedAt: null,
        note: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
        lockSeq: 0,
      });
      return status;
    });
  }
}
