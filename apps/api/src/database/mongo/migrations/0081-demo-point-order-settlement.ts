import { isDeepStrictEqual } from 'node:util';
import type { Db, Document } from 'mongodb';
import { and, eq, f, gte, lt, or, t, type CollectionSpec } from '../schema-dsl.js';

export function createDemoPointOrderSettlementMigration(previous: CollectionSpec) {
  const marker = 'demoInspectionCompletedAt';
  const noMarker = eq({ $type: f(marker) }, 'missing');
  const earlyCompletion = and(
    eq(f('state'), 'Completed'),
    eq(f(marker), f('closedAt')),
    gte(f(marker), f('collectedAt')),
    lt(f(marker), f('inspectionDeadline')),
  );
  const elapsed = gte(f('closedAt'), f('inspectionDeadline'));
  let replaced = 0;
  function allowDemoCompletion(node: unknown): unknown {
    if (isDeepStrictEqual(node, elapsed)) {
      replaced += 1;
      return or(and(noMarker, elapsed), earlyCompletion);
    }
    if (Array.isArray(node)) return node.map(allowDemoCompletion);
    if (node && typeof node === 'object')
      return Object.fromEntries(
        Object.entries(node).map(([key, value]) => [key, allowDemoCompletion(value)]),
      );
    return node;
  }

  const stateRules = allowDemoCompletion(previous.expr) as Document;
  if (replaced !== 1) throw new Error('Expected one point-order settlement deadline rule');

  // Optional on existing orders. A demo marker is valid only on an early completion.
  const collections = [{
    ...previous,
    schema: {
      ...previous.schema,
      properties: { ...previous.schema.properties, [marker]: t.date() },
    },
    expr: and(stateRules, or(noMarker, earlyCompletion)),
  }];
  return {
    id: '0081-demo-point-order-settlement',
    definition: { collections },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
    },
  };
}
