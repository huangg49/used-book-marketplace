import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Tx } from '../../database/mongo/transaction.js';
import { CatalogService } from '../catalog/catalog.service.js';
import {
  ListingFulfillmentService,
  originReference,
} from './listing-fulfillment.service.js';
import {
  MongoCommandService,
  member,
  requireActive,
  type Actor,
  type CommandContext,
} from '../commands/mongo-command.service.js';
import {
  conflict,
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
} from './listing-projection.js';

export const lowerIds = (ids: string[]) => ids.map((id) => id.toLowerCase());

// Attaches photos to a revision that is still a draft (W for the
// latlai_guard_revision_media trigger): the revision must not be frozen and
// every photo must be an unpurged asset of the same listing, locked.
export async function attachPhotos(
  tx: Tx,
  listingId: string,
  revisionId: string,
  mediaIds: string[],
) {
  if (!mediaIds.length) return;
  const r = await tx.c.listing_revisions.findOne({ _id: revisionId });
  if (!r || r.submittedAt)
    throw new Error('Attach photos before freezing a revision');
  await tx.c.revision_media.insertMany(
    mediaIds.map((mediaId, position) => ({
      _id: `${revisionId}:${mediaId}`,
      listingId,
      revisionId,
      mediaId,
      position,
    })),
  );
}

@Injectable()
export class ListingDraftsService {
  constructor(
    private readonly commands: MongoCommandService,
    private readonly catalog: CatalogService,
    private readonly pages: MongoPageService,
    private readonly fulfillment: ListingFulfillmentService,
  ) {}
  private async own(tx: Tx, id: string, ownerId: string) {
    const listing = await loadListing(tx.c, id);
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
          actor._id,
          body.content.fulfillment,
        );
        await this.catalog.lockForListing(
          tx,
          body.content.bookId?.toLowerCase() ?? null,
          actor._id,
        );
        const {
          mediaIds: _media,
          fulfillment: _fulfillment,
          ...content
        } = body.content;
        const listingId = randomUUID(),
          revisionId = randomUUID(),
          now = await tx.now();
        await tx.c.listing_revisions.insertOne({
          _id: revisionId,
          listingId,
          number: 1,
          ...revisionContent(content),
          ...origin,
          submittedAt: null,
          ownershipDeclaredAt: null,
          createdAt: now,
          lockSeq: 0,
        });
        const listing = {
          _id: listingId,
          ownerId: actor._id,
          version: 1,
          moderation: 'Draft' as const,
          visibility: 'Visible' as const,
          trade: 'Available' as const,
          currentRevisionId: revisionId,
          removalReason: null,
          deletedAt: null,
          publishedAt: null,
          createdAt: now,
          updatedAt: new Date(),
          lockSeq: 0,
        };
        await tx.c.listings.insertOne(listing);
        tx.check(`listing:${listingId}`, () => checkListing(tx, listingId));
        return {
          entityType: 'Listing',
          entityId: listingId,
          version: 1,
          revisionId,
          state: state(listing),
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
        return this.own(tx, id, actor._id);
      },
      mutate: async (tx, actor, before) => {
        requireActive(actor);
        const origin = await this.fulfillment.prepare(
          tx,
          actor._id,
          body.content.fulfillment === undefined
            ? originReference(before.currentRevision!)
            : body.content.fulfillment,
        );
        await this.catalog.lockForListing(
          tx,
          body.content.bookId?.toLowerCase() ?? null,
          actor._id,
        );
        await tx.lock('listings', [id]);
        const l = await this.own(tx, id, actor._id);
        if (l.version !== body.expectedVersion) throw conflict();
        if (
          !['Draft', 'Rejected'].includes(l.moderation) ||
          l.visibility === 'Removed' ||
          l.trade !== 'Available'
        )
          throw invalidState();
        await tx.lock('listing_revisions', [l.currentRevisionId!]);
        const { fulfillment: _fulfillment, ...rest } = body.content;
        const mediaIds = lowerIds(rest.mediaIds);
        if (mediaIds.length) {
          await tx.lock('listing_media', mediaIds);
          const available = await tx.c.listing_media.countDocuments({
            _id: { $in: mediaIds },
            listingId: id,
            purgedAt: null,
            status: { $in: ['Pending', 'Processing', 'Ready'] },
          });
          if (available !== mediaIds.length)
            invalidField(
              '/content/mediaIds',
              'Một hoặc nhiều ảnh không còn khả dụng cho bản sách này.',
              'Unavailable',
            );
        }
        let revisionId = l.currentRevisionId!;
        if (l.moderation === 'Rejected') {
          revisionId = randomUUID();
          await tx.c.listing_revisions.insertOne({
            _id: revisionId,
            listingId: id,
            number: l.currentRevision!.number + 1,
            ...revisionContent(rest),
            ...origin,
            submittedAt: null,
            ownershipDeclaredAt: null,
            createdAt: await tx.now(),
            lockSeq: 0,
          });
        } else {
          // Only an unsubmitted draft revision may change (latlai_guard_revision).
          await tx.c.revision_media.deleteMany({ revisionId });
          await tx.c.listing_revisions.updateOne(
            { _id: revisionId, listingId: id, submittedAt: null },
            { $set: { ...revisionContent(rest), ...origin } },
          );
        }
        await attachPhotos(tx, id, revisionId, mediaIds);
        const next = await tx.c.listings.findOneAndUpdate(
          { _id: id, version: l.version },
          {
            $set: {
              currentRevisionId: revisionId,
              moderation: 'Draft',
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
        };
      },
    });
  }
  detail(auth: Actor, id: string) {
    return this.commands.read(auth, async (tx, actor) => {
      member(actor);
      return projection(await this.own(tx, id, actor._id));
    });
  }
  list(auth: Actor, query: Record<string, string | number>) {
    return this.commands.read(auth, async (tx, actor) => {
      member(actor);
      const moderation = query.moderation ?? null,
        visibility = query.visibility ?? null;
      const page = await this.pages.page(
        tx.c.listings,
        [
          {
            $match: {
              ownerId: actor._id,
              deletedAt: null,
              ...(moderation ? { moderation } : {}),
              ...(visibility ? { visibility } : {}),
            },
          },
          { $project: { key: '$updatedAt' } },
        ],
        {
          kind: 'time',
          ascending: false,
          scope: {
            operation: 'listMyListings',
            actor: actor._id,
            moderation,
            visibility,
          },
          limit: Number(query.limit),
          cursor: query.cursor as string | undefined,
        },
      );
      const items = [];
      for (const listingId of page.ids)
        items.push(projection((await loadListing(tx.c, listingId))!));
      return {
        items,
        nextCursor: page.nextCursor,
        serverTime: page.serverTime,
      };
    });
  }
  history(auth: Actor, id: string, query: Record<string, string | number>) {
    return this.commands.read(auth, async (tx, actor) => {
      member(actor);
      await this.own(tx, id, actor._id);
      const page = await this.pages.page(
        tx.c.listing_revisions,
        [{ $match: { listingId: id } }, { $project: { key: '$number' } }],
        {
          kind: 'number',
          ascending: false,
          scope: { operation: 'listMyListingRevisions', actor: actor._id, id },
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
