import { Injectable } from '@nestjs/common';
import { Prisma, type CatalogRevision } from '../../generated/prisma/client.js';
import { DatabaseService } from '../../database/database.service.js';
import {
  CommandService,
  admin,
  member,
  requireActive,
  type CommandContext,
  type Actor,
  type Tx,
} from '../commands/command.service.js';
import {
  DomainError,
  conflict,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import {
  isbn13,
  likeLiteral,
  normalizeSearch,
} from '../commands/contract-input.service.js';
import { PageService } from '../commands/page.service.js';

const details = {
  currentRevision: true,
  revisions: {
    orderBy: { number: 'asc' as const },
    include: { decision: true },
  },
} satisfies Prisma.CatalogBookInclude;
type Book = Prisma.CatalogBookGetPayload<{ include: typeof details }>;
function metadata(r: CatalogRevision): Wire['CatalogMetadata'] {
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
    id: b.id,
    version: b.version,
    status: b.status,
    requesterId: b.requesterId,
    currentRevision: {
      id: current.id,
      number: current.number,
      metadata: metadata(current),
      submittedAt: current.submittedAt.toISOString(),
    },
    decisions: b.revisions.flatMap((r) =>
      r.decision
        ? [
            {
              id: r.decision.id,
              revisionId: r.id,
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
@Injectable()
export class CatalogService {
  constructor(
    private readonly db: DatabaseService,
    private readonly commands: CommandService,
    private readonly pages: PageService,
  ) {}
  private async locked(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM catalog_books WHERE id=${id}::uuid FOR UPDATE`;
    const book = await tx.catalogBook.findUnique({
      where: { id },
      include: details,
    });
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
    if (
      isbn &&
      (await tx.catalogBook.findUnique({ where: { confirmedIsbn: isbn } }))
    )
      throw new DomainError(
        409,
        'CatalogDuplicate',
        'Đầu sách có ISBN này đã có trong danh mục. Hãy tìm và chọn đầu sách đó.',
      );
  }
  create(context: CommandContext, body: Wire['CreateCatalogRequest']) {
    return this.commands.run(context, 'createCatalogRequest', null, body, {
      authorize: async (_tx, actor) => {
        member(actor);
      },
      mutate: async (tx, actor) => {
        requireActive(actor);
        await this.noDuplicate(tx, body.metadata.isbn);
        const b = await tx.catalogBook.create({
          data: {
            requesterId: actor.id,
            searchText: normalizeSearch(
              body.metadata.title + ' ' + body.metadata.authors.join(' '),
            ),
          },
        });
        const r = await tx.catalogRevision.create({
          data: { ...body.metadata, bookId: b.id, number: 1 },
        });
        await tx.catalogBook.update({
          where: { id: b.id },
          data: { currentRevisionId: r.id },
        });
        return {
          entityType: 'Catalog',
          entityId: b.id,
          version: 1,
          revisionId: r.id,
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
        if (b.requesterId !== actor.id) throw notFound();
        return b;
      },
      mutate: async (tx, actor, b) => {
        requireActive(actor);
        if (b.version !== body.expectedVersion) throw conflict();
        if (b.status !== 'Rejected' || b.currentRevision!.number >= 1000)
          throw invalidState();
        await this.noDuplicate(tx, body.metadata.isbn);
        const r = await tx.catalogRevision.create({
          data: {
            ...body.metadata,
            bookId: id,
            number: b.currentRevision!.number + 1,
          },
        });
        await tx.catalogBook.update({
          where: { id },
          data: {
            currentRevisionId: r.id,
            status: 'Pending',
            version: { increment: 1 },
            searchText: normalizeSearch(
              body.metadata.title + ' ' + body.metadata.authors.join(' '),
            ),
          },
        });
        return {
          entityType: 'Catalog',
          entityId: id,
          version: b.version + 1,
          revisionId: r.id,
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
            const b = await tx.catalogBook.findUnique({ where: { id } });
            return b ? [b.requesterId] : [];
          },
          authorize: async (tx, actor) => {
            admin(actor);
            const b = await this.locked(tx, id);
            if (b.requesterId === actor.id)
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
            await tx.catalogDecision.create({
              data: {
                revisionId: body.revisionId,
                reviewerId: context.auth.user.id,
                decision: body.decision,
                reason: body.decision === 'Reject' ? body.reason : null,
              },
            });
            const state =
              body.decision === 'Confirm'
                ? ('Confirmed' as const)
                : ('Rejected' as const);
            await tx.catalogBook.update({
              where: { id },
              data: {
                status: state,
                version: { increment: 1 },
                confirmedIsbn:
                  state === 'Confirmed' ? b.currentRevision!.isbn : null,
              },
            });
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
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new DomainError(
          409,
          'CatalogDuplicate',
          'Một yêu cầu khác vừa xác nhận ISBN này. Hãy tải lại danh mục.',
        );
      throw error;
    }
  }
  async publicDetail(id: string): Promise<Wire['PublicBook']> {
    const b = await this.db.catalogBook.findFirst({
      where: { id, status: 'Confirmed' },
      include: { currentRevision: true },
    });
    if (!b?.currentRevision) throw notFound();
    return { id: b.id, ...metadata(b.currentRevision) };
  }
  async publicList(
    query: Record<string, string | number>,
  ): Promise<Wire['BookPage']> {
    const q = normalizeSearch(String(query.q ?? '')),
      isbn = isbn13(String(query.q ?? ''));
    return this.db.$transaction(async (tx) => {
      const page = await this.pages.select(tx, {
        from: Prisma.sql`catalog_books b JOIN catalog_revisions r ON r.id=b.current_revision_id`,
        id: Prisma.sql`b.id`,
        key: Prisma.sql`replace(regexp_replace(normalize(lower(r.title), NFD), ${'[\u0300-\u036f]'}, '', 'g'),'đ','d')`,
        kind: 'text',
        ascending: true,
        where: Prisma.sql`b.status='Confirmed' AND (${q}='' OR b.search_text LIKE ${'%' + likeLiteral(q) + '%'} OR b.confirmed_isbn=${isbn})`,
        scope: { operation: 'listBooks', q, isbn },
        limit: Number(query.limit),
        cursor: query.cursor as string | undefined,
      });
      const books = await tx.catalogBook.findMany({
        where: { id: { in: page.ids }, status: 'Confirmed' },
        include: { currentRevision: true },
      });
      return {
        items: page.ids.flatMap((id) => {
          const b = books.find((b) => b.id === id);
          return b?.currentRevision
            ? [{ id: b.id, ...metadata(b.currentRevision) }]
            : [];
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
      const b = await tx.catalogBook.findUnique({
        where: { id },
        include: details,
      });
      if (!b || (!operations && b.requesterId !== actor.id)) throw notFound();
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
      const page = await this.pages.select(tx, {
        from: Prisma.sql`catalog_books b`,
        id: Prisma.sql`b.id`,
        key: operations ? Prisma.sql`b.created_at` : Prisma.sql`b.updated_at`,
        kind: 'time',
        ascending: operations,
        where: operations
          ? Prisma.sql`b.status::text=${status}`
          : Prisma.sql`b.requester_id=${actor.id}::uuid`,
        scope: {
          operation: operations
            ? 'listCatalogReviewQueue'
            : 'listMyCatalogRequests',
          actor: actor.id,
          status: operations ? status : null,
        },
        limit: Number(query.limit),
        cursor: query.cursor as string | undefined,
      });
      const books = await tx.catalogBook.findMany({
        where: { id: { in: page.ids } },
        include: details,
      });
      return {
        items: page.ids.map((id) =>
          privateBook(books.find((b) => b.id === id)!),
        ),
        nextCursor: page.nextCursor,
        serverTime: page.serverTime,
      };
    });
  }
}
