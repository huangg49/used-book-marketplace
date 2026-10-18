import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  ConversationMode,
  ConversationTermsDoc,
  PurchaseConversationDoc,
  ConversationEventDoc,
} from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import {
  conflict,
  DomainError,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import { ListingCommitmentPolicy } from '../listings/listing-commitment-policy.service.js';

@Injectable()
export class ConversationAgreementsService {
  constructor(private readonly listings: ListingCommitmentPolicy) {}
  empty(
    id: string,
    mode: ConversationMode = 'Negotiation',
  ): ConversationTermsDoc {
    return {
      _id: id,
      mode,
      pendingProposal: null,
      agreedPrice: null,
      agreedListingRevisionId: null,
      activeExchangeId: null,
      lockSeq: 0,
    };
  }
  async event(
    tx: Tx,
    row: PurchaseConversationDoc,
    actorId: string,
    kind: ConversationEventDoc['kind'],
    values: Partial<
      Pick<ConversationEventDoc, 'mode' | 'amount' | 'exchangeId'>
    > = {},
  ) {
    await tx.c.conversation_events.insertOne({
      _id: randomUUID(),
      conversationId: row._id,
      actorId,
      kind,
      mode: null,
      amount: null,
      exchangeId: null,
      createdAt: await tx.now(),
      ...values,
    });
  }
  async initialize(
    tx: Tx,
    row: PurchaseConversationDoc,
    intent: ConversationMode,
    listingMode: string,
  ) {
    const terms = this.empty(
      row._id,
      listingMode === 'Exchange' ? 'Exchange' : 'Negotiation',
    );
    if (intent === 'Exchange' && terms.mode !== 'Exchange') {
      const listing = await tx.c.listings.findOne({ _id: row.listingId });
      terms.pendingProposal = {
        id: randomUUID(),
        kind: 'Mode',
        proposedById: row.buyerId,
        mode: 'Exchange',
        amount: null,
        listingRevisionId: listing!.currentRevisionId!,
        createdAt: await tx.now(),
      };
      await this.event(tx, row, row.buyerId, 'ModeProposed', {
        mode: 'Exchange',
      });
    }
    await tx.c.conversation_terms.insertOne(terms);
  }
  async view(
    tx: Tx,
    row: PurchaseConversationDoc,
  ): Promise<Wire['ConversationTerms'] | null> {
    const t = await tx.c.conversation_terms.findOne({ _id: row._id });
    if (!t) return null;
    const links = await tx.c.conversation_exchange_links
      .find({ conversationId: row._id }, { sort: { createdAt: 1, _id: 1 } })
      .toArray();
    const listing = await tx.c.listings.findOne({ _id: row.listingId });
    const available =
      listing?.moderation === 'Approved' &&
      listing.visibility === 'Visible' &&
      listing.trade === 'Available';
    const ex = t.activeExchangeId
      ? await tx.c.exchanges.findOne({ _id: t.activeExchangeId })
      : null;
    return {
      mode: t.mode,
      agreedPrice: t.agreedPrice,
      agreedListingRevisionId: t.agreedListingRevisionId,
      activeExchangeId: ex?.status === 'Cancelled' ? null : t.activeExchangeId,
      exchangeIds: links.map((l) => l._id),
      pendingProposal: t.pendingProposal
        ? {
            ...t.pendingProposal,
            createdAt: t.pendingProposal.createdAt.toISOString(),
          }
        : null,
      locked:
        !available ||
        row.status !== 'Active' ||
        Boolean(row.orderId) ||
        Boolean(ex && ex.status !== 'Cancelled'),
    };
  }
  private async editable(tx: Tx, row: PurchaseConversationDoc) {
    if (
      row.status !== 'Active' ||
      row.orderId ||
      (row.expiresAt && row.expiresAt <= (await tx.now()))
    )
      throw invalidState();
    const terms = await tx.c.conversation_terms.findOne({ _id: row._id });
    if (terms?.activeExchangeId) {
      await tx.lock('exchanges', [terms.activeExchangeId]);
      const ex = await tx.c.exchanges.findOne({ _id: terms.activeExchangeId });
      if (!ex || ex.status !== 'Cancelled') throw invalidState();
    }
    const listing = await this.listings.lock(tx, row.listingId);
    if (
      listing.moderation !== 'Approved' ||
      listing.visibility !== 'Visible' ||
      listing.trade !== 'Available'
    )
      throw invalidState();
    const revision = await tx.c.listing_revisions.findOne({
      _id: listing.currentRevisionId!,
    });
    if (!revision) throw notFound();
    return {
      terms:
        terms ??
        this.empty(
          row._id,
          revision.mode === 'Exchange' ? 'Exchange' : 'Negotiation',
        ),
      listing,
      revision,
      exists: Boolean(terms),
    };
  }
  private async save(
    tx: Tx,
    row: PurchaseConversationDoc,
    terms: ConversationTermsDoc,
    exists: boolean,
  ) {
    if (exists) {
      const { _id: _ignored, ...value } = terms;
      await tx.c.conversation_terms.updateOne(
        { _id: row._id },
        { $set: value },
      );
    } else await tx.c.conversation_terms.insertOne(terms);
    const next = await tx.c.purchase_conversations.findOneAndUpdate(
      { _id: row._id, version: row.version, status: 'Active' },
      { $inc: { version: 1 }, $set: { updatedAt: await tx.now() } },
      { returnDocument: 'after' },
    );
    if (!next) throw conflict();
    tx.check(`conversation-terms:${row._id}`, async () => {
      const current = await tx.c.conversation_terms.findOne({ _id: row._id });
      if (
        !current ||
        (current.pendingProposal &&
          ![row.buyerId, row.sellerId].includes(
            current.pendingProposal.proposedById,
          ))
      )
        throw new Error('Conversation proposal participant invariant');
      if (
        (current.agreedPrice === null) !==
        (current.agreedListingRevisionId === null)
      )
        throw new Error('Conversation price revision invariant');
    });
    return next;
  }
  async propose(
    tx: Tx,
    row: PurchaseConversationDoc,
    actorId: string,
    body: Wire['ProposeConversationTerms'],
  ) {
    const { terms, revision, exists } = await this.editable(tx, row);
    if (terms.pendingProposal) throw conflict();
    if (body.kind === 'Price') {
      if (
        terms.mode !== 'Negotiation' ||
        !['Sale', 'Both'].includes(revision.mode ?? '')
      )
        throw invalidState();
    } else {
      if (
        (body.kind === 'Mode' && actorId !== row.sellerId) ||
        (body.kind === 'RequestExchange' && actorId !== row.buyerId)
      )
        throw new DomainError(
          403,
          'FORBIDDEN',
          'Chỉ người bán được đề xuất chuyển hình thức; người mua có thể yêu cầu đổi sách.',
        );
      const mode = body.kind === 'RequestExchange' ? 'Exchange' : body.mode!;
      if (
        mode === terms.mode ||
        (mode === 'Exchange' &&
          !['Exchange', 'Both'].includes(revision.mode ?? '')) ||
        (mode === 'Negotiation' &&
          !['Sale', 'Both'].includes(revision.mode ?? ''))
      )
        throw invalidState();
    }
    const mode =
      body.kind === 'Price'
        ? null
        : body.kind === 'RequestExchange'
          ? 'Exchange'
          : body.mode!;
    terms.pendingProposal = {
      id: randomUUID(),
      kind: body.kind === 'Price' ? 'Price' : 'Mode',
      proposedById: actorId,
      mode,
      amount: body.kind === 'Price' ? body.amount! : null,
      listingRevisionId: revision._id,
      createdAt: await tx.now(),
    };
    await this.event(
      tx,
      row,
      actorId,
      body.kind === 'Price' ? 'PriceProposed' : 'ModeProposed',
      { mode, amount: terms.pendingProposal.amount },
    );
    return this.save(tx, row, terms, exists);
  }
  async respond(
    tx: Tx,
    row: PurchaseConversationDoc,
    actorId: string,
    body: Wire['RespondConversationTerms'],
  ) {
    const { terms, revision, exists } = await this.editable(tx, row),
      proposal = terms.pendingProposal;
    if (!proposal || proposal.id !== body.proposalId) throw conflict();
    if (body.accept && proposal.proposedById === actorId)
      throw new DomainError(
        403,
        'FORBIDDEN',
        'Đối tác cần xác nhận đề nghị này.',
      );
    if (body.accept && proposal.listingRevisionId !== revision._id)
      throw conflict();
    if (body.accept) {
      if (proposal.kind === 'Mode') {
        terms.mode = proposal.mode!;
        terms.agreedPrice = null;
        terms.agreedListingRevisionId = null;
        terms.activeExchangeId = null;
        await tx.c.purchase_conversations.updateOne(
          { _id: row._id },
          { $set: { quoteId: null } },
        );
      } else {
        terms.agreedPrice = proposal.amount;
        terms.agreedListingRevisionId = proposal.listingRevisionId;
      }
    }
    await this.event(
      tx,
      row,
      actorId,
      body.accept
        ? proposal.kind === 'Price'
          ? 'PriceAccepted'
          : 'ModeAccepted'
        : 'ProposalDeclined',
      { mode: proposal.mode, amount: proposal.amount },
    );
    terms.pendingProposal = null;
    return this.save(tx, row, terms, exists);
  }
  async validateOrder(tx: Tx, row: PurchaseConversationDoc, price: number) {
    const terms = await tx.c.conversation_terms.findOne({ _id: row._id });
    if (!terms) return; // Existing native/legacy commands retain ADR0037 semantics.
    const listing = await tx.c.listings.findOne({ _id: row.listingId });
    if (
      terms.mode !== 'Negotiation' ||
      terms.pendingProposal ||
      terms.agreedPrice !== price ||
      terms.agreedListingRevisionId !== listing?.currentRevisionId
    )
      throw conflict();
  }
  async prepareExchange(
    tx: Tx,
    id: string,
    version: number,
    buyerId: string,
    listingId: string,
    sellerId: string,
  ) {
    await tx.lock('purchase_conversations', [id]);
    const row = await tx.c.purchase_conversations.findOne({ _id: id });
    if (
      !row ||
      row.buyerId !== buyerId ||
      row.sellerId !== sellerId ||
      row.listingId !== listingId
    )
      throw notFound();
    if (row.version !== version || row.status !== 'Active' || row.orderId)
      throw conflict();
    const terms = await tx.c.conversation_terms.findOne({ _id: id });
    if (!terms || terms.mode !== 'Exchange' || terms.pendingProposal)
      throw invalidState();
    if (terms.activeExchangeId) {
      const previous = await tx.c.exchanges.findOne({
        _id: terms.activeExchangeId,
      });
      if (!previous || previous.status !== 'Cancelled') throw invalidState();
    }
    return row;
  }
  async linkExchange(
    tx: Tx,
    row: PurchaseConversationDoc,
    exchangeId: string,
    actorId: string,
  ) {
    await tx.c.conversation_exchange_links.insertOne({
      _id: exchangeId,
      conversationId: row._id,
      createdAt: await tx.now(),
    });
    await tx.c.conversation_terms.updateOne(
      { _id: row._id },
      { $set: { activeExchangeId: exchangeId } },
    );
    await tx.c.purchase_conversations.updateOne(
      { _id: row._id, version: row.version },
      { $inc: { version: 1 }, $set: { updatedAt: await tx.now() } },
    );
    await this.event(tx, row, actorId, 'ExchangeLinked', { exchangeId });
    tx.check(`conversation-exchange:${exchangeId}`, async () => {
      const exchange = await tx.c.exchanges.findOne({ _id: exchangeId });
      if (
        exchange?.initiatorId !== row.buyerId ||
        exchange.recipientId !== row.sellerId ||
        exchange.recipientListingId !== row.listingId
      )
        throw new Error('Conversation exchange link invariant');
    });
  }
}
