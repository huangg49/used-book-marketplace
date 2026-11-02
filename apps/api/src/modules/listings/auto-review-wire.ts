import type { Collections } from '../../database/mongo/collections.js';
import type {
  ListingAutoReviewCheckDoc,
  ListingAutoReviewDoc,
} from '../../database/mongo/documents.js';
import type { Wire } from '../commands/domain-error.js';

export function autoReviewCheckWire(
  c: ListingAutoReviewCheckDoc,
): Wire['AutoReviewCheck'] {
  return {
    id: c._id,
    listingId: c.listingId,
    revisionId: c.revisionId,
    selection: c.selection,
    status: c.status,
    reasons: c.reasons,
    model: c.model,
    policyVersion: c.policyVersion,
    note: c.note,
    resolvedAt: c.resolvedAt?.toISOString() ?? null,
    resolvedByStaff: c.resolvedBy !== null,
    version: c.version,
    createdAt: c.createdAt.toISOString(),
  };
}

// Stored JSON from a known writer. Rows from before ADR 0063 hold another shape
// and recorded none of these parts, so they read as empty rather than as a pass.
export function autoReviewWire(
  row: ListingAutoReviewDoc,
  checks: ListingAutoReviewCheckDoc[],
): Wire['AutoReviewSummary'] {
  const a = (row.assessment ?? {}) as Partial<
    Pick<
      Wire['AutoReviewSummary'],
      'stages' | 'criteria' | 'extraction' | 'comparison' | 'damage'
    >
  >;
  return {
    outcome: row.outcome,
    reasons: row.reasons,
    decidedAt: row.decidedAt.toISOString(),
    model: row.model,
    policyVersion: row.policyVersion,
    stages: a.stages ?? [],
    criteria: a.criteria ?? [],
    extraction: a.extraction ?? null,
    comparison: a.comparison ?? null,
    damage: a.damage ?? null,
    facts: (row.facts as Wire['AutoReviewSummary']['facts']) ?? null,
    checks: checks.map(autoReviewCheckWire),
  };
}

export async function autoReviewForRevision(c: Collections, revisionId: string) {
  const row = await c.listing_auto_reviews.findOne({ revisionId });
  if (!row) return null;
  const checks = await c.listing_auto_review_checks
    .find({ revisionId })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();
  return autoReviewWire(row, checks);
}
