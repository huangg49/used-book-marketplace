import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import {
  CommandService,
  member,
  requireActive,
  type Actor,
  type CommandContext,
  type OrderChange,
  type Tx,
} from '../commands/command.service.js';
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

@Injectable()
export class OrdersService {
  constructor(
    private readonly commands: CommandService,
    private readonly quotes: QuotesService,
    private readonly listings: ListingCommitmentPolicy,
    private readonly reservations: ReservationsService,
    private readonly clock: OrderClock,
    private readonly input: ContractInput,
    private readonly storage: MediaStorage,
    private readonly ledger: LedgerService,
  ) {}
  private async quote(tx: Tx, id: string, buyerId: string) {
    const q = await tx.saleQuote.findFirst({ where: { id, buyerId } });
    if (!q) throw notFound();
    return q;
  }
  private async order(tx: Tx, id: string) {
    const o = await tx.directOrder.findUnique({
      where: { id },
      include: {
        context: { include: { items: true, agreement: true } },
        quote: true,
        preparation: { include: { pickupReview: true } },
      },
    });
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
      const session = await tx.authSession.findUnique({
        where: { id: auth.sessionId },
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
  create(context: CommandContext, body: Wire['CreateDirectOrder']) {
    return this.commands.runOrder(
      context,
      'createDirectOrder',
      body.quoteId,
      body,
      {
        discover: async (tx) => [
          (await this.quote(tx, body.quoteId, context.auth.user.id)).sellerId,
        ],
        authorize: async (tx, actor) => {
          member(actor);
          return this.quote(tx, body.quoteId, actor.id);
        },
        mutate: async (tx, actor, _before, receiptId) => {
          requireActive(actor);
          const { q, l, book, origin, destination } =
            await this.quotes.prepareOrder(tx, actor.id, body);
          if (q.sellerId === actor.id) throw invalidState();
          const now = await this.decision(tx, context.auth);
          if (now >= q.expiresAt) throw conflict();
          if (
            (await tx.directOrder.count({
              where: { buyerId: actor.id, state: 'AwaitingPayment' },
            })) >= 2
          )
            throw new DomainError(
              429,
              'RATE_LIMITED',
              'Bạn đang có hai đơn chờ thanh toán. Hãy hoàn tất hoặc hủy đơn trước.',
            );
          const paymentDeadline = new Date(now.getTime() + 15 * 60 * 1000);
          const o = await tx.directOrder.create({
            data: {
              buyerId: actor.id,
              sellerId: q.sellerId,
              quoteId: q.id,
              state: 'AwaitingPayment',
              createdAt: now,
              paymentDeadline,
            },
          });
          const c = await tx.workflowContext.create({
            data: { kind: 'Order', orderId: o.id, ownershipPhase: 'Holding' },
          });
          const r = l.currentRevision!,
            b = book.currentRevision!;
          const media = await tx.revisionMedia.findMany({
            where: { revisionId: r.id },
            orderBy: { position: 'asc' },
          });
          const item: Wire['OrderItemSnapshot'] = {
            listingId: l.id,
            listingRevisionId: r.id,
            catalogRevisionId: b.id,
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
            recipientName: a.recipientName,
            phone: a.phone,
            serviceAreaCode: 'HCM-DEMO-v1',
            localityCode: a.localityCode,
            detail: a.detail,
          });
          const agreement: Wire['DirectOrderAgreement'] = {
            schemaVersion: 1,
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
              bookPrice: q.bookPrice,
              shippingFee: q.shippingFee,
              buyerTotal: q.buyerTotal,
              commissionBps: q.commissionBps,
              commission: q.commission,
              sellerProceedsOnCompletion: q.sellerProceeds,
            },
          };
          this.input.body('OrderItemSnapshot', item);
          this.input.body('DirectOrderAgreement', agreement);
          await tx.workflowItem.create({
            data: {
              contextId: c.id,
              listingId: l.id,
              listingRevisionId: r.id,
              catalogRevisionId: b.id,
              snapshot: item,
            },
          });
          await tx.agreementSnapshot.create({
            data: { contextId: c.id, snapshot: agreement },
          });
          await this.reservations.acquire(tx, c.id, l.id, now, receiptId);
          const listing = await this.listings.project(
            tx,
            l.id,
            l.version,
            'Available',
            'Reserved',
          );
          return {
            entityType: 'Order',
            entityId: o.id,
            contextId: c.id,
            version: 1,
            state: 'AwaitingPayment',
            decidedAt: now,
            paymentDeadline,
            affectedListings: [{ id: l.id, version: listing.version }],
            event: 'ReservationCreated',
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
      if (!(await tx.carrierPickupReview.findUnique({ where: { orderId } }))) {
        const applied = await tx.carrierPickupEvent.count({
          where: { orderId, outcome: 'Applied' },
        });
        await tx.carrierPickupReview.create({
          data: {
            orderId,
            eventId,
            openedAt: now,
            reason: applied ? 'ConflictingPickup' : 'LatePickup',
          },
        });
      }
      state = 'ResolutionPending';
    }
    const next =
      state === o.state
        ? o
        : await tx.directOrder.update({
            where: { id: orderId },
            data: { state, version: { increment: 1 } },
          });
    return { orderState: state, orderVersion: next.version };
  }
  private async locked(tx: Tx, id: string) {
    const before = await this.order(tx, id);
    const listing = await this.listings.lock(tx, before.quote.listingId);
    await tx.$queryRaw`SELECT id FROM workflow_contexts WHERE id=${before.context!.id}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM direct_orders WHERE id=${id}::uuid FOR UPDATE`;
    const o = await this.order(tx, id);
    const item = o.context!.items[0];
    await tx.$queryRaw`SELECT id FROM listing_revisions WHERE id=${item.listingRevisionId}::uuid FOR SHARE`;
    const media = await tx.revisionMedia.findMany({
      where: { revisionId: item.listingRevisionId },
      orderBy: { mediaId: 'asc' },
    });
    if (media.length)
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM listing_media WHERE id IN (${Prisma.join(media.map((m) => Prisma.sql`${m.mediaId}::uuid`))}) ORDER BY id FOR SHARE`,
      );
    const commitment = await tx.exclusiveCommitment.findFirstOrThrow({
      where: { currentContextId: o.context!.id },
    });
    await tx.$queryRaw`SELECT id FROM exclusive_commitments WHERE id=${commitment.id}::uuid FOR UPDATE`;
    return { o, listing, commitment };
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
      o.context!.id,
      commitment.id,
      commitment.version,
      reason,
      now,
      receiptId,
    );
    const next = await tx.directOrder.update({
      where: { id },
      data: { state: reason, closedAt: now, version: { increment: 1 } },
    });
    await tx.workflowContext.update({
      where: { id: o.context!.id },
      data: { ownershipPhase: 'Closed', version: { increment: 1 } },
    });
    const result = await this.listings.project(
      tx,
      listing.id,
      listing.version,
      'Reserved',
      'Available',
    );
    return {
      entityType: 'Order',
      entityId: id,
      contextId: o.context!.id,
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
        return this.own(tx, id, actor.id, true);
      },
      mutate: (tx, _actor, o, receiptId) =>
        this.close(
          tx,
          o.id,
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
        this.close(tx, o.id, undefined, 'PaymentExpired', receiptId),
    });
  }
  private async paymentSellerEligible(tx: Tx, sellerId: string) {
    const seller = await tx.user.findUniqueOrThrow({
      where: { id: sellerId },
      include: { roles: true },
    });
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
        return this.own(tx, id, actor.id, true);
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
        const accounts = await this.ledger.lockOrder(tx, o.buyerId, o.id, true);
        const now = await this.decision(tx, context.auth);
        if (now >= o.paymentDeadline) throw conflict();
        await this.ledger.postOrder(
          tx,
          o.id,
          receiptId,
          accounts,
          o.quote.buyerTotal,
          now,
        );
        const next = await tx.directOrder.update({
          where: { id },
          data: {
            state: 'PendingSellerConfirmation',
            version: { increment: 1 },
            paidAt: now,
            sellerConfirmationDeadline: new Date(now.getTime() + 48 * 3600000),
          },
        });
        return {
          entityType: 'Order',
          entityId: id,
          contextId: o.context!.id,
          version: next.version,
          state: 'PendingSellerConfirmation',
          decidedAt: now,
          paymentDeadline: o.paymentDeadline,
          affectedListings: [],
          event: 'OrderPaymentHeld',
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
    const next = await tx.directOrder.update({
      where: { id },
      data: {
        state: 'SettlementPending',
        version: { increment: 1 },
        cancellationRequestedAt: now,
        cancellationReason: reason,
      },
    });
    return {
      entityType: 'Order',
      entityId: id,
      contextId: o.context!.id,
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
          const o = await this.own(tx, id, actor.id);
          if ((seller ? o.sellerId : o.buyerId) !== actor.id) throw notFound();
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
        const o = await this.own(tx, id, actor.id);
        if (o.sellerId !== actor.id) throw notFound();
        return o;
      },
      mutate: async (tx, _actor, _before, receiptId) => {
        const { o } = await this.locked(tx, id);
        if (o.version !== body.expectedVersion) throw conflict();
        if (o.state !== 'PendingSellerConfirmation') throw invalidState();
        // The old obligation remains even if the buyer later loses account access.
        // Lock/check its actual hold; acceptance never credits the seller.
        await this.ledger.lockOrder(tx, o.buyerId, id, false);
        if ((await this.ledger.orderFunds(tx, id)).held !== o.quote.buyerTotal)
          throw invalidState();
        const now = await this.decision(tx, context.auth);
        if (now >= o.sellerConfirmationDeadline!) throw conflict();
        await tx.orderPreparation.create({
          data: {
            orderId: id,
            acceptedAt: now,
            pickupDeadline: new Date(now.getTime() + 48 * 3600000),
            receiptId,
          },
        });
        const next = await tx.directOrder.update({
          where: { id },
          data: { state: 'Preparing', version: { increment: 1 } },
        });
        return {
          entityType: 'Order',
          entityId: id,
          contextId: o.context!.id,
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
          await tx.pickupReview.create({
            data: { orderId: id, openedAt: now, receiptId },
          });
          const next = await tx.directOrder.update({
            where: { id },
            data: { state: 'ResolutionPending', version: { increment: 1 } },
          });
          return {
            entityType: 'Order',
            entityId: id,
            contextId: o.context!.id,
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
        await this.own(tx, id, actor.id, true);
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
    const pickup = await tx.carrierPickupEvent.findFirst({
      where: { orderId: id, outcome: 'Applied' },
    });
    if (!pickup?.deliveryDeadline) throw invalidState();
    await tx.$queryRaw`SELECT id FROM direct_shipments WHERE id=${pickup.shipmentId}::uuid FOR UPDATE`;
    await this.ledger.lockOrder(tx, o.buyerId, id, false);
    if ((await this.ledger.orderFunds(tx, id)).held !== o.quote.buyerTotal)
      throw invalidState();
    const now = await this.decision(tx, report?.auth);
    if (now < pickup.deliveryDeadline) throw conflict();
    const existing = await tx.orderDeliveryReview.findUnique({
      where: { orderId: id },
    });
    if (!report && existing) throw conflict();
    if (
      report &&
      (await tx.orderNonReceiptReport.findUnique({ where: { orderId: id } }))
    )
      throw conflict();
    if (!existing)
      await tx.orderDeliveryReview.create({
        data: {
          orderId: id,
          pickupEventId: pickup.id,
          openedAt: now,
          openedBy: report ? 'BuyerReport' : 'DeadlineWorker',
          receiptId,
        },
      });
    if (report)
      await tx.orderNonReceiptReport.create({
        data: {
          orderId: id,
          submittedAt: now,
          description: report.body.description,
          receiptId,
        },
      });
    const next =
      o.state === 'InTransit'
        ? await tx.directOrder.update({
            where: { id },
            data: { state: 'ResolutionPending', version: { increment: 1 } },
          })
        : o;
    return {
      entityType: 'Order',
      entityId: id,
      contextId: o.context!.id,
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
            id,
            false,
          );
          const now = await this.decision(tx);
          await this.ledger.postOrder(
            tx,
            id,
            receiptId,
            accounts,
            o.quote.buyerTotal,
            now,
            true,
          );
          await this.reservations.closeRefunded(
            tx,
            o.context!.id,
            commitment.id,
            commitment.version,
            now,
            receiptId,
          );
          const next = await tx.directOrder.update({
            where: { id },
            data: {
              state: 'Cancelled',
              closedAt: now,
              version: { increment: 1 },
            },
          });
          await tx.workflowContext.update({
            where: { id: o.context!.id },
            data: { ownershipPhase: 'Closed', version: { increment: 1 } },
          });
          const result = await this.listings.project(
            tx,
            listing.id,
            listing.version,
            'Reserved',
            'Available',
          );
          return {
            entityType: 'Order',
            entityId: id,
            contextId: o.context!.id,
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
        await this.own(tx, id, actor.id);
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
        const role = o.buyerId === actor.id ? 'Buyer' : 'Seller';
        const funds = await this.ledger.orderFunds(tx, id);
        const pendingConfirmation =
          o.state === 'PendingSellerConfirmation' &&
          now < o.sellerConfirmationDeadline!;
        const carrierReview = await tx.carrierPickupReview.findUnique({
          where: { orderId: id },
        });
        const delivery = await tx.orderDeliveryReview.findUnique({
          where: { orderId: id },
          include: { pickup: true, buyerReport: true },
        });
        const pickup = await tx.carrierPickupEvent.findFirst({
          where: { orderId: id, outcome: 'Applied' },
        });
        return {
          id: o.id,
          deliveryReview: delivery
            ? {
                id: delivery.id,
                shipmentId: delivery.pickup.shipmentId,
                pickupEventId: delivery.pickupEventId,
                openedAt: delivery.openedAt.toISOString(),
                deliveryDeadline:
                  delivery.pickup.deliveryDeadline!.toISOString(),
                reason: 'DeliveryDeadlineExceeded',
                status: 'Open',
                openedBy: delivery.openedBy as 'DeadlineWorker' | 'BuyerReport',
                policyCode: 'ORDER-DELIVERY-REVIEW-v1',
                buyerReport: delivery.buyerReport
                  ? {
                      id: delivery.buyerReport.id,
                      submittedAt:
                        delivery.buyerReport.submittedAt.toISOString(),
                      description: delivery.buyerReport.description,
                    }
                  : null,
              }
            : null,
          canReportNonReceipt:
            role === 'Buyer' &&
            ['InTransit', 'ResolutionPending'].includes(o.state) &&
            !!pickup?.deliveryDeadline &&
            now >= pickup.deliveryDeadline &&
            !delivery?.buyerReport &&
            funds.held === o.quote.buyerTotal,
          carrierReview: carrierReview
            ? {
                id: carrierReview.id,
                openedAt: carrierReview.openedAt.toISOString(),
                reason: carrierReview.reason as
                  'LatePickup' | 'ConflictingPickup',
                status: 'Open',
              }
            : null,
          contextId: o.context!.id,
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
          amounts: agreement.amounts,
          ownAddress:
            role === 'Buyer' ? agreement.destination : agreement.origin,
          commitment: {
            id: commitment.id,
            version: commitment.version,
            status: commitment.status as 'Active' | 'Released',
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
            o.sellerConfirmationDeadline?.toISOString() ?? null,
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
                      id: o.preparation.pickupReview.id,
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
            (await tx.orderPackagingEvidence.count({
              where: { orderId: id, status: 'Ready' },
            })) > 0 &&
            !(await tx.directShipment.findUnique({
              where: { orderId: id },
              select: { id: true },
            })),
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
        await this.own(tx, id, actor.id);
        const { o } = await this.locked(tx, id);
        await this.decision(tx, auth);
        const item = this.input.body(
          'OrderItemSnapshot',
          o.context!.items[0].snapshot,
        );
        if (!item.mediaIds.includes(mediaId)) throw notFound();
        const m = await tx.listingMedia.findUnique({ where: { id: mediaId } });
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
        ? await this.own(tx, String(query.cursor), actor.id)
        : null;
      const rows = await tx.directOrder.findMany({
        where: {
          AND: [
            { OR: [{ buyerId: actor.id }, { sellerId: actor.id }] },
            ...(query.state ? [{ state: String(query.state) }] : []),
            ...(cursor
              ? [
                  {
                    OR: [
                      { createdAt: { lt: cursor.createdAt } },
                      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                    ],
                  },
                ]
              : []),
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: Number(query.limit) + 1,
      });
      const more = rows.length > Number(query.limit);
      if (more) rows.pop();
      return {
        items: rows.map((o) => ({
          id: o.id,
          version: o.version,
          state: o.state as Wire['MyOrderSummary']['state'],
          role: o.buyerId === actor.id ? 'Buyer' : 'Seller',
          createdAt: o.createdAt.toISOString(),
          paymentDeadline: o.paymentDeadline.toISOString(),
          closedAt: o.closedAt?.toISOString() ?? null,
        })),
        nextCursor: more ? rows.at(-1)!.id : null,
        serverTime: (await this.decision(tx, auth)).toISOString(),
      };
    });
  }
}
