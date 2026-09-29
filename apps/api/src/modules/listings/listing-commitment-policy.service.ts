import { Injectable } from '@nestjs/common';
import { LegacyCatalogLocks } from '../catalog/legacy-catalog-locks.js';
import type { Tx } from '../commands/command.service.js';
import { conflict, invalidState, notFound } from '../commands/domain-error.js';

@Injectable()
export class ListingCommitmentPolicy {
  // Still PostgreSQL until the order module is ported (MIG-05).
  constructor(private readonly catalog: LegacyCatalogLocks) {}
  async lock(tx: Tx, id: string) {
    const before = await tx.listing.findUnique({
      where: { id },
      include: { currentRevision: true },
    });
    if (!before) throw notFound();
    await this.catalog.lockForReview(tx, before.currentRevision!.bookId);
    await tx.$queryRaw`SELECT id FROM listings WHERE id=${id}::uuid FOR UPDATE`;
    const current = await tx.listing.findUniqueOrThrow({ where: { id } });
    if (current.currentRevisionId !== before.currentRevisionId)
      throw conflict();
    return current;
  }
  async project(
    tx: Tx,
    id: string,
    expectedVersion: number,
    from: 'Available' | 'Reserved',
    to: 'Reserved' | 'Available',
  ) {
    const listing = await tx.listing.findUniqueOrThrow({ where: { id } });
    if (listing.version !== expectedVersion) throw conflict();
    if (listing.trade !== from) throw invalidState();
    // Preserve moderation, visibility, ownership and accepted revision on release.
    return tx.listing.update({
      where: { id },
      data: { trade: to, version: { increment: 1 } },
    });
  }
}
