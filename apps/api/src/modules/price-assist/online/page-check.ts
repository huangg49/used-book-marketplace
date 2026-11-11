import { isbn13 } from '../../commands/contract-input.service.js';

// Reads a new-book price from a shop's product page (ADR 0029). The price is
// taken from the page's own structured data (schema.org JSON-LD, or the
// product:price / itemprop="price" metadata), never from the search model,
// and kept only when the page is about this book: same ISBN, or, when the
// page shows no ISBN, the same title and an author named on the page.

export interface BookIdentity {
  title: string;
  authors: string[];
  isbn: string | null;
  edition?: string | null;
  strictIdentity?: boolean;
}
export type PageCheck =
  | { ok: true; amount: number; isbnMatched: boolean; pageTitle: string | null }
  | { ok: false; reason: PageRejection };
export type PageRejection =
  | 'NoPrice'
  | 'NotVnd'
  | 'PriceOutOfRange'
  | 'OtherIsbn'
  | 'OtherTitle';

const MIN_VND = 1_000;
const MAX_VND = 10_000_000;

export const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const digits = (value: unknown) => String(value ?? '').replace(/[^0-9Xx]/g, '').toUpperCase();
const isbnKey = (value: string) => isbn13(value) ?? digits(value);

const romanValue: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
const editionTitle = (title: string) => normalize(title).replace(
  /\b(tap|quyen|phan|volume|vol) ((?=[ivxlcdm]+\b)m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3}))\b/g,
  (_, label: string, roman: string) => {
    const values = [...roman].map((char) => romanValue[char]!);
    const number = values.reduce((sum, value, index) => sum + (value < (values[index + 1] ?? 0) ? -value : value), 0);
    return `${label} ${number}`;
  },
);

function matchesEdition(name: string, book: BookIdentity) {
  const title = editionTitle(book.title);
  const edition = editionTitle(book.edition ?? '');
  const expected = edition && title !== edition && !title.endsWith(` ${edition}`)
    ? `${title} ${edition}` : title;
  return !!expected && editionTitle(name) === expected;
}

interface Offer {
  price: number | null;
  currency: string | null;
}
interface Product {
  name: string | null;
  authors: string[];
  isbns: string[];
  offers: Offer[];
}

const asArray = <T>(value: T | T[] | undefined | null): T[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

function toPrice(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  // "120000", "120000.00", "120.000" (vi grouping), "120,000".
  const plain = value.trim();
  if (/^\d+(\.\d{1,2})?$/.test(plain)) return Number(plain);
  if (/^\d{1,3}([.,]\d{3})+$/.test(plain)) return Number(plain.replace(/[.,]/g, ''));
  return null;
}

function productsFromJsonLd(html: string): Product[] {
  const found: Product[] = [];
  const blocks = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    const o = node as Record<string, unknown>;
    const types = asArray(o['@type'] as string | string[]).map(String);
    if (types.some((t) => t === 'Product' || t === 'Book')) {
      const offers = asArray(o.offers as unknown).flatMap((offer) => {
        if (!offer || typeof offer !== 'object') return [];
        const of = offer as Record<string, unknown>;
        // AggregateOffer: a price span from several sellers is not a list price.
        if (String(of['@type'] ?? '') === 'AggregateOffer') return [];
        return [
          {
            price: toPrice(of.price),
            currency: of.priceCurrency ? String(of.priceCurrency).toUpperCase() : null,
          },
        ];
      });
      found.push({
        name: typeof o.name === 'string' ? o.name : null,
        authors: asArray(o.author).flatMap((author) => {
          if (typeof author === 'string') return [author];
          const name = (author as { name?: unknown } | null)?.name;
          return typeof name === 'string' ? [name] : [];
        }),
        isbns: [o.isbn, o.gtin13, o.gtin, o.productID, o.sku]
          .map(digits)
          .filter((d) => d.length === 10 || d.length === 13),
        offers,
      });
    }
    for (const key of ['@graph', 'mainEntity', 'workExample', 'itemListElement'])
      visit(o[key]);
  };
  for (const [, body] of blocks) {
    try {
      visit(JSON.parse(body.trim()));
    } catch {
      // Broken JSON-LD is ignored; the metadata fallback may still apply.
    }
  }
  return found;
}

function meta(html: string, pattern: RegExp): string | null {
  const m = html.match(pattern);
  return m ? m[1] : null;
}

