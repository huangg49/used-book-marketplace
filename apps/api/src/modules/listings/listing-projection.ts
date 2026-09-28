import { Prisma } from '../../generated/prisma/client.js';
import type { Wire } from '../commands/domain-error.js';
import {
  originInclude,
  originReference,
  originStatus,
} from './listing-fulfillment.service.js';
export const revisionDetails = {
  originAddress: originInclude,
  media: { orderBy: { position: 'asc' as const } },
  decision: true,
} satisfies Prisma.ListingRevisionInclude;
export const details = {
  currentRevision: { include: { ...revisionDetails, book: true } },
  revisions: {
    where: { decision: { isNot: null } },
    orderBy: { number: 'desc' as const },
    take: 1,
    include: revisionDetails,
  },
} satisfies Prisma.ListingInclude;
export type Listing = Prisma.ListingGetPayload<{ include: typeof details }>;
type Revision = Prisma.ListingRevisionGetPayload<{
  include: typeof revisionDetails;
}>;
function decision(r: Revision): Wire['ReviewDecision'] | null {
  const d = r.decision;
  return d
    ? {
        id: d.id,
        revisionId: d.revisionId,
        decision: d.decision,
        reason: d.reason,
        decidedAt: d.decidedAt.toISOString(),
      }
    : null;
}
// SQL revision_mode_prices enforces the discriminated mode/price union.
export function revision(r: Revision): Wire['ListingRevision'] {
  return {
    id: r.id,
    number: r.number,
    submittedAt: r.submittedAt?.toISOString() ?? null,
    ownershipDeclaredAt: r.ownershipDeclaredAt?.toISOString() ?? null,
    decision: decision(r),
    fulfillmentStatus: originStatus(r),
    content: {
      ...(r.originAddressId ? { fulfillment: originReference(r) } : {}),
      bookId: r.bookId,
      mode: r.mode,
      condition: r.condition,
      pages: r.pages,
      coverNote: r.coverNote,
      notes: r.notes,
      accessories: r.accessories,
      readable: r.readable,
      hasMissingPages: r.hasMissingPages,
      missingEssentialContent: r.missingEssentialContent,
      description: r.description,
      salePrice: r.salePrice,
      exchangeValue: r.exchangeValue,
      mediaIds: r.media.map((m) => m.mediaId),
    } as Wire['DraftContent'],
  };
}
export const state = (l: Listing): Wire['ListingState'] => ({
  moderation: l.moderation,
  visibility: l.visibility,
  trade: l.trade,
  deletedAt: l.deletedAt?.toISOString() ?? null,
});

export function projection(l: Listing): Wire['PrivateListing'] {
  const latest = l.revisions[0];
  return {
    id: l.id,
    ownerId: l.ownerId,
    version: l.version,
    state: state(l),
    currentRevision: revision(l.currentRevision!),
    latestDecision: latest ? decision(latest) : null,
    removalReason: l.removalReason,
    catalogStatus: l.currentRevision?.book?.status ?? null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}
