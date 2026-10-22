import { ConversationAgreementsService } from './conversation-agreements.service.js';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PurchaseConversationDoc } from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import { MongoCommandService, member, requireActive, type Actor, type CommandContext } from '../commands/mongo-command.service.js';
import { conflict, invalidState, notFound, type Wire } from '../commands/domain-error.js';
import { ListingCommitmentPolicy } from '../listings/listing-commitment-policy.service.js';

@Injectable()
export class PurchasesService {
  constructor(private readonly commands: MongoCommandService, private readonly listings: ListingCommitmentPolicy, private readonly agreements: ConversationAgreementsService) {}

  // Called only by an Order command after its participant/user/session and
  // Order locks. Opening chat never changes the financial aggregate or adopts
  // a pre-existing negotiation merely because the book and Buyer match.
  async forOrder(tx: Tx, source: {
    orderId: string; listingId: string; listingVersion: number;
    buyerId: string; sellerId: string; now: Date;
  }) {
    const existing = await tx.c.purchase_conversations.findOne({ orderId: source.orderId });
    if (existing) {
      if (existing.listingId !== source.listingId || existing.buyerId !== source.buyerId || existing.sellerId !== source.sellerId || existing.status !== 'OrderCreated') throw conflict();
      await tx.lock('purchase_conversations', [existing._id]);
      return { row: await this.conversation(tx, existing._id), created: false };
    }
    const row: PurchaseConversationDoc = {
      _id: randomUUID(), listingId: source.listingId, listingVersion: source.listingVersion,
      buyerId: source.buyerId, sellerId: source.sellerId, version: 1,
      status: 'OrderCreated', expiresAt: null, quoteId: null, orderId: source.orderId,
      closedAt: source.now, createdAt: source.now, updatedAt: source.now, lockSeq: 0,
    };
    // quoteId stays null: an Order chat does not share a live historical
    // destination before the Seller has the existing fulfillment permission.
    await tx.c.purchase_conversations.insertOne(row);
    return { row, created: true };
  }

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
    const quote = row.quoteId
      ? await tx.c.sale_quotes.findOne({ _id: row.quoteId, buyerId: row.buyerId, sellerId: row.sellerId, listingId: row.listingId })
      : null;
    const destination = quote
      ? await tx.c.member_addresses.findOne({ _id: quote.destinationAddressId, ownerId: row.buyerId })
      : null;
    return {
      terms: await this.agreements.view(tx, row),
      id: row._id, listingId: row.listingId,
      buyer: { id: buyer._id, displayName: buyer.displayName },
      seller: { id: seller._id, displayName: seller.displayName },
      version: row.version, status: row.status,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      hasQuote: row.quoteId !== null,
      quotePreview: quote && destination?.version === quote.destinationAddressVersion ? {
        destination: {
          recipientName: destination.recipientName,
          phone: destination.phone,
          serviceAreaCode: 'HCM-DEMO-v1' as const,
          localityCode: destination.localityCode,
          detail: destination.detail,
        },
        shippingFee: quote.shippingFee,
        expiresAt: quote.expiresAt.toISOString(),
      } : null,
      orderId: row.orderId,
      createdAt: row.createdAt.toISOString(),
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
        if (!revision || !(body.intent ? ['Sale', 'Both', 'Exchange'] : ['Sale', 'Both']).includes(revision.mode ?? '') || body.intent === 'Negotiation' && revision.mode === 'Exchange' || body.intent === 'Exchange' && revision.mode === 'Sale') throw invalidState();
        const existing = await tx.c.purchase_conversations.findOne({
          listingId: listing._id,
          buyerId: actor._id,
          status: 'Active',
        });
        const now = await tx.now();
        if (existing)
          return {
            entityType: 'PurchaseConversation' as const,
            entityId: existing._id,
            listingId: existing.listingId,
            version: existing.version,
            state: existing.status,
            expiresAt: existing.expiresAt,
            decidedAt: now,
            event: 'PurchaseConversationReused',
          };
        const row: PurchaseConversationDoc = {
          _id: randomUUID(), listingId: listing._id, listingVersion: listing.version,
          buyerId: actor._id, sellerId: listing.ownerId, version: 1, status: 'Active',
          expiresAt: null, quoteId: null, orderId: null, closedAt: null,
          createdAt: now, updatedAt: now, lockSeq: 0,
        };
        await tx.c.purchase_conversations.insertOne(row);
        if (body.intent) await this.agreements.initialize(tx, row, body.intent, revision.mode!);
        return { entityType: 'PurchaseConversation' as const, entityId: row._id, listingId: row.listingId, version: row.version, state: row.status, expiresAt: row.expiresAt, decidedAt: now, event: 'PurchaseConversationStarted' };
      },
    });
  }
  attachQuote(context: CommandContext, id: string, body: Wire['AttachPurchaseConversationQuote']) {
    return this.commands.runPurchaseConversation(context, 'attachPurchaseConversationQuote', id, body, {
      discover: async (tx) => {
        const row = await this.conversation(tx, id);
        return [row.buyerId, row.sellerId];
      },
      authorize: async (tx, actor) => {
        member(actor);
        const row = await this.conversation(tx, id);
        if (row.buyerId !== actor._id) throw notFound();
        return row;
      },
      mutate: async (tx, actor, before) => {
        requireActive(actor);
        await tx.lock('purchase_conversations', [before._id]);
        const row = await this.conversation(tx, before._id);
        if (
          row.version !== body.expectedVersion ||
          row.status !== 'Active' ||
          row.orderId ||
          (row.expiresAt && row.expiresAt <= (await tx.now()))
        ) throw conflict();
        const listing = await this.listings.lock(tx, row.listingId);
        const quote = await tx.c.sale_quotes.findOne({ _id: body.quoteId.toLowerCase(), buyerId: actor._id });
        const now = await tx.now();
        if (
          listing.trade !== 'Available' ||
          !quote ||
          listing.version !== quote.listingVersion ||
          listing.currentRevisionId !== quote.listingRevisionId ||
          listing.moderation !== 'Approved' || listing.visibility !== 'Visible' ||
          quote.sellerId !== row.sellerId ||
          quote.listingId !== row.listingId ||
          quote.version !== body.expectedQuoteVersion ||
          quote.listingVersion !== body.expectedListingVersion ||
          quote.listingRevisionId !== body.expectedListingRevisionId ||
          quote.expiresAt <= now
        ) throw conflict();
        const updated = await tx.c.purchase_conversations.findOneAndUpdate(
          { _id: row._id, version: row.version, status: 'Active' },
          { $set: { quoteId: quote._id, updatedAt: now }, $inc: { version: 1 } },
          { returnDocument: 'after' },
        );
        if (!updated) throw conflict();
        return { entityType: 'PurchaseConversation' as const, entityId: updated._id, listingId: updated.listingId, version: updated.version, state: updated.status, expiresAt: updated.expiresAt, decidedAt: now, event: 'PurchaseConversationQuoteAttached' };
      },
    });
  }

  terms(context: CommandContext, id: string, body: Wire['ProposeConversationTerms'] | Wire['RespondConversationTerms'], respond: boolean) {
    return this.commands.runPurchaseConversation(context, respond ? 'respondConversationTerms' : 'proposeConversationTerms', id, body, {
      discover: async tx => { const row = await this.conversation(tx, id); return [row.buyerId, row.sellerId]; },
      authorize: async (tx, actor) => { member(actor); const row = await this.conversation(tx, id); this.participant(row, actor._id); return row; },
      mutate: async (tx, actor) => {
        requireActive(actor); await tx.lock('purchase_conversations', [id]);
        const row = await this.conversation(tx, id);
        if (row.version !== body.expectedVersion) throw conflict();
        const next = respond
          ? await this.agreements.respond(tx, row, actor._id, body as Wire['RespondConversationTerms'])
          : await this.agreements.propose(tx, row, actor._id, body as Wire['ProposeConversationTerms']);
        return { entityType: 'PurchaseConversation' as const, entityId: id, listingId: row.listingId, version: next.version, state: next.status, expiresAt: next.expiresAt, decidedAt: await tx.now(), event: respond ? 'ConversationTermsResponded' : 'ConversationTermsProposed' };
      },
    });
  }
  events(auth: Actor, id: string) {
    return this.commands.read(auth, async (tx, actor) => {
      const row = await this.conversation(tx, id); this.participant(row, actor._id);
      const events = await tx.c.conversation_events.find({ conversationId: id }, { sort: { createdAt: 1, _id: 1 }, limit: 500 }).toArray();
      return events.map(({ _id, createdAt, ...event }) => ({ id: _id, ...event, createdAt: createdAt.toISOString() }));
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
      const links = await tx.c.conversation_exchange_links.find({ conversationId: id }).toArray();
      const legacy = links.length ? await tx.c.exchange_messages.find({ exchangeId: { $in: links.map(l => l._id) } }, { sort: { sentAt: -1, _id: -1 }, limit: 500 }).toArray() : [];
      return [...messages, ...legacy].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime() || a._id.localeCompare(b._id)).slice(-500).map(m => ({ id: m._id, conversationId: id, senderId: m.senderId, body: m.body, sentAt: m.sentAt.toISOString() })) satisfies Wire['PurchaseMessage'][];
    });
  }
  send(auth: Actor, input: { messageId: string; conversationId: string; body: string }) {
    return this.commands.read(auth, async (tx, actor) => {
      const body = input.body.trim();
      if (!body || [...body].length > 1000) throw invalidState();
      await tx.lock('purchase_conversations', [input.conversationId]);
      const row = await this.conversation(tx, input.conversationId); this.participant(row, actor._id);
      const now = await tx.now();
      requireActive(actor);
      if (!['Active', 'OrderCreated'].includes(row.status) || (row.status === 'Active' && row.expiresAt && now >= row.expiresAt)) throw invalidState();
      const existing = await tx.c.purchase_messages.findOne({ _id: input.messageId });
      if (existing) {
        if (existing.conversationId !== row._id || existing.senderId !== actor._id || existing.body !== body) throw conflict();
        return { id: existing._id, conversationId: existing.conversationId, senderId: existing.senderId, body: existing.body, sentAt: existing.sentAt.toISOString() } satisfies Wire['PurchaseMessage'];
      }
      await tx.c.purchase_messages.insertOne({ _id: input.messageId, conversationId: row._id, senderId: actor._id, body, sentAt: now });
      const updated = await tx.c.purchase_conversations.updateOne({ _id: row._id, version: row.version, status: row.status }, { $set: { updatedAt: now }, $inc: { version: 1 } });
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
        if (row.status !== 'Active' || !row.expiresAt || now < row.expiresAt || listing.trade !== 'Reserved') throw conflict();
        const next = await tx.c.purchase_conversations.findOneAndUpdate({ _id: row._id, version: row.version, status: 'Active' }, { $set: { status: 'Expired', closedAt: now, updatedAt: now }, $inc: { version: 1 } }, { returnDocument: 'after' });
        if (!next) throw conflict();
        await this.listings.project(tx, listing._id, listing.version, 'Reserved', 'Available');
        return { entityType: 'PurchaseConversation' as const, entityId: next._id, listingId: next.listingId, version: next.version, state: next.status, expiresAt: next.expiresAt, decidedAt: now, event: 'PurchaseConversationExpired' };
      },
    });
  }
}
