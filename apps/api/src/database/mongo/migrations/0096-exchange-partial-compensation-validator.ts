import type { Db } from 'mongodb';
import {
  and,
  eq,
  f,
  isNull,
  notNull,
  or,
  type CollectionSpec,
} from '../schema-dsl.js';

const closedReturnResolutionExpr = or(
  eq({ $type: f('returnResolution') }, 'missing'),
  and(
    eq(f('returnResolution.phase'), 'Closed'),
    eq(f('status'), 'Cancelled'),
    notNull('returnResolution.outcome'),
    notNull('returnResolution.settlementReceiptId'),
  ),
  and(
    eq(f('returnResolution.phase'), 'Closed'),
    eq(f('status'), 'Completed'),
    eq(f('returnResolution.outcome'), 'Compensated'),
    notNull('returnResolution.settlementReceiptId'),
    notNull('resolutionCompensationAmount'),
  ),
  and(
    { $ne: [f('returnResolution.phase'), 'Closed'] },
    eq(f('status'), 'ResolutionPending'),
    isNull('returnResolution.outcome'),
    isNull('returnResolution.settlementReceiptId'),
  ),
);

function isLegacyReturnResolutionOr(node: unknown): boolean {
  if (!node || typeof node !== 'object' || !('$or' in node)) return false;
  const branches = (node as { $or?: unknown }).$or;
  if (!Array.isArray(branches) || branches.length < 3) return false;
  const first = branches[0] as { $eq?: unknown[] } | undefined;
  return (
    Array.isArray(first?.$eq) &&
    first.$eq[1] === 'missing' &&
    typeof first.$eq[0] === 'object' &&
    first.$eq[0] !== null &&
    (first.$eq[0] as { $type?: unknown }).$type === '$returnResolution'
  );
}

function replaceReturnResolutionClause(node: unknown): {
  value: unknown;
  replaced: boolean;
} {
  if (isLegacyReturnResolutionOr(node)) {
    return { value: closedReturnResolutionExpr, replaced: true };
  }
  if (node && typeof node === 'object' && '$and' in node) {
    const items = (node as { $and?: unknown }).$and;
    if (Array.isArray(items)) {
      let replaced = false;
      const next = items.map((item) => {
        if (replaced) return item;
        const result = replaceReturnResolutionClause(item);
        if (result.replaced) replaced = true;
        return result.value;
      });
      if (replaced) return { value: { $and: next }, replaced: true };
    }
  }
  return { value: node, replaced: false };
}

export function withExchangePartialCompensationValidator(
  spec: CollectionSpec,
): CollectionSpec {
  if (spec.name !== 'exchanges') return spec;
  const { value, replaced } = replaceReturnResolutionClause(spec.expr);
  if (!replaced) {
    throw new Error(
      'Expected legacy returnResolution $expr clause in exchanges collection spec',
    );
  }
  return {
    ...spec,
    expr: value as Record<string, unknown>,
  };
}

export function createExchangePartialCompensationValidatorMigration(
  previous: CollectionSpec,
) {
  const collections = [withExchangePartialCompensationValidator(previous)];
  return {
    id: '0096-exchange-partial-compensation-validator',
    definition: { collections },
    async up(db: Db) {
      const { applyCollectionSpecs, currentCollections } = await import(
        './index.js'
      );
      const currentExchange = currentCollections().find(
        (spec) => spec.name === 'exchanges',
      );
      if (!currentExchange) {
        throw new Error('Expected current Exchange collection spec');
      }
      await applyCollectionSpecs(db, [currentExchange]);
    },
  };
}
