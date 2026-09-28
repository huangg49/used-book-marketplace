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
import { details, state, type Listing } from './listing-projection.js';

@Injectable()
export class ListingLifecycleService {
  constructor(
    private readonly commands: CommandService,
    private readonly catalog: CatalogService,
    private readonly fulfillment: ListingFulfillmentService,
  ) {}

  // Deleted state is intentionally readable only inside receipt authorization.
  // No content leaves this service; a new command still rejects it under lock.
  private async target(tx: Tx, id: string) {
    const l = await tx.listing.findUnique({ where: { id }, include: details });
    if (!l) throw notFound();
    return l;
  }
  private async lock(tx: Tx, before: Listing, version: number) {
    await tx.$queryRaw`SELECT id FROM listings WHERE id=${before.id}::uuid FOR UPDATE`;
    const l = await this.target(tx, before.id);
    if (l.deletedAt) throw notFound();
    if (
      l.version !== version ||
      l.currentRevisionId !== before.currentRevisionId
    )
      throw conflict();
    if (l.visibility === 'Removed' || l.trade !== 'Available')
      throw invalidState();
    await tx.$queryRaw`SELECT id FROM listing_revisions WHERE id=${l.currentRevisionId}::uuid FOR UPDATE`;
    return l;
  }
  private async ready(tx: Tx, id: string, mediaIds: string[]) {
    const ids = [...mediaIds].sort();
    if (ids.length)
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM listing_media WHERE id IN (${Prisma.join(ids.map((i) => Prisma.sql`${i}::uuid`))}) ORDER BY id FOR UPDATE`,
      );
    const count = await tx.listingMedia.count({
      where: {
        id: { in: ids },
        listingId: id,
        status: 'Ready',
        purgedAt: null,
        derivativeKey: { not: null },
        width: { not: null },
        height: { not: null },
      },
    });
    if (ids.length < 1 || ids.length > 8 || count !== ids.length)
      throw new DomainError(
        422,
        'MediaNotReady',
        'Chọn từ 1 đến 8 ảnh đã xử lý thành công của cuốn sách này.',
      );
  }
  private change(l: Listing, next: Listing) {
    return {
      entityType: 'Listing' as const,
      entityId: l.id,
      version: next.version,
      revisionId: next.currentRevisionId,
      state: state(next),
      before: {
        version: l.version,
        revisionId: l.currentRevisionId,
        state: state(l),
      } as Prisma.InputJsonObject,
    };
  }
  revise(context: CommandContext, id: string, body: Wire['EditApproved']) {
    return this.commands.run(context, 'reviseApprovedListing', id, body, {
      authorize: async (tx, actor) => {
        member(actor);
        const l = await this.target(tx, id);
        if (l.ownerId !== actor.id) throw notFound();
        return l;
      },
      mutate: async (tx, actor, before) => {
        requireActive(actor);
        const origin = await this.fulfillment.prepare(
          tx,
          actor.id,
          body.content.fulfillment === undefined
            ? originReference(before.currentRevision!)
            : body.content.fulfillment,
        );
        await this.catalog.lockForListing(tx, body.content.bookId, actor.id);
        const l = await this.lock(tx, before, body.expectedVersion);
        if (l.moderation !== 'Approved') throw invalidState();
        const {
          mediaIds,
          fulfillment: _fulfillment,
          ...content
        } = body.content;
        await this.ready(tx, id, mediaIds);
        const r = await tx.listingRevision.create({
          data: {
            ...content,
            ...origin,
            listingId: id,
            number: l.currentRevision!.number + 1,
          },
        });
        await tx.revisionMedia.createMany({
          data: mediaIds.map((mediaId, position) => ({
            listingId: id,
            revisionId: r.id,
            mediaId,
            position,
          })),
        });
        const now = new Date();
        await tx.listingRevision.update({
          where: { id: r.id },
          data: { submittedAt: now, ownershipDeclaredAt: now },
        });
        const next = await tx.listing.update({
          where: { id },
          data: {
            currentRevisionId: r.id,
            moderation: 'PendingReview',
            version: { increment: 1 },
          },
          include: details,
        });
        return { ...this.change(l, next), event: 'ListingSubmitted' };
      },
    });
  }
  visibility(context: CommandContext, id: string, body: Wire['SetVisibility']) {
    return this.commands.run(context, 'setListingVisibility', id, body, {
      authorize: async (tx, actor) => {
        member(actor);
        const l = await this.target(tx, id);
        if (l.ownerId !== actor.id) throw notFound();
        return l;
      },
      mutate: async (tx, actor, before) => {
        if (body.visibility === 'Visible') {
          requireActive(actor);
          await this.fulfillment.prepare(
            tx,
            actor.id,
            originReference(before.currentRevision!),
          );
          const book = await this.catalog.lockForReview(
            tx,
            before.currentRevision!.bookId,
          );
          if (book?.status !== 'Confirmed')
            throw new DomainError(
              409,
              'CatalogNotConfirmed',
              'Đầu sách cần được xác nhận trước khi mở lại.',
            );
        }
        const l = await this.lock(tx, before, body.expectedVersion);
        if (l.moderation !== 'Approved' || l.visibility === body.visibility)
          throw invalidState();
        if (body.visibility === 'Visible')
          await this.ready(
            tx,
            id,
            l.currentRevision!.media.map((m) => m.mediaId),
          );
        const next = await tx.listing.update({
          where: { id },
          data: { visibility: body.visibility, version: { increment: 1 } },
          include: details,
        });
        return this.change(l, next);
      },
    });
  }
  archive(context: CommandContext, id: string, body: Wire['VersionCommand']) {
    return this.commands.run(context, 'archiveListing', id, body, {
      authorize: async (tx, actor) => {
        member(actor);
        const l = await this.target(tx, id);
        if (l.ownerId !== actor.id) throw notFound();
        return l;
      },
      mutate: async (tx, _actor, before) => {
        const l = await this.lock(tx, before, body.expectedVersion);
        const next = await tx.listing.update({
          where: { id },
          data: { deletedAt: new Date(), version: { increment: 1 } },
          include: details,
        });
        return this.change(l, next);
      },
    });
  }
  remove(context: CommandContext, id: string, body: Wire['RemoveListing']) {
    return this.commands.run(context, 'removeListing', id, body, {
      discover: async (tx) => [(await this.target(tx, id)).ownerId],
      authorize: async (tx, actor) => {
        reviewer(actor);
        const l = await this.target(tx, id);
        if (l.ownerId === actor.id)
          throw new DomainError(
            403,
            'SelfReviewForbidden',
            'Cần người kiểm duyệt khác gỡ bài đăng này.',
          );
        if (!l.currentRevision?.submittedAt) throw notFound();
        return l;
      },
      mutate: async (tx, _actor, before) => {
        const l = await this.lock(tx, before, body.expectedVersion);
        const next = await tx.listing.update({
          where: { id },
          data: {
            visibility: 'Removed',
            removalReason: body.reason,
            version: { increment: 1 },
          },
          include: details,
        });
        return {
          ...this.change(l, next),
          reason: body.reason,
          event: 'ListingRemoved',
        };
      },
    });
  }
}
