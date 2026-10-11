import type { CollectionSpec } from '../schema-dsl.js';
// Frozen v1 vocabulary: later taxonomy changes must use a NEW migration.
const taxonomyVersion = 'catalog-v1';
const allCategories = [
  { id: 'manga' },
  { id: 'light-novel' },
  { id: 'literature' },
  { id: 'languages' },
  { id: 'languages.en' },
  { id: 'languages.ja' },
  { id: 'languages.ko' },
  { id: 'languages.zh' },
  { id: 'languages.other' },
  { id: 'education' },
  { id: 'business' },
  { id: 'business.management' },
  { id: 'business.marketing' },
  { id: 'business.finance' },
  { id: 'business.startup' },
  { id: 'business.economics' },
  { id: 'psychology' },
  { id: 'psychology.psychology' },
  { id: 'psychology.skills' },
  { id: 'children' },
  { id: 'science' },
  { id: 'science.natural' },
  { id: 'science.technology' },
  { id: 'science.space' },
  { id: 'science.environment' },
  { id: 'history' },
  { id: 'history.history' },
  { id: 'history.geography' },
  { id: 'other' },
];
const facetDefinitions = [
  {
    id: 'genre',
    options: [
      { id: 'action' },
      { id: 'adventure' },
      { id: 'fantasy' },
      { id: 'romance' },
      { id: 'comedy' },
      { id: 'drama' },
      { id: 'mystery' },
      { id: 'horror' },
      { id: 'scifi' },
      { id: 'historical' },
    ],
  },
  {
    id: 'audience',
    options: [
      { id: 'shounen' },
      { id: 'shoujo' },
      { id: 'seinen' },
      { id: 'josei' },
      { id: 'kodomo' },
    ],
  },
  {
    id: 'setting',
    options: [
      { id: 'school' },
      { id: 'isekai' },
      { id: 'daily' },
      { id: 'apocalypse' },
      { id: 'supernatural' },
    ],
  },
  {
    id: 'form',
    options: [
      { id: 'novel' },
      { id: 'short' },
      { id: 'essay' },
      { id: 'poetry' },
      { id: 'memoir' },
      { id: 'picture' },
      { id: 'activity' },
      { id: 'story' },
    ],
  },
  {
    id: 'purpose',
    options: [
      { id: 'general' },
      { id: 'communication' },
      { id: 'exam' },
      { id: 'textbook' },
      { id: 'workbook' },
      { id: 'reference' },
    ],
  },
  {
    id: 'level',
    options: [
      { id: 'beginner' },
      { id: 'intermediate' },
      { id: 'advanced' },
      { id: 'n5' },
      { id: 'n4' },
      { id: 'n3' },
      { id: 'n2' },
      { id: 'n1' },
      { id: 'ielts' },
      { id: 'toeic' },
      { id: 'hsk' },
      { id: 'topik' },
    ],
  },
  {
    id: 'skill',
    options: [
      { id: 'listening' },
      { id: 'speaking' },
      { id: 'reading' },
      { id: 'writing' },
      { id: 'grammar' },
      { id: 'vocabulary' },
      { id: 'characters' },
    ],
  },
  {
    id: 'schoolStage',
    options: [
      { id: 'primary' },
      { id: 'secondary' },
      { id: 'high' },
      { id: 'university' },
    ],
  },
  {
    id: 'grade',
    options: [
      { id: '1' },
      { id: '2' },
      { id: '3' },
      { id: '4' },
      { id: '5' },
      { id: '6' },
      { id: '7' },
      { id: '8' },
      { id: '9' },
      { id: '10' },
      { id: '11' },
      { id: '12' },
    ],
  },
  {
    id: 'subject',
    options: [
      { id: 'math' },
      { id: 'literature' },
      { id: 'english' },
      { id: 'physics' },
      { id: 'chemistry' },
      { id: 'biology' },
      { id: 'history' },
      { id: 'geography' },
      { id: 'computing' },
      { id: 'civics' },
    ],
  },
  {
    id: 'reader',
    options: [
      { id: 'student' },
      { id: 'professional' },
      { id: 'manager' },
      { id: 'entrepreneur' },
      { id: 'parent' },
      { id: 'teen' },
      { id: 'general' },
    ],
  },
  {
    id: 'topic',
    options: [
      { id: 'habits' },
      { id: 'communication' },
      { id: 'emotion' },
      { id: 'relationships' },
      { id: 'career' },
      { id: 'animals' },
      { id: 'nature' },
      { id: 'discovery' },
      { id: 'culture' },
      { id: 'politics' },
      { id: 'civilization' },
    ],
  },
  {
    id: 'age',
    options: [{ id: '0-3' }, { id: '4-6' }, { id: '7-10' }, { id: '11-15' }],
  },
  {
    id: 'depth',
    options: [{ id: 'intro' }, { id: 'popular' }, { id: 'specialist' }],
  },
  {
    id: 'region',
    options: [
      { id: 'vietnam' },
      { id: 'asia' },
      { id: 'europe' },
      { id: 'americas' },
      { id: 'world' },
    ],
  },
  {
    id: 'period',
    options: [
      { id: 'ancient' },
      { id: 'medieval' },
      { id: 'modern' },
      { id: 'contemporary' },
    ],
  },
];
import { baselineCollections } from './0001-baseline-schema.js';
import { applyCollectionSpecs, type Migration } from './index.js';

// Additive, optional fields: do not rewrite append-only confirmed revisions or receipts.
// Each submitted classification is reviewed with the catalog revision that owns it.
export function withCatalogClassification(
  spec: CollectionSpec,
): CollectionSpec {
  if (spec.name !== 'catalog_revisions') return spec;
  return {
    ...spec,
    schema: {
      ...spec.schema,
      properties: {
        ...spec.schema.properties,
        categoryId: {
          bsonType: ['string', 'null'],
          enum: [...allCategories.map((c) => c.id), null],
        },
        series: { bsonType: ['string', 'null'], minLength: 1, maxLength: 120 },
        attributes: {
          bsonType: 'object',
          additionalProperties: false,
          properties: Object.fromEntries(
            facetDefinitions.map((f) => [
              f.id,
              {
                bsonType: 'array',
                minItems: 1,
                maxItems: 16,
                uniqueItems: true,
                items: { bsonType: 'string', enum: f.options.map((o) => o.id) },
              },
            ]),
          ),
        },
      },
    },
    indexes: [
      ...spec.indexes,
      { key: { categoryId: 1 }, name: 'catalog_revisions_category_idx' },
    ],
  };
}
const specs = baselineCollections
  .filter((s) => s.name === 'catalog_revisions')
  .map(withCatalogClassification);
export const catalogClassificationMigration: Migration = {
  id: '0016-catalog-classification',
  definition: { version: taxonomyVersion, specs },
  up: (db) => applyCollectionSpecs(db, specs),
};
