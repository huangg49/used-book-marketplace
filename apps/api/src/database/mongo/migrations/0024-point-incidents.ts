import type { Db } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import {
  and,
  document,
  eq,
  f,
  gte,
  index,
  isNull,
  lte,
  notNull,
  or,
  t,
  unique,
  type CollectionSpec,
} from '../schema-dsl.js';
import {
  INCIDENT_FUND_OPENING,
  INCIDENT_FUND_OPENING_ID,
} from './auction-constants.js';

// N4-13 (FR-T04, FR-H07, POL-42): an incident exists at a point even
// without an Order (auction intake). An independent Admin decides; the
// approved compensation is capped by the protected value and funded from
// the simulated incident fund only while it has money left. The unfunded
// part is recorded, never invented, and the point stops taking new
// bookings. Paying the member's wallet stays behind the settlement gate:
// the fund journal records approvals, not ledger payouts.

export const INCIDENT_KINDS = [
  'Lost',
  'Damaged',
  'ArrivalMismatch',
  'LateArrival',
  'EmergencyClose',
  'Other',
] as const;

const incidentSpec: CollectionSpec = {
  name: 'point_incidents',
  access: 'mutable',
  schema: document({
    _id: t.uuid(),
    pointId: t.uuid(),
    intakeId: t.nuuid(),
    kind: t.enum(...INCIDENT_KINDS),
    description: t.str(2000),
    protectedValue: t.nint(0, 1_000_000),
    state: t.enum('Open', 'Decided', 'Underfunded'),
    openedBy: t.uuid(),
    openedAt: t.date(),
    decision: t.nenum('Compensate', 'NoCompensation'),
    approvedAmount: t.nint(0, 1_000_000),
    fundedAmount: t.nint(0, 1_000_000),
    unfundedAmount: t.nint(0, 1_000_000),
    decidedBy: t.nuuid(),
    decidedAt: t.ndate(),
    decisionReason: t.nstr(1000),
    version: t.int(1),
    updatedAt: t.date(),
    lockSeq: t.lockSeq(),
  }),
  expr: or(
    and(
      eq(f('state'), 'Open'),
      isNull('decision'),
      isNull('decidedBy'),
      isNull('decidedAt'),
      isNull('approvedAmount'),
    ),
    and(
      notNull('decision'),
      notNull('decidedBy'),
      gte(f('decidedAt'), f('openedAt')),
      notNull('decisionReason'),
      eq(f('approvedAmount'), {
        $add: [f('fundedAmount'), f('unfundedAmount')],
      }),
      or(
        and(eq(f('decision'), 'NoCompensation'), eq(f('approvedAmount'), 0)),
        and(
          eq(f('decision'), 'Compensate'),
          notNull('protectedValue'),
          lte(f('approvedAmount'), f('protectedValue')),
        ),
      ),
      or(
        and(eq(f('state'), 'Decided'), eq(f('unfundedAmount'), 0)),
        and(eq(f('state'), 'Underfunded'), gte(f('unfundedAmount'), 1)),
      ),
    ),
  ),
  indexes: [
    index({ state: 1, openedAt: -1 }, 'point_incidents_state_idx'),
    index({ pointId: 1, openedAt: -1 }, 'point_incidents_point_idx'),
  ],
};

// Append-only and serialized under one lock: balanceAfter chains entries.
const fundSpec: CollectionSpec = {
  name: 'incident_fund_journal',
  access: 'appendOnly',
  schema: document({
    _id: t.uuid(),
    sequence: t.int(1),
    type: t.enum('Opening', 'CompensationApproved'),
    amount: t.int(1),
    incidentId: t.nuuid(),
    balanceAfter: t.int(0),
    createdAt: t.date(),
  }),
  expr: or(
    and(eq(f('type'), 'Opening'), isNull('incidentId')),
    and(eq(f('type'), 'CompensationApproved'), notNull('incidentId')),
  ),
  indexes: [
    unique({ sequence: 1 }, 'incident_fund_journal_sequence_key'),
    unique({ incidentId: 1 }, 'incident_fund_journal_incident_key', {
      incidentId: { $type: 'string' },
    }),
  ],
};

export const pointIncidentCollectionSpecs = [incidentSpec, fundSpec];

export const pointIncidentsMigration = {
  id: '0024-point-incidents',
  definition: {
    collections: pointIncidentCollectionSpecs,
    opening: INCIDENT_FUND_OPENING,
  },
  async up(db: Db) {
    await applyCollectionSpecs(db, pointIncidentCollectionSpecs);
    // POL-42 demo opening balance; never topped up automatically.
    await db.collection('incident_fund_journal').updateOne(
      { _id: INCIDENT_FUND_OPENING_ID as never },
      {
        $setOnInsert: {
          sequence: 1,
          type: 'Opening',
          amount: INCIDENT_FUND_OPENING,
          incidentId: null,
          balanceAfter: INCIDENT_FUND_OPENING,
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );
  },
};
