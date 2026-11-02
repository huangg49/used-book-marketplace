import type { Db, Document } from 'mongodb';
import { document, index, t, type CollectionSpec } from '../schema-dsl.js';

export function withSupportCases(spec: CollectionSpec): CollectionSpec {
  if (spec.name === 'member_notifications') {
    const properties = spec.schema.properties as Record<string, Document>;
    return {
      ...spec,
      schema: {
        ...spec.schema,
        properties: {
          ...properties,
          kind: {
            ...properties.kind,
            enum: [
              ...properties.kind.enum,
              'SupportUpdated',
              'ReviewModerated',
            ],
          },
          targetType: {
            ...properties.targetType,
            enum: [
              ...properties.targetType.enum,
              'SupportCase',
              'TransactionReview',
            ],
          },
        },
      },
    };
  }
  if (!['mutation_receipts', 'audit_events'].includes(spec.name)) return spec;
  const extend = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      const next = node.map(extend);
      return next.includes('$listingId') &&
        next.includes('$topupId') &&
        !next.includes('$supportCaseId')
        ? [...next, '$supportCaseId']
        : next;
    }
    if (node && typeof node === 'object')
      return Object.fromEntries(
        Object.entries(node).map(([k, v]) => [k, extend(v)]),
      );
    return node;
  };
  return {
    ...spec,
    schema: {
      ...spec.schema,
      properties: { ...spec.schema.properties, supportCaseId: t.nuuid() },
    },
    expr: extend(spec.expr) as Document,
  };
}
export const supportSpecs: CollectionSpec[] = [
  {
    name: 'support_cases',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      reporterId: t.uuid(),
      reporterName: t.str(120),
      kind: t.enum('Feedback', 'Bug', 'Violation', 'TransactionIssue'),
      title: t.str(160),
      target: {
        anyOf: [
          { bsonType: 'null' },
          document({
            type: t.enum(
              'DirectOrder',
              'Exchange',
              'PointOrder',
              'Auction',
              'Listing',
              'Review',
              'Member',
            ),
            id: t.uuid(),
          }),
        ],
      },
      involvedUserIds: { bsonType: 'array', items: t.uuid() },
      assigneeId: t.nuuid(),
      state: t.enum('Open', 'InReview', 'AwaitingMember', 'Answered', 'Closed'),
      version: t.int(1),
      messageCount: t.int(1, 200),
      createdAt: t.date(),
      updatedAt: t.date(),
      lockSeq: t.lockSeq(),
    }),
    indexes: [
      index(
        { reporterId: 1, createdAt: -1, _id: -1 },
        'support_reporter_created_idx',
      ),
      index({ state: 1, createdAt: -1, _id: -1 }, 'support_queue_idx'),
      index({ assigneeId: 1, state: 1, createdAt: -1 }, 'support_assignee_idx'),
    ],
  },
  {
    name: 'support_messages',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      caseId: t.uuid(),
      authorId: t.uuid(),
      authorName: t.str(120),
      role: t.enum('Member', 'Admin', 'System'),
      internal: t.bool(),
      text: t.str(5000),
      createdAt: t.date(),
    }),
    indexes: [
      index({ caseId: 1, createdAt: 1, _id: 1 }, 'support_messages_case_idx'),
    ],
  },
];
export function createSupportCasesMigration(previous: CollectionSpec[]) {
  const changed = previous.map(withSupportCases);
  return {
    id: '0050-support-cases',
    definition: {
      collections: [...changed, ...supportSpecs],
      policy: 'private-owner-independent-admin-text-evidence-no-money-v1',
    },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, [...changed, ...supportSpecs]);
    },
  };
}
