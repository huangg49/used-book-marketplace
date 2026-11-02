import type { Db } from 'mongodb';
import { and, document, eq, f, index, isNull, notNull, or, t, type CollectionSpec } from '../schema-dsl.js';
import { withSystemOperations } from './0008-auctions.js';
import { LOCAL_DEMO_COMPLETION_MS, LOCAL_DEMO_COMPLETION_POLICY } from '../demo-completion-policy.js';

export const demoCompletionSpec: CollectionSpec = {
  name: 'local_demo_order_completions', access: 'mutable',
  schema: document({
    _id: t.uuid(), policy: t.enum(LOCAL_DEMO_COMPLETION_POLICY), sellerId: t.uuid(),
    shipmentId: t.uuid(), receiptId: t.uuid(), sourceVersion: t.int(3, 3),
    status: t.enum('Pending', 'Completed'), createdAt: t.date(), dueAt: t.date(),
    updatedAt: t.date(), completedAt: t.ndate(), completionReceiptId: t.nuuid(), lockSeq: t.lockSeq(),
  }),
  expr: and(
    eq(f('dueAt'), { $add: [f('createdAt'), LOCAL_DEMO_COMPLETION_MS] }),
    or(and(eq(f('status'), 'Pending'), isNull('completedAt'), isNull('completionReceiptId')),
      and(eq(f('status'), 'Completed'), notNull('completedAt'), notNull('completionReceiptId'), { $gte: [f('completedAt'), f('dueAt')] })),
  ),
  indexes: [index({ status: 1, dueAt: 1, _id: 1 }, 'local_demo_completion_due_idx')],
};

export function withLocalDemoCompletion(spec: CollectionSpec): CollectionSpec {
  if (['mutation_receipts', 'audit_events'].includes(spec.name))
    return withSystemOperations(spec, spec.name === 'mutation_receipts' ? 'operation' : 'action', [['OrderDemoCompletion', 'completeLocalDemoOrder']]);
  if (spec.name !== 'direct_orders') return spec;
  return {
    ...spec,
    schema: { ...spec.schema, properties: { ...spec.schema.properties, demoCompletionPolicy: t.enum(LOCAL_DEMO_COMPLETION_POLICY) } },
    expr: or(spec.expr!, and(
      eq(f('demoCompletionPolicy'), LOCAL_DEMO_COMPLETION_POLICY), eq(f('state'), 'Completed'), eq(f('version'), 5),
      notNull('paidAt'), notNull('completedAt'), eq(f('closedAt'), f('completedAt')),
      eq(f('deliveredAt'), f('completedAt')), isNull('inspectionDeadline'),
      isNull('cancellationRequestedAt'), isNull('cancellationReason'),
      { $gte: [f('completedAt'), f('paidAt')] },
    )),
  };
}

export function createLocalDemoCompletionMigration(previous: CollectionSpec[]) {
  const collections = [...previous.filter(s => ['direct_orders', 'mutation_receipts', 'audit_events'].includes(s.name)).map(withLocalDemoCompletion), demoCompletionSpec];
  return {
    id: '0054-local-demo-completion',
    definition: { policy: LOCAL_DEMO_COMPLETION_POLICY, delayMs: LOCAL_DEMO_COMPLETION_MS, collections },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
    },
  };
}
