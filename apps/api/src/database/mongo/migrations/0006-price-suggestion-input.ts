import type { Db } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import { priceAssistSpecs, priceSuggestionSpec } from './0005-price-assist.js';
import { document, t, type CollectionSpec } from '../schema-dsl.js';

// Each suggestion keeps the inputs it was made for (book, condition and the
// three condition answers) so a save can be checked against them. Records
// written before this migration hold null and can no longer be applied.
export const priceSuggestionInputSpec: CollectionSpec = {
  ...priceSuggestionSpec,
  schema: document({
    ...(priceSuggestionSpec.schema.properties as Record<string, Record<string, unknown>>),
    input: t.nobject(),
  }),
};

export const priceAssistSpecsV2 = priceAssistSpecs.map((spec) =>
  spec.name === priceSuggestionInputSpec.name ? priceSuggestionInputSpec : spec,
);

export const priceSuggestionInputMigration = {
  id: '0006-price-suggestion-input',
  definition: priceSuggestionInputSpec,
  up: async (db: Db) => {
    await db
      .collection('price_suggestions')
      .updateMany({ input: { $exists: false } }, { $set: { input: null } });
    await applyCollectionSpecs(db, [priceSuggestionInputSpec]);
  },
};
