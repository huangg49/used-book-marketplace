import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Json, ListingDoc } from '../../database/mongo/documents.js';
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
  reviewer,
  type CommandContext,
} from '../commands/mongo-command.service.js';
import {
  conflict,
  DomainError,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import {
  checkListing,
  loadListing,
  revisionContent,
  state,
  type Listing,
} from './listing-projection.js';
import { attachPhotos, lowerIds } from './listing-drafts.service.js';
import { PriceAssistService } from '../price-assist/price-assist.service.js';

@Injectable()
export class ListingLifecycleService {
  constructor(
    private readonly commands: MongoCommandService,
    private readonly catalog: CatalogService,
    private readonly fulfillment: ListingFulfillmentService,
    private readonly priceAssist: PriceAssistService,
  ) {}

  // Deleted state is intentionally readable only inside receipt authorization.
  // No content leaves this service; a new command still rejects it under lock.
  private async target(tx: Tx, id: string) {
    const l = await loadListing(tx.c, id);
    if (!l) throw notFound();
    return l;
  }
  private async lock(tx: Tx, before: Listing, version: number) {
    await tx.lock('listings', [before._id]);
    const l = await this.target(tx, before._id);
    if (l.deletedAt) throw notFound();
    if (
      l.version !== version ||
      l.currentRevisionId !== before.currentRevisionId
    )
      throw conflict();
    if (l.visibility === 'Removed' || l.trade !== 'Available')
      throw invalidState();
    await tx.lock('listing_revisions', [l.currentRevisionId!]);
    return l;
  }
  private async ready(tx: Tx, id: string, mediaIds: string[]) {
    const ids = [...mediaIds].sort();
    if (ids.length) await tx.lock('listing_media', ids);
    const count = await tx.c.listing_media.countDocuments({
      _id: { $in: ids },
      listingId: id,
      status: 'Ready',
      purgedAt: null,
      derivativeKey: { $ne: null },
      width: { $ne: null },
      height: { $ne: null },
    });
    if (ids.length < 1 || ids.length > 8 || count !== ids.length)
      throw new DomainError(
        422,
        'MediaNotReady',
        'Chọn từ 1 đến 8 ảnh đã xử lý thành công của cuốn sách này.',
      );
  }
  // Every listing update bumps the version once, keeps the owner and records
  // Prisma's @updatedAt equivalent (latlai_guard_aggregate write protocol).
  private async update(
    tx: Tx,
    l: Listing,
    set: Partial<ListingDoc>,
  ): Promise<ListingDoc> {
    const next = await tx.c.listings.findOneAndUpdate(
      { _id: l._id, version: l.version, ownerId: l.ownerId },
      { $set: { ...set, updatedAt: new Date() }, $inc: { version: 1 } },
      { returnDocument: 'after' },
    );
    tx.check(`listing:${l._id}`, () => checkListing(tx, l._id));
    return next!;
  }
  private change(l: Listing, next: ListingDoc) {
    return {
      entityType: 'Listing' as const,
      entityId: l._id,
      version: next.version,
      revisionId: next.currentRevisionId,
      state: state(next),
      before: {
        version: l.version,
        revisionId: l.currentRevisionId,
        state: state(l),
      } as Json,
    };
  }
  revise(context: CommandContext, id: string, body: Wire['EditApproved']) {
    return this.commands.run(context, 'reviseApprovedListing', id, body, {
      authorize: async (tx, actor) => {
        member(actor);
        const l = await this.target(tx, id);
        if (l.ownerId !== actor._id) throw notFound();
        return l;
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
        const l = await this.lock(tx, before, body.expectedVersion);
        if (l.moderation !== 'Approved') throw invalidState();
        const { fulfillment: _fulfillment, ...rest } = body.content;
        const mediaIds = lowerIds(rest.mediaIds);
        await this.ready(tx, id, mediaIds);
        const revisionId = randomUUID();
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
        // Attach before freezing: submitted revision contents/order are immutable.
        await attachPhotos(tx, id, revisionId, mediaIds);
        if (body.priceAssist)
          await this.priceAssist.recordDecision(
            tx,
            actor._id,
            id,
            revisionId,
            body.priceAssist,
            rest.salePrice ?? null,
          );
        const now = new Date();
        await tx.c.listing_revisions.updateOne(
          { _id: revisionId, submittedAt: null },
          { $set: { submittedAt: now, ownershipDeclaredAt: now } },
        );
        const next = await this.update(tx, l, {
          currentRevisionId: revisionId,
          moderation: 'PendingReview',
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
        if (l.ownerId !== actor._id) throw notFound();
        return l;
      },
      mutate: async (tx, actor, before) => {
        if (body.visibility === 'Visible') {
          requireActive(actor);
          await this.fulfillment.prepare(
            tx,
            actor._id,
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
        const next = await this.update(tx, l, { visibility: body.visibility });
        return this.change(l, next);
      },
    });
  }
  archive(context: CommandContext, id: string, body: Wire['VersionCommand']) {
    return this.commands.run(context, 'archiveListing', id, body, {
      authorize: async (tx, actor) => {
        member(actor);
        const l = await this.target(tx, id);
        if (l.ownerId !== actor._id) throw notFound();
        return l;
      },
      mutate: async (tx, _actor, before) => {
        const l = await this.lock(tx, before, body.expectedVersion);
        const next = await this.update(tx, l, { deletedAt: new Date() });
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
        if (l.ownerId === actor._id)
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
        const next = await this.update(tx, l, {
          visibility: 'Removed',
          removalReason: body.reason,
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
