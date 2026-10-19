import { ConversationAgreementsService } from '../purchases/conversation-agreements.service.js';
import { orderContext } from '../reservations/workflow-context.js';
import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { Collections } from '../../database/mongo/collections.js';
import type {
  DirectOrderDoc,
  Json,
  WorkflowContextDoc,
} from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import {
  MongoCommandService,
  canonicalJson,
  member,
  requireActive,
  type Actor,
  type CommandContext,
  type OrderChange,
} from '../commands/mongo-command.service.js';
import {
  conflict,
  DomainError,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { QuotesService } from '../quotes/quotes.service.js';
import { ListingCommitmentPolicy } from '../listings/listing-commitment-policy.service.js';
import { ReservationsService } from '../reservations/reservations.service.js';
import { MediaStorage } from '../media/media-storage.js';
import { OrderClock } from './order-clock.js';
import { LedgerService } from '../wallet/ledger.service.js';
import { checkOrder } from './order-invariants.js';
import { quoteAmounts } from '../quotes/quote-money.js';

// Order with the parts every command/read needs (the Prisma include).
export async function loadOrder(c: Collections, id: string) {
  const o = await c.direct_orders.findOne({ _id: id.toLowerCase() });
  if (!o) return null;
  const context = orderContext(
    await c.workflow_contexts.findOne({ orderId: o._id }),
  );
  const items = context
    ? await c.workflow_items.find({ contextId: context._id }).toArray()
    : [];
  const agreement = context
    ? await c.agreement_snapshots.findOne({ _id: context._id })
    : null;
  const sourceQuote = (await c.sale_quotes.findOne({ _id: o.quoteId }))!;
  const agreedAmounts = (
    agreement?.snapshot as {
      amounts?: {
        bookPrice: number;
        shippingFee: number;
        buyerTotal: number;
        commissionBps: number;
        commission: number;
        sellerProceedsOnCompletion: number;
      };
    } | null
  )?.amounts;
  const quote = agreedAmounts
    ? {
        ...sourceQuote,
        bookPrice: agreedAmounts.bookPrice,
        shippingFee: agreedAmounts.shippingFee,
        buyerTotal: agreedAmounts.buyerTotal,
        commissionBps: agreedAmounts.commissionBps,
        commission: agreedAmounts.commission,
        sellerProceeds: agreedAmounts.sellerProceedsOnCompletion,
      }
    : sourceQuote;
  const preparation = await c.order_preparations.findOne({ _id: o._id });
  const pickupReview = preparation
    ? await c.pickup_reviews.findOne({ orderId: o._id })
    : null;
  return {
    ...o,
    context: context ? { ...context, items, agreement } : null,
    quote,
    preparation: preparation ? { ...preparation, pickupReview } : null,
  };
}
export type Order = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

@Injectable()
export class OrdersService {
  constructor(
    private readonly agreements: ConversationAgreementsService,
    private readonly commands: MongoCommandService,
    private readonly quotes: QuotesService,
    private readonly listings: ListingCommitmentPolicy,
    private readonly reservations: ReservationsService,
    private readonly clock: OrderClock,
    private readonly input: ContractInput,
    private readonly storage: MediaStorage,
    private readonly ledger: LedgerService,
  ) {}
  private async order(tx: Tx, id: string) {
    const o = await loadOrder(tx.c, id);
    if (!o) throw notFound();
    return o;
  }
  private async own(tx: Tx, id: string, userId: string, buyerOnly = false) {
    const o = await this.order(tx, id);
    if (o.buyerId !== userId && (buyerOnly || o.sellerId !== userId))
      throw notFound();
    return o;
  }
  private async decision(tx: Tx, auth?: Actor) {
    const now = await this.clock.now(tx);
    if (auth) {
      const session = await tx.c.auth_sessions.findOne({
        _id: auth.sessionId,
      });
      if (!session || session.revokedAt || session.expiresAt <= now)
        throw new DomainError(
          401,
          'SESSION_EXPIRED',
          'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
        );
    }
    return now;
  }
  // Order transitions: one version step from the expected state
  // (latlai_guard_order_transition write protocol) plus the commit-time check.
  async transition(
    tx: Tx,
    o: DirectOrderDoc,
    set: Partial<DirectOrderDoc>,
  ): Promise<DirectOrderDoc> {
    const next = await tx.c.direct_orders.findOneAndUpdate(
      { _id: o._id, version: o.version, state: o.state },
      { $set: set, $inc: { version: 1 } },
      { returnDocument: 'after' },
    );
    if (!next) throw conflict();
    tx.check(`order:${o._id}`, () => checkOrder(tx, o._id));
    return next;
  }
  private async closeContext(tx: Tx, context: WorkflowContextDoc) {
    await tx.c.workflow_contexts.updateOne(
      { _id: context._id, ownershipPhase: 'Holding', version: context.version },
      { $set: { ownershipPhase: 'Closed' }, $inc: { version: 1 } },
    );
  }
  create(
    context: CommandContext,
    body: Wire['CreateOrderFromPurchaseConversation'],
  ) {
    return this.createPurchase(context, { mode: 'Negotiated', body });
  }
  buyNow(context: CommandContext, body: Wire['CreateDirectOrder']) {
    return this.createPurchase(context, { mode: 'BuyNow', body });
  }
  private createPurchase(
    context: CommandContext,
    intent:
      | {
          mode: 'Negotiated';
          body: Wire['CreateOrderFromPurchaseConversation'];
        }
      | { mode: 'BuyNow'; body: Wire['CreateDirectOrder'] },
  ) {
    const source = async (tx: Tx) => {
      if (intent.mode === 'Negotiated') {
        const conversation = await tx.c.purchase_conversations.findOne({
          _id: intent.body.conversationId,
        });
        if (!conversation) throw notFound();
        return {
          buyerId: conversation.buyerId,
          sellerId: conversation.sellerId,
          conversation,
        };
      }
      const quote = await tx.c.sale_quotes.findOne({
        _id: intent.body.quoteId,
        buyerId: context.auth.user.id,
      });
      if (!quote) throw notFound();
      return {
        buyerId: quote.buyerId,
        sellerId: quote.sellerId,
        conversation: null,
      };
    };
    return this.commands.runOrder(
      context,
      intent.mode === 'BuyNow'
        ? 'createBuyNowOrder'
        : 'createDirectOrderFromConversation',
      intent.mode === 'BuyNow'
        ? intent.body.quoteId
        : intent.body.conversationId,
      intent.body,
      {
        discover: async (tx) => {
          const row = await source(tx);
          return [row.buyerId, row.sellerId];
        },
        authorize: async (tx, actor) => {
          member(actor);
          const row = await source(tx);
          if (
            (intent.mode === 'BuyNow' ? row.buyerId : row.sellerId) !==
            actor._id
          )
            throw notFound();
          return row;
        },
        mutate: async (tx, actor, before, receiptId) => {
          requireActive(actor);
          const buyer = await tx.c.users.findOne({ _id: before.buyerId });
          if (!buyer) throw invalidState();
          member(buyer);
          requireActive(buyer);
          let conversation = before.conversation;
          let orderBody: Wire['CreateDirectOrder'];
          if (intent.mode === 'Negotiated') {
            await tx.lock('purchase_conversations', [
              intent.body.conversationId,
            ]);
            conversation = await tx.c.purchase_conversations.findOne({
              _id: intent.body.conversationId,
            });
            if (
              !conversation ||
              conversation.version !== intent.body.expectedVersion ||
              conversation.status !== 'Active' ||
              conversation.sellerId !== actor._id ||
              !conversation.quoteId ||
              conversation.orderId
            )
              throw conflict();
            await this.agreements.validateOrder(tx, conversation, intent.body.agreedBookPrice);
            const quote = await tx.c.sale_quotes.findOne({
              _id: conversation.quoteId,
              buyerId: before.buyerId,
            });
            if (!quote) throw invalidState();
            orderBody = {
              quoteId: quote._id,
              expectedQuoteVersion: 1,
              expectedListingVersion: quote.listingVersion,
              expectedListingRevisionId: quote.listingRevisionId,
            };
          } else orderBody = intent.body;
          const { q, l, book, origin, destination } =
            await this.quotes.prepareOrder(tx, before.buyerId, orderBody);
          const continuingLegacyHold =
            intent.mode === 'Negotiated' &&
            l.trade === 'Reserved' &&
            conversation?.expiresAt !== null;
          if (
            q.sellerId !== before.sellerId ||
            q.buyerId === q.sellerId ||
            (l.trade !== 'Available' && !continuingLegacyHold)
          )
            throw invalidState();
          const orderId = randomUUID();
          const now = await this.decision(tx, context.auth);
          if (
            now >= q.expiresAt ||
            (conversation?.expiresAt && now >= conversation.expiresAt)
          )
            throw conflict();
          if (
            (await tx.c.direct_orders.countDocuments({
              buyerId: before.buyerId,
              state: 'AwaitingPayment',
            })) >= 2
          )
            throw new DomainError(
              429,
              'RATE_LIMITED',
              'Bạn đang có hai đơn chờ thanh toán. Hãy hoàn tất hoặc hủy đơn trước.',
            );
          const paymentDeadline = new Date(now.getTime() + 15 * 60 * 1000);
          const o: DirectOrderDoc = {
            _id: orderId,
            buyerId: before.buyerId,
            sellerId: q.sellerId,
            quoteId: q._id,
            version: 1,
            state: 'AwaitingPayment',
            createdAt: now,
            paymentDeadline,
            closedAt: null,
            paidAt: null,
            sellerConfirmationDeadline: null,
            cancellationRequestedAt: null,
            cancellationReason: null,
            deliveredAt: null,
            inspectionDeadline: null,
            completedAt: null,
            lockSeq: 0,
          };
          await tx.c.direct_orders.insertOne(o);
          const c: WorkflowContextDoc = {
            _id: randomUUID(),
            kind: 'Order',
            orderId: o._id,
            auctionIntakeId: null,
            version: 1,
            ownershipPhase: 'Holding',
            lockSeq: 0,
          };
          await tx.c.workflow_contexts.insertOne(c);
          const r = l.currentRevision!,
            b = book.currentRevision!;
          const media = await tx.c.revision_media
            .find({ revisionId: r._id }, { sort: { position: 1 } })
            .toArray();
          const item: Wire['OrderItemSnapshot'] = {
            listingId: l._id,
            listingRevisionId: r._id,
            catalogRevisionId: b._id,
            metadata: {
              title: b.title,
              authors: b.authors,
              publisher: b.publisher,
              publicationYear: b.publicationYear,
              language: b.language,
              edition: b.edition,
              category: b.category,
              isbn: b.isbn,
            },
            condition: r.condition!,
            pages: r.pages,
            coverNote: r.coverNote,
            notes: r.notes,
            accessories: r.accessories,
            readable: r.readable!,
            hasMissingPages: r.hasMissingPages!,
            missingEssentialContent: r.missingEssentialContent!,
            description: r.description,
            mediaIds: media.map((m) => m.mediaId),
          };
          const contact = (a: typeof origin): Wire['OrderContact'] => ({
            recipientName: a!.recipientName,
            phone: a!.phone,
            serviceAreaCode: 'HCM-DEMO-v1',
            localityCode: a!.localityCode,
            detail: a!.detail,
          });
          const amounts = quoteAmounts(
            intent.mode === 'BuyNow'
              ? q.bookPrice
              : intent.body.agreedBookPrice,
            q.shippingFee,
            q.commissionBps,
          );
          const agreement: Wire['DirectOrderAgreement'] = {
            schemaVersion: 1,
            purchaseMode: intent.mode,
            policyVersion: q.policyCode,
            method: 'DirectDelivery',
            demoOnly: true,
            currency: 'VND',
            buyerId: o.buyerId,
            sellerId: o.sellerId,
            origin: contact(origin),
            destination: contact(destination),
            createdAt: now.toISOString(),
            paymentDeadline: paymentDeadline.toISOString(),
            amounts: {
              bookPrice: amounts.bookPrice,
              shippingFee: amounts.shippingFee,
              buyerTotal: amounts.buyerTotal,
              commissionBps: amounts.commissionBps,
              commission: amounts.commission,
              sellerProceedsOnCompletion: amounts.sellerProceeds,
            },
          };
          this.input.body('OrderItemSnapshot', item);
          this.input.body('DirectOrderAgreement', agreement);
          // Snapshots are built only from the sources locked above
          // (latlai_guard_order_snapshot) and are append-only afterwards.
          await tx.c.workflow_items.insertOne({
            _id: `${c._id}:${l._id}`,
            contextId: c._id,
            listingId: l._id,
            listingRevisionId: r._id,
            catalogRevisionId: b._id,
            snapshot: item as unknown as Json,
          });
          await tx.c.agreement_snapshots.insertOne({
            _id: c._id,
            snapshot: agreement as unknown as Json,
          });
          await this.reservations.acquire(tx, c._id, l._id, now, receiptId);
          if (conversation) {
            const selected = await tx.c.purchase_conversations.updateOne(
              {
                _id: conversation._id,
                version: conversation.version,
                status: 'Active',
                quoteId: q._id,
                orderId: null,
              },
              {
                $set: {
                  status: 'OrderCreated',
                  orderId: o._id,
                  closedAt: now,
                  updatedAt: now,
                },
                $inc: { version: 1 },
              },
            );
            if (selected.matchedCount !== 1) throw conflict();
          }
          const listing =
            l.trade === 'Available'
              ? await this.listings.project(
                  tx,
                  l._id,
                  l.version,
                  'Available',
                  'Reserved',
                )
              : l;
          tx.check(`order:${o._id}`, () => checkOrder(tx, o._id));
          return {
            entityType: 'Order',
            entityId: o._id,
            contextId: c._id,
            version: o.version,
            state: o.state as OrderChange['state'],
            decidedAt: now,
            paymentDeadline,
            affectedListings: [{ id: l._id, version: listing.version }],
            event:
              intent.mode === 'BuyNow'
                ? 'BuyNowOrderCreated'
                : 'SellerOrderCreated',
          };
        },
      },
    );
  }
  // Explicit shared lock protocol for fulfillment commands; no state mutation.
  lockForFulfillment(tx: Tx, id: string) {
    return this.locked(tx, id);
  }
  // Called only inside the shared fulfillment transaction after aggregate and ledger locks.
  async recordCarrierPickup(
    tx: Tx,
    orderId: string,
    eventId: string,
    outcome: Wire['CarrierEventReceipt']['outcome'],
    now: Date,
  ) {
    const o = await this.order(tx, orderId);
    if (!['Preparing', 'InTransit', 'ResolutionPending'].includes(o.state))
      throw invalidState();
    let state = o.state as Wire['CarrierEventReceipt']['orderState'];
    if (outcome === 'Applied') {
      if (
        state !== 'Preparing' ||
        !o.preparation ||
        now >= o.preparation.pickupDeadline
      )
        throw invalidState();
      state = 'InTransit';
    } else if (outcome === 'ReviewRequired') {
      if (!(await tx.c.carrier_pickup_reviews.findOne({ orderId: o._id }))) {
        const applied = await tx.c.carrier_pickup_events.countDocuments({
          orderId: o._id,
          outcome: 'Applied',
        });
        await tx.c.carrier_pickup_reviews.insertOne({
          _id: randomUUID(),
          orderId: o._id,
          eventId,
          openedAt: now,
          reason: applied ? 'ConflictingPickup' : 'LatePickup',
        });
      }
      state = 'ResolutionPending';
    }
    const next =
      state === o.state ? o : await this.transition(tx, o, { state });
    tx.check(`order:${o._id}`, () => checkOrder(tx, o._id));
    return { orderState: state, orderVersion: next.version };
  }
  private async locked(tx: Tx, id: string) {
    const before = await this.order(tx, id);
    const listing = await this.listings.lock(tx, before.quote.listingId);
    await tx.lock('workflow_contexts', [before.context!._id]);
    await tx.lock('direct_orders', [before._id]);
    const o = await this.order(tx, id);
    const item = o.context!.items[0];
    // PostgreSQL took FOR SHARE on the frozen revision and its photos; the
    // revision is locked here and Ready photos of a frozen revision are immutable.
    await tx.lock('listing_revisions', [item.listingRevisionId]);
    const found = await tx.c.exclusive_commitments.findOne({
      currentContextId: o.context!._id,
    });
    if (!found) throw new Error('Order commitment missing');
    await tx.lock('exclusive_commitments', [found._id]);
    const commitment = (await tx.c.exclusive_commitments.findOne({
      _id: found._id,
    }))!;
    return { o, listing: { ...listing, id: listing._id }, commitment };
  }
  private async close(
    tx: Tx,
    id: string,
    expectedVersion: number | undefined,
    reason: 'Cancelled' | 'PaymentExpired',
    receiptId: string,
    auth?: Actor,
  ): Promise<OrderChange> {
    const { o, listing, commitment } = await this.locked(tx, id);
    if (expectedVersion !== undefined && o.version !== expectedVersion)
      throw conflict();
    if (o.state !== 'AwaitingPayment') throw invalidState();
    const now = await this.decision(tx, auth);
    if (
      reason === 'Cancelled'
        ? now >= o.paymentDeadline
        : now < o.paymentDeadline
    )
      throw conflict();
    await this.reservations.closeUnpaid(
      tx,
      o.context!._id,
      commitment._id,
      commitment.version,
      reason,
      now,
      receiptId,
    );
    const next = await this.transition(tx, o, {
      state: reason,
      closedAt: now,
    });
    await this.closeContext(tx, o.context!);
    const result = await this.listings.project(
      tx,
      listing.id,
      listing.version,
      'Reserved',
      'Available',
    );
    return {
      entityType: 'Order',
      entityId: o._id,
      contextId: o.context!._id,
      version: next.version,
      state: reason,
      decidedAt: now,
      paymentDeadline: o.paymentDeadline,
      affectedListings: [{ id: result.id, version: result.version }],
      reason,
      event: 'ReservationReleased',
    };
  }
  cancel(context: CommandContext, id: string, body: Wire['CancelUnpaidOrder']) {
    return this.commands.runOrder(context, 'cancelUnpaidOrder', id, body, {
      discover: async (tx) => {
        const o = await this.own(tx, id, context.auth.user.id, true);
        return [o.buyerId, o.sellerId];
      },
      authorize: async (tx, actor) => {
        member(actor);
        return this.own(tx, id, actor._id, true);
      },
      mutate: (tx, _actor, o, receiptId) =>
        this.close(
          tx,
          o._id,
          body.expectedVersion,
          'Cancelled',
          receiptId,
          context.auth,
        ),
    });
  }
  expire(id: string) {
    return this.commands.expireOrder(id, {
      discover: async (tx) => {
        const o = await this.order(tx, id);
        return [o.buyerId, o.sellerId];
      },
      authorize: (tx) => this.order(tx, id),
      mutate: (tx, o, receiptId) =>
        this.close(tx, o._id, undefined, 'PaymentExpired', receiptId),
    });
  }
  private async paymentSellerEligible(tx: Tx, sellerId: string) {
    const seller = (await tx.c.users.findOne({ _id: sellerId }))!;
    return (
      !!seller.emailVerifiedAt &&
      ['ACTIVE', 'RESTRICTED'].includes(seller.status) &&
      seller.roles.some((r) => r.role === 'MEMBER')
    );
  }
  pay(context: CommandContext, id: string, body: Wire['PayOrder']) {
    return this.commands.runOrder(context, 'payOrder', id, body, {
      discover: async (tx) => {
        const o = await this.own(tx, id, context.auth.user.id, true);
        return [o.buyerId, o.sellerId];
      },
      authorize: async (tx, actor) => {
        member(actor);
        return this.own(tx, id, actor._id, true);
      },
      mutate: async (tx, _actor, _before, receiptId) => {
        const { o } = await this.locked(tx, id);
        if (o.version !== body.expectedVersion) throw conflict();
        if (o.state !== 'AwaitingPayment') throw invalidState();
        if (!(await this.paymentSellerEligible(tx, o.sellerId)))
          throw new DomainError(
            403,
            'AccountIneligible',
            'Người bán hiện không đủ điều kiện nhận thanh toán. Bạn có thể hủy đơn chưa trả tiền.',
          );
        const accounts = await this.ledger.lockOrder(
          tx,
          o.buyerId,
          o._id,
          true,
        );
        const now = await this.decision(tx, context.auth);
        if (now >= o.paymentDeadline) throw conflict();
        await this.ledger.postOrder(
          tx,
          o._id,
          receiptId,
          accounts,
          o.quote.buyerTotal,
          now,
        );
        let next = await this.transition(tx, o, {
          state: 'PendingSellerConfirmation',
          paidAt: now,
          sellerConfirmationDeadline: new Date(now.getTime() + 48 * 3600000),
        });
        const buyNow =
          (o.context!.agreement!.snapshot as { purchaseMode?: string })
            .purchaseMode === 'BuyNow';
        if (buyNow) {
          // The listing price is the seller's commitment. Both state steps and
          // the hold commit together; no externally visible approval phase.
          await tx.c.order_preparations.insertOne({
            _id: o._id,
            acceptedAt: now,
            pickupDeadline: new Date(now.getTime() + 48 * 3600000),
            policyCode: 'ORDER-PICKUP-v1',
            receiptId,
          });
          next = await this.transition(tx, next, { state: 'Preparing' });
          await tx.c.member_notifications.insertMany(
            [o.buyerId, o.sellerId].map((userId) => ({
              _id: randomUUID(),
              userId,
              kind: 'OrderBuyNowPaid' as const,
              title:
                userId === o.sellerId
                  ? 'Sách đã có người mua — chuẩn bị gửi'
                  : 'Đặt mua thành công',
              body:
                userId === o.sellerId
                  ? 'Đơn Mua ngay đã thanh toán. Hãy mở đơn và bàn giao sách trong 48 giờ. Tiền đang được giữ cho đơn.'
                  : 'Bạn đã thanh toán đơn Mua ngay. Tiền đang được giữ; người bán sẽ chuẩn bị gửi sách trong 48 giờ.',
              targetType: 'Order' as const,
              targetId: o._id,
              dedupeKey: `buy-now-paid:${o._id}:${userId}`,
              createdAt: now,
              readAt: null,
            })),
          );
        }
        return {
          entityType: 'Order',
          entityId: o._id,
          contextId: o.context!._id,
          version: next.version,
          state: next.state as OrderChange['state'],
          decidedAt: now,
          paymentDeadline: o.paymentDeadline,
          affectedListings: [],
          event: buyNow ? 'OrderBuyNowPaid' : 'OrderPaymentHeld',
          before: { version: o.version, state: o.state },
        };
      },
    });
  }
  private async requestRefund(
    tx: Tx,
    id: string,
    expectedVersion: number | undefined,
    reason: 'BuyerCancelled' | 'SellerRejected' | 'SellerConfirmationExpired',
    auth?: Actor,
  ): Promise<OrderChange> {
    const { o } = await this.locked(tx, id);
    if (expectedVersion !== undefined && o.version !== expectedVersion)
      throw conflict();
    if (o.state !== 'PendingSellerConfirmation') throw invalidState();
    const now = await this.decision(tx, auth);
    if (
      reason === 'SellerConfirmationExpired'
        ? now < o.sellerConfirmationDeadline!
        : now >= o.sellerConfirmationDeadline!
    )
      throw conflict();
    const next = await this.transition(tx, o, {
      state: 'SettlementPending',
      cancellationRequestedAt: now,
      cancellationReason: reason,
    });
    return {
      entityType: 'Order',
      entityId: o._id,
      contextId: o.context!._id,
      version: next.version,
      state: 'SettlementPending',
      decidedAt: now,
      paymentDeadline: o.paymentDeadline,
      affectedListings: [],
      event: 'OrderRefundRequested',
      before: { version: o.version, state: o.state },
      reason,
    };
  }
  cancelPaid(
    context: CommandContext,
    id: string,
    body: Wire['CancelPaidOrder'],
    seller = false,
  ) {
    return this.commands.runOrder(
      context,
      seller ? 'rejectPaidOrder' : 'cancelPaidOrder',
      id,
      body,
      {
        discover: async (tx) => {
          const o = await this.own(tx, id, context.auth.user.id);
          return [o.buyerId, o.sellerId];
        },
        authorize: async (tx, actor) => {
          member(actor);
          const o = await this.own(tx, id, actor._id);
          if ((seller ? o.sellerId : o.buyerId) !== actor._id) throw notFound();
          return o;
        },
        mutate: (tx) =>
          this.requestRefund(
            tx,
            id,
            body.expectedVersion,
            seller ? 'SellerRejected' : 'BuyerCancelled',
            context.auth,
          ),
      },
    );
  }
  expireConfirmation(id: string) {
    return this.commands.expireOrder(
      id,
      {
        discover: async (tx) => {
          const o = await this.order(tx, id);
          return [o.buyerId, o.sellerId];
        },
        authorize: (tx) => this.order(tx, id),
        mutate: (tx) =>
          this.requestRefund(tx, id, undefined, 'SellerConfirmationExpired'),
      },
      'expireSellerConfirmation',
    );
  }
  accept(context: CommandContext, id: string, body: Wire['AcceptOrder']) {
    return this.commands.runOrder(context, 'acceptOrder', id, body, {
      discover: async (tx) => {
        const o = await this.own(tx, id, context.auth.user.id);
        return [o.buyerId, o.sellerId];
      },
      authorize: async (tx, actor) => {
        member(actor);
        const o = await this.own(tx, id, actor._id);
        if (o.sellerId !== actor._id) throw notFound();
        return o;
      },
      mutate: async (tx, _actor, _before, receiptId) => {
        const { o } = await this.locked(tx, id);
        if (o.version !== body.expectedVersion) throw conflict();
        if (o.state !== 'PendingSellerConfirmation') throw invalidState();
        // The old obligation remains even if the buyer later loses account access.
        // Lock/check its actual hold; acceptance never credits the seller.
        await this.ledger.lockOrder(tx, o.buyerId, o._id, false);
        if (
          (await this.ledger.orderFunds(tx, o._id)).held !== o.quote.buyerTotal
        )
          throw invalidState();
        const now = await this.decision(tx, context.auth);
        if (now >= o.sellerConfirmationDeadline!) throw conflict();
        await tx.c.order_preparations.insertOne({
          _id: o._id,
          acceptedAt: now,
          pickupDeadline: new Date(now.getTime() + 48 * 3600000),
          policyCode: 'ORDER-PICKUP-v1',
          receiptId,
        });
        const next = await this.transition(tx, o, { state: 'Preparing' });
        return {
          entityType: 'Order',
          entityId: o._id,
          contextId: o.context!._id,
          version: next.version,
          state: 'Preparing',
          decidedAt: now,
          paymentDeadline: o.paymentDeadline,
          affectedListings: [],
          event: 'OrderAccepted',
          before: { state: o.state, version: o.version },
        };
      },
    });
  }
  confirmReceipt(
    context: CommandContext,
    id: string,
    body: Wire['ConfirmOrderReceipt'],
  ) {
    return this.commands.runOrder(context, 'confirmOrderReceipt', id, body, {
      discover: async (tx) => {
        const o = await this.own(tx, id, context.auth.user.id, true);
        return [o.buyerId, o.sellerId];
      },
      authorize: async (tx, actor) => {
        member(actor);
        return this.own(tx, id, actor._id, true);
      },
      mutate: async (tx, _actor, _before, receiptId) => {
        const { o, commitment } = await this.locked(tx, id);
        if (o.version !== body.expectedVersion || o.state !== 'InTransit')
          throw invalidState();
        if (commitment.status !== 'Active') throw invalidState();
        const shipment = await tx.c.direct_shipments.findOne({
          orderId: o._id,
        });
        const pickup = shipment
          ? await tx.c.carrier_pickup_events.findOne({
              shipmentId: shipment._id,
              outcome: 'Applied',
            })
          : null;
        if (
          !shipment ||
          !pickup ||
          (await tx.c.order_delivery_reviews.findOne({ orderId: o._id }))
        )
          throw invalidState();
        await this.ledger.lockOrder(tx, o.buyerId, o._id, false);
        if (
          (await this.ledger.orderFunds(tx, o._id)).held !== o.quote.buyerTotal
        )
          throw invalidState();
        const now = await this.decision(tx, context.auth);
        await tx.c.direct_delivery_events.insertOne({
          _id: receiptId,
          orderId: o._id,
          shipmentId: shipment._id,
          source: 'BuyerReceived',
          occurredAt: now,
          receivedAt: now,
          payloadHash: createHash('sha256')
            .update(canonicalJson(body))
            .digest('hex'),
          signature: createHash('sha256')
            .update(`buyer-receipt:${receiptId}`)
            .digest('hex'),
          receiptId,
        });
        const next = await this.transition(tx, o, {
          state: 'Inspection',
          deliveredAt: now,
          inspectionDeadline: new Date(now.getTime() + 72 * 3600000),
        });
        return {
          entityType: 'Order',
          entityId: o._id,
          contextId: o.context!._id,
          version: next.version,
          state: 'Inspection',
          decidedAt: now,
          paymentDeadline: o.paymentDeadline,
          affectedListings: [],
          event: 'OrderReceiptConfirmed',
          before: { state: o.state, version: o.version },
        };
      },
    });
  }
  recordDelivery(
    context: CommandContext,
    event: Wire['SimulatedDeliveryEvent'],
    signature: string,
  ) {
    return this.commands.runOrder(
      context,
      'emitSimulatedDeliveryEvent',
      event.orderId,
      event,
      {
        discover: async (tx) => {
          const shipment = await tx.c.direct_shipments.findOne({
            _id: event.shipmentId,
          });
          if (!shipment || shipment.orderId !== event.orderId) throw notFound();
          const order = await this.order(tx, event.orderId);
          return [order.buyerId, order.sellerId];
        },
        authorize: async (tx, actor) => {
          requireActive(actor);
          if (!actor.roles.some((role) => role.role === 'TEST_OPERATOR'))
            throw new DomainError(
              403,
              'FORBIDDEN',
              'Cần quyền vận hành mô phỏng.',
            );
          const shipment = await tx.c.direct_shipments.findOne({
            _id: event.shipmentId,
          });
          if (
            !shipment ||
            shipment.orderId !== event.orderId ||
            shipment.carrier !== event.carrier ||
            shipment.trackingCode !== event.trackingCode
          )
            throw notFound();
          const order = await this.order(tx, event.orderId);
          if ([order.buyerId, order.sellerId].includes(actor._id))
            throw new DomainError(
              403,
              'FORBIDDEN',
              'Người vận hành phải độc lập với hai bên giao dịch.',
            );
        },
        mutate: async (tx, _actor, _before, receiptId) => {
          const { o, commitment } = await this.locked(tx, event.orderId);
          const shipment = await tx.c.direct_shipments.findOne({
            _id: event.shipmentId,
          });
          const pickup = shipment
            ? await tx.c.carrier_pickup_events.findOne({
                shipmentId: shipment._id,
                outcome: 'Applied',
              })
            : null;
          if (
            !shipment ||
            !pickup ||
            o.state !== 'InTransit' ||
            commitment.status !== 'Active' ||
            (await tx.c.order_delivery_reviews.findOne({ orderId: o._id }))
          )
            throw invalidState();
          await this.ledger.lockOrder(tx, o.buyerId, o._id, false);
          if (
            (await this.ledger.orderFunds(tx, o._id)).held !==
            o.quote.buyerTotal
          )
            throw invalidState();
          const now = await this.decision(tx, context.auth);
          const occurredAt = new Date(event.occurredAt);
          if (occurredAt < pickup.occurredAt || occurredAt > now)
            throw new DomainError(
              422,
              'VALIDATION_ERROR',
              'Thời điểm giao phải sau pickup và không ở tương lai.',
            );
          await tx.c.direct_delivery_events.insertOne({
            _id: event.eventId,
            orderId: o._id,
            shipmentId: shipment._id,
            source: 'CarrierDelivered',
            occurredAt,
            receivedAt: now,
            payloadHash: createHash('sha256')
              .update(canonicalJson(event))
              .digest('hex'),
            signature,
            receiptId,
          });
          const next = await this.transition(tx, o, {
            state: 'Inspection',
            deliveredAt: occurredAt,
            inspectionDeadline: new Date(occurredAt.getTime() + 72 * 3600000),
          });
          return {
            entityType: 'Order',
            entityId: o._id,
            contextId: o.context!._id,
            version: next.version,
            state: 'Inspection',
            decidedAt: now,
            paymentDeadline: o.paymentDeadline,
            affectedListings: [],
            event: 'CarrierDeliveryRecorded',
            before: { state: o.state, version: o.version },
          };
        },
      },
    );
  }
  expirePickup(id: string) {
    return this.commands.expireOrder(
      id,
      {
        discover: async (tx) => {
          const o = await this.order(tx, id);
          return [o.buyerId, o.sellerId];
        },
        authorize: (tx) => this.order(tx, id),
        mutate: async (tx, _before, receiptId) => {
          const { o } = await this.locked(tx, id);
          if (o.state !== 'Preparing' || !o.preparation) throw invalidState();
          const now = await this.decision(tx);
          if (now < o.preparation.pickupDeadline) throw conflict();
          // Missing carrier evidence is uncertainty, never proof of no pickup.
          await tx.c.pickup_reviews.insertOne({
            _id: randomUUID(),
            orderId: o._id,
            openedAt: now,
            reason: 'PickupDeadlineExceeded',
            receiptId,
          });
          const next = await this.transition(tx, o, {
            state: 'ResolutionPending',
          });
          return {
            entityType: 'Order',
            entityId: o._id,
            contextId: o.context!._id,
            version: next.version,
            state: 'ResolutionPending',
            decidedAt: now,
            paymentDeadline: o.paymentDeadline,
            affectedListings: [],
            event: 'OrderPickupReviewOpened',
            reason: 'PickupDeadlineExceeded',
            before: { state: o.state, version: o.version },
          };
        },
      },
      'expireOrderPickup',
    );
  }
  reportNonReceipt(
    context: CommandContext,
    id: string,
    body: Wire['ReportOrderNonReceipt'],
  ) {
    return this.commands.runOrder(context, 'reportOrderNonReceipt', id, body, {
      discover: async (tx) => {
        const o = await this.own(tx, id, context.auth.user.id, true);
        return [o.buyerId, o.sellerId];
      },
      authorize: async (tx, actor) => {
        member(actor);
        await this.own(tx, id, actor._id, true);
        await this.decision(tx, context.auth);
      },
      mutate: (tx, _actor, _before, receiptId) =>
        this.openDeliveryReview(tx, id, receiptId, {
          auth: context.auth,
          body,
        }),
    });
  }
  expireDelivery(id: string) {
    return this.commands.expireOrder(
      id,
      {
        discover: async (tx) => {
          const o = await this.order(tx, id);
          return [o.buyerId, o.sellerId];
        },
        authorize: (tx) => this.order(tx, id),
        mutate: (tx, _before, receiptId) =>
          this.openDeliveryReview(tx, id, receiptId),
      },
      'expireOrderDelivery',
    );
  }
  settle(id: string) {
    return this.commands.expireOrder(
      id,
      {
        discover: async (tx) => {
          const o = await this.order(tx, id);
          return [o.buyerId, o.sellerId];
        },
        authorize: (tx) => this.order(tx, id),
        mutate: async (tx, _before, receiptId) => {
          const { o, listing } = await this.locked(tx, id);
          if (o.state !== 'Inspection' || !o.inspectionDeadline)
            throw invalidState();
          const now = await this.decision(tx);
          if (now < o.inspectionDeadline) throw conflict();
          await this.ledger.settleDirectOrder(
            tx,
            {
              _id: o._id,
              sellerId: o.sellerId,
              buyerTotal: o.quote.buyerTotal,
              sellerProceeds: o.quote.sellerProceeds,
            },
            receiptId,
            now,
          );
          await this.reservations.closeDirectCompleted(
            tx,
            o.context!._id,
            now,
            receiptId,
          );
          await this.closeContext(tx, o.context!);
          const sold = await this.listings.project(
            tx,
            listing.id,
            listing.version,
            'Reserved',
            'Sold',
          );
          const next = await this.transition(tx, o, {
            state: 'Completed',
            completedAt: now,
            closedAt: now,
          });
          return {
            entityType: 'Order',
            entityId: o._id,
            contextId: o.context!._id,
            version: next.version,
            state: 'Completed',
            decidedAt: now,
            paymentDeadline: o.paymentDeadline,
            affectedListings: [{ id: sold.id, version: sold.version }],
            event: 'DirectOrderSettled',
            before: { state: o.state, version: o.version },
          };
        },
      },
      'settleDirectOrder',
    );
  }
  private async openDeliveryReview(
    tx: Tx,
    id: string,
    receiptId: string,
    report?: { auth: Actor; body: Wire['ReportOrderNonReceipt'] },
  ): Promise<OrderChange> {
    const { o, commitment } = await this.locked(tx, id);
    if (report && o.version !== report.body.expectedVersion) throw conflict();
    if (
      !['InTransit', 'ResolutionPending'].includes(o.state) ||
      commitment.status !== 'Active'
    )
      throw invalidState();
    const pickup = await tx.c.carrier_pickup_events.findOne({
      orderId: o._id,
      outcome: 'Applied',
    });
    if (!pickup?.deliveryDeadline) throw invalidState();
    // PostgreSQL also locked the shipment row; every shipment/carrier writer
    // locks this order first (locked()), so the order lock serializes them.
    await this.ledger.lockOrder(tx, o.buyerId, o._id, false);
    if ((await this.ledger.orderFunds(tx, o._id)).held !== o.quote.buyerTotal)
      throw invalidState();
    const now = await this.decision(tx, report?.auth);
    if (now < pickup.deliveryDeadline) throw conflict();
    const existing = await tx.c.order_delivery_reviews.findOne({
      orderId: o._id,
    });
    if (!report && existing) throw conflict();
    if (
      report &&
      (await tx.c.order_non_receipt_reports.findOne({ orderId: o._id }))
    )
      throw conflict();
    if (!existing)
      await tx.c.order_delivery_reviews.insertOne({
        _id: randomUUID(),
        orderId: o._id,
        pickupEventId: pickup._id,
        openedAt: now,
        openedBy: report ? 'BuyerReport' : 'DeadlineWorker',
        policyCode: 'ORDER-DELIVERY-REVIEW-v1',
        receiptId,
      });
    if (report)
      await tx.c.order_non_receipt_reports.insertOne({
        _id: randomUUID(),
        orderId: o._id,
        submittedAt: now,
        description: report.body.description,
        receiptId,
      });
    const next =
      o.state === 'InTransit'
        ? await this.transition(tx, o, { state: 'ResolutionPending' })
        : o;
    tx.check(`order:${o._id}`, () => checkOrder(tx, o._id));
    return {
      entityType: 'Order',
      entityId: o._id,
      contextId: o.context!._id,
      version: next.version,
      state: 'ResolutionPending',
      decidedAt: now,
      paymentDeadline: o.paymentDeadline,
      affectedListings: [],
      event: report ? 'OrderNonReceiptReported' : 'OrderDeliveryReviewOpened',
      reason: 'DeliveryDeadlineExceeded',
      before: { state: o.state, version: o.version },
    };
  }
  refund(id: string) {
    return this.commands.expireOrder(
      id,
      {
        discover: async (tx) => {
          const o = await this.order(tx, id);
          return [o.buyerId, o.sellerId];
        },
        authorize: (tx) => this.order(tx, id),
        mutate: async (tx, _before, receiptId) => {
          const { o, listing, commitment } = await this.locked(tx, id);
          if (o.state !== 'SettlementPending') throw invalidState();
          const accounts = await this.ledger.lockOrder(
            tx,
            o.buyerId,
            o._id,
            false,
          );
          const now = await this.decision(tx);
          // Journal, hold release, commitment release and closure commit together;
          // any failure keeps both the money and the book held.
          await this.ledger.postOrder(
            tx,
            o._id,
            receiptId,
            accounts,
            o.quote.buyerTotal,
            now,
            true,
          );
          await this.reservations.closeRefunded(
            tx,
            o.context!._id,
            commitment._id,
            commitment.version,
            now,
            receiptId,
          );
          const next = await this.transition(tx, o, {
            state: 'Cancelled',
            closedAt: now,
          });
          await this.closeContext(tx, o.context!);
          const result = await this.listings.project(
            tx,
            listing.id,
            listing.version,
            'Reserved',
            'Available',
          );
          return {
            entityType: 'Order',
            entityId: o._id,
            contextId: o.context!._id,
            version: next.version,
            state: 'Cancelled',
            decidedAt: now,
            paymentDeadline: o.paymentDeadline,
            affectedListings: [{ id: result.id, version: result.version }],
            event: 'OrderRefundCompleted',
            before: { version: o.version, state: o.state },
            reason: o.cancellationReason!,
          };
        },
      },
      'refundOrder',
    );
  }
  read(auth: Actor, id: string): Promise<Wire['PrivateUnpaidOrder']> {
    return this.commands.readObligation(
      auth,
      async (tx, actor) => {
        member(actor);
        await this.own(tx, id, actor._id);
        const { o, commitment } = await this.locked(tx, id),
          now = await this.decision(tx, auth);
        const agreement = this.input.body(
          'DirectOrderAgreement',
          o.context!.agreement!.snapshot,
        );
        const item = this.input.body(
          'OrderItemSnapshot',
          o.context!.items[0].snapshot,
        );
        const role = o.buyerId === actor._id ? 'Buyer' : 'Seller';
        const funds = await this.ledger.orderFunds(tx, o._id);
        const pendingConfirmation =
          o.state === 'PendingSellerConfirmation' &&
          now < o.sellerConfirmationDeadline!;
        const carrierReview = await tx.c.carrier_pickup_reviews.findOne({
          orderId: o._id,
        });
        const delivery = await tx.c.order_delivery_reviews.findOne({
          orderId: o._id,
        });
        const deliveryPickup = delivery
          ? await tx.c.carrier_pickup_events.findOne({
              _id: delivery.pickupEventId,
            })
          : null;
        const buyerReport = delivery
          ? await tx.c.order_non_receipt_reports.findOne({ orderId: o._id })
          : null;
        const pickup = await tx.c.carrier_pickup_events.findOne({
          orderId: o._id,
          outcome: 'Applied',
        });
        return {
          id: o._id,
          deliveryReview: delivery
            ? {
                id: delivery._id,
                shipmentId: deliveryPickup!.shipmentId,
                pickupEventId: delivery.pickupEventId,
                openedAt: delivery.openedAt.toISOString(),
                deliveryDeadline:
                  deliveryPickup!.deliveryDeadline!.toISOString(),
                reason: 'DeliveryDeadlineExceeded',
                status: 'Open',
                openedBy: delivery.openedBy,
                policyCode: 'ORDER-DELIVERY-REVIEW-v1',
                buyerReport: buyerReport
                  ? {
                      id: buyerReport._id,
                      submittedAt: buyerReport.submittedAt.toISOString(),
                      description: buyerReport.description,
                    }
                  : null,
              }
            : null,
          canReportNonReceipt:
            role === 'Buyer' &&
            ['InTransit', 'ResolutionPending'].includes(o.state) &&
            !!pickup?.deliveryDeadline &&
            now >= pickup.deliveryDeadline &&
            !buyerReport &&
            funds.held === o.quote.buyerTotal,
          deliveredAt: o.deliveredAt?.toISOString() ?? null,
          inspectionDeadline: o.inspectionDeadline?.toISOString() ?? null,
          completedAt: o.completedAt?.toISOString() ?? null,
          canConfirmReceipt:
            role === 'Buyer' &&
            o.state === 'InTransit' &&
            !!pickup &&
            !delivery &&
            funds.held === o.quote.buyerTotal,
          carrierReview: carrierReview
            ? {
                id: carrierReview._id,
                openedAt: carrierReview.openedAt.toISOString(),
                reason: carrierReview.reason,
                status: 'Open',
              }
            : null,
          contextId: o.context!._id,
          version: o.version,
          state: o.state as Wire['PrivateUnpaidOrder']['state'],
          role,
          createdAt: o.createdAt.toISOString(),
          paymentDeadline: o.paymentDeadline.toISOString(),
          closedAt: o.closedAt?.toISOString() ?? null,
          serverTime: now.toISOString(),
          quoteId: o.quoteId,
          item,
          method: 'DirectDelivery',
          demoOnly: true,
          currency: 'VND',
          policyVersion: agreement.policyVersion,
          purchaseMode: agreement.purchaseMode ?? 'Negotiated',
          amounts: agreement.amounts,
          ownAddress:
            role === 'Buyer' ? agreement.destination : agreement.origin,
          commitment: {
            id: commitment._id,
            version: commitment.version,
            status: commitment.status,
          },
          canCancel:
            role === 'Buyer' &&
            o.state === 'AwaitingPayment' &&
            now < o.paymentDeadline,
          paymentEnabled:
            role === 'Buyer' &&
            actor.status !== 'LOCKED' &&
            o.state === 'AwaitingPayment' &&
            now < o.paymentDeadline &&
            (await this.paymentSellerEligible(tx, o.sellerId)),
          moneyHeld: funds.held,
          refundedAmount: funds.refunded,
          paidAt: o.paidAt?.toISOString() ?? null,
          sellerConfirmationDeadline:
            agreement.purchaseMode === 'BuyNow'
              ? null
              : (o.sellerConfirmationDeadline?.toISOString() ?? null),
          cancellationRequestedAt:
            o.cancellationRequestedAt?.toISOString() ?? null,
          cancellationReason:
            o.cancellationReason as Wire['PrivateUnpaidOrder']['cancellationReason'],
          canRequestRefund: role === 'Buyer' && pendingConfirmation,
          canReject: role === 'Seller' && pendingConfirmation,
          sellerAcceptanceEnabled: role === 'Seller' && pendingConfirmation,
          preparation: o.preparation
            ? {
                acceptedAt: o.preparation.acceptedAt.toISOString(),
                pickupDeadline: o.preparation.pickupDeadline.toISOString(),
                pickupReview: o.preparation.pickupReview
                  ? {
                      id: o.preparation.pickupReview._id,
                      openedAt:
                        o.preparation.pickupReview.openedAt.toISOString(),
                      reason: 'PickupDeadlineExceeded',
                      status: 'Open',
                    }
                  : null,
              }
            : null,
          shippingAddress:
            role === 'Seller' && o.preparation ? agreement.destination : null,
          shipmentRegistrationEnabled:
            role === 'Seller' &&
            o.state === 'Preparing' &&
            !!o.preparation &&
            now < o.preparation.pickupDeadline &&
            funds.held === o.quote.buyerTotal &&
            (await tx.c.order_packaging_evidence.countDocuments({
              orderId: o._id,
              status: 'Ready',
            })) > 0 &&
            !(await tx.c.direct_shipments.findOne({ orderId: o._id })),
        };
      },
      async (tx) => {
        const o = await this.own(tx, id, auth.user.id);
        return [o.buyerId, o.sellerId];
      },
    );
  }
  private mediaKey(auth: Actor, id: string, mediaId: string) {
    return this.commands.readObligation(
      auth,
      async (tx, actor) => {
        member(actor);
        await this.own(tx, id, actor._id);
        const { o } = await this.locked(tx, id);
        await this.decision(tx, auth);
        const item = this.input.body(
          'OrderItemSnapshot',
          o.context!.items[0].snapshot,
        );
        if (!item.mediaIds.includes(mediaId)) throw notFound();
        const m = await tx.c.listing_media.findOne({ _id: mediaId });
        if (!m || m.purgedAt || m.status !== 'Ready' || !m.derivativeKey)
          throw notFound();
        return { key: m.derivativeKey, width: m.width!, height: m.height! };
      },
      async (tx) => {
        const o = await this.own(tx, id, auth.user.id);
        return [o.buyerId, o.sellerId];
      },
    );
  }
  async mediaRead(
    auth: Actor,
    id: string,
    mediaId: string,
  ): Promise<Wire['MediaRead']> {
    const key = await this.mediaKey(auth, id, mediaId);
    await this.storage.check();
    const signed = await this.storage.signedRead(key.key);
    if ((await this.mediaKey(auth, id, mediaId)).key !== key.key)
      throw notFound();
    return { id: mediaId, ...signed, width: key.width, height: key.height };
  }
  list(
    auth: Actor,
    query: Record<string, string | number>,
  ): Promise<Wire['MyOrderPage']> {
    return this.commands.readObligation(auth, async (tx, actor) => {
      member(actor);
      const cursor = query.cursor
        ? await this.own(tx, String(query.cursor), actor._id)
        : null;
      const rows = await tx.c.direct_orders
        .find(
          {
            $and: [
              { $or: [{ buyerId: actor._id }, { sellerId: actor._id }] },
              ...(query.state ? [{ state: String(query.state) }] : []),
              ...(cursor
                ? [
                    {
                      $or: [
                        { createdAt: { $lt: cursor.createdAt } },
                        {
                          createdAt: cursor.createdAt,
                          _id: { $lt: cursor._id },
                        },
                      ],
                    },
                  ]
                : []),
            ],
          },
          { sort: { createdAt: -1, _id: -1 }, limit: Number(query.limit) + 1 },
        )
        .toArray();
      const more = rows.length > Number(query.limit);
      if (more) rows.pop();
      const items: Wire['MyOrderSummary'][] = [];
      for (const o of rows) {
        const context = await tx.c.workflow_contexts.findOne({
          orderId: o._id,
        });
        const item = context
          ? await tx.c.workflow_items.findOne({ contextId: context._id })
          : null;
        const snapshot = item?.snapshot as
          Wire['OrderItemSnapshot'] | undefined;
        items.push({
          id: o._id,
          version: o.version,
          state: o.state as Wire['MyOrderSummary']['state'],
          role: o.buyerId === actor._id ? 'Buyer' : 'Seller',
          createdAt: o.createdAt.toISOString(),
          paymentDeadline: o.paymentDeadline.toISOString(),
          closedAt: o.closedAt?.toISOString() ?? null,
          ...(snapshot
            ? { title: snapshot.metadata.title, listingId: snapshot.listingId }
            : {}),
        });
      }
      return {
        items,
        nextCursor: more ? rows.at(-1)!._id : null,
        serverTime: (await this.decision(tx, auth)).toISOString(),
      };
    });
  }
}
