import { ContractInput } from '../src/modules/commands/contract-input.service.js';
import { catalogFilters } from '../src/modules/catalog/catalog-classification.js';
import {
  compatibleAttributes,
  facetsFor,
  matchesClassification,
  categories,
  allCategories,
  facetDefinitions,
  facetRules,
  categoryDirectorySections,
  searchClassificationErrors,
  searchBranches,
  categoryPath,
  taxonomyVersion,
  classificationErrors,
} from '@used-books/api-contract/catalog-taxonomy';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { catalogVocabularyV2 } from '../src/database/mongo/migrations/0019-catalog-vocabulary-v2.js';
const input = new ContractInput();
const metadata = {
  title: 'Sách kiểm thử',
  authors: ['Tác giả'],
  publisher: null,
  publicationYear: null,
  language: 'vi',
  edition: null,
  category: 'Manga / Comic',
  isbn: null,
  categoryId: 'manga',
  attributes: { genre: ['action', 'fantasy'] },
  series: 'Tên bộ truyện',
};
it('accepts legacy requests and validates controlled classification on new requests', () => {
  expect(input.body('CreateCatalogRequest', { metadata })).toMatchObject({
    metadata: { categoryId: 'manga' },
  });
  const {
    categoryId: _categoryId,
    attributes: _attributes,
    series: _series,
    ...legacy
  } = metadata;
  expect(
    input.body('CreateCatalogRequest', { metadata: legacy }),
  ).toMatchObject({ metadata: legacy });
  for (const extra of [
    { category: 'Khác' },
    { categoryId: 'unknown' },
    { attributes: { skill: ['writing'] } },
    { attributes: { genre: ['action', 'action'] } },
    { categoryId: null },
  ])
    expect(() =>
      input.body('CreateCatalogRequest', {
        metadata: { ...metadata, ...extra },
      }),
    ).toThrow();
});
it('keeps vocabulary, contract, frozen migration and navigation exhaustive and compatible', () => {
  const contract = parse(
    readFileSync(
      new URL('../../../packages/api-contract/openapi.yaml', import.meta.url),
      'utf8',
    ),
  );
  expect(taxonomyVersion).toBe('catalog-v2');
  expect(categories).toHaveLength(17);
  expect(allCategories).toHaveLength(72);
  expect(new Set(allCategories.map((c) => c.id)).size).toBe(72);
  expect(categoryDirectorySections.flatMap((s) => s.ids).sort()).toEqual(
    categories.map((c) => c.id).sort(),
  );
  expect(contract.components.schemas.CatalogCategoryId.enum).toEqual(
    allCategories.map((c) => c.id),
  );
  expect(catalogVocabularyV2.categoryIds).toEqual(
    allCategories.map((c) => c.id),
  );
  for (const f of facetDefinitions) {
    expect(new Set(f.options.map((o) => o.id)).size, f.id).toBe(
      f.options.length,
    );
    expect(
      contract.components.schemas.CatalogAttributes.properties[f.id].items.enum,
    ).toEqual(f.options.map((o) => o.id));
    expect(
      catalogVocabularyV2.attributes[
        f.id as keyof typeof catalogVocabularyV2.attributes
      ],
    ).toEqual(f.options.map((o) => o.id));
  }
  for (const c of allCategories) {
    expect(categoryPath(c.id).at(-1)?.id).toBe(c.id);
    expect(c.facets.length).toBeLessThanOrEqual(5);
    for (const id of c.facets)
      expect(facetDefinitions.some((f) => f.id === id)).toBe(true);
    for (const op of ['listBooks', 'listPublicListings'])
      expect(input.query(op, { categoryId: c.id })).toMatchObject({
        categoryId: c.id,
      });
  }
  for (const [key, values] of Object.entries(facetRules.restrictions)) {
    const separator = key.lastIndexOf('.'),
      category = key.slice(0, separator),
      field = key.slice(separator + 1);
    expect(
      allCategories.some((c) => c.id === category),
      key,
    ).toBe(true);
    expect(
      values.every((v) =>
        facetDefinitions
          .find((f) => f.id === field)
          ?.options.some((o) => o.id === v),
      ),
      key,
    ).toBe(true);
  }
});
it('searches compatible descendant branches without weakening submitted metadata', () => {
  const attributes = {
    purpose: ['exam'],
    level: ['n3', 'toeic'],
    skill: ['grammar'],
  };
  expect(searchClassificationErrors('languages', attributes)).toEqual([]);
  expect(searchBranches('languages', attributes)).toEqual([
    {
      categoryId: 'languages.en',
      attributes: { purpose: ['exam'], level: ['toeic'], skill: ['grammar'] },
    },
    {
      categoryId: 'languages.ja',
      attributes: { purpose: ['exam'], level: ['n3'], skill: ['grammar'] },
    },
  ]);
  expect(classificationErrors('languages', attributes)).toContain('level');
  expect(searchClassificationErrors('languages.en', attributes)).toContain(
    'level',
  );
  expect(searchClassificationErrors('languages', { level: ['n3'] })).toContain(
    'level',
  );
  expect(compatibleAttributes('languages.en', attributes, 'search')).toEqual({
    purpose: ['exam'],
    level: ['toeic'],
    skill: ['grammar'],
  });
  expect(
    catalogFilters({
      categoryId: 'languages',
      facets: JSON.stringify(attributes),
    }).taxonomyVersion,
  ).toBe('catalog-v2');
});
it('applies profiles to every new branch, rejects cross-domain input and preserves v1 attributes', () => {
  for (const c of allCategories) {
    const attributes = Object.fromEntries(
      facetsFor(c.id)
        .filter((f) => f.options.length)
        .map((f) => [f.id, [f.options[0]!.id]]),
    );
    expect(classificationErrors(c.id, attributes), c.id).toEqual([]);
    expect(() =>
      input.body('CreateCatalogRequest', {
        metadata: {
          ...metadata,
          category: c.label,
          categoryId: c.id,
          attributes,
          series: null,
        },
      }),
    ).not.toThrow();
  }
  expect(
    classificationErrors('society.philosophy', { lawField: ['civil'] }),
  ).toContain('lawField');
  expect(
    classificationErrors('business.marketing', { businessTopic: ['tax'] }),
  ).toContain('businessTopic');
  expect(classificationErrors('children', { form: ['novel'] })).toContain(
    'form',
  );
  expect(
    classificationErrors('history.geography', {
      topic: ['politics'],
      period: ['modern'],
    }),
  ).toEqual([]);
  expect(
    searchClassificationErrors('arts', {
      topic: ['music-theory'],
      artMedium: ['pencil'],
    }),
  ).not.toEqual([]);
  expect(
    searchBranches('arts', {
      topic: ['music-theory'],
      artMedium: ['instrument'],
    }),
  ).toEqual([
    {
      categoryId: 'arts.music',
      attributes: { topic: ['music-theory'], artMedium: ['instrument'] },
    },
  ]);
  expect(
    classificationErrors('manga', { genre: Array(17).fill('action') }),
  ).toContain('genre');
});
it('enforces language-specific exams, educational dependencies and rejects malformed facets', () => {
  expect(() =>
    catalogFilters({
      categoryId: 'languages.ja',
      facets: JSON.stringify({ purpose: ['exam'], level: ['ielts'] }),
    }),
  ).toThrow();
  expect(() =>
    catalogFilters({
      categoryId: 'education',
      facets: JSON.stringify({ schoolStage: ['secondary'], grade: ['3'] }),
    }),
  ).toThrow();
  expect(() =>
    catalogFilters({
      categoryId: 'education',
      facets: JSON.stringify({ grade: ['3'] }),
    }),
  ).toThrow();
  for (const facets of [
    'null',
    '[]',
    '{"genre":"action"}',
    '{"schoolStage":{"length":1}}',
    '{"$where":["x"]}',
    '{',
  ])
    expect(() => catalogFilters({ categoryId: 'manga', facets })).toThrow();
  expect(() => catalogFilters({ facets: '{"genre":["action"]}' })).toThrow();
  expect(() =>
    catalogFilters({ categoryId: 'science', series: 'Naruto' }),
  ).toThrow();
  expect(
    catalogFilters({
      categoryId: 'languages.ja',
      facets: '{"purpose":["exam"],"level":["n3"]}',
    }).attributes.level,
  ).toEqual(['n3']);
});
it('normalizes facet order for cursor scope without widening incompatible selections', () => {
  expect(
    catalogFilters({
      categoryId: 'manga',
      facets: '{"genre":["fantasy","action"],"audience":["shounen"]}',
    }),
  ).toEqual(
    catalogFilters({
      categoryId: 'manga',
      facets: '{"audience":["shounen"],"genre":["action","fantasy"]}',
    }),
  );
  expect(
    compatibleAttributes('languages.en', {
      purpose: ['exam'],
      level: ['n3'],
      genre: ['action'],
      skill: ['reading'],
    }),
  ).toEqual({ purpose: ['exam'], skill: ['reading'] });
  expect(
    compatibleAttributes('education', {
      schoolStage: ['high'],
      grade: ['3', '10'],
    }),
  ).toEqual({ schoolStage: ['high'], grade: ['10'] });
  expect(
    facetsFor('languages.ja', { purpose: ['exam'] })
      .find((f) => f.id === 'level')
      ?.options.map((o) => o.id),
  ).toContain('n3');
});
it('uses OR within and AND between facets, descendant categories and distinct learning/text languages', () => {
  const book = {
    category: 'Tiếng Nhật',
    categoryId: 'languages.ja',
    language: 'vi',
    attributes: { purpose: ['exam'], level: ['n3'], skill: ['grammar'] },
  };
  expect(
    matchesClassification(book, {
      categoryId: 'languages',
      language: 'vi',
      attributes: { skill: ['reading', 'grammar'], level: ['n3'] },
    }),
  ).toBe(true);
  expect(matchesClassification(book, { language: 'ja' })).toBe(false);
  expect(
    matchesClassification(book, {
      attributes: { skill: ['reading'], level: ['n3'] },
    }),
  ).toBe(false);
});
