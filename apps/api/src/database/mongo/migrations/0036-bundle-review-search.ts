import type { Db } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import { baselineCollections } from './0001-baseline-schema.js';
import { withBookBundles } from './0035-whole-book-bundles.js';
import { and, eq, f, isNull, or, t, type CollectionSpec } from '../schema-dsl.js';
const CHECKLIST = ['catalogMatches','photosClear','conditionDisclosed','readable','pricingValid','contentAppropriate'];
const normalizeSearch = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase().trim();

export function withBundleReviewSearch(spec: CollectionSpec): CollectionSpec {
  if (spec.name === 'listing_revisions') return { ...spec,
    schema: { ...spec.schema, properties: { ...(spec.schema.properties as Record<string, unknown>), bundleSearchText: t.str(14000) } },
  };
  if (spec.name !== 'listing_decisions') return spec;
  return { ...spec, expr: or(spec.expr, and(
    eq(f('decision'), 'Approve'), isNull('reason'),
    eq({ $size: { $objectToArray: f('checklist') } }, CHECKLIST.length + 1),
    ...CHECKLIST.map(key => eq(f(`checklist.${key}`), true)),
    eq(f('checklist.bundleContentsVerified'), true),
  )) };
}
const specs = baselineCollections.filter(spec => ['listing_revisions','listing_decisions'].includes(spec.name)).map(withBookBundles).map(withBundleReviewSearch);
export const bundleReviewSearchMigration = {
  id:'0036-bundle-review-search', definition:{collections:specs,backfill:'normalized whole bundle title/component labels'},
  async up(db: Db) {
    await applyCollectionSpecs(db,specs);
    const revisions=db.collection<{_id:string;bundle:{title:string;items:{label:string}[]}|null;bundleSearchText?:string}>('listing_revisions');
    for await (const row of revisions.find({bundle:{$ne:null},bundleSearchText:{$exists:false}})) {
      if (!row.bundle) continue;
      await revisions.updateOne({_id:row._id,bundleSearchText:{$exists:false}},{$set:{bundleSearchText:normalizeSearch([row.bundle.title,...row.bundle.items.map(item=>item.label)].join(' '))}});
    }
  },
};
