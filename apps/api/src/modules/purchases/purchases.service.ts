import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PurchaseConversationDoc } from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import { MongoCommandService, member, requireActive, type Actor, type CommandContext } from '../commands/mongo-command.service.js';
import { conflict, invalidState, notFound, type Wire } from '../commands/domain-error.js';
import { ListingCommitmentPolicy } from '../listings/listing-commitment-policy.service.js';

export const PURCHASE_CONVERSATION_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PurchasesService {
  constructor(private readonly commands: MongoCommandService, private readonly listings: ListingCommitmentPolicy) {}

  private async conversation(tx: Tx, id: string) {
    const row = await tx.c.purchase_conversations.findOne({ _id: id });
    if (!row) throw notFound();
    return row;
  }
  private participant(row: PurchaseConversationDoc, userId: string) {
    if (row.buyerId !== userId && row.sellerId !== userId) throw notFound();
  }
  private async view(tx: Tx, row: PurchaseConversationDoc) {
    const buyer = await tx.c.users.findOne({ _id: row.buyerId });
    const seller = await tx.c.users.findOne({ _id: row.sellerId });
    if (!buyer || !seller) throw notFound();
    return {
      id: row._id, listingId: row.listingId,
      buyer: { id: buyer._id, displayName: buyer.displayName },
      seller: { id: seller._id, displayName: seller.displayName },
      version: row.version, status: row.status,
      expiresAt: row.expiresAt.toISOString(), createdAt: row.createdAt.toISOString(),
      closedAt: row.closedAt?.toISOString() ?? null,
    } satisfies Wire['PurchaseConversation'];
  }

  create(context: CommandContext, listingId: string, body: Wire['CreatePurchaseConversation']) {
    return this.commands.runPurchaseConversation(context, 'createPurchaseConversation', listingId, body, {
      discover: async (tx) => {
        const listing = await tx.c.listings.findOne({ _id: listingId });
        return listing ? [listing.ownerId] : [];
      },
      authorize: async (tx, actor) => {
        member(actor);
        const listing = await tx.c.listings.findOne({ _id: listingId });
        if (!listing) throw notFound();
        return listing;
      },
      mutate: async (tx, actor, before) => {
        requireActive(actor);
        const listing = await this.listings.lock(tx, before._id);
        if (listing.ownerId === actor._id || listing.version !== body.expectedVersion) throw conflict();
        if (listing.moderation !== 'Approved' || listing.visibility !== 'Visible' || listing.trade !== 'Available') throw invalidState();
        const revision = await tx.c.listing_revisions.findOne({ _id: listing.currentRevisionId! });
        if (!revision || !['Sale', 'Both'].includes(revision.mode ?? '')) throw invalidState();
        const now = await tx.now();
        const row: PurchaseConversationDoc = {
          _id: randomUUID(), listingId: listing._id, listingVersion: listing.version,
          buyerId: actor._id, sellerId: listing.ownerId, version: 1, status: 'Active',
          expiresAt: new Date(now.getTime() + PURCHASE_CONVERSATION_MS), closedAt: null,
          createdAt: now, updatedAt: now, lockSeq: 0,
        };
        await tx.c.purchase_conversations.insertOne(row);
        await this.listings.project(tx, listing._id, listing.version, 'Available', 'Reserved');
        return { entityType: 'PurchaseConversation' as const, entityId: row._id, listingId: row.listingId, version: row.version, state: row.status, expiresAt: row.expiresAt, decidedAt: now, event: 'PurchaseConversationStarted' };
      },
    });
  }

  list(auth: Actor) {
    return this.commands.read(auth, async (tx, actor) => {
      const rows = await tx.c.purchase_conversations.find({ $or: [{ buyerId: actor._id }, { sellerId: actor._id }] }, { sort: { updatedAt: -1, _id: -1 }, limit: 100 }).toArray();
      return Promise.all(rows.map((row) => this.view(tx, row)));
    });
  }
  get(auth: Actor, id: string) {
    return this.commands.read(auth, async (tx, actor) => {
      const row = await this.conversation(tx, id); this.participant(row, actor._id);
      return this.view(tx, row);
    });
  }
  messages(auth: Actor, id: string) {
    return this.commands.read(auth, async (tx, actor) => {
      const row = await this.conversation(tx, id); this.participant(row, actor._id);
      const messages = await tx.c.purchase_messages.find({ conversationId: id }, { sort: { sentAt: 1, _id: 1 }, limit: 500 }).toArray();
      return messages.map((m) => ({ id: m._id, conversationId: m.conversationId, senderId: m.senderId, body: m.body, sentAt: m.sentAt.toISOString() })) satisfies Wire['PurchaseMessage'][];
    });
  }
  send(auth: Actor, input: { messageId: string; conversationId: string; body: string }) {
    return this.commands.read(auth, async (tx, actor) => {
      const body = input.body.trim();
      if (!body || [...body].length > 1000) throw invalidState();
      await tx.lock('purchase_conversations', [input.conversationId]);
      const row = await this.conversation(tx, input.conversationId); this.participant(row, actor._id);
      const now = await tx.now();
      if (row.status !== 'Active' || now >= row.expiresAt) throw invalidState();
      const existing = await tx.c.purchase_messages.findOne({ _id: input.messageId });
      if (existing) {
        if (existing.conversationId !== row._id || existing.senderId !== actor._id || existing.body !== body) throw conflict();
        return { id: existing._id, conversationId: existing.conversationId, senderId: existing.senderId, body: existing.body, sentAt: existing.sentAt.toISOString() } satisfies Wire['PurchaseMessage'];
      }
      await tx.c.purchase_messages.insertOne({ _id: input.messageId, conversationId: row._id, senderId: actor._id, body, sentAt: now });
      const updated = await tx.c.purchase_conversations.updateOne({ _id: row._id, version: row.version, status: 'Active' }, { $set: { updatedAt: now }, $inc: { version: 1 } });
      if (updated.matchedCount !== 1) throw conflict();
      return { id: input.messageId, conversationId: row._id, senderId: actor._id, body, sentAt: now.toISOString() } satisfies Wire['PurchaseMessage'];
    });
  }
  expire(id: string) {
    return this.commands.systemPurchaseConversation(id, {
      discover: async (tx) => { const row = await this.conversation(tx, id); return [row.buyerId, row.sellerId]; },
      authorize: (tx) => this.conversation(tx, id),
      mutate: async (tx, before) => {
        await tx.lock('purchase_conversations', [before._id]);
        const row = await this.conversation(tx, id);
        const listing = await this.listings.lock(tx, row.listingId);
        const now = await tx.now();
        if (row.status !== 'Active' || now < row.expiresAt || listing.trade !== 'Reserved') throw conflict();
        const next = await tx.c.purchase_conversations.findOneAndUpdate({ _id: row._id, version: row.version, status: 'Active' }, { $set: { status: 'Expired', closedAt: now, updatedAt: now }, $inc: { version: 1 } }, { returnDocument: 'after' });
        if (!next) throw conflict();
        await this.listings.project(tx, listing._id, listing.version, 'Reserved', 'Available');
        return { entityType: 'PurchaseConversation' as const, entityId: next._id, listingId: next.listingId, version: next.version, state: next.status, expiresAt: next.expiresAt, decidedAt: now, event: 'PurchaseConversationExpired' };
      },
    });
  }
}
