import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { SaleQuoteDoc } from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import { CatalogService } from '../catalog/catalog.service.js';
import {
  MongoCommandService,
  member,
  requireActive,
  type Actor,
  type CommandContext,
} from '../commands/mongo-command.service.js';
import {
  conflict,
  DomainError,
  invalidField,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import { publicEligibleStages } from '../listings/public-listing.service.js';
import { QuoteClock } from './quote-clock.js';
import { quoteAmounts } from './quote-money.js';

// Address rows are not locked here (PostgreSQL used FOR SHARE): every address
// writer holds its owner's user lock, and quote/order commands lock both the
// buyer and the seller, so address content cannot change underneath them.
// Frozen revision photos are Ready and immutable, so they are not locked either.
@Injectable()
export class QuotesService {
  constructor(
    private readonly commands: MongoCommandService,
    private readonly catalog: CatalogService,
    private readonly clock: QuoteClock,
  ) {}
  private async listing(tx: Tx, id: string) {
    const l = await tx.c.listings.findOne({ _id: id.toLowerCase() });
    const r = l?.currentRevisionId
      ? await tx.c.listing_revisions.findOne({ _id: l.currentRevisionId })
      : null;
    if (!l) throw notFound();
    return { ...l, currentRevision: r };
  }
  private async ownQuote(tx: Tx, id: string, buyerId: string) {
    const q = await tx.c.sale_quotes.findOne({
      _id: id.toLowerCase(),
      buyerId,
    });
    if (!q) throw notFound();
    return q;
  }
  private async policy(tx: Tx) {
    const selection = await tx.c.sale_quote_policy_selection.findOne({
      _id: 'DirectSale',
    });
    return (await tx.c.sale_quote_policies.findOne({
      _id: selection!.policyCode,
    }))!;
  }
  private async available(tx: Tx, listingId: string, buyerId?: string) {
    const [row] = await tx.c.listings
      .aggregate([
        { $match: { _id: listingId } },
        ...publicEligibleStages(),
        { $match: { 'r.mode': { $in: ['Sale', 'Both'] } } },
        { $project: { _id: 1, trade: 1 } },
      ])
      .toArray();
    if (!row) return false;
    if (row.trade !== 'Reserved') return true;
    if (!buyerId) return false;
    return !!(await tx.c.purchase_conversations.findOne({
      listingId,
      buyerId,
      status: 'Active',
      expiresAt: { $gt: await tx.now() },
    }));
  }
  private async lockListing(
    tx: Tx,
    before: Awaited<ReturnType<QuotesService['listing']>>,
  ) {
    const book = await this.catalog.lockForReview(
      tx,
      before.currentRevision!.bookId,
    );
    await tx.lock('listings', [before._id]);
    const l = await this.listing(tx, before._id);
    if (l.currentRevisionId !== before.currentRevisionId) throw conflict();
    await tx.lock('listing_revisions', [l.currentRevisionId!]);
    return { l, book };
  }
  private async timeAndSession(tx: Tx, auth: Actor) {
    const now = await this.clock.now(tx);
    const session = await tx.c.auth_sessions.findOne({ _id: auth.sessionId });
    if (!session || session.revokedAt || session.expiresAt <= now)
      throw new DomainError(
        401,
        'SESSION_EXPIRED',
        'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      );
    return now;
  }
  create(
    context: CommandContext,
    listingId: string,
    body: Wire['CreateSaleQuote'],
  ) {
    return this.commands.runQuote(context, 'createSaleQuote', listingId, body, {
      discover: async (tx) => [(await this.listing(tx, listingId)).ownerId],
      authorize: async (tx, actor) => {
        member(actor);
        return this.listing(tx, listingId);
      },
      mutate: async (tx, actor, before) => {
        requireActive(actor);
        if (before.ownerId === actor._id)
          throw new DomainError(
            403,
            'FORBIDDEN',
            'Không thể yêu cầu báo giá cho sách của mình.',
          );
        const policy = await this.policy(tx),
          r = before.currentRevision!;
        const destination = await tx.c.member_addresses.findOne({
          _id: body.destinationAddressId.toLowerCase(),
          ownerId: actor._id,
        });
        if (!destination) throw notFound();
        if (destination.version !== body.expectedDestinationAddressVersion)
          throw conflict();
        if (destination.serviceAreaCode !== 'HCM-DEMO-v1')
          invalidField(
            '/destinationAddressId',
            'Chọn địa chỉ nhận trong vùng phục vụ TP.HCM.',
          );
        const { l, book } = await this.lockListing(tx, before);
        if (
          l.version !== body.expectedListingVersion ||
          l.currentRevisionId !== body.expectedListingRevisionId
        )
          throw conflict();
        if (!(await this.available(tx, l._id, actor._id))) throw invalidState();
        if (!r.originAddressId)
          invalidField(
            '/listingId',
            'Người đăng cần hoàn thiện nơi gửi trước khi báo giá.',
          );
        const origin = await tx.c.member_addresses.findOne({
          _id: r.originAddressId!,
          ownerId: l.ownerId,
        });
        if (
          !origin ||
          origin.version !== r.originAddressVersion ||
          origin.serviceAreaCode !== destination.serviceAreaCode
        )
          throw conflict();
        const now = await this.timeAndSession(tx, context.auth);
        if (
          (await tx.c.sale_quotes.countDocuments({
            buyerId: actor._id,
            expiresAt: { $gt: now },
          })) >= 20
        )
          throw new DomainError(
            429,
            'RATE_LIMITED',
            'Bạn có nhiều báo giá còn hiệu lực. Hãy chờ báo giá cũ hết hạn.',
          );
        const q: SaleQuoteDoc = {
          _id: randomUUID(),
          version: 1,
          buyerId: actor._id,
          sellerId: l.ownerId,
          listingId: l._id,
          listingVersion: l.version,
          listingRevisionId: l.currentRevisionId!,
          catalogRevisionId: book!.currentRevisionId!,
          originAddressId: origin._id,
          originAddressVersion: origin.version,
          destinationAddressId: destination._id,
          destinationAddressVersion: destination.version,
          serviceAreaCode: destination.serviceAreaCode,
          policyCode: policy._id,
          ...quoteAmounts(
            r.salePrice!,
            policy.shippingFee,
            policy.commissionBps,
          ),
          createdAt: now,
          expiresAt: new Date(now.getTime() + policy.ttlSeconds * 1000),
        };
        // latlai_sale_quote_check: snapshot equals its locked sources.
        if (
          q.bookPrice !== r.salePrice ||
          q.expiresAt.getTime() !==
            q.createdAt.getTime() + policy.ttlSeconds * 1000
        )
          throw new Error('Quote snapshot does not match its sources');
        await tx.c.sale_quotes.insertOne(q);
        return {
          entityType: 'SaleQuote' as const,
          entityId: q._id,
          version: 1,
          decidedAt: q.createdAt,
          expiresAt: q.expiresAt,
        };
      },
    });
  }
  read(auth: Actor, id: string) {
    return this.commands.read(
      auth,
      async (tx, actor) => {
        member(actor);
        const q = await this.ownQuote(tx, id, actor._id),
          policy = await this.policy(tx);
        const before = await this.listing(tx, q.listingId);
        const { l, book } = await this.lockListing(tx, before);
        const now = await this.timeAndSession(tx, auth);
        let assessment: Wire['SaleQuote']['assessment'] = 'Current';
        if (now >= q.expiresAt) assessment = 'Expired';
        else if (
          actor.status !== 'ACTIVE' ||
          !(await this.available(tx, l._id, actor._id))
        )
          assessment = 'Unavailable';
        else {
          const destination = await tx.c.member_addresses.findOne({
            _id: q.destinationAddressId,
            ownerId: actor._id,
          });
          const origin = await tx.c.member_addresses.findOne({
            _id: q.originAddressId,
            ownerId: q.sellerId,
          });
          if (
            l.version !== q.listingVersion ||
            l.currentRevisionId !== q.listingRevisionId ||
            book?.currentRevisionId !== q.catalogRevisionId ||
            policy._id !== q.policyCode ||
            destination?.version !== q.destinationAddressVersion ||
            origin?.version !== q.originAddressVersion
          )
            assessment = 'Changed';
        }
        return this.project(q, now, assessment);
      },
      async (tx) => [(await this.ownQuote(tx, id, auth.user.id)).sellerId],
    );
  }
  // Internal transaction preparation; the Order service owns the final clock/session
  // check and writes. This does not call a public read or nest a transaction.
  async prepareOrder(tx: Tx, buyerId: string, body: Wire['CreateDirectOrder']) {
    const q = await this.ownQuote(tx, body.quoteId, buyerId);
    const policy = await this.policy(tx);
    const before = await this.listing(tx, q.listingId);
    const { l, book } = await this.lockListing(tx, before);
    const origin = await tx.c.member_addresses.findOne({
      _id: q.originAddressId,
    });
    const destination = await tx.c.member_addresses.findOne({
      _id: q.destinationAddressId,
    });
    if (
      q.version !== body.expectedQuoteVersion ||
      l.version !== body.expectedListingVersion ||
      l.version !== q.listingVersion ||
      l.currentRevisionId !== body.expectedListingRevisionId ||
      l.currentRevisionId !== q.listingRevisionId ||
      book?.currentRevisionId !== q.catalogRevisionId ||
      policy._id !== q.policyCode ||
      origin?.version !== q.originAddressVersion ||
      destination?.version !== q.destinationAddressVersion ||
      origin.ownerId !== q.sellerId ||
      destination.ownerId !== buyerId ||
      origin.serviceAreaCode !== q.serviceAreaCode ||
      destination.serviceAreaCode !== q.serviceAreaCode
    )
      throw conflict();
    if (!(await this.available(tx, l._id, buyerId))) throw invalidState();
    return { q, l, book: book!, origin, destination };
  }
  private project(
    q: SaleQuoteDoc,
    now: Date,
    assessment: Wire['SaleQuote']['assessment'],
  ): Wire['SaleQuote'] {
    return {
      id: q._id,
      version: 1,
      listingId: q.listingId,
      listingVersion: q.listingVersion,
      listingRevisionId: q.listingRevisionId,
      catalogRevisionId: q.catalogRevisionId,
      destinationAddressId: q.destinationAddressId,
      destinationAddressVersion: q.destinationAddressVersion,
      serviceAreaCode: 'HCM-DEMO-v1',
      method: 'DirectDelivery',
      demoOnly: true,
      policyVersion: q.policyCode,
      currency: 'VND',
      amounts: {
        bookPrice: q.bookPrice,
        shippingFee: q.shippingFee,
        buyerTotal: q.buyerTotal,
        commissionBps: q.commissionBps,
        commission: q.commission,
        sellerProceedsOnCompletion: q.sellerProceeds,
      },
      shippingPayer: 'Buyer',
      shippingAdvancedBy: 'Seller',
      reservesBook: false,
      createdAt: q.createdAt.toISOString(),
      expiresAt: q.expiresAt.toISOString(),
      serverTime: now.toISOString(),
      assessment,
    };
  }
}
