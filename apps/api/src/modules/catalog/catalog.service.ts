import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MongoServerError } from 'mongodb';
import type {
  CatalogBookDoc,
  CatalogDecisionDoc,
  CatalogRevisionDoc,
} from '../../database/mongo/documents.js';
import { MongoService } from '../../database/mongo/mongo.service.js';
import type { Tx } from '../../database/mongo/transaction.js';
import { titleKey } from '../../database/mongo/migrations/0003-catalog-title-key.js';
import {
  MongoCommandService,
  admin,
  member,
  requireActive,
  type CommandContext,
  type Actor,
} from '../commands/mongo-command.service.js';
import {
  DomainError,
  conflict,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import { isbn13, normalizeSearch } from '../commands/contract-input.service.js';
import {
  MongoPageService,
  regexLiteral,
} from '../commands/mongo-page.service.js';
import type {
  BoundCollection,
  Collections,
} from '../../database/mongo/collections.js';

type Revision = CatalogRevisionDoc & { decision: CatalogDecisionDoc | null };
export type Book = CatalogBookDoc & {
  currentRevision: CatalogRevisionDoc | null;
  revisions: Revision[];
};

function metadata(r: CatalogRevisionDoc): Wire['CatalogMetadata'] {
  return {
    title: r.title,
    authors: r.authors,
    publisher: r.publisher,
    publicationYear: r.publicationYear,
    language: r.language,
    edition: r.edition,
    category: r.category,
    isbn: r.isbn,
  };
}
function privateBook(b: Book): Wire['PrivateCatalogRequest'] {
  const current = b.currentRevision!;
  return {
    id: b._id,
    version: b.version,
    status: b.status,
    requesterId: b.requesterId,
    currentRevision: {
      id: current._id,
      number: current.number,
      metadata: metadata(current),
      submittedAt: current.submittedAt.toISOString(),
    },
    decisions: b.revisions.flatMap((r) =>
      r.decision
        ? [
            {
              id: r.decision._id,
              revisionId: r._id,
              decision: r.decision.decision,
              reason: r.decision.reason,
              decidedAt: r.decision.decidedAt.toISOString(),
            },
          ]
        : [],
    ),
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}
const revisionFields = (m: Wire['CatalogMetadata']) => ({
  title: m.title,
  authors: m.authors,
  publisher: m.publisher ?? null,
  publicationYear: m.publicationYear ?? null,
  language: m.language,
  edition: m.edition ?? null,
  category: m.category,
  isbn: m.isbn ?? null,
});

// Loads a book with its current revision and every revision/decision.
export async function loadBook(
  c: Collections,
  id: string,
): Promise<Book | null> {
  const book = await c.catalog_books.findOne({ _id: id });
  if (!book) return null;
  const revisions = await c.catalog_revisions
    .find({ bookId: id }, { sort: { number: 1 } })
    .toArray();
  const decisions = await c.catalog_decisions
    .find({ revisionId: { $in: revisions.map((r) => r._id) } })
    .toArray();
  const byRevision = new Map(decisions.map((d) => [d.revisionId, d]));
  return {
    ...book,
    currentRevision:
      revisions.find((r) => r._id === book.currentRevisionId) ?? null,
    revisions: revisions.map((r) => ({
      ...r,
      decision: byRevision.get(r._id) ?? null,
    })),
  };
}

// Commit-time replacement for latlai_check_catalog (deferred constraint).
export async function checkCatalog(tx: Tx, bookId: string) {
  const b = await loadBook(tx.c, bookId);
  if (!b) return;
  const r = b.currentRevision;
  if (!r) throw new Error('Catalog requires its own current revision');
  const d = b.revisions.find((x) => x._id === r._id)!.decision?.decision;
  if (
    (b.status === 'Pending' && d) ||
    (b.status === 'Confirmed' && d !== 'Confirm') ||
    (b.status === 'Rejected' && d !== 'Reject')
  )
    throw new Error('Catalog state does not match current decision');
  if (
    b.status === 'Confirmed' &&
    b.confirmedIsbn !== (r.isbn ? isbn13(r.isbn) : null)
  )
    throw new Error('Confirmed ISBN does not match reviewed revision');
  if (b.titleKey !== titleKey(r.title))
    throw new Error('Catalog sort key does not match current revision');
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly mongo: MongoService,
    private readonly commands: MongoCommandService,
    private readonly pages: MongoPageService,
  ) {}
  private async locked(tx: Tx, id: string) {
    await tx.lock('catalog_books', [id]);
    const book = await loadBook(tx.c, id);
    if (!book) throw notFound();
    return book;
  }
  async lockForListing(tx: Tx, bookId: string | null, ownerId: string) {
    if (!bookId) return;
    const book = await this.locked(tx, bookId);
    if (
      book.status !== 'Confirmed' &&
      !(book.status === 'Pending' && book.requesterId === ownerId)
    )
      throw notFound();
  }
  async lockForReview(tx: Tx, bookId: string | null) {
    return bookId ? this.locked(tx, bookId) : null;
  }
  private async noDuplicate(tx: Tx, isbn: string | null) {
    if (isbn && (await tx.c.catalog_books.findOne({ confirmedIsbn: isbn })))
      throw new DomainError(
        409,
        'CatalogDuplicate',
        'Đầu sách có ISBN này đã có trong danh mục. Hãy tìm và chọn đầu sách đó.',
      );
  }
  private verify(tx: Tx, id: string) {
    tx.check(`catalog:${id}`, () => checkCatalog(tx, id));
  }
  create(context: CommandContext, body: Wire['CreateCatalogRequest']) {
    return this.commands.run(context, 'createCatalogRequest', null, body, {
      authorize: async (_tx, actor) => {
        member(actor);
      },
      mutate: async (tx, actor) => {
        requireActive(actor);
        await this.noDuplicate(tx, body.metadata.isbn);
        const now = await tx.now();
        const bookId = randomUUID(),
          revisionId = randomUUID();
        await tx.c.catalog_revisions.insertOne({
          _id: revisionId,
          bookId,
          number: 1,
          ...revisionFields(body.metadata),
          submittedAt: now,
        });
        await tx.c.catalog_books.insertOne({
          _id: bookId,
          requesterId: actor._id,
          status: 'Pending',
          version: 1,
          currentRevisionId: revisionId,
          confirmedIsbn: null,
          searchText: normalizeSearch(
            body.metadata.title + ' ' + body.metadata.authors.join(' '),
          ),
          titleKey: titleKey(body.metadata.title),
          createdAt: now,
          updatedAt: new Date(),
          lockSeq: 0,
        });
        this.verify(tx, bookId);
        return {
          entityType: 'Catalog',
          entityId: bookId,
          version: 1,
          revisionId,
          state: 'Pending',
          event: 'CatalogRequested',
        };
      },
    });
  }
  resubmit(
    context: CommandContext,
    id: string,
    body: Wire['ResubmitCatalogRequest'],
  ) {
    return this.commands.run(context, 'resubmitCatalogRequest', id, body, {
      authorize: async (tx, actor) => {
        member(actor);
        const b = await this.locked(tx, id);
        if (b.requesterId !== actor._id) throw notFound();
        return b;
      },
      mutate: async (tx, actor, b) => {
        requireActive(actor);
        if (b.version !== body.expectedVersion) throw conflict();
        if (b.status !== 'Rejected' || b.currentRevision!.number >= 1000)
          throw invalidState();
        await this.noDuplicate(tx, body.metadata.isbn);
        const revisionId = randomUUID();
        await tx.c.catalog_revisions.insertOne({
          _id: revisionId,
          bookId: id,
          number: b.currentRevision!.number + 1,
          ...revisionFields(body.metadata),
          submittedAt: await tx.now(),
        });
        // Version advances once; a Confirmed book is never rewritten.
        await tx.c.catalog_books.updateOne(
          { _id: id, version: b.version, status: { $ne: 'Confirmed' } },
          {
            $set: {
              currentRevisionId: revisionId,
              status: 'Pending',
              updatedAt: new Date(),
              searchText: normalizeSearch(
                body.metadata.title + ' ' + body.metadata.authors.join(' '),
              ),
              titleKey: titleKey(body.metadata.title),
            },
            $inc: { version: 1 },
          },
        );
        this.verify(tx, id);
        return {
          entityType: 'Catalog',
          entityId: id,
          version: b.version + 1,
          revisionId,
          state: 'Pending',
          before: { version: b.version, status: b.status },
          event: 'CatalogRequested',
        };
      },
    });
  }
  async decide(
    context: CommandContext,
    id: string,
    body: Wire['DecideCatalog'],
  ) {
    try {
      return await this.commands.run(
        context,
        'decideCatalogRequest',
        id,
        body,
        {
          discover: async (tx) => {
            const b = await tx.c.catalog_books.findOne({ _id: id });
            return b ? [b.requesterId] : [];
          },
          authorize: async (tx, actor) => {
            admin(actor);
            const b = await this.locked(tx, id);
            if (b.requesterId === actor._id)
              throw new DomainError(
                403,
                'SelfReviewForbidden',
                'Cần người quản trị khác xét duyệt yêu cầu của bạn.',
              );
            return b;
          },
          mutate: async (tx, _actor, b) => {
            if (
              b.version !== body.expectedVersion ||
              b.currentRevisionId !== body.revisionId
            )
              throw conflict();
            if (b.status !== 'Pending') throw invalidState();
            if (body.decision === 'Confirm')
              await this.noDuplicate(tx, b.currentRevision!.isbn);
            await tx.c.catalog_decisions.insertOne({
              _id: randomUUID(),
              revisionId: body.revisionId,
              reviewerId: context.auth.user.id,
              decision: body.decision,
              reason: body.decision === 'Reject' ? body.reason : null,
              decidedAt: await tx.now(),
            });
            const state =
              body.decision === 'Confirm'
                ? ('Confirmed' as const)
                : ('Rejected' as const);
            await tx.c.catalog_books.updateOne(
              { _id: id, version: b.version, status: 'Pending' },
              {
                $set: {
                  status: state,
                  updatedAt: new Date(),
                  confirmedIsbn:
                    state === 'Confirmed' ? b.currentRevision!.isbn : null,
                },
                $inc: { version: 1 },
              },
            );
            this.verify(tx, id);
            return {
              entityType: 'Catalog',
              entityId: id,
              version: b.version + 1,
              revisionId: body.revisionId,
              state,
              before: { version: b.version, status: b.status },
              reason: body.decision === 'Reject' ? body.reason : undefined,
              event:
                state === 'Confirmed' ? 'CatalogConfirmed' : 'CatalogRejected',
            };
          },
        },
      );
    } catch (error) {
      // A concurrent confirmation committed the same ISBN first.
      if (error instanceof MongoServerError && error.code === 11000)
        throw new DomainError(
          409,
          'CatalogDuplicate',
          'Một yêu cầu khác vừa xác nhận ISBN này. Hãy tải lại danh mục.',
        );
      throw error;
    }
  }
  async publicDetail(id: string): Promise<Wire['PublicBook']> {
    const b = await this.mongo.c.catalog_books.findOne({
      _id: id,
      status: 'Confirmed',
    });
    const r =
      b?.currentRevisionId &&
      (await this.mongo.c.catalog_revisions.findOne({
        _id: b.currentRevisionId,
      }));
    if (!b || !r) throw notFound();
    return { id: b._id, ...metadata(r) };
  }
  async publicList(
    query: Record<string, string | number>,
  ): Promise<Wire['BookPage']> {
    const q = normalizeSearch(String(query.q ?? '')),
      isbn = isbn13(String(query.q ?? ''));
    // One snapshot for the page selection and its projection.
    return this.mongo.tx(async (tx) => {
      const match: Record<string, unknown> = { status: 'Confirmed' };
      if (q)
        match.$or = [
          { searchText: { $regex: regexLiteral(q) } },
          ...(isbn ? [{ confirmedIsbn: isbn }] : []),
        ];
      const page = await this.pages.page(
        tx.c.catalog_books,
        [{ $match: match }, { $project: { key: '$titleKey' } }],
        {
          kind: 'text',
          ascending: true,
          scope: { operation: 'listBooks', q, isbn },
          limit: Number(query.limit),
          cursor: query.cursor as string | undefined,
        },
      );
      const books = await tx.c.catalog_books
        .find({ _id: { $in: page.ids }, status: 'Confirmed' })
        .toArray();
      const revisions = await tx.c.catalog_revisions
        .find({
          _id: { $in: books.flatMap((b) => b.currentRevisionId ?? []) },
        })
        .toArray();
      return {
        items: page.ids.flatMap((id) => {
          const b = books.find((x) => x._id === id);
          const r = revisions.find((x) => x._id === b?.currentRevisionId);
          return b && r ? [{ id: b._id, ...metadata(r) }] : [];
        }),
        nextCursor: page.nextCursor,
        serverTime: page.serverTime,
      };
    });
  }
  privateDetail(auth: Actor, id: string, operations = false) {
    return this.commands.read(auth, async (tx, actor) => {
      if (operations) admin(actor);
      else member(actor);
      const b = await loadBook(tx.c, id);
      if (!b || (!operations && b.requesterId !== actor._id)) throw notFound();
      return privateBook(b);
    });
  }
  privateList(
    auth: Actor,
    query: Record<string, string | number>,
    operations = false,
  ) {
    return this.commands.read(auth, async (tx, actor) => {
      if (operations) admin(actor);
      else member(actor);
      const status = String(query.status ?? 'Pending');
      const page = await this.pages.page(
        tx.c.catalog_books as BoundCollection<CatalogBookDoc>,
        [
          {
            $match: operations ? { status } : { requesterId: actor._id },
          },
          {
            $project: { key: operations ? '$createdAt' : '$updatedAt' },
          },
        ],
        {
          kind: 'time',
          ascending: operations,
          scope: {
            operation: operations
              ? 'listCatalogReviewQueue'
              : 'listMyCatalogRequests',
            actor: actor._id,
            status: operations ? status : null,
          },
          limit: Number(query.limit),
          cursor: query.cursor as string | undefined,
        },
      );
      const books: Book[] = [];
      for (const id of page.ids) books.push((await loadBook(tx.c, id))!);
      return {
        items: books.map(privateBook),
        nextCursor: page.nextCursor,
        serverTime: page.serverTime,
      };
    });
  }
}
