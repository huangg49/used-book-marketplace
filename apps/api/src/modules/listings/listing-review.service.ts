import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { CatalogService } from '../catalog/catalog.service.js';
import {
  ListingFulfillmentService,
  originReference,
} from './listing-fulfillment.service.js';
import {
  CommandService,
  member,
  requireActive,
  reviewer,
  type Actor,
  type CommandContext,
  type Tx,
} from '../commands/command.service.js';
import { ContractInput } from '../commands/contract-input.service.js';
import {
  conflict,
  DomainError,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import { PageService } from '../commands/page.service.js';
import {
  details,
  projection,
  revision,
  revisionDetails,
  state,
  type Listing,
} from './listing-projection.js';

@Injectable()
export class ListingReviewService {
  constructor(
    private readonly commands: CommandService,
    private readonly catalog: CatalogService,
    private readonly input: ContractInput,
    private readonly pages: PageService,
    private readonly fulfillment: ListingFulfillmentService,
  ) {}

  private async listing(tx: Tx, id: string) {
    const l = await tx.listing.findUnique({ where: { id }, include: details });
    if (!l || l.deletedAt) throw notFound();
    return l;
  }
  private async lock(tx: Tx, before: Listing, expectedVersion: number) {
    await tx.$queryRaw`SELECT id FROM listings WHERE id=${before.id}::uuid FOR UPDATE`;
    const l = await this.listing(tx, before.id);
    // Catalog was locked from the discovery projection. Never acquire another
    // catalog lock after locking a listing if its pointer changed meanwhile.
    if (
      l.version !== expectedVersion ||
      l.currentRevisionId !== before.currentRevisionId
    )
      throw conflict();
    if (l.visibility === 'Removed' || l.trade !== 'Available')
      throw invalidState();
    await tx.$queryRaw`SELECT id FROM listing_revisions WHERE id=${l.currentRevisionId}::uuid FOR UPDATE`;
    return l;
  }
  private async ready(tx: Tx, l: Listing) {
    const ids = l.currentRevision!.media.map((m) => m.mediaId).sort();
    if (ids.length)
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM listing_media WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`,
      );
    const count = await tx.listingMedia.count({
      where: {
        id: { in: ids },
        listingId: l.id,
        status: 'Ready',
        purgedAt: null,
      },
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
        if (l.ownerId !== actor.id) throw notFound();
        return l;
      },
      mutate: async (tx, actor, before) => {
        requireActive(actor);
        const origin = await this.fulfillment.prepare(
          tx,
          actor.id,
          originReference(before.currentRevision!),
        );
        await this.catalog.lockForListing(
          tx,
          before.currentRevision!.bookId,
          actor.id,
        );
        const l = await this.lock(tx, before, body.expectedVersion);
        if (!['Draft', 'Rejected'].includes(l.moderation)) throw invalidState();
        const {
          mediaIds,
          fulfillment: _fulfillment,
          ...content
        } = this.input.body(
          'SubmittedContent',
          revision(l.currentRevision!).content,
        );
        await this.ready(tx, l);
        let r = l.currentRevision!;
        if (l.moderation === 'Rejected') {
          r = await tx.listingRevision.create({
            data: {
              ...content,
              ...origin,
              listingId: id,
              number: r.number + 1,
            },
            include: { ...revisionDetails, book: true },
          });
          // Attach before freezing: submitted revision contents/order are immutable.
          await tx.revisionMedia.createMany({
            data: mediaIds.map((mediaId, position) => ({
              listingId: id,
              revisionId: r.id,
              mediaId,
              position,
            })),
          });
        }
        const now = new Date();
        await tx.listingRevision.update({
          where: { id: r.id },
          data: { submittedAt: now, ownershipDeclaredAt: now },
        });
        const next = await tx.listing.update({
          where: { id },
          data: {
            moderation: 'PendingReview',
            currentRevisionId: r.id,
            version: { increment: 1 },
          },
          include: details,
        });
        return {
          entityType: 'Listing',
          entityId: id,
          version: next.version,
          revisionId: r.id,
          state: state(next),
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
        const l = await tx.listing.findUnique({
          where: { id },
          select: { ownerId: true },
        });
        if (!l) throw notFound();
        return [l.ownerId];
      },
      authorize: async (tx, actor) => {
        reviewer(actor);
        const l = await this.listing(tx, id);
        if (l.ownerId === actor.id)
          throw new DomainError(
            403,
            'SelfReviewForbidden',
            'Không thể tự duyệt sách của mình.',
          );
        return l;
      },
      mutate: async (tx, actor, before) => {
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
          if (book?.status !== 'Confirmed')
            throw new DomainError(
              409,
              'CatalogNotConfirmed',
              'Đầu sách cần được xác nhận trước khi duyệt bản sách.',
            );
          const owner = await tx.user.findUniqueOrThrow({
            where: { id: l.ownerId },
            include: { roles: true },
          });
          if (
            owner.status !== 'ACTIVE' ||
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
        await tx.listingDecision.create({
          data: {
            revisionId: body.revisionId,
            reviewerId: actor.id,
            decision: body.decision,
            ...(body.decision === 'Approve'
              ? { checklist: body.checklist }
              : { reason: body.reason }),
          },
        });
        const next = await tx.listing.update({
          where: { id },
          data: {
            moderation: body.decision === 'Approve' ? 'Approved' : 'Rejected',
            ...(body.decision === 'Approve' ? { publishedAt: new Date() } : {}),
            version: { increment: 1 },
          },
          include: details,
        });
        return {
          entityType: 'Listing',
          entityId: id,
          version: next.version,
          revisionId: body.revisionId,
          state: state(next),
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
  detail(auth: Actor, id: string) {
    return this.commands.read(auth, async (tx, actor) => {
      reviewer(actor);
      const l = await this.listing(tx, id);
      if (!l.currentRevision?.submittedAt) throw notFound();
      return projection(l);
    });
  }
  list(auth: Actor, query: Record<string, string | number>) {
    return this.commands.read(auth, async (tx, actor) => {
      reviewer(actor);
      const moderation = String(query.moderation ?? 'PendingReview');
      const page = await this.pages.select(tx, {
        from: Prisma.sql`listings l JOIN listing_revisions r ON r.id=l.current_revision_id`,
        id: Prisma.sql`l.id`,
        key: Prisma.sql`r.submitted_at`,
        kind: 'time',
        ascending: true,
        where: Prisma.sql`l.deleted_at IS NULL AND l.visibility <> 'Removed' AND r.submitted_at IS NOT NULL AND l.moderation::text=${moderation}`,
        scope: {
          operation: 'listListingReviewQueue',
          actor: actor.id,
          moderation,
        },
        limit: Number(query.limit),
        cursor: query.cursor as string | undefined,
      });
      const listings = await tx.listing.findMany({
        where: {
          id: { in: page.ids },
          deletedAt: null,
          visibility: { not: 'Removed' },
          currentRevision: { submittedAt: { not: null } },
        },
        include: details,
      });
      return {
        items: page.ids.flatMap((id) => {
          const l = listings.find(
            (l) => l.id === id && l.moderation === moderation,
          );
          return l ? [projection(l)] : [];
        }),
        nextCursor: page.nextCursor,
        serverTime: page.serverTime,
      };
    });
  }
  history(auth: Actor, id: string, query: Record<string, string | number>) {
    return this.commands.read(auth, async (tx, actor) => {
      reviewer(actor);
      await this.listing(tx, id);
      const page = await this.pages.select(tx, {
        from: Prisma.sql`listing_revisions r`,
        id: Prisma.sql`r.id`,
        key: Prisma.sql`r.number`,
        kind: 'number',
        ascending: false,
        where: Prisma.sql`r.listing_id=${id}::uuid AND r.submitted_at IS NOT NULL`,
        scope: { operation: 'listReviewRevisions', actor: actor.id, id },
        limit: Number(query.limit),
        cursor: query.cursor as string | undefined,
      });
      const revisions = await tx.listingRevision.findMany({
        where: { id: { in: page.ids } },
        include: revisionDetails,
      });
      return {
        items: page.ids.map((id) =>
          revision(revisions.find((r) => r.id === id)!),
        ),
        nextCursor: page.nextCursor,
        serverTime: page.serverTime,
      };
    });
  }
}
