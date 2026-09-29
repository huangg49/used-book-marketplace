import { Prisma } from '../../generated/prisma/client.js';

// TEMPORARY (MongoDB migration lane): the PostgreSQL public-eligibility
// predicate, kept only for the quote/order modules not ported yet (MIG-05).
// The MongoDB equivalent is publicEligibleStages in public-listing.service.ts.
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
