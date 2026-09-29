import { Injectable } from '@nestjs/common';
import { Prisma, type SaleQuote } from '../../generated/prisma/client.js';
import { LegacyCatalogLocks } from '../catalog/legacy-catalog-locks.js';
import {
  CommandService,
  member,
  requireActive,
  type Actor,
  type CommandContext,
  type Tx,
} from '../commands/command.service.js';
import {
  conflict,
  DomainError,
  invalidField,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import { publicEligible, publicFrom } from '../listings/legacy-public-sql.js';
import { QuoteClock } from './quote-clock.js';
import { quoteAmounts } from './quote-money.js';

@Injectable()
export class QuotesService {
  constructor(
    private readonly commands: CommandService,
    private readonly catalog: LegacyCatalogLocks,
    private readonly clock: QuoteClock,
  ) {}
  private async listing(tx: Tx, id: string) {
    const l = await tx.listing.findUnique({
      where: { id },
      include: { currentRevision: true },
    });
    if (!l) throw notFound();
    return l;
  }
  private async ownQuote(tx: Tx, id: string, buyerId: string) {
    const q = await tx.saleQuote.findFirst({ where: { id, buyerId } });
    if (!q) throw notFound();
    return q;
  }
  private async policy(tx: Tx) {
    await tx.$queryRaw`SELECT scope FROM sale_quote_policy_selection WHERE scope='DirectSale' FOR SHARE`;
    return (
      await tx.saleQuotePolicySelection.findUniqueOrThrow({
        where: { scope: 'DirectSale' },
        include: { policy: true },
      })
    ).policy;
  }
  private async lockAddresses(tx: Tx, ids: string[]) {
    const unique = [...new Set(ids)].sort();
    if (unique.length)
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM member_addresses WHERE id IN (${Prisma.join(unique.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR SHARE`,
      );
  }
  private async available(tx: Tx, listingId: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT l.id FROM ${publicFrom} WHERE ${publicEligible} AND l.id=${listingId}::uuid AND r.mode IN ('Sale','Both')`,
    );
    return !!rows.length;
  }
  private async lockListing(
    tx: Tx,
    before: Awaited<ReturnType<QuotesService['listing']>>,
  ) {
    const book = await this.catalog.lockForReview(
      tx,
      before.currentRevision!.bookId,
    );
    await tx.$queryRaw`SELECT id FROM listings WHERE id=${before.id}::uuid FOR UPDATE`;
    const l = await this.listing(tx, before.id);
    if (l.currentRevisionId !== before.currentRevisionId) throw conflict();
    await tx.$queryRaw`SELECT id FROM listing_revisions WHERE id=${l.currentRevisionId}::uuid FOR SHARE`;
    const media = await tx.revisionMedia.findMany({
      where: { revisionId: l.currentRevisionId! },
      orderBy: { mediaId: 'asc' },
    });
    if (media.length)
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM listing_media WHERE id IN (${Prisma.join(media.map((m) => Prisma.sql`${m.mediaId}::uuid`))}) ORDER BY id FOR SHARE`,
      );
    return { l, book };
  }
  private async timeAndSession(tx: Tx, auth: Actor) {
    const now = await this.clock.now(tx);
    const session = await tx.authSession.findUnique({
      where: { id: auth.sessionId },
    });
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
        if (before.ownerId === actor.id)
          throw new DomainError(
            403,
            'FORBIDDEN',
            'Không thể yêu cầu báo giá cho sách của mình.',
          );
        const policy = await this.policy(tx),
          r = before.currentRevision!;
        await this.lockAddresses(tx, [
          body.destinationAddressId,
          ...(r.originAddressId ? [r.originAddressId] : []),
        ]);
        const destination = await tx.memberAddress.findFirst({
          where: { id: body.destinationAddressId, ownerId: actor.id },
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
        if (!(await this.available(tx, listingId))) throw invalidState();
        if (!r.originAddressId)
          invalidField(
            '/listingId',
            'Người đăng cần hoàn thiện nơi gửi trước khi báo giá.',
          );
        const origin = await tx.memberAddress.findFirst({
          where: { id: r.originAddressId!, ownerId: l.ownerId },
        });
        if (
          !origin ||
          origin.version !== r.originAddressVersion ||
          origin.serviceAreaCode !== destination.serviceAreaCode
        )
          throw conflict();
        const now = await this.timeAndSession(tx, context.auth);
        if (
          (await tx.saleQuote.count({
            where: { buyerId: actor.id, expiresAt: { gt: now } },
          })) >= 20
        )
          throw new DomainError(
            429,
            'RATE_LIMITED',
            'Bạn có nhiều báo giá còn hiệu lực. Hãy chờ báo giá cũ hết hạn.',
          );
        const q = await tx.saleQuote.create({
          data: {
            buyerId: actor.id,
            sellerId: l.ownerId,
            listingId,
            listingVersion: l.version,
            listingRevisionId: l.currentRevisionId!,
            catalogRevisionId: book!.currentRevisionId!,
            originAddressId: origin.id,
            originAddressVersion: origin.version,
            destinationAddressId: destination.id,
            destinationAddressVersion: destination.version,
            serviceAreaCode: destination.serviceAreaCode,
            policyCode: policy.code,
            ...quoteAmounts(
              r.salePrice!,
              policy.shippingFee,
              policy.commissionBps,
            ),
            createdAt: now,
            expiresAt: new Date(now.getTime() + policy.ttlSeconds * 1000),
          },
        });
        return {
          entityType: 'SaleQuote' as const,
          entityId: q.id,
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
        const q = await this.ownQuote(tx, id, actor.id),
          policy = await this.policy(tx);
        const before = await this.listing(tx, q.listingId);
        await this.lockAddresses(tx, [
          q.destinationAddressId,
          q.originAddressId,
        ]);
        const { l, book } = await this.lockListing(tx, before);
        const now = await this.timeAndSession(tx, auth);
        let assessment: Wire['SaleQuote']['assessment'] = 'Current';
        if (now >= q.expiresAt) assessment = 'Expired';
        else if (actor.status !== 'ACTIVE' || !(await this.available(tx, l.id)))
          assessment = 'Unavailable';
        else {
          const destination = await tx.memberAddress.findFirst({
            where: { id: q.destinationAddressId, ownerId: actor.id },
          });
          const origin = await tx.memberAddress.findFirst({
            where: { id: q.originAddressId, ownerId: q.sellerId },
          });
          if (
            l.version !== q.listingVersion ||
            l.currentRevisionId !== q.listingRevisionId ||
            book?.currentRevisionId !== q.catalogRevisionId ||
            policy.code !== q.policyCode ||
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
    await this.lockAddresses(tx, [q.originAddressId, q.destinationAddressId]);
    const before = await this.listing(tx, q.listingId);
    const { l, book } = await this.lockListing(tx, before);
    const origin = await tx.memberAddress.findUnique({
      where: { id: q.originAddressId },
    });
    const destination = await tx.memberAddress.findUnique({
      where: { id: q.destinationAddressId },
    });
    if (
      q.version !== body.expectedQuoteVersion ||
      l.version !== body.expectedListingVersion ||
      l.version !== q.listingVersion ||
      l.currentRevisionId !== body.expectedListingRevisionId ||
      l.currentRevisionId !== q.listingRevisionId ||
      book?.currentRevisionId !== q.catalogRevisionId ||
      policy.code !== q.policyCode ||
      origin?.version !== q.originAddressVersion ||
      destination?.version !== q.destinationAddressVersion ||
      origin.ownerId !== q.sellerId ||
      destination.ownerId !== buyerId ||
      origin.serviceAreaCode !== q.serviceAreaCode ||
      destination.serviceAreaCode !== q.serviceAreaCode
    )
      throw conflict();
    if (!(await this.available(tx, l.id))) throw invalidState();
    return { q, l, book: book!, origin, destination };
  }
  private project(
    q: SaleQuote,
    now: Date,
    assessment: Wire['SaleQuote']['assessment'],
  ): Wire['SaleQuote'] {
    return {
      id: q.id,
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
