import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { DatabaseService } from '../../database/database.service.js';
import { PageService } from '../commands/page.service.js';
import {
  isbn13,
  likeLiteral,
  normalizeSearch,
} from '../commands/contract-input.service.js';
import { invalidField, notFound, type Wire } from '../commands/domain-error.js';
import { MediaStorage } from '../media/media-storage.js';
import { originInclude, originStatus } from './listing-fulfillment.service.js';

// One predicate for shelf, detail and signed reads. These are current eligibility
// checks, not a historical approval badge. Future commitments must extend it.
export const publicFrom = Prisma.sql`listings l
  JOIN listing_revisions r ON r.id=l.current_revision_id AND r.listing_id=l.id
  JOIN catalog_books b ON b.id=r.book_id
  JOIN users u ON u.id=l.owner_id`;
export const publicEligible = Prisma.sql`l.moderation='Approved' AND l.visibility='Visible'
  AND l.trade='Available' AND l.deleted_at IS NULL AND l.published_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM exclusive_commitments ec WHERE ec.listing_id=l.id AND ec.status='Active')
  AND r.submitted_at IS NOT NULL AND b.status='Confirmed'
  AND u.status='ACTIVE' AND u.email_verified_at IS NOT NULL
  AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id AND ur.role='MEMBER')
  AND EXISTS (SELECT 1 FROM listing_decisions d WHERE d.revision_id=r.id AND d.decision='Approve')
  AND EXISTS (SELECT 1 FROM revision_media rm WHERE rm.revision_id=r.id)
  AND NOT EXISTS (SELECT 1 FROM revision_media rm JOIN listing_media m ON m.id=rm.media_id
    WHERE rm.revision_id=r.id AND (m.status<>'Ready' OR m.purged_at IS NOT NULL
      OR m.derivative_key IS NULL OR m.width IS NULL OR m.height IS NULL))`;
