import type { AutofillFields } from '../../src/modules/autofill-assist/autofill-check.js';
export type ExpectedAutofill = {
  title: string;
  authors?: string[];
  isbn?: string | null;
  publisher?: string | null;
  publicationYear?: number | null;
  edition?: string | null;
  language?: string | null;
};
const exact = (s: string) =>
  s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const loose = (s: string) =>
  exact(s).normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');
const name = (s: string) => exact(s).replace(/[\s·・-]+/g, '');
const digits = (s: string | null | undefined) =>
  (s ?? '').replace(/[^0-9X]/gi, '').toUpperCase();
export function scoreAutofill(
  expected: ExpectedAutofill,
  fields: AutofillFields | null,
) {
  const scored = !!expected.title.trim(),
    title = fields?.title;
  const expectedIsbn = digits(expected.isbn),
    readIsbn = digits(fields?.isbn);
  const field = (
    key: 'publisher' | 'publicationYear' | 'edition' | 'language',
  ) => {
    if (!(key in expected)) return null;
    const one = expected[key],
      two = fields?.[key] ?? null;
    return typeof one === 'string' && typeof two === 'string'
      ? exact(one) === exact(two)
      : one === two;
  };
  return {
    scored,
    titleExact: scored
      ? !!title && exact(title) === exact(expected.title)
      : null,
    titleIgnoringAccents: scored
      ? !!title && loose(title) === loose(expected.title)
      : null,
    authorsFound: expected.authors?.length
      ? expected.authors.every((author) =>
          fields?.authors.some((read) => name(read) === name(author)),
        )
      : null,
    isbnWrong:
      'isbn' in expected ? !!readIsbn && readIsbn !== expectedIsbn : null,
    isbnFound: expectedIsbn ? readIsbn === expectedIsbn : null,
    publisherExact: field('publisher'),
    publicationYearExact: field('publicationYear'),
    editionExact: field('edition'),
    languageExact: field('language'),
  };
}
export function qualityGate(
  source: string,
  rows: {
    id: string;
    bookKey?: string;
    reviewed?: boolean;
    skipped?: string;
    scored?: boolean;
    titleExact?: boolean | null;
    isbnWrong?: boolean | null;
  }[],
) {
  if (source !== 'real-camera')
    return 'NOT EVIDENCE: images are not real-camera';
  if (
    rows.some(
      (row) =>
        row.skipped ||
        !row.scored ||
        row.reviewed !== true ||
        !row.bookKey?.trim() ||
        typeof row.isbnWrong !== 'boolean',
    )
  )
    return 'NOT EVIDENCE: incomplete run or unreviewed answers/book identity/ISBN';
  const distinct = new Set(rows.map((row) => row.bookKey!.trim()));
  if (distinct.size < 20 || distinct.size !== rows.length)
    return 'NOT EVIDENCE: need at least 20 distinct books, grouped photos';
  return (
    rows.filter((row) => row.titleExact).length / rows.length >= 0.8 &&
    rows.every((row) => !row.isbnWrong)
  );
}
