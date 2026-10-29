import { originGroups } from './source-origin.js';
import {
  evaluate,
  fingerprint,
  type RawSource,
  type PriceInput,
  type BookFacts,
} from './evidence.js';
const now = new Date('2026-10-29T00:00:00Z');
const source = (
  id: string,
  kind: RawSource['kind'],
  amount: number,
  url: string | null,
  sourceGroup?: string,
): RawSource => ({
  id,
  kind,
  amount,
  url,
  sourceGroup,
  label: `Independent-looking label ${id}`,
  condition: null,
  observedAt: now,
  isbn: null,
});
const input: PriceInput = {
  bookId: 'book',
  condition: 'Good',
  readable: true,
  hasMissingPages: false,
  missingEssentialContent: false,
  conditionNote: '',
};
const book: BookFacts = {
  id: 'book',
  title: 'Book',
  authors: ['Author'],
  publisher: null,
  publicationYear: null,
  language: 'vi',
  edition: '2026',
  category: 'Văn học',
  isbn: null,
  confirmed: true,
};
describe('source origin, not display label', () => {
  it('invalidates cached evidence when a website joins two curated organizations', () => {
    const before = [
      source('a', 'CoverPrice', 100000, 'https://publisher.com/a', 'publisher'),
      source('b', 'CompletedSale', 50000, 'https://independent.org/b', 'editorial'),
    ];
    const after = [before[0], { ...before[1], url: 'https://shop.publisher.com/b' }];
    expect(evaluate(input, book, before, now).level).toBe('Strong');
    expect(evaluate(input, book, after, now).level).toBe('Limited');
    expect(fingerprint(input, before)).not.toBe(fingerprint(input, after));
  });
  it('keeps curated cover-price priority over a newer retail price from the same origin', () => {
    const cover = source(
      'a',
      'CoverPrice',
      100000,
      'https://publisher.com/book',
    );
    const retail = {
      ...source('b', 'OnlineRetail', 60000, 'https://shop.publisher.com/book'),
      observedAt: new Date(+now + 1000),
    };
    const result = evaluate(
      input,
      book,
      [cover, retail],
      new Date(+now + 2000),
      { hasPhoto: true },
    );
    expect(result.bounds).toEqual({ low: 40000, high: 60000 });
    expect(
      result.sources.find((s) => s.kind === 'OnlineRetail')?.excluded,
    ).toBe('DuplicateSource');
    expect(
      result.sources.find((s) => s.kind === 'CoverPrice')?.excluded,
    ).toBeNull();
  });
  it('joins subdomains/tracking URLs and explicit organizations across sites transitively', () => {
    const groups = originGroups([
      { url: 'https://a.shop.com.vn/a?ref=1', sourceGroup: 'publisher-one' },
      { url: 'https://shop.com.vn/b', sourceGroup: 'publisher-two' },
      { url: 'https://different.org/x', sourceGroup: 'publisher-two' },
    ]);
    expect(new Set(groups).size).toBe(1);
    expect(originGroups([{ url: null }, { url: 'http://shop.com' }])).toEqual([
      null,
      null,
    ]);
  });
  it('does not inflate evidence when one website has multiple labels or observations', () => {
    const result = evaluate(
      input,
      book,
      [
        source('a', 'CoverPrice', 100000, 'https://shop.com/a'),
        source('b', 'OnlineRetail', 90000, 'https://www.shop.com/b'),
        source('c', 'CompletedSale', 50000, 'https://sales.shop.com/c'),
      ],
      now,
      { hasPhoto: true },
    );
    expect(result.level).toBe('Limited');
    expect(result.rules).toContain('R-LIMITED-FEW-SOURCES');
    expect(
      result.sources.filter((s) => s.excluded === 'DuplicateSource'),
    ).toHaveLength(1);
  });
  it('allows two proven origins, but legacy references without origin remain Limited', () => {
    expect(
      evaluate(
        input,
        book,
        [
          source('a', 'CoverPrice', 100000, 'https://publisher.com/a'),
          source('b', 'CompletedSale', 50000, null, 'editorial-team'),
        ],
        now,
        { hasPhoto: true },
      ).level,
    ).toBe('Strong');
    const legacy = evaluate(
      input,
      book,
      [
        source('a', 'CoverPrice', 100000, null),
        source('b', 'CompletedSale', 50000, null),
      ],
      now,
      { hasPhoto: true },
    );
    expect(legacy.level).toBe('Limited');
    expect(legacy.rules).toContain('R-LIMITED-SOURCE-ORIGIN');
  });
});
