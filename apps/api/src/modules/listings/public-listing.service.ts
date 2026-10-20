import { Injectable } from '@nestjs/common';
import type { Document } from 'mongodb';
import type {
  CatalogBookDoc,
  CatalogRevisionDoc,
  ListingChannel,
  ListingDoc,
  ListingMediaDoc,
  ListingRevisionDoc,
  MemberAddressDoc,
  RevisionMediaDoc,
  UserDoc,
} from '../../database/mongo/documents.js';
import { MongoService } from '../../database/mongo/mongo.service.js';
import type { Tx } from '../../database/mongo/transaction.js';
import {
  MongoPageService,
  regexLiteral,
} from '../commands/mongo-page.service.js';
import { isbn13, normalizeSearch } from '../commands/contract-input.service.js';
import { invalidField, notFound, type Wire } from '../commands/domain-error.js';
import { MediaStorage } from '../media/media-storage.js';
import { originStatus } from './listing-fulfillment.service.js';
import {
  catalogFilters,
  catalogFilterStages,
} from '../catalog/catalog-classification.js';

// One predicate for shelf, detail and signed reads (the PostgreSQL publicFrom +
// publicEligible). These are current eligibility checks, not a historical
// approval badge. Output documents carry r (revision), b (book), u (owner),
// rm (photo links) and m (photos). Marketplace reads never see Auction
// listings (ADR 0042); only auction intake asks for the Auction channel.
export function publicEligibleStages(
  channel: ListingChannel = 'Marketplace',
): Document[] {
  const ready = {
    $and: [
      { $eq: ['$$this.status', 'Ready'] },
      { $eq: ['$$this.purgedAt', null] },
      { $ne: ['$$this.derivativeKey', null] },
      { $ne: ['$$this.width', null] },
      { $ne: ['$$this.height', null] },
    ],
  };
  return [
    {
      $match: {
        channel: channel === 'Auction' ? 'Auction' : { $ne: 'Auction' },
        moderation: 'Approved',
        visibility: 'Visible',
        trade: { $in: ['Available', 'Reserved'] },
        deletedAt: null,
        publishedAt: { $ne: null },
      },
    },
    {
      $lookup: {
        from: 'purchase_conversations',
        localField: '_id',
        foreignField: 'listingId',
        pipeline: [
          {
            $match: {
              status: 'Active',
              $expr: { $gt: ['$expiresAt', '$$NOW'] },
            },
          },
          { $limit: 1 },
        ],
        as: 'purchase',
      },
    },
    {
      $lookup: {
        from: 'exclusive_commitments',
        localField: '_id',
        foreignField: 'listingId',
        pipeline: [{ $match: { status: 'Active' } }, { $limit: 1 }],
        as: 'active',
      },
    },
    {
      $lookup: {
        from: 'workflow_contexts',
        localField: 'active.currentContextId',
        foreignField: '_id',
        pipeline: [{ $match: { kind: 'Order' } }, { $limit: 1 }],
        as: 'activeOrderContext',
      },
    },
    {
      $lookup: {
        from: 'direct_orders',
        localField: 'activeOrderContext.orderId',
        foreignField: '_id',
        pipeline: [
          {
            $match: {
              state: {
                $in: [
                  'AwaitingPayment',
                  'PendingSellerConfirmation',
                  'SettlementPending',
                  'Preparing',
                  'InTransit',
                  'ResolutionPending',
                  'Inspection',
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: 'activeOrder',
      },
    },
    {
      $match: {
        $expr: {
          $or: [
            { $eq: ['$trade', 'Available'] },
            {
              $and: [
                { $eq: ['$trade', 'Reserved'] },
                {
                  $or: [
                    { $gt: [{ $size: '$purchase' }, 0] },
                    { $gt: [{ $size: '$activeOrder' }, 0] },
                  ],
                },
              ],
            },
          ],
        },
      },
    },
    {
      $lookup: {
        from: 'listing_revisions',
        localField: 'currentRevisionId',
        foreignField: '_id',
        as: 'r',
      },
    },
    { $unwind: '$r' },
    {
      $match: {
        $expr: { $eq: ['$r.listingId', '$_id'] },
        'r.submittedAt': { $ne: null },
      },
    },
    {
      $lookup: {
        from: 'catalog_books',
        localField: 'r.bookId',
        foreignField: '_id',
        as: 'b',
      },
    },
    { $unwind: '$b' },
    { $match: { 'b.status': 'Confirmed' } },
    {
      $lookup: {
        from: 'users',
        localField: 'ownerId',
        foreignField: '_id',
        as: 'u',
      },
    },
    { $unwind: '$u' },
    {
      $match: {
        'u.status': 'ACTIVE',
        'u.emailVerifiedAt': { $ne: null },
        'u.roles.role': 'MEMBER',
      },
    },
    {
      $lookup: {
        from: 'listing_decisions',
        localField: 'r._id',
        foreignField: 'revisionId',
        as: 'd',
      },
    },
    { $match: { 'd.decision': 'Approve' } },
    {
      $lookup: {
        from: 'revision_media',
        localField: 'r._id',
        foreignField: 'revisionId',
        as: 'rm',
      },
    },
    { $match: { 'rm.0': { $exists: true } } },
    {
      $lookup: {
        from: 'listing_media',
        localField: 'rm.mediaId',
        foreignField: '_id',
        as: 'm',
      },
    },
    {
      $match: {
        $expr: {
          $and: [
            { $eq: [{ $size: '$m' }, { $size: '$rm' }] },
            { $allElementsTrue: [{ $map: { input: '$m', in: ready } }] },
          ],
        },
      },
    },
  ];
}

type Eligible = ListingDoc & {
  r: ListingRevisionDoc;
  b: CatalogBookDoc;
  u: UserDoc;
  rm: RevisionMediaDoc[];
  m: ListingMediaDoc[];
  purchase: { expiresAt: Date }[];
  activeOrder: { paidAt: Date | null; paymentDeadline: Date }[];
};
type ProjectionSources = {
  metadata: CatalogRevisionDoc;
  origin: Pick<MemberAddressDoc, 'version'> | null;
};

@Injectable()
export class PublicListingService {
  constructor(
    private readonly mongo: MongoService,
    private readonly pages: MongoPageService,
    private readonly storage: MediaStorage,
  ) {}

  private async projection(
    tx: Tx,
    l: Eligible,
    sources?: ProjectionSources,
  ): Promise<Wire['PublicListing']> {
    const r = l.r,
      b = l.b;
    const metadata = sources
      ? sources.metadata
      : ((await tx.c.catalog_revisions.findOne({
          _id: b.currentRevisionId!,
        })) as CatalogRevisionDoc);
    const origin = sources
      ? sources.origin
      : r.originAddressId
        ? await tx.c.member_addresses.findOne({ _id: r.originAddressId })
        : null;
    const photos = [...l.rm]
      .sort((x, y) => x.position - y.position)
      .map((link) => l.m.find((m) => m._id === link.mediaId)!);
    const content = {
      fulfillment:
        originStatus({
          ...r,
          originCurrentVersion: origin?.version ?? null,
        }) === 'Current'
          ? {
              serviceAreaCode: 'HCM-DEMO-v1' as const,
              name: 'TP.HCM' as const,
              demoOnly: true as const,
              method: 'DirectDelivery' as const,
            }
          : null,
      id: l._id,
      revisionId: r._id,
      version: l.version,
      book: {
        id: b._id,
        title: metadata.title,
        authors: metadata.authors,
        publisher: metadata.publisher,
        publicationYear: metadata.publicationYear,
        language: metadata.language,
        edition: metadata.edition,
        category: metadata.category,
        categoryId: metadata.categoryId ?? null,
        attributes: metadata.attributes ?? {},
        series: metadata.series ?? null,
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
      seller: { id: l.u._id, displayName: l.u.displayName },
      photos: photos.map((m) => ({
        id: m._id,
        width: m.width!,
        height: m.height!,
      })),
      publishedAt: l.publishedAt!.toISOString(),
      purchaseAvailability:
        l.trade === 'Reserved'
          ? l.activeOrder[0]
            ? {
                status: l.activeOrder[0].paidAt
                  ? ('InTransaction' as const)
                  : ('AwaitingPayment' as const),
                expiresAt: l.activeOrder[0].paidAt
                  ? null
                  : l.activeOrder[0].paymentDeadline.toISOString(),
              }
            : {
                status: 'InNegotiation' as const,
                expiresAt: l.purchase[0]?.expiresAt?.toISOString() ?? null,
              }
          : { status: 'Available' as const, expiresAt: null },
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
    const classification = catalogFilters(query);
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
      ...classification,
    };
    const match: Record<string, unknown> = {};
    const and: Record<string, unknown>[] = [];
    if (q)
      and.push({
        $or: [
          { 'b.searchText': { $regex: regexLiteral(q) } },
          ...(isbn ? [{ 'b.confirmedIsbn': isbn }] : []),
        ],
      });
    if (scope.bookId) match['b._id'] = scope.bookId;
    if (query.condition) match['r.condition'] = query.condition;
    if (query.mode)
      match['r.mode'] =
        query.mode === 'Both' ? 'Both' : { $in: [query.mode, 'Both'] };
    for (const [field, path, op] of [
      ['minSalePrice', 'r.salePrice', '$gte'],
      ['maxSalePrice', 'r.salePrice', '$lte'],
      ['minExchangeValue', 'r.exchangeValue', '$gte'],
      ['maxExchangeValue', 'r.exchangeValue', '$lte'],
    ] as const)
      if (query[field] !== undefined)
        and.push({ [path]: { [op]: Number(query[field]) } });
    const key = sort.startsWith('salePrice')
      ? '$r.salePrice'
      : sort.startsWith('exchangeValue')
        ? '$r.exchangeValue'
        : '$publishedAt';
    // The ID selection and projection share one snapshot: no revision/owner change
    // between two queries can turn a selected public row into private content.
    return this.mongo.tx(async (tx) => {
      const page = await this.pages.page(
        tx.c.listings,
        [
          ...publicEligibleStages(),
          ...catalogFilterStages(classification, 'b.currentRevisionId'),
          { $match: { ...match, ...(and.length ? { $and: and } : {}) } },
          { $project: { key } },
          { $match: { key: { $ne: null } } },
        ],
        {
          kind: sort === 'newest' ? 'time' : 'number',
          ascending: sort.endsWith('Asc'),
          scope,
          limit: Number(query.limit),
          cursor: query.cursor as string | undefined,
        },
      );
      if (!page.ids.length)
        return {
          items: [],
          nextCursor: page.nextCursor,
          serverTime: page.serverTime,
        };
      const rows = await tx.c.listings
        .aggregate<Eligible>([
          { $match: { _id: { $in: page.ids } } },
          ...publicEligibleStages(),
        ])
        .toArray();
      // Two bounded reads in this same snapshot instead of two per listing.
      // Do not parallelize operations on the MongoDB transaction session.
      const metadataRows = await tx.c.catalog_revisions
        .find({
          _id: {
            $in: [...new Set(rows.map((row) => row.b.currentRevisionId!))],
          },
        })
        .toArray();
      const originRows = await tx.c.member_addresses
        .find(
          {
            _id: {
              $in: [
                ...new Set(
                  rows.flatMap((row) =>
                    row.r.originAddressId ? [row.r.originAddressId] : [],
                  ),
                ),
              ],
            },
          },
          { projection: { _id: 1, version: 1 } },
        )
        .toArray();
      const metadataById = new Map(metadataRows.map((row) => [row._id, row]));
      const originsById = new Map(originRows.map((row) => [row._id, row]));
      const byId = new Map(rows.map((row) => [row._id, row]));
      const items = [];
      for (const id of page.ids) {
        const row = byId.get(id);
        if (!row) continue;
        const metadata = metadataById.get(row.b.currentRevisionId!);
        if (!metadata) throw notFound();
        items.push(
          await this.projection(tx, row, {
            metadata,
            origin: row.r.originAddressId
              ? (originsById.get(row.r.originAddressId) ?? null)
              : null,
          }),
        );
      }
      return {
        items,
        nextCursor: page.nextCursor,
        serverTime: page.serverTime,
      };
    });
  }
  detail(id: string): Promise<Wire['PublicListing']> {
    return this.mongo.tx(async (tx) => {
      const [row] = await tx.c.listings
        .aggregate<Eligible>([
          { $match: { _id: id } },
          ...publicEligibleStages(),
        ])
        .toArray();
      if (!row) throw notFound();
      return this.projection(tx, row);
    });
  }
  async media(listingId: string, mediaId: string): Promise<Wire['MediaRead']> {
    const authorize = async () => {
      const [row] = await this.mongo.c.listings
        .aggregate<Eligible>([
          { $match: { _id: listingId } },
          ...publicEligibleStages(),
          { $match: { 'rm.mediaId': mediaId } },
        ])
        .toArray();
      const m = row?.m.find((x) => x._id === mediaId);
      if (!row || !m) throw notFound();
      return {
        revisionId: row.r._id,
        key: m.derivativeKey!,
        width: m.width!,
        height: m.height!,
      };
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
