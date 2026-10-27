import type { Db } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import { baselineCollections } from './0001-baseline-schema.js';
import { and, eq, f, or, t, type CollectionSpec } from '../schema-dsl.js';

const conditions = ['LikeNew', 'Good', 'Fair', 'Worn'];
const item = {
  bsonType: 'object', additionalProperties: false, required: ['label', 'condition', 'notes'],
  properties: { label: { ...t.str(200), minLength: 1 }, condition: t.enum(...conditions), notes: t.str(500) },
};
const bundle = {
  bsonType: ['object', 'null'], additionalProperties: false,
  required: ['title', 'wholeOnly', 'exclusiveOwnershipDeclared', 'items'],
  properties: {
    title: { ...t.str(300), minLength: 1 },
    wholeOnly: { bsonType: 'bool', enum: [true] },
    exclusiveOwnershipDeclared: { bsonType: 'bool', enum: [true] },
    items: { bsonType: 'array', minItems: 2, maxItems: 50, uniqueItems: true, items: item },
  },
};
const items = { $ifNull: ['$bundle.items', []] };
const labels = { $map: { input: items, as: 'item', in: { $toLower: { $trim: { input: '$$item.label' } } } } };
export function withBookBundles(spec: CollectionSpec): CollectionSpec {
  if (spec.name !== 'listing_revisions') return spec;
  return { ...spec,
    schema: { ...spec.schema, properties: { ...(spec.schema.properties as Record<string, unknown>), bundle } },
    expr: and(spec.expr, or(
      eq({ $ifNull: ['$bundle', null] }, null),
      and(eq(f('mode'), 'Sale'), eq(f('exchangeValue'), null),
        eq({ $size: labels }, { $size: { $setUnion: [labels, []] } }),
        { $allElementsTrue: [{ $map: { input: labels, as: 'label', in: { $gt: [{ $strLenCP: '$$label' }, 0] } } }] },
        or(eq(f('condition'), null), eq({ $indexOfArray: [conditions, f('condition')] },
          { $max: { $map: { input: items, as: 'item', in: { $indexOfArray: [conditions, '$$item.condition'] } } } })),
      ),
    )),
  };
}
const specs = baselineCollections.filter(spec => spec.name === 'listing_revisions').map(withBookBundles);
export const wholeBookBundlesMigration = {
  id: '0035-whole-book-bundles', definition: { collections: specs },
  async up(db: Db) { await applyCollectionSpecs(db, specs); },
};