function productFromMeta(html: string): Product | null {
  const price =
    meta(html, /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i) ??
    meta(html, /<meta[^>]+itemprop=["']price["'][^>]+content=["']([^"']+)["']/i);
  if (!price) return null;
  const currency =
    meta(html, /<meta[^>]+property=["']product:price:currency["'][^>]+content=["']([^"']+)["']/i) ??
    meta(html, /<meta[^>]+itemprop=["']priceCurrency["'][^>]+content=["']([^"']+)["']/i);
  const title = meta(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  return {
    name: title,
    authors: [],
    isbns: [],
    offers: [{ price: toPrice(price), currency: currency ? currency.toUpperCase() : null }],
  };
}

const pageText = (html: string) => html
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
  .replace(/<\/?(?:br|p|li|dt|dd|div|tr|td|th)\b[^>]*>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ');

function visibleIsbns(text: string): Set<string> {
  const found = new Set<string>();
  // Require the ISBN label and keep the number on one line so a product ID,
  // price or page count from a neighbouring field cannot complete an ISBN.
  const labels = /\bISBN(?:[ \t-]*(?:10|13))?\b[ \t]*[:：]?\s*([0-9][0-9X \t\u00a0\u2010-\u2013-]*)/gi;
  for (const [, printed] of text.matchAll(labels)) {
    const id = digits(printed);
    if (/^(?:97[89][0-9]{10}|[0-9]{9}[0-9X])$/.test(id)) found.add(isbnKey(id));
  }
  return found;
}

export function checkPage(html: string, book: BookIdentity): PageCheck {
  const products = productsFromJsonLd(html);
  const fallback = products.some((p) => p.offers.length) ? null : productFromMeta(html);
  if (fallback) products.push(fallback);
  const priced = products.filter((p) => p.offers.some((o) => o.price !== null));
  if (!priced.length) return { ok: false, reason: 'NoPrice' };

  const wantIsbn = book.isbn ? isbnKey(book.isbn) : null;
  const plain = pageText(html);
  const text = normalize(plain);
  const printed = wantIsbn ? visibleIsbns(plain) : new Set<string>();
  const printedAuthors = book.strictIdentity && !wantIsbn
    ? [...plain.matchAll(/(?:tác\s+giả|author)[ \t]*[:：]?[ \t]*(?:\r?\n[ \t]*)?([^\r\n]+)/gi)]
      .flatMap(([, names]) => names.split(/[;,]/).map(normalize))
    : [];
  const hasStructuredIsbn = priced.some((p) => p.isbns.length > 0);
  const titleOk = (name: string | null) => {
    const want = normalize(book.title);
    return !!want && (normalize(name ?? '').includes(want) || text.includes(want));
  };
  const authorOk = book.authors.some((a) => {
    const n = normalize(a);
    return n.length > 0 && text.includes(n);
  });

  let rejection: PageRejection = 'OtherTitle';
  for (const p of priced) {
    let isbnMatched = false;
    if (p.isbns.length && wantIsbn) {
      if (!p.isbns.some((id) => isbnKey(id) === wantIsbn)) {
        rejection = 'OtherIsbn';
        continue;
      }
      isbnMatched = true;
    } else if (wantIsbn && (printed.size || hasStructuredIsbn)) {
      // Page-wide text is useful only when it points to a single priced product and edition.
      if (priced.length !== 1 || printed.size !== 1 || !printed.has(wantIsbn)) {
        rejection = 'OtherIsbn';
        continue;
      }
      isbnMatched = true;
    } else if (wantIsbn && book.strictIdentity) {
      rejection = 'OtherIsbn';
      continue;
    } else if (book.strictIdentity) {
      const authors = [...p.authors.map(normalize), ...(priced.length === 1 ? printedAuthors : [])];
      if (!matchesEdition(p.name ?? '', book) || !book.authors.some((author) => authors.includes(normalize(author)))) continue;
    } else if (!(titleOk(p.name) && authorOk)) {
      continue;
    }
    const offer = p.offers.find((o) => o.price !== null)!;
    if (offer.currency && offer.currency !== 'VND') return { ok: false, reason: 'NotVnd' };
    const amount = Math.round(offer.price!);
    if (amount < MIN_VND || amount > MAX_VND)
      return { ok: false, reason: 'PriceOutOfRange' };
    return { ok: true, amount, isbnMatched, pageTitle: p.name };
  }
  return { ok: false, reason: rejection };
}
