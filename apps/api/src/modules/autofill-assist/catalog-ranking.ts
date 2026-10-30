import {
  recoveryText,
  recoveryKeys,
} from '../../common/catalog-recovery-keys.js';
import type { Wire } from '../commands/domain-error.js';

type Hints = Wire['AutofillFields'];
type Book = Wire['PublicBook'];
export const catalogText = recoveryText;
function similarity(a: string, b: string) {
  if (a === b) return a ? 1 : 0;
  if (!a || !b || Math.min(a.length, b.length) < 5) return 0;
  // Linear bigram overlap; no quadratic edit-distance work on user-provided long strings.
  const counts = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++)
    counts.set(a.slice(i, i + 2), (counts.get(a.slice(i, i + 2)) ?? 0) + 1);
  let shared = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const key = b.slice(i, i + 2),
      n = counts.get(key) ?? 0;
    if (n) {
      shared++;
      counts.set(key, n - 1);
    }
  }
  return (2 * shared) / (a.length + b.length - 2);
}
const roman = (s: string) => {
  const values: Record<string, number> = {
    i: 1,
    v: 5,
    x: 10,
    l: 50,
    c: 100,
    d: 500,
    m: 1000,
  };
  return [...s].reduce(
    (n, c, i) =>
      n + (values[c] < (values[s[i + 1]] ?? 0) ? -values[c] : values[c]),
    0,
  );
};
export const catalogVolumes = (s: string) => [
  ...new Set(
    [
      ...catalogText(s).matchAll(
        /(?:^|\s)(?:tap|quyen|volume|vol|book)\s+(\d+|[ivxlcdm]+)(?=\s|$)/g,
      ),
    ].map((m) =>
      /^\d+$/.test(m[1]) ? m[1].replace(/^0+(?=\d)/, '') : String(roman(m[1])),
    ),
  ),
];
// Migration 0042 supplies the multikey index for interior title and author tokens.
// Ranking still requires a title clue, not just a matching author.
export function catalogPrefixes(hints: Hints) {
  return recoveryKeys(hints.title ?? '', hints.authors)
    .filter(
      (t) =>
        ![
          'tap',
          'quy',
          'vol',
          'boo',
          'nha',
          'xua',
          'ban',
          'the',
          'and',
        ].includes(t),
    )
    .slice(0, 12);
}
export function rankCatalog(
  hints: Hints,
  candidates: { book: Book; pending: boolean }[],
) {
  const inputTitle = catalogText(hints.title ?? ''),
    inputAuthors = hints.authors.map(catalogText);
  const inputVolume = catalogVolumes(
    `${hints.title ?? ''} ${hints.edition ?? ''}`,
  );
  if (inputVolume.length > 1) return [];
  const publisher = (s: string) =>
    catalogText(s).replace(/^(?:nha xuat ban|nxb)\s+/, '');
  const ranked: { value: Wire['ListingCatalogMatch']; rank: number }[] = [];
  for (const { book, pending } of candidates) {
    if (hints.isbn && book.isbn !== hints.isbn) continue;
    const title = catalogText(book.title),
      authors = book.authors.map(catalogText);
    const bookVolume = catalogVolumes(`${book.title} ${book.edition ?? ''}`);
    if (
      inputVolume.length &&
      bookVolume.length &&
      (bookVolume.length > 1 || inputVolume[0] !== bookVolume[0])
    )
      continue;
    const authorMatch = inputAuthors.some((a) =>
      authors.some((b) => similarity(a, b) >= 0.85),
    );
    const direct = similarity(inputTitle, title);
    const partialTitle =
      inputTitle.length >= 6 &&
      inputTitle.split(' ').every((t) => title.split(' ').includes(t));
    const swapped =
      inputAuthors.some((a) => similarity(a, title) >= 0.85) &&
      authors.some((a) => similarity(a, inputTitle) >= 0.85);
    // A combined title+author field is usable only when both independent facts appear.
    const combined =
      title.length >= 6 &&
      inputTitle.includes(title) &&
      authors.some((a) => a.length >= 6 && inputTitle.includes(a));
    const matchedBy: Wire['ListingCatalogMatch']['matchedBy'] | null =
      hints.isbn
        ? 'Isbn'
        : direct === 1 && authorMatch
          ? 'TitleAuthor'
          : swapped || combined
            ? 'SwappedText'
            : direct >= 0.78 ||
                (partialTitle && (authorMatch || inputTitle.length >= 8))
              ? 'SimilarTitle'
              : null;
    if (!matchedBy) continue;
    const warnings: Wire['ListingCatalogMatch']['warnings'] = ['CheckEdition'];
    if (inputAuthors.length && !authorMatch && !swapped && !combined)
      warnings.push('AuthorDiffers');
    if (
      hints.publisher &&
      book.publisher &&
      publisher(hints.publisher) !== publisher(book.publisher)
    )
      warnings.push('PublisherDiffers');
    if (
      hints.publicationYear &&
      book.publicationYear &&
      hints.publicationYear !== book.publicationYear
    )
      warnings.push('YearDiffers');
    if (
      hints.language &&
      hints.language.toLowerCase() !== book.language.toLowerCase()
    )
      warnings.push('LanguageDiffers');
    if (
      (bookVolume.length && !inputVolume.length) ||
      (inputVolume.length && !bookVolume.length)
    )
      warnings.push('VolumeUnclear');
    const base =
      matchedBy === 'Isbn'
        ? 200
        : matchedBy === 'TitleAuthor'
          ? 120
          : matchedBy === 'SwappedText'
            ? 100
            : 70 + direct * 20;
    ranked.push({
      value: { book, matchedBy, pending, warnings: warnings.slice(0, 6) },
      rank:
        base +
        (authorMatch ? 10 : 0) -
        (warnings.includes('AuthorDiffers') ? 20 : 0),
    });
  }
  ranked.sort(
    (a, b) => b.rank - a.rank || a.value.book.id.localeCompare(b.value.book.id),
  );
  return ranked.map((r) => r.value);
}
