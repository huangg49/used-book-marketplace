import { isbn13 } from '../commands/contract-input.service.js';

export class InvalidAutofillOutput extends Error {}

export interface AutofillFields {
  title: string | null;
  authors: string[];
  publisher: string | null;
  publicationYear: number | null;
  language: string | null;
  edition: string | null;
  isbn: string | null;
}
export interface CheckedAutofill {
  fields: AutofillFields;
  missing: string[];
}

const LANGUAGE_NAMES: Record<string, string> = {
  'tiếng việt': 'vi',
  'tieng viet': 'vi',
  vietnamese: 'vi',
  'tiếng anh': 'en',
  english: 'en',
  'tiếng pháp': 'fr',
  french: 'fr',
  'tiếng nhật': 'ja',
  japanese: 'ja',
  'tiếng trung': 'zh',
  chinese: 'zh',
};

// Collapses whitespace, keeps Vietnamese marks in NFC, drops control chars.
function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const clean = value
    .normalize('NFC')
    // oxlint-disable-next-line no-control-regex -- stripping control chars is the point
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean || [...clean].length > max) return null;
  return clean;
}

function language(value: unknown): string | null {
  const raw = text(value, 35);
  if (!raw) return null;
  const named = LANGUAGE_NAMES[raw.toLowerCase()];
  try {
    return Intl.getCanonicalLocales(named ?? raw)[0] ?? null;
  } catch {
    return null;
  }
}

// The model drafts; the server decides what is trustworthy enough to show.
// Anything malformed becomes null rather than being repaired.
export function checkAutofill(output: unknown, now = new Date()): CheckedAutofill {
  if (!output || typeof output !== 'object' || Array.isArray(output))
    throw new InvalidAutofillOutput('Output is not an object');
  const o = output as Record<string, unknown>;
  const authors = Array.isArray(o.authors)
    ? [
        ...new Set(
          o.authors
            .map((a) => text(a, 200)?.replace(/^(tác giả|tac gia|author)\s*:\s*/i, ''))
            .filter((a): a is string => !!a),
        ),
      ].slice(0, 10)
    : [];
  const year =
    typeof o.publicationYear === 'number' &&
    Number.isInteger(o.publicationYear) &&
    o.publicationYear >= 1400 &&
    o.publicationYear <= now.getUTCFullYear()
      ? o.publicationYear
      : null;
  const isbnRaw = typeof o.isbn === 'string' ? o.isbn.replace(/^isbn[\s:-]*/i, '') : '';
  const missing = Array.isArray(o.missing)
    ? o.missing
        .map((m) => text(m, 200))
        .filter((m): m is string => !!m)
        .slice(0, 3)
    : [];
  return {
    fields: {
      title: text(o.title, 300),
      authors,
      publisher: text(o.publisher, 200),
      publicationYear: year,
      language: language(o.language),
      edition: text(o.edition, 200),
      // A wrong checksum means a misread digit: drop it, never "fix" it.
      isbn: isbnRaw ? isbn13(isbnRaw) : null,
    },
    missing,
  };
}
