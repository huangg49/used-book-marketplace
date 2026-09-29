import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Tx } from '../commands/command.service.js';
import { notFound } from '../commands/domain-error.js';

// TEMPORARY (MongoDB migration lane): PostgreSQL catalog lock for the quote and
// order modules that are not ported yet (MIG-05). Delete with Prisma at cutover.
const details = {
  currentRevision: true,
  revisions: {
    orderBy: { number: 'asc' as const },
    include: { decision: true },
  },
} satisfies Prisma.CatalogBookInclude;

@Injectable()
export class LegacyCatalogLocks {
  async lockForReview(tx: Tx, bookId: string | null) {
    if (!bookId) return null;
    await tx.$queryRaw`SELECT id FROM catalog_books WHERE id=${bookId}::uuid FOR UPDATE`;
    const book = await tx.catalogBook.findUnique({
      where: { id: bookId },
      include: details,
    });
    if (!book) throw notFound();
    return book;
  }
}