const details = {
  owner: { select: { id: true, displayName: true } },
  currentRevision: {
    include: {
      originAddress: originInclude,
      book: { include: { currentRevision: true } },
      media: {
        orderBy: { position: 'asc' as const },
        include: { media: { select: { id: true, width: true, height: true } } },
      },
    },
  },
} satisfies Prisma.ListingInclude;
type Listing = Prisma.ListingGetPayload<{ include: typeof details }>;
function projection(l: Listing): Wire['PublicListing'] {
  const r = l.currentRevision!,
    b = r.book!,
    metadata = b.currentRevision!;
  const content = {
    fulfillment:
      originStatus(r) === 'Current'
        ? {
            serviceAreaCode: 'HCM-DEMO-v1' as const,
            name: 'TP.HCM' as const,
            demoOnly: true as const,
            method: 'DirectDelivery' as const,
          }
        : null,
    id: l.id,
    revisionId: r.id,
    version: l.version,
    book: {
      id: b.id,
      title: metadata.title,
      authors: metadata.authors,
      publisher: metadata.publisher,
      publicationYear: metadata.publicationYear,
      language: metadata.language,
      edition: metadata.edition,
      category: metadata.category,
      isbn: metadata.isbn,
    },
    condition: r.condition!,
    pages: r.pages,
    coverNote: r.coverNote,
    notes: r.notes,
    accessories: r.accessories,
    readable: true as const,
    hasMissingPages: r.hasMissingPages!,
    missingEssentialContent: false as const,
    description: r.description,
    seller: l.owner,
    photos: r.media.map(({ media }) => ({
      id: media.id,
      width: media.width!,
      height: media.height!,
    })),
    publishedAt: l.publishedAt!.toISOString(),
  };
  // Submitted/approved invariants enforce the selected mode's price requirements.
  if (r.mode === 'Sale')
    return {
      ...content,
      mode: 'Sale',
      salePrice: r.salePrice!,
      exchangeValue: null,
    };
  if (r.mode === 'Exchange')
    return {
      ...content,
      mode: 'Exchange',
      salePrice: null,
      exchangeValue: r.exchangeValue!,
    };
  return {
    ...content,
    mode: 'Both',
    salePrice: r.salePrice!,
    exchangeValue: r.exchangeValue!,
  };
}
@Injectable()
export class PublicListingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly pages: PageService,
    private readonly storage: MediaStorage,
  ) {}

  async list(
    query: Record<string, string | number>,
  ): Promise<Wire['PublicListingPage']> {
    for (const [min, max] of [
      ['minSalePrice', 'maxSalePrice'],
      ['minExchangeValue', 'maxExchangeValue'],
    ]) {
      if (
        query[min] !== undefined &&
        query[max] !== undefined &&
        Number(query[min]) > Number(query[max])
      )
        invalidField(
          `/${min}`,
          'Giá tối thiểu phải nhỏ hơn hoặc bằng giá tối đa.',
        );
    }
    const q = normalizeSearch(String(query.q ?? '')),
      isbn = isbn13(String(query.q ?? ''));
    const sort = String(query.sort ?? 'newest');
    const scope = {
      operation: 'listPublicListings',
      q,
      isbn,
      bookId: String(query.bookId ?? '').toLowerCase(),
      mode: query.mode ?? null,
      condition: query.condition ?? null,
      minSalePrice: query.minSalePrice ?? null,
      maxSalePrice: query.maxSalePrice ?? null,
      minExchangeValue: query.minExchangeValue ?? null,
      maxExchangeValue: query.maxExchangeValue ?? null,
      sort,
    };
    const parts = [
      publicEligible,
      Prisma.sql`(${q}='' OR b.search_text LIKE ${'%' + likeLiteral(q) + '%'} OR b.confirmed_isbn=${isbn})`,
    ];
    if (scope.bookId) parts.push(Prisma.sql`b.id=${scope.bookId}::uuid`);
    if (query.condition)
      parts.push(Prisma.sql`r.condition::text=${query.condition}`);
    if (query.mode)
      parts.push(
        query.mode === 'Both'
          ? Prisma.sql`r.mode='Both'`
          : Prisma.sql`(r.mode::text=${query.mode} OR r.mode='Both')`,
      );
    for (const [field, column, minimum] of [
      ['minSalePrice', Prisma.sql`r.sale_price`, true],
      ['maxSalePrice', Prisma.sql`r.sale_price`, false],
      ['minExchangeValue', Prisma.sql`r.exchange_value`, true],
      ['maxExchangeValue', Prisma.sql`r.exchange_value`, false],
    ] as const)
      if (query[field] !== undefined)
        parts.push(
          Prisma.sql`${column} ${minimum ? Prisma.sql`>=` : Prisma.sql`<=`} ${Number(query[field])}`,
        );
    const key = sort.startsWith('salePrice')
      ? Prisma.sql`r.sale_price`
      : sort.startsWith('exchangeValue')
        ? Prisma.sql`r.exchange_value`
        : Prisma.sql`l.published_at`;
    parts.push(Prisma.sql`${key} IS NOT NULL`);
    // The ID selection and projection share one snapshot: no revision/owner change
    // between two queries can turn a selected public row into private content.
    return this.db.$transaction(
      async (tx) => {
        const page = await this.pages.select(tx, {
          from: publicFrom,
          id: Prisma.sql`l.id`,
          key,
          kind: sort === 'newest' ? 'time' : 'number',
          ascending: sort.endsWith('Asc'),
          where: Prisma.join(parts, ' AND '),
          scope,
          limit: Number(query.limit),
          cursor: query.cursor as string | undefined,
        });
        const rows = await tx.listing.findMany({
          where: { id: { in: page.ids } },
          include: details,
        });
        const byId = new Map(rows.map((row) => [row.id, row]));
        return {
          items: page.ids.map((id) => projection(byId.get(id)!)),
          nextCursor: page.nextCursor,
          serverTime: page.serverTime,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  detail(id: string): Promise<Wire['PublicListing']> {
    return this.db.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT l.id FROM ${publicFrom} WHERE ${publicEligible} AND l.id=${id}::uuid`,
        );
        if (!rows.length) throw notFound();
        return projection(
          await tx.listing.findUniqueOrThrow({
            where: { id },
            include: details,
          }),
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async media(listingId: string, mediaId: string): Promise<Wire['MediaRead']> {
    const authorize = async () => {
      const rows = await this.db.$queryRaw<
        { revisionId: string; key: string; width: number; height: number }[]
      >(Prisma.sql`
        SELECT r.id AS "revisionId", m.derivative_key AS key, m.width, m.height
        FROM ${publicFrom} JOIN revision_media rm ON rm.revision_id=r.id
        JOIN listing_media m ON m.id=rm.media_id
        WHERE ${publicEligible} AND l.id=${listingId}::uuid AND m.id=${mediaId}::uuid`);
      if (!rows.length) throw notFound();
      return rows[0];
    };
    const before = await authorize();
    await this.storage.check();
    const signed = await this.storage.signedRead(before.key);
    const after = await authorize();
    if (before.revisionId !== after.revisionId || before.key !== after.key)
      throw notFound();
    return { id: mediaId, ...signed, width: after.width, height: after.height };
  }
}
