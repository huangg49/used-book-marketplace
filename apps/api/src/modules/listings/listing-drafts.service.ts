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
  type Actor,
  type Tx,
  type CommandContext,
} from '../commands/command.service.js';
import {
  conflict,
  invalidState,
  notFound,
  invalidField,
  type Wire,
} from '../commands/domain-error.js';
import { PageService } from '../commands/page.service.js';
import {
  details,
  revisionDetails,
  revision,
  state,
  projection,
} from './listing-projection.js';

@Injectable()
export class ListingDraftsService {
  constructor(
    private readonly commands: CommandService,
    private readonly catalog: CatalogService,
    private readonly pages: PageService,
    private readonly fulfillment: ListingFulfillmentService,
  ) {}
  private async own(tx: Tx, id: string, ownerId: string) {
    const listing = await tx.listing.findUnique({
      where: { id },
      include: details,
    });
    if (!listing || listing.ownerId !== ownerId || listing.deletedAt)
      throw notFound();
    return listing;
  }
  create(context: CommandContext, body: Wire['CreateDraft']) {
    return this.commands.run(context, 'createListingDraft', null, body, {
      authorize: async (_tx, actor) => {
        member(actor);
      },
      mutate: async (tx, actor) => {
        requireActive(actor);
        const origin = await this.fulfillment.prepare(
          tx,
          actor.id,
          body.content.fulfillment,
        );
        await this.catalog.lockForListing(tx, body.content.bookId, actor.id);
        const l = await tx.listing.create({ data: { ownerId: actor.id } });
        const {
          mediaIds: _media,
          fulfillment: _fulfillment,
          ...content
        } = body.content;
        const r = await tx.listingRevision.create({
          data: { ...content, ...origin, listingId: l.id, number: 1 },
        });
        await tx.listing.update({
          where: { id: l.id },
          data: { currentRevisionId: r.id },
        });
        return {
          entityType: 'Listing',
          entityId: l.id,
          version: 1,
          revisionId: r.id,
          state: state({ ...l, currentRevision: null, revisions: [] }),
        };
      },
    });
  }
  save(context: CommandContext, id: string, body: Wire['SaveDraft']) {
    return this.commands.run(context, 'saveListingDraft', id, body, {
      // Authorize receipt access before input catalog checks. A replay must survive
      // a later catalog decision; a new command validates the catalog under lock.
      authorize: async (tx, actor) => {
        member(actor);
        return this.own(tx, id, actor.id);
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
        await tx.$queryRaw`SELECT id FROM listings WHERE id=${id}::uuid FOR UPDATE`;
        const l = await this.own(tx, id, actor.id);
        if (l.version !== body.expectedVersion) throw conflict();
        if (
          !['Draft', 'Rejected'].includes(l.moderation) ||
          l.visibility === 'Removed' ||
          l.trade !== 'Available'
        )
          throw invalidState();
        await tx.$queryRaw`SELECT id FROM listing_revisions WHERE id=${l.currentRevisionId}::uuid FOR UPDATE`;
        const {
          mediaIds,
          fulfillment: _fulfillment,
          ...content
        } = body.content;
        if (mediaIds.length) {
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM listing_media WHERE id IN (${Prisma.join([...mediaIds].sort().map((i) => Prisma.sql`${i}::uuid`))}) ORDER BY id FOR UPDATE`,
          );
          const media = await tx.listingMedia.findMany({
            where: {
              id: { in: mediaIds },
              listingId: id,
              purgedAt: null,
              status: { in: ['Pending', 'Processing', 'Ready'] },
            },
          });
          if (media.length !== mediaIds.length)
            invalidField(
              '/content/mediaIds',
              'Một hoặc nhiều ảnh không còn khả dụng cho bản sách này.',
              'Unavailable',
            );
        }
        let r = l.currentRevision!;
        if (l.moderation === 'Rejected')
          r = await tx.listingRevision.create({
            data: {
              ...content,
              ...origin,
              listingId: id,
              number: r.number + 1,
            },
            include: { ...revisionDetails, book: true },
          });
        else {
          await tx.revisionMedia.deleteMany({ where: { revisionId: r.id } });
          r = await tx.listingRevision.update({
            where: { id: r.id },
            data: { ...content, ...origin },
            include: { ...revisionDetails, book: true },
          });
        }
        if (mediaIds.length)
          await tx.revisionMedia.createMany({
            data: mediaIds.map((mediaId, position) => ({
              listingId: id,
              revisionId: r.id,
              mediaId,
              position,
            })),
          });
        const next = await tx.listing.update({
          where: { id },
          data: {
            currentRevisionId: r.id,
            moderation: 'Draft',
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
        };
      },
    });
  }
  detail(auth: Actor, id: string) {
    return this.commands.read(auth, async (tx, actor) => {
      member(actor);
      return projection(await this.own(tx, id, actor.id));
    });
  }
  list(auth: Actor, query: Record<string, string | number>) {
    return this.commands.read(auth, async (tx, actor) => {
      member(actor);
      const moderation = query.moderation ?? null,
        visibility = query.visibility ?? null;
      const page = await this.pages.select(tx, {
        from: Prisma.sql`listings l`,
        id: Prisma.sql`l.id`,
        key: Prisma.sql`l.updated_at`,
        kind: 'time',
        ascending: false,
        where: Prisma.sql`l.owner_id=${actor.id}::uuid AND l.deleted_at IS NULL AND (${moderation}::text IS NULL OR l.moderation::text=${moderation}) AND (${visibility}::text IS NULL OR l.visibility::text=${visibility})`,
        scope: {
          operation: 'listMyListings',
          actor: actor.id,
          moderation,
          visibility,
        },
        limit: Number(query.limit),
        cursor: query.cursor as string | undefined,
      });
      const listings = await tx.listing.findMany({
        where: { id: { in: page.ids } },
        include: details,
      });
      return {
        items: page.ids.map((id) =>
          projection(listings.find((l) => l.id === id)!),
        ),
        nextCursor: page.nextCursor,
        serverTime: page.serverTime,
      };
    });
  }
  history(auth: Actor, id: string, query: Record<string, string | number>) {
    return this.commands.read(auth, async (tx, actor) => {
      member(actor);
      await this.own(tx, id, actor.id);
      const page = await this.pages.select(tx, {
        from: Prisma.sql`listing_revisions r`,
        id: Prisma.sql`r.id`,
        key: Prisma.sql`r.number`,
        kind: 'number',
        ascending: false,
        where: Prisma.sql`r.listing_id=${id}::uuid`,
        scope: { operation: 'listMyListingRevisions', actor: actor.id, id },
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
