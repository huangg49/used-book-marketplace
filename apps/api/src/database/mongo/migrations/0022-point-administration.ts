import type { Db, Document } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import { auctionCollectionSpecs } from './0008-auctions.js';
import { withPointOrderChanges } from './0009-point-orders.js';
import { withResolutionChanges } from './0011-point-order-resolution.js';
import { withSettlementChanges } from './0012-point-order-settlement.js';
import { withRulesChanges } from './0013-auction-business-rules.js';
import { notificationChangedSpecs } from './0015-member-notifications.js';
import { t, type CollectionSpec } from '../schema-dsl.js';

// N4-10/N4-11 (FR-H04): Admin manages the handover points and the Staff
// assignments. Every point command checks the point's expectedVersion, and
// its receipt and audit row name the point, so receipts and audit gain a
// pointId target (exactly one target per row is kept). Assignment rows are
// unchanged: ending one sets validTo; the audit row records who and why.

export const latestAuctionSpec = (name: string) => {
  const spec = auctionCollectionSpecs.find((s) => s.name === name);
  if (!spec) throw new Error(`Missing auction ${name} schema`);
  return withRulesChanges(
    withSettlementChanges(withResolutionChanges(withPointOrderChanges(spec))),
  );
};
const latestCommandSpec = (name: string) => {
  const spec = notificationChangedSpecs.find((s) => s.name === name);
  if (!spec) throw new Error(`Missing current ${name} schema`);
  return spec;
};

// Adds `field` next to the existing nullable targets and to the
// exactly-one-target count wherever that count appears in the validator.
// The field is optional: rows written before it, and writers that never
// target a point, omit it; a missing field counts as null.
const withTarget = (spec: CollectionSpec, field: string): CollectionSpec => {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      const next = node.map(walk);
      return next.includes('$topupId') && next.includes('$listingId')
        ? [...next, `$${field}`]
        : next;
    }
    if (node && typeof node === 'object')
      return Object.fromEntries(
        Object.entries(node).map(([k, v]) => [k, walk(v)]),
      );
    return node;
  };
  const schema = spec.schema as Document;
  return {
    ...spec,
    schema: {
      ...schema,
      properties: { ...schema.properties, [field]: t.nuuid() },
    },
    expr: walk(spec.expr) as Document,
  };
};

const pointSpec = (() => {
  const spec = latestAuctionSpec('handover_points');
  const schema = spec.schema as Document;
  return {
    ...spec,
    schema: {
      ...schema,
      required: [...(schema.required as string[]), 'version', 'updatedAt'],
      properties: {
        ...schema.properties,
        version: t.int(1),
        updatedAt: t.date(),
      },
    },
  };
})();

export const pointAdministrationChangedSpecs: CollectionSpec[] = [
  pointSpec,
  withTarget(latestCommandSpec('mutation_receipts'), 'pointId'),
  withTarget(latestCommandSpec('audit_events'), 'pointId'),
];
export const withPointAdministrationChanges = (spec: CollectionSpec) =>
  pointAdministrationChangedSpecs.find((s) => s.name === spec.name) ?? spec;

export const pointAdministrationMigration = {
  id: '0022-point-administration',
  definition: { changed: pointAdministrationChangedSpecs },
  async up(db: Db) {
    // Nullable fields are stored as null, never omitted.
    await db
      .collection('handover_points')
      .updateMany(
        { version: { $exists: false } },
        [{ $set: { version: 1, updatedAt: '$$NOW' } }],
        { bypassDocumentValidation: true },
      );
    await applyCollectionSpecs(db, pointAdministrationChangedSpecs);
  },
};
