import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Json } from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import {
  AUTO_REVIEWER_ID,
  AutoReviewBlocked,
  autoReviewFacts,
} from './auto-review-facts.js';
import {
  precheckAutoReview,
  POLICY_VERSION,
  type AutoReviewChecklist,
  type AutoReviewSettings,
} from './auto-review-policy.js';
import { autoReviewForRevision, autoReviewWire } from './auto-review-wire.js';
import { CatalogService } from '../catalog/catalog.service.js';
import {
  ListingFulfillmentService,
  originReference,
} from './listing-fulfillment.service.js';
import {
  MongoCommandService,
  member,
  requireActive,
  reviewer,
  type Actor,
  type CommandContext,
} from '../commands/mongo-command.service.js';
import { ContractInput } from '../commands/contract-input.service.js';
import {
  conflict,
  DomainError,
  invalidState,
  notFound,
  invalidField,
  type Wire,
} from '../commands/domain-error.js';
import { MongoPageService } from '../commands/mongo-page.service.js';
import {
  checkListing,
  loadListing,
  loadRevisions,
  projection,
  revision,
  revisionContent,
  state,
  type Listing,
} from './listing-projection.js';
import { priceAssistForRevision } from '../price-assist/price-assist.service.js';
import { attachPhotos } from './listing-drafts.service.js';
import { ListingFeeService } from '../wallet/listing-fee.service.js';
import { requireListingSlot } from './listing-quota.js';
import { requireChannelContent } from './listing-channel.js';

@Injectable()
export class ListingReviewService {
  constructor(
    private readonly commands: MongoCommandService,
    private readonly catalog: CatalogService,
    private readonly input: ContractInput,
    private readonly pages: MongoPageService,
    private readonly fulfillment: ListingFulfillmentService,
    private readonly fees: ListingFeeService,
  ) {}

