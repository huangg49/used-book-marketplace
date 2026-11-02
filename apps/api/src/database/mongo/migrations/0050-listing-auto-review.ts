import type { Db, Document } from 'mongodb';
import {
  and,
  document,
  eq,
  f,
  index,
  notNull,
  t,
  unique,
  type CollectionSpec,
} from '../schema-dsl.js';

// ADR 0061: one row per revision the AI reviewer looked at, published or sent
// to Staff. Holds verdicts and reason codes, never photos or seller text.
export const listingAutoReviewSpec: CollectionSpec = {
  name: 'listing_auto_reviews',
  access: 'appendOnly',
  schema: document({
    _id: t.uuid(),
    revisionId: t.uuid(),
    listingId: t.uuid(),
    outcome: t.enum('Approved', 'Escalated'),
    reasons: {
      bsonType: 'array',
      maxItems: 30,
      items: { bsonType: 'string', maxLength: 60 },
    },
    assessment: t.nobject(),
    model: t.nstr(120),
    decidedAt: t.date(),
  }),
  expr: {
    $eq: [
      { $eq: ['$outcome', 'Approved'] },
      { $eq: [{ $size: '$reasons' }, 0] },
    ],
  },
  indexes: [
    unique({ revisionId: 1 }, 'listing_auto_reviews_revision_id_key'),
    index({ decidedAt: 1 }, 'listing_auto_reviews_decided_at_idx'),
  ],
};

// Grants one more system operation, targeted at a listing, next to the only
// other listing-targeted worker. Every other principal rule stays as it was.
function withAutoApprovePrincipal(spec: CollectionSpec, field: string) {
  const expr = JSON.parse(JSON.stringify(spec.expr)) as Document;
  let pairs = 0;
  let targets = 0;
  const isActor = (x: unknown) =>
    (x as Document)?.$and?.[0]?.$eq?.[0] === '$systemActor' &&
    (x as Document)?.$and?.[0]?.$eq?.[1] === 'PurchaseConversationExpiry';
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      const match = node.find(isActor) as Document | undefined;
      if (match?.$and?.[1]?.$eq?.[0] === f(field)) {
        pairs++;
        node.push(
          and(
            eq(f('systemActor'), 'ListingAutoReview'),
            eq(f(field), 'autoApproveListing'),
          ),
        );
      } else if (match) {
        targets++;
        node.push(
          and(eq(f('systemActor'), 'ListingAutoReview'), notNull('listingId')),
        );
      } else node.forEach(visit);
      return;
    }
    if (node && typeof node === 'object') Object.values(node).forEach(visit);
  };
  visit(expr);
  if (pairs !== 1 || targets !== 1)
    throw new Error(`Auto review principal rule not found in ${spec.name}`);
  return { ...spec, expr };
}

export function withListingAutoReview(spec: CollectionSpec): CollectionSpec {
  if (spec.name === 'mutation_receipts')
    return withAutoApprovePrincipal(spec, 'operation');
  if (spec.name === 'audit_events')
    return withAutoApprovePrincipal(spec, 'action');
  return spec;
}

export function createListingAutoReviewMigration(previous: CollectionSpec[]) {
  const changed = previous.map(withListingAutoReview);
  return {
    id: '0050-listing-auto-review',
    definition: {
      collections: [listingAutoReviewSpec],
      changed,
      policy: 'approve-or-escalate-never-reject-v1',
    },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, [listingAutoReviewSpec, ...changed]);
    },
  };
}
