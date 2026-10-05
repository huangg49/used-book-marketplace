import { describe, expect, it } from 'vitest';
import {
  evaluate,
  fingerprint,
  sanitizeNote,
  type BookFacts,
  type PriceInput,
  type RawSource,
} from './evidence.js';
import { checkOutput, InvalidModelOutput } from './output-check.js';

const SALE_MAX_FOR_TEST = 1_000_000;
const now = new Date('2026-10-05T00:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const book: BookFacts = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Dế Mèn phiêu lưu ký',
  authors: ['Tô Hoài'],
  publisher: 'NXB Kim Đồng',
  publicationYear: 2020,
  language: 'vi',
  edition: 'Tái bản lần thứ 12',
  category: 'Thiếu nhi',
  isbn: '9786042000000',
  confirmed: true,
};
const input: PriceInput = {
  bookId: book.id,
  condition: 'Good',
  readable: true,
  hasMissingPages: false,
  missingEssentialContent: false,
  conditionNote: '',
};
const src = (
  id: string,
  amount: number,
  over: Partial<RawSource> = {},
): RawSource => ({
  id,
  kind: 'EditorialReference',
  amount,
  condition: null,
  label: `Nguồn ${id}`,
  url: null,
  observedAt: daysAgo(30),
  isbn: null,
  ...over,
});

describe('price evidence rules', () => {
  it('refuses unreadable copies and missing essential content without a model', () => {
    const a = evaluate({ ...input, readable: false }, book, [src('a', 80_000)], now);
    expect(a.status).toBe('Refused');
    expect(a.rules).toContain('R-REFUSE-UNREADABLE');
    const b = evaluate(
      { ...input, missingEssentialContent: true },
      book,
      [src('a', 80_000)],
      now,
    );
    expect(b.status).toBe('Refused');
    expect(b.bounds).toBeNull();
  });

  it('asks for condition answers and sources before estimating', () => {
    const e = evaluate(
      { ...input, condition: null, hasMissingPages: null },
      book,
      [],
      now,
    );
    expect(e.status).toBe('NeedsMoreData');
    expect(e.rules).toEqual(
      expect.arrayContaining(['R-NEED-CONDITION', 'R-NEED-CONDITION-ANSWERS', 'R-NEED-SOURCES']),
    );
    expect(e.missing.length).toBeGreaterThanOrEqual(3);
  });

  it('is Strong only with 3+ fresh, independent, non-asking sources on a known edition', () => {
    const strong = evaluate(
      input,
      book,
      [
        src('a', 90_000, { kind: 'CoverPrice', label: 'Kim Đồng' }),
        src('b', 60_000, { label: 'Biên tập A' }),
        src('d', 58_000, { label: 'Biên tập B' }),
        src('c', 5_000, { kind: 'InternalAsking', label: 'Giá rao trên Lật lại' }),
      ],
      now,
    );
    expect(strong.level).toBe('Strong');
    // Good: 40-60% of the 90.000 d cover price. The asking price is shown
    // but neither lowers the range nor counts.
    expect(strong.bounds).toEqual({ low: 36_000, high: 54_000 });
    expect(strong.rules).toContain('R-BAND-GOOD');
    expect(strong.sources.find((s) => s.label === 'Giá rao trên Lật lại')?.excluded).toBe(
      'AskingPrice',
    );
    expect(strong.rules).toContain('R-EXCLUDED-ASKING');
  });

  it('excludes other editions, stale data and outliers and reports them', () => {
    const e = evaluate(
      input,
      book,
      [
        src('a', 60_000, { label: 'A' }),
        src('b', 62_000, { label: 'B' }),
        src('c', 64_000, { label: 'C' }),
        src('d', 900_000, { label: 'D' }),
        src('e', 61_000, { label: 'E', isbn: '9780000000002' }),
        src('f', 58_000, { label: 'F', observedAt: daysAgo(900) }),
      ],
      now,
    );
    const why = Object.fromEntries(e.sources.map((s) => [s.label, s.excluded]));
    expect(why).toMatchObject({ D: 'Outlier', E: 'OtherEdition', F: 'Stale' });
    expect(e.used.map((s) => s.label).sort()).toEqual(['A', 'B', 'C']);
    expect(e.rules).toEqual(
      expect.arrayContaining([
        'R-EXCLUDED-OUTLIER',
        'R-EXCLUDED-OTHER-EDITION',
        'R-EXCLUDED-STALE',
      ]),
    );
  });

  it('caps unverified editions and pending catalog books at Limited', () => {
    const e = evaluate(
      input,
      { ...book, isbn: null, edition: null, confirmed: false },
      [src('a', 60_000), src('b', 62_000), src('c', 64_000)],
      now,
    );
    expect(e.level).toBe('Limited');
    expect(e.rules).toEqual(
      expect.arrayContaining([
        'R-LIMITED-EDITION-UNVERIFIED',
        'R-LIMITED-CATALOG-PENDING',
      ]),
    );
  });

  it.each([
    ['LikeNew', false, 'R-BAND-LIKENEW', { low: 66_000, high: 90_000 }],
    ['Good', false, 'R-BAND-GOOD', { low: 48_000, high: 72_000 }],
    ['Fair', false, 'R-BAND-FAIR', { low: 30_000, high: 54_000 }],
    ['Worn', false, 'R-BAND-WORN', { low: 18_000, high: 36_000 }],
    // Missing pages cap the band at Fair; Worn stays Worn.
    ['LikeNew', true, 'R-BAND-FAIR', { low: 30_000, high: 54_000 }],
    ['Worn', true, 'R-BAND-WORN', { low: 18_000, high: 36_000 }],
  ] as const)('bands %s (missing pages: %s) on the new-book price', (condition, missingPages, rule, bounds) => {
    const e = evaluate(
      { ...input, condition, hasMissingPages: missingPages },
      book,
      [src('a', 120_000, { kind: 'CoverPrice' }), src('b', 100_000, { label: 'Biên tập' })],
      now,
    );
    expect(e.rules).toContain(rule);
    expect(e.bounds).toEqual(bounds);
  });

  it('keeps used-price bounds without a new-book price, and clamps bands to POL-16', () => {
    const used = evaluate(input, book, [src('a', 60_000), src('b', 50_000, { label: 'B' })], now);
    expect(used.rules).toEqual(expect.arrayContaining(['R-BAND-USED-PRICES', 'R-LIMITED-NO-NEW-PRICE']));
    expect(used.bounds).toEqual({ low: 15_000, high: 66_000 });
    const cheap = evaluate({ ...input, condition: 'Worn' }, book, [src('a', 30_000, { kind: 'CoverPrice' })], now);
    expect(cheap.status).toBe('Refused');
    expect(cheap.rules).toContain('R-REFUSE-BELOW-MIN');
    const dear = evaluate({ ...input, condition: 'LikeNew' }, book, [src('a', 1_500_000, { kind: 'CoverPrice' })], now);
    expect(dear.bounds).toEqual({ low: 825_000, high: SALE_MAX_FOR_TEST });
    const tooDear = evaluate({ ...input, condition: 'LikeNew' }, book, [src('a', 2_000_000, { kind: 'CoverPrice' })], now);
    expect(tooDear.rules).toContain('R-REFUSE-ABOVE-MAX');
  });

  it('does not estimate from asking prices alone, however many', () => {
    const e = evaluate(
      input,
      book,
      [1, 2, 3].map((i) =>
        src(`x${i}`, 50_000 + i * 1000, {
          kind: 'InternalAsking',
          label: `Giá rao ${i}`,
        }),
      ),
      now,
    );
    expect(e.status).toBe('NeedsMoreData');
    expect(e.bounds).toBeNull();
    expect(e.rules).toEqual(
      expect.arrayContaining(['R-NEED-SOURCES', 'R-EXCLUDED-ASKING']),
    );
    expect(e.missing.join(' ')).toContain('Chỉ có giá rao');
  });

  it('asks for a photo before pricing and keys the cache on it', () => {
    const raw = [src('a', 60_000, { kind: 'CoverPrice' })];
    const e = evaluate(input, book, raw, now, { hasPhoto: false });
    expect(e.status).toBe('NeedsMoreData');
    expect(e.rules).toContain('R-NEED-PHOTO');
    expect(evaluate(input, book, raw, now, { hasPhoto: true }).status).toBe('Proceed');
    expect(fingerprint(input, raw, { hasPhoto: false })).not.toBe(
      fingerprint(input, raw, { hasPhoto: true }),
    );
  });

  it('refuses when sourced prices fall outside POL-16', () => {
    expect(evaluate(input, book, [src('a', 5_000)], now).rules).toContain(
      'R-REFUSE-BELOW-MIN',
    );
    expect(
      evaluate(input, book, [src('a', 5_000_000)], now).rules,
    ).toContain('R-REFUSE-ABOVE-MAX');
  });

  it('removes contact-like text and changes the fingerprint with the reference set', () => {
    expect(
      sanitizeNote('Gọi 0901 234 567 hoặc a@b.vn, xem https://x.y nhé'),
    ).toBe('Gọi [đã ẩn]hoặc [đã ẩn] xem [đã ẩn] nhé');
    const one = fingerprint(input, [src('a', 60_000)]);
    expect(fingerprint(input, [src('a', 60_000)])).toBe(one);
    expect(fingerprint(input, [src('a', 61_000)])).not.toBe(one);
    expect(fingerprint({ ...input, condition: 'Fair' }, [src('a', 60_000)])).not.toBe(one);
  });
});