  private async listing(tx: Tx, id: string) {
    const l = await loadListing(tx.c, id);
    if (!l || l.deletedAt) throw notFound();
    return l;
  }
  private async lock(tx: Tx, before: Listing, expectedVersion: number) {
    await tx.lock('listings', [before._id]);
    const l = await this.listing(tx, before._id);
    // Catalog was locked from the discovery projection. Never acquire another
    // catalog lock after locking a listing if its pointer changed meanwhile.
    if (
      l.version !== expectedVersion ||
      l.currentRevisionId !== before.currentRevisionId
    )
      throw conflict();
    if (l.visibility === 'Removed' || l.trade !== 'Available')
      throw invalidState();
    await tx.lock('listing_revisions', [l.currentRevisionId!]);
    return l;
  }
  private async ready(tx: Tx, l: Listing) {
    const ids = l.currentRevision!.media.map((m) => m.mediaId).sort();
    if (ids.length) await tx.lock('listing_media', ids);
    const count = await tx.c.listing_media.countDocuments({
      _id: { $in: ids },
      listingId: l._id,
      status: 'Ready',
      purgedAt: null,
    });
    if (ids.length < 1 || ids.length > 8 || count !== ids.length)
      throw new DomainError(
        422,
        'MediaNotReady',
        'Chờ ảnh xử lý xong trước khi gửi duyệt.',
        [
          {
            path: '/content/mediaIds',
            code: 'Unavailable',
            message: 'Cần từ 1 đến 8 ảnh đã xử lý thành công.',
          },
        ],
      );
  }
  submit(context: CommandContext, id: string, body: Wire['SubmitListing']) {
    return this.commands.run(context, 'submitListing', id, body, {
      authorize: async (tx, actor) => {
        member(actor);
        const l = await this.listing(tx, id);
        if (l.ownerId !== actor._id) throw notFound();
        return l;
      },
      mutate: async (tx, actor, before) => {
        requireActive(actor);
        const originReferenceForSubmission = originReference(
          before.currentRevision!,
        );
        const origin = await this.fulfillment.prepare(
          tx,
          actor._id,
          originReferenceForSubmission,
        );
        await this.catalog.lockForListing(
          tx,
          before.currentRevision!.bookId,
          actor._id,
        );
        const l = await this.lock(tx, before, body.expectedVersion);
        if (!['Draft', 'Rejected'].includes(l.moderation)) throw invalidState();
        await requireListingSlot(tx, actor._id);
        const {
          mediaIds,
          fulfillment: _fulfillment,
          ...content
        } = this.input.body(
          'SubmittedContent',
          revision(l.currentRevision!).content,
        );
        requireChannelContent(l.channel, {
          ...content,
          fulfillment: origin.originAddressId,
        });
        await this.ready(tx, l);
        let revisionId = l.currentRevisionId!;
        if (l.moderation === 'Rejected') {
          revisionId = randomUUID();
          await tx.c.listing_revisions.insertOne({
            _id: revisionId,
            listingId: id,
            number: l.currentRevision!.number + 1,
            ...revisionContent(content),
            ...origin,
            submittedAt: null,
            ownershipDeclaredAt: null,
            createdAt: await tx.now(),
            lockSeq: 0,
          });
          // Attach before freezing: submitted revision contents/order are immutable.
          await attachPhotos(tx, id, revisionId, mediaIds);
        }
        const now = new Date();
        await tx.c.listing_revisions.updateOne(
          { _id: revisionId, submittedAt: null },
          { $set: { submittedAt: now, ownershipDeclaredAt: now } },
        );
        const next = await tx.c.listings.findOneAndUpdate(
          { _id: id, version: l.version },
          {
            $set: {
              moderation: 'PendingReview',
              currentRevisionId: revisionId,
              updatedAt: new Date(),
            },
            $inc: { version: 1 },
          },
          { returnDocument: 'after' },
        );
        tx.check(`listing:${id}`, () => checkListing(tx, id));
        return {
          entityType: 'Listing',
          entityId: id,
          version: next!.version,
          revisionId,
          state: state(next!),
          before: {
            version: l.version,
            revisionId: l.currentRevisionId,
            moderation: l.moderation,
          },
          event: 'ListingSubmitted',
        };
      },
    });
  }
  decide(context: CommandContext, id: string, body: Wire['DecideListing']) {
    return this.commands.run(context, 'decideListing', id, body, {
      discover: async (tx) => {
        const l = await tx.c.listings.findOne({ _id: id });
        if (!l) throw notFound();
        return [l.ownerId];
      },
      authorize: async (tx, actor) => {
        reviewer(actor);
        const l = await this.listing(tx, id);
        if (l.ownerId === actor._id)
          throw new DomainError(
            403,
            'SelfReviewForbidden',
            'Không thể tự duyệt sách của mình.',
          );
        return l;
      },
      mutate: async (tx, actor, before, receiptId) => {
        if (body.decision === 'Approve')
          await this.fulfillment.prepare(
            tx,
            before.ownerId,
            originReference(before.currentRevision!),
          );
        const book = await this.catalog.lockForReview(
          tx,
          before.currentRevision!.bookId,
        );
        const l = await this.lock(tx, before, body.expectedVersion);
        if (l.currentRevisionId !== body.revisionId) throw conflict();
        if (l.moderation !== 'PendingReview') throw invalidState();
        if (body.decision === 'Approve') {
          if (l.currentRevision?.bundle && body.checklist.bundleContentsVerified !== true)
            invalidField('/checklist/bundleContentsVerified', 'Xác nhận danh sách và ảnh của toàn bộ bộ sách trước khi duyệt.');
          if (book?.status !== 'Confirmed')
            throw new DomainError(
              409,
              'CatalogNotConfirmed',
              'Đầu sách cần được xác nhận trước khi duyệt bản sách.',
            );
          // The owner was locked by the executor (discover).
          const owner = await tx.c.users.findOne({ _id: l.ownerId });
          if (
            owner?.status !== 'ACTIVE' ||
            !owner.emailVerifiedAt ||
            !owner.roles.some((r) => r.role === 'MEMBER')
          )
            throw new DomainError(
              403,
              'AccountIneligible',
              'Chủ sách hiện chưa đủ điều kiện đăng sách.',
            );
          this.input.body(
            'SubmittedContent',
            revision(l.currentRevision!).content,
          );
          await this.ready(tx, l);
        }
        await tx.c.listing_decisions.insertOne({
          _id: randomUUID(),
          revisionId: body.revisionId,
          reviewerId: actor._id,
          decision: body.decision,
          checklist: body.decision === 'Approve' ? body.checklist : null,
          reason: body.decision === 'Reject' ? body.reason : null,
          decidedAt: await tx.now(),
        });
        const next = await tx.c.listings.findOneAndUpdate(
          { _id: id, version: l.version },
          {
            $set: {
              moderation: body.decision === 'Approve' ? 'Approved' : 'Rejected',
              ...(body.decision === 'Approve'
                ? { publishedAt: new Date() }
                : {}),
              updatedAt: new Date(),
            },
            $inc: { version: 1 },
          },
          { returnDocument: 'after' },
        );
        tx.check(`listing:${id}`, () => checkListing(tx, id));
        await this.fees.decide(
          tx,
          body.revisionId,
          body.decision === 'Approve',
          receiptId,
          context.auth.sessionId,
        );
        return {
          entityType: 'Listing',
          entityId: id,
          version: next!.version,
          revisionId: body.revisionId,
          state: state(next!),
          before: {
            version: l.version,
            revisionId: l.currentRevisionId,
            moderation: l.moderation,
          },
          ...(body.decision === 'Reject' ? { reason: body.reason } : {}),
          event:
            body.decision === 'Approve' ? 'ListingApproved' : 'ListingRejected',
        };
      },
    });
  }
  // ADR 0061 worker only: no HTTP route selects this principal. The worker's
  // verdict is only an input; state, owner and catalog are rechecked under locks.
  autoApprove(input: {
    listingId: string;
    revisionId: string;
    expectedVersion: number;
    checklist: AutoReviewChecklist;
    settings: AutoReviewSettings;
    assessment: Json | null;
    facts: Json;
    photoHashes: string[];
    sampleBucket: number;
    humanAudit: boolean;
    model: string | null;
    inputTokens: number;
    outputTokens: number;
    costMicroUsd: number;
    latencyMs: number | null;
  }) {
    const id = input.listingId;
    return this.commands.systemAutoApprove(input.revisionId, id, {
      discover: async (tx) => {
        const l = await tx.c.listings.findOne({ _id: id });
        if (!l) throw notFound();
        return [l.ownerId];
      },
      authorize: (tx) => this.listing(tx, id),
      mutate: async (tx, before) => {
        await this.fulfillment.prepare(
          tx,
          before.ownerId,
          originReference(before.currentRevision!),
        );
        await this.catalog.lockForReview(tx, before.currentRevision!.bookId);
        const l = await this.lock(tx, before, input.expectedVersion);
        if (l.currentRevisionId !== input.revisionId) throw conflict();
        if (l.moderation !== 'PendingReview') throw invalidState();
        const reasons = precheckAutoReview(
          await autoReviewFacts(tx.c, l, await tx.now()),
          input.settings,
        );
        if (reasons.length) throw new AutoReviewBlocked(reasons);
        this.input.body(
          'SubmittedContent',
          revision(l.currentRevision!).content,
        );
        await this.ready(tx, l);
        const decidedAt = await tx.now();
        await tx.c.listing_decisions.insertOne({
          _id: randomUUID(),
          revisionId: input.revisionId,
          reviewerId: AUTO_REVIEWER_ID,
          decision: 'Approve',
          checklist: input.checklist,
          reason: null,
          decidedAt,
        });
        await tx.c.listing_auto_reviews.insertOne({
          _id: randomUUID(),
          revisionId: input.revisionId,
          listingId: id,
          outcome: 'Approved',
          reasons: [],
          assessment: input.assessment,
          model: input.model,
          decidedAt,
          policyVersion: POLICY_VERSION,
          facts: input.facts,
          photoHashes: input.photoHashes,
          sampleBucket: input.sampleBucket,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          costMicroUsd: input.costMicroUsd,
          latencyMs: input.latencyMs,
        });
        // A random share goes straight to people: the only check on the AI that
        // does not depend on the same model agreeing with itself.
        if (input.humanAudit)
          await tx.c.listing_auto_review_checks.insertOne({
            _id: randomUUID(),
            revisionId: input.revisionId,
            listingId: id,
            selection: 'HumanAudit',
            status: 'Open',
            reasons: ['RandomAudit'],
            assessment: null,
            facts: null,
            model: null,
            policyVersion: POLICY_VERSION,
            inputTokens: 0,
            outputTokens: 0,
            costMicroUsd: 0,
            resolvedBy: null,
            resolvedAt: null,
            note: null,
            version: 1,
            createdAt: decidedAt,
            updatedAt: decidedAt,
            lockSeq: 0,
          });
        const next = await tx.c.listings.findOneAndUpdate(
          { _id: id, version: l.version },
          {
            $set: {
              moderation: 'Approved',
              publishedAt: new Date(),
              updatedAt: new Date(),
            },
            $inc: { version: 1 },
          },
          { returnDocument: 'after' },
        );
        tx.check(`listing:${id}`, () => checkListing(tx, id));
        return {
          entityType: 'Listing' as const,
          entityId: id,
          version: next!.version,
          revisionId: input.revisionId,
          state: state(next!),
          before: {
            version: l.version,
            revisionId: l.currentRevisionId,
            moderation: l.moderation,
          },
          event: 'ListingApproved',
        };
      },
    });
  }
  detail(auth: Actor, id: string) {
    return this.commands.read(auth, async (tx, actor) => {
      reviewer(actor);
      const l = await this.listing(tx, id);
      if (!l.currentRevision?.submittedAt) throw notFound();
      return {
        ...projection(l),
        autoReview: await autoReviewForRevision(tx.c, l.currentRevisionId!),
        priceAssist: await priceAssistForRevision(
          tx,
          l._id,
          l.currentRevisionId!,
        ),
      };
    });
  }
  list(auth: Actor, query: Record<string, string | number>) {
    return this.commands.read(auth, async (tx, actor) => {
      reviewer(actor);
      const moderation = String(query.moderation ?? 'PendingReview');
      const aiOutcome = query.aiOutcome ? String(query.aiOutcome) : null;
      const page = await this.pages.page(
        tx.c.listings,
        [
          {
            $match: {
              deletedAt: null,
              visibility: { $ne: 'Removed' },
              moderation,
            },
          },
          {
            $lookup: {
              from: 'listing_revisions',
              localField: 'currentRevisionId',
              foreignField: '_id',
              as: 'r',
            },
          },
          { $unwind: '$r' },
          { $match: { 'r.submittedAt': { $ne: null } } },
          ...(aiOutcome
            ? [
                {
                  $lookup: {
                    from: 'listing_auto_reviews',
                    localField: 'currentRevisionId',
                    foreignField: 'revisionId',
                    as: 'ai',
                  },
                },
                {
                  $match:
                    aiOutcome === 'None'
                      ? { ai: { $size: 0 } }
                      : { 'ai.outcome': aiOutcome },
                },
              ]
            : []),
          { $project: { key: '$r.submittedAt' } },
        ],
        {
          kind: 'time',
          ascending: true,
          scope: {
            operation: 'listListingReviewQueue',
            actor: actor._id,
            moderation,
            ...(aiOutcome ? { aiOutcome } : {}),
          },
          limit: Number(query.limit),
          cursor: query.cursor as string | undefined,
        },
      );
      const items = [];
      for (const listingId of page.ids) {
        const l = await loadListing(tx.c, listingId);
        if (
          l &&
          !l.deletedAt &&
          l.visibility !== 'Removed' &&
          l.currentRevision?.submittedAt &&
          l.moderation === moderation
        ) {
          const row = await tx.c.listing_auto_reviews.findOne({
            revisionId: l.currentRevisionId!,
          });
          items.push({
            ...projection(l),
            autoReview: row ? autoReviewWire(row, []) : null,
          });
        }
      }
      return {
        items,
        nextCursor: page.nextCursor,
        serverTime: page.serverTime,
      };
    });
  }
  history(auth: Actor, id: string, query: Record<string, string | number>) {
    return this.commands.read(auth, async (tx, actor) => {
      reviewer(actor);
      await this.listing(tx, id);
      const page = await this.pages.page(
        tx.c.listing_revisions,
        [
          { $match: { listingId: id, submittedAt: { $ne: null } } },
          { $project: { key: '$number' } },
        ],
        {
          kind: 'number',
          ascending: false,
          scope: { operation: 'listReviewRevisions', actor: actor._id, id },
          limit: Number(query.limit),
          cursor: query.cursor as string | undefined,
        },
      );
      const docs = await tx.c.listing_revisions
        .find({ _id: { $in: page.ids } })
        .toArray();
      const revisions = await loadRevisions(tx.c, docs);
      return {
        items: page.ids.map((rid) =>
          revision(revisions.find((r) => r._id === rid)!),
        ),
        nextCursor: page.nextCursor,
        serverTime: page.serverTime,
      };
    });
  }
}
