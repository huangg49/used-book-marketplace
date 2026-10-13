import type { Db, Document } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import { latestAuctionSpec } from './0022-point-administration.js';
export { EVIDENCE_WINDOW_MS } from './auction-constants.js';
import {
  and,
  document,
  eq,
  f,
  gt,
  isNull,
  notNull,
  or,
  t,
  unique,
  type CollectionSpec,
} from '../schema-dsl.js';

// N4-12 (FR-T01/T02, FR-H08, POL-09): the point inspection records a
// checklist and may ask the seller for evidence instead of Pass/Fail. Each
// conclusion is an immutable report revision. NeedsEvidence blocks opening
// the auction; an independent Staff member decides after the seller answers
// or the 48-hour window ends, and it never becomes Pass on its own.
// N4-14 (POL-34) reads reclaimRequiredAt, set when reclaim becomes required.

export const CHECKLIST_KEYS = [
  'titleEditionMatches',
  'privateMarksMatch',
  'coverPagesMatch',
  'notesAccessoriesMatch',
  'suspectedCopy',
] as const;

// Appends `branch` to the validator's per-state alternatives.
const withStateBranch = (expr: unknown, branch: Document): Document => {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      const entries = Object.entries(node).map(([k, v]) => [k, walk(v)]);
      const next = Object.fromEntries(entries) as Document;
      const alternatives = next.$or as unknown[] | undefined;
      if (
        alternatives &&
        JSON.stringify(alternatives).includes('"AwaitingDropoff"') &&
        JSON.stringify(alternatives).includes('"Auctioning"')
      )
        return { $or: [...alternatives, branch] };
      return next;
    }
    return node;
  };
  return walk(expr) as Document;
};

const intakeSpec: CollectionSpec = (() => {
  const spec = latestAuctionSpec('auction_intakes');
  const properties = (spec.schema as Document).properties as Record<
    string,
    Document
  >;
  const states = properties.state.enum as string[];
  return {
    ...spec,
    schema: document({
      ...properties,
      state: t.enum(...states, 'NeedsEvidence'),
      inspectionOutcome: t.nenum('Pass', 'Fail', 'NeedsEvidence'),
      evidenceRequestedBy: t.nuuid(),
      evidenceDeadline: t.ndate(),
      evidenceNote: t.nstr(2000),
      evidenceSubmittedAt: t.ndate(),
      reclaimRequiredAt: t.ndate(),
    }),
    expr: and(
      withStateBranch(
        spec.expr,
        and(
          eq(f('state'), 'NeedsEvidence'),
          eq(f('inspectionOutcome'), 'NeedsEvidence'),
          notNull('evidenceRequestedBy'),
          gt(f('evidenceDeadline'), f('inspectedAt')),
          isNull('auctionId'),
        ),
      ),
      or(
        and(isNull('evidenceRequestedBy'), isNull('evidenceDeadline')),
        and(notNull('evidenceRequestedBy'), notNull('evidenceDeadline')),
      ),
      or(
        and(isNull('evidenceNote'), isNull('evidenceSubmittedAt')),
        and(
          notNull('evidenceNote'),
          notNull('evidenceDeadline'),
          gt(f('evidenceDeadline'), f('evidenceSubmittedAt')),
        ),
      ),
      or(isNull('reclaimRequiredAt'), notNull('reclaimReason')),
    ),
  };
})();

const checklist = document(
  Object.fromEntries(CHECKLIST_KEYS.map((k) => [k, t.bool()])),
);
const reportSpec: CollectionSpec = {
  name: 'intake_inspection_reports',
  access: 'appendOnly',
  schema: document({
    _id: t.uuid(),
    intakeId: t.uuid(),
    revision: t.int(1),
    outcome: t.enum('Pass', 'Fail', 'NeedsEvidence'),
    checklist: { ...checklist, bsonType: ['object', 'null'] },
    note: t.nstr(1000),
    inspectorId: t.uuid(),
    createdAt: t.date(),
  }),
  indexes: [
    unique(
      { intakeId: 1, revision: 1 },
      'intake_inspection_reports_revision_key',
    ),
  ],
};

export const inspectionEvidenceCollectionSpecs = [reportSpec];
export const inspectionEvidenceChangedSpecs = [intakeSpec];
export const withInspectionEvidenceChanges = (spec: CollectionSpec) =>
  inspectionEvidenceChangedSpecs.find((s) => s.name === spec.name) ?? spec;

export const inspectionEvidenceMigration = {
  id: '0023-inspection-evidence',
  definition: {
    collections: inspectionEvidenceCollectionSpecs,
    changed: inspectionEvidenceChangedSpecs,
  },
  async up(db: Db) {
    // Nullable fields are stored as null; a pending reclaim dates from its
    // last transition.
    await db.collection('auction_intakes').updateMany(
      { evidenceDeadline: { $exists: false } },
      [
        {
          $set: {
            evidenceRequestedBy: null,
            evidenceDeadline: null,
            evidenceNote: null,
            evidenceSubmittedAt: null,
            reclaimRequiredAt: {
              $cond: [
                { $eq: ['$state', 'ReclaimRequired'] },
                '$updatedAt',
                null,
              ],
            },
          },
        },
      ],
      { bypassDocumentValidation: true },
    );
    await applyCollectionSpecs(db, [
      ...inspectionEvidenceCollectionSpecs,
      ...inspectionEvidenceChangedSpecs,
    ]);
  },
};
