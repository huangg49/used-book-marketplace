import { ContractInput } from '../src/modules/commands/contract-input.service.js';
import { catalogFilters } from '../src/modules/catalog/catalog-classification.js';
import {
  compatibleAttributes,
  facetsFor,
  matchesClassification,
} from '@used-books/api-contract/catalog-taxonomy';
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