describe('model output check', () => {
  const evidence = evaluate(
    input,
    book,
    [src('a', 120_000, { kind: 'CoverPrice', label: 'K' }), src('b', 60_000, { label: 'B' })],
    now,
  );
  // Good band on a 120.000 d cover price: 48.000-72.000 d.
  const good = {
    low: 50_400,
    high: 60_000,
    factors: [{ text: 'Giá bìa 120.000 đ; sách còn tốt.', sourceRefs: ['s1', 'condition'] }],
    missing: [],
  };

  it('accepts a bounded, cited answer and rounds to 1000', () => {
    expect(checkOutput(good, evidence)).toMatchObject({ low: 50_000, high: 60_000 });
  });

  it.each([
    ['not an object', 'text'],
    ['extra keys', { ...good, confidence: 0.93 }],
    ['out of bounds', { ...good, high: 500_000 }],
    ['low above high', { ...good, low: 70_000, high: 60_000 }],
    ['too wide', { ...good, low: 20_000, high: 60_000 }],
    ['unknown source', { ...good, factors: [{ text: 'x', sourceRefs: ['s9'] }] }],
    ['condition only', { ...good, factors: [{ text: 'x', sourceRefs: ['condition'] }] }],
    ['link in text', { ...good, factors: [{ text: 'xem https://a.b', sourceRefs: ['s1'] }] }],
    ['no factors', { ...good, factors: [] }],
    ['float', { ...good, low: 45_000.5 }],
  ])('rejects %s', (_name, output) => {
    expect(() => checkOutput(output, evidence)).toThrow(InvalidModelOutput);
  });

  it('never accepts output for a refused or incomplete evidence set', () => {
    const refused = evaluate({ ...input, readable: false }, book, [src('a', 60_000)], now);
    expect(() => checkOutput(good, refused)).toThrow(InvalidModelOutput);
  });
});
