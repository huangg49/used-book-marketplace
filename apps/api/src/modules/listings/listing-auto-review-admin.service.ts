import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Tx } from '../../database/mongo/transaction.js';
import {
  MongoCommandService,
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
import { AUTO_REVIEWER_ID } from './auto-review-facts.js';
import { POLICY_VERSION } from './auto-review-policy.js';
import { autoReviewCheckWire, autoReviewWire } from './auto-review-wire.js';
import { attachPhotos } from './listing-drafts.service.js';
import {
  checkListing,
  loadListing,
  loadRevisions,
  revision,
  state,
} from './listing-projection.js';

const REPORT_DAYS = 30;
const DAY_MS = 24 * 3_600_000;
const selfForbidden = () =>
  new DomainError(
    403,
    'SelfReviewForbidden',
    'Cần người kiểm duyệt khác xử lý bài đăng này.',
  );

// What people do about the AI reviewer (ADR 0062): read its work, clear a flag,
// or take an AI approval back. Only a person's command changes published state.
@Injectable()
export class ListingAutoReviewAdminService {
  constructor(
    private readonly commands: MongoCommandService,
    private readonly pages: MongoPageService,
    private readonly config: ConfigService,
  ) {}

  private async target(tx: Tx, id: string, actorId: string) {
    const l = await loadListing(tx.c, id);
    if (!l || l.deletedAt || !l.currentRevision?.submittedAt) throw notFound();
    if (l.ownerId === actorId) throw selfForbidden();
    return l;
  }

  // A decided revision is immutable and PendingReview may not carry a decision,
  // so the same content goes back to the queue as a new revision. A later Staff
  // decision is therefore a human decision on record, next to the AI one. Reserved
  // listings stay out: a buyer's commitment points at the approved revision.
  revoke(context: CommandContext, id: string, body: Wire['RevokeAutoApproval']) {
    return this.commands.run(context, 'revokeAutoApproval', id, body, {
      discover: async (tx) => {
        const l = await tx.c.listings.findOne({ _id: id });
        if (!l) throw notFound();
        return [l.ownerId];
      },
      authorize: async (tx, actor) => {
        reviewer(actor);
        return this.target(tx, id, actor._id);
      },
      mutate: async (tx, actor, before) => {
        await tx.lock('listings', [id]);
        const l = await this.target(tx, id, actor._id);
        if (
          l.version !== body.expectedVersion ||
          l.currentRevisionId !== body.revisionId ||
          l.currentRevisionId !== before.currentRevisionId
        )
          throw conflict();
        if (
          l.visibility === 'Removed' ||
          l.trade !== 'Available' ||
          l.moderation !== 'Approved' ||
          l.currentRevision!.decision?.reviewerId !== AUTO_REVIEWER_ID
        )
          throw invalidState();
        await tx.lock('listing_revisions', [body.revisionId]);
        const mediaIds = l.currentRevision!.media.map((m) => m.mediaId);
        const source = await tx.c.listing_revisions.findOne({ _id: body.revisionId });
        const revisionId = randomUUID();
        const now = await tx.now();
        await tx.c.listing_revisions.insertOne({
          ...source!,
          _id: revisionId,
          number: source!.number + 1,
          submittedAt: null,
          ownershipDeclaredAt: null,
          createdAt: now,
          lockSeq: 0,
        });
        // Attach before freezing: submitted revision contents/order are immutable.
        await attachPhotos(tx, id, revisionId, mediaIds);
        await tx.c.listing_revisions.updateOne(
          { _id: revisionId, submittedAt: null },
          { $set: { submittedAt: now, ownershipDeclaredAt: source!.ownershipDeclaredAt } },
        );
        const next = await tx.c.listings.findOneAndUpdate(
          { _id: id, version: l.version },
          {
            $set: {
              currentRevisionId: revisionId,
              moderation: 'PendingReview',
              updatedAt: new Date(),
            },
            $inc: { version: 1 },
          },
          { returnDocument: 'after' },
        );
        tx.check(`listing:${id}`, () => checkListing(tx, id));
        const open = await tx.c.listing_auto_review_checks
          .find({ revisionId: body.revisionId, status: 'Open' })
          .toArray();
        if (open.length) {
          await tx.lock(
            'listing_auto_review_checks',
            open.map((c) => c._id),
          );
          await tx.c.listing_auto_review_checks.updateMany(
            { _id: { $in: open.map((c) => c._id) }, status: 'Open' },
            {
              $set: {
                status: 'Confirmed',
                resolvedBy: actor._id,
                resolvedAt: now,
                note: body.reason,
                updatedAt: now,
              },
              $inc: { version: 1 },
            },
          );
        } else
          await tx.c.listing_auto_review_checks.insertOne({
            _id: randomUUID(),
            revisionId: body.revisionId,
            listingId: id,
            selection: 'StaffOverride',
            status: 'Confirmed',
            reasons: [],
            assessment: null,
            facts: null,
            model: null,
            policyVersion: null,
            inputTokens: 0,
            outputTokens: 0,
            costMicroUsd: 0,
            resolvedBy: actor._id,
            resolvedAt: now,
            note: body.reason,
            version: 1,
            createdAt: now,
            updatedAt: now,
            lockSeq: 0,
          });
        return {
          entityType: 'Listing' as const,
          entityId: id,
          version: next!.version,
          revisionId,
          state: state(next!),
          before: {
            version: l.version,
            revisionId: body.revisionId,
            moderation: l.moderation,
          },
          reason: body.reason,
          event: 'ListingAutoApprovalRevoked',
        };
      },
    });
  }

  // The reviewer looked and the listing stands. Publishing state does not change.
  clearCheck(
    context: CommandContext,
    id: string,
    checkId: string,
    body: Wire['ClearAutoReviewCheck'],
  ) {
    return this.commands.run(context, 'clearAutoReviewCheck', id, body, {
      discover: async (tx) => {
        const l = await tx.c.listings.findOne({ _id: id });
        if (!l) throw notFound();
        return [l.ownerId];
      },
      authorize: async (tx, actor) => {
        reviewer(actor);
        return this.target(tx, id, actor._id);
      },
      mutate: async (tx, actor, l) => {
        await tx.lock('listing_auto_review_checks', [checkId]);
        const check = await tx.c.listing_auto_review_checks.findOne({
          _id: checkId,
          listingId: id,
        });
        if (!check) throw notFound();
        if (check.version !== body.expectedVersion) throw conflict();
        if (check.status !== 'Open') throw invalidState();
        const now = await tx.now();
        await tx.c.listing_auto_review_checks.updateOne(
          { _id: checkId, version: check.version },
          {
            $set: {
              status: 'Cleared',
              resolvedBy: actor._id,
              resolvedAt: now,
              note: body.note,
              updatedAt: now,
            },
            $inc: { version: 1 },
          },
        );
        return {
          entityType: 'Listing' as const,
          entityId: id,
          version: l.version,
          revisionId: check.revisionId,
          state: state(l),
          before: { checkId, status: check.status },
          reason: body.note,
          event: 'ListingAutoReviewCheckCleared',
        };
      },
    });
  }

  listChecks(auth: Actor, query: Record<string, string | number>) {
    return this.commands.read(auth, async (tx, actor) => {
      reviewer(actor);
      const status = String(query.status ?? 'Open');
      const page = await this.pages.page(
        tx.c.listing_auto_review_checks,
        [
          { $match: { status } },
          { $project: { key: '$createdAt' } },
        ],
        {
          kind: 'time',
          ascending: true,
          scope: { operation: 'listAutoReviewChecks', actor: actor._id, status },
          limit: Number(query.limit),
          cursor: query.cursor as string | undefined,
        },
      );
      const docs = await tx.c.listing_auto_review_checks
        .find({ _id: { $in: page.ids } })
        .toArray();
      const items = page.ids.flatMap((checkId) => {
        const doc = docs.find((d) => d._id === checkId);
        return doc && doc.status === status ? [autoReviewCheckWire(doc)] : [];
      });
      return { items, nextCursor: page.nextCursor, serverTime: page.serverTime };
    });
  }

  history(auth: Actor, id: string) {
    return this.commands.read(auth, async (tx, actor) => {
      reviewer(actor);
      const l = await loadListing(tx.c, id);
      if (!l || l.deletedAt) throw notFound();
      const docs = await tx.c.listing_revisions
        .find({ listingId: id, submittedAt: { $ne: null } })
        .sort({ number: -1 })
        .limit(50)
        .toArray();
      const ids = docs.map((r) => r._id);
      const revisions = await loadRevisions(tx.c, docs);
      const reviews = await tx.c.listing_auto_reviews
        .find({ revisionId: { $in: ids } })
        .toArray();
      const checks = await tx.c.listing_auto_review_checks
        .find({ revisionId: { $in: ids } })
        .sort({ createdAt: 1, _id: 1 })
        .toArray();
      return {
        items: revisions.map((r) => {
          const row = reviews.find((v) => v.revisionId === r._id);
          return {
            revisionId: r._id,
            number: r.number,
            submittedAt: r.submittedAt!.toISOString(),
            decision: revision(r).decision,
            autoReview: row
              ? autoReviewWire(
                  row,
                  checks.filter((c) => c.revisionId === r._id),
                )
              : null,
          };
        }),
      };
    });
  }

  report(auth: Actor) {
    return this.commands.read(auth, async (tx, actor) => {
      reviewer(actor);
      const now = await tx.now();
      const since = new Date(now.getTime() - REPORT_DAYS * DAY_MS);
      const rows = await tx.c.listing_auto_reviews
        .find(
          { decidedAt: { $gte: since } },
          { projection: { revisionId: 1, outcome: 1, costMicroUsd: 1 } },
        )
        .toArray();
      const checks = await tx.c.listing_auto_review_checks
        .find(
          { createdAt: { $gte: since } },
          { projection: { selection: 1, status: 1, costMicroUsd: 1 } },
        )
        .toArray();
      const escalated = rows.filter((r) => r.outcome === 'Escalated');
      const decisions = await tx.c.listing_decisions
        .find(
          { revisionId: { $in: escalated.map((r) => r.revisionId) } },
          { projection: { decision: 1 } },
        )
        .toArray();
      const count = (status: string, selection?: string) =>
        checks.filter(
          (c) => c.status === status && (!selection || c.selection === selection),
        ).length;
      const confirmed = count('Confirmed');
      const reviewed = confirmed + count('Cleared');
      const approved = this.config.get<unknown>('LISTING_AUTO_REVIEW_APPROVED_POLICY');
      return {
        windowDays: REPORT_DAYS,
        enabled: this.config.get<unknown>('LISTING_AUTO_REVIEW_ENABLED') === 'true',
        policyVersion: POLICY_VERSION,
        policyApproved: approved === POLICY_VERSION,
        approved: rows.length - escalated.length,
        escalated: escalated.length,
        escalatedThenApproved: decisions.filter((d) => d.decision === 'Approve').length,
        escalatedThenRejected: decisions.filter((d) => d.decision === 'Reject').length,
        checksOpen: count('Open'),
        rechecksPassed: count('Passed', 'AiRecheck'),
        rechecksFlagged:
          count('Open', 'AiRecheck') +
          count('Cleared', 'AiRecheck') +
          count('Confirmed', 'AiRecheck'),
        humanAudits: checks.filter((c) => c.selection === 'HumanAudit').length,
        staffReviewedChecks: reviewed,
        staffConfirmedProblems: confirmed,
        overturnRate: reviewed ? confirmed / reviewed : null,
        costMicroUsd: [...rows, ...checks].reduce(
          (sum, r) => sum + (r.costMicroUsd ?? 0),
          0,
        ),
        serverTime: now.toISOString(),
      };
    });
  }
}
