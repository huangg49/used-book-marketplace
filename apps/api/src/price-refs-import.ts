import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';
import { bindCollections } from './database/mongo/collections.js';
import type { PriceReferenceDoc } from './database/mongo/documents.js';

// Imports human-curated price references (ADR 0028) from a JSON file:
//   pnpm --filter @used-books/api price-refs:import <file.json> [--apply]
// Dry run by default. Writes as the migrator (the app role may only read).
// Each entry: { bookId | isbn, kind, amount, condition?, sourceLabel,
//   sourceUrl?, observedAt: "YYYY-MM-DD", enteredBy, rightsNote }.
// The same entry always maps to the same id, so re-running inserts nothing new.

const [file, ...flags] = process.argv.slice(2);
const apply = flags.includes('--apply');
if (!file) throw new Error('Usage: price-refs:import <file.json> [--apply]');
const url = process.env.MONGODB_MIGRATOR_URL;
if (!url) throw new Error('MONGODB_MIGRATOR_URL is required.');

const KINDS = ['CoverPrice', 'EditorialReference', 'CompletedSale'] as const;
const CONDITIONS = ['LikeNew', 'Good', 'Fair', 'Worn'] as const;
type Entry = Record<string, unknown>;
const text = (e: Entry, key: string, max: number, required = true) => {
  const value = e[key];
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`${key} is required`);
    return null;
  }
  if (typeof value !== 'string' || value.trim().length > max)
    throw new Error(`${key} must be text up to ${max} characters`);
  return value.trim();
};
const stableId = (parts: unknown[]) => {
  const h = createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const entries = JSON.parse(readFileSync(file, 'utf8')) as Entry[];
if (!Array.isArray(entries)) throw new Error('The file must hold a JSON array.');
const client = new MongoClient(url);
try {
  await client.connect();
  const c = bindCollections(client.db());
  const docs: PriceReferenceDoc[] = [];
  const problems: string[] = [];
  for (const [i, e] of entries.entries()) {
    try {
      const isbn = text(e, 'isbn', 13, false);
      let bookId = text(e, 'bookId', 36, false)?.toLowerCase() ?? null;
      if (!bookId && isbn)
        bookId = (await c.catalog_books.findOne({ confirmedIsbn: isbn }))?._id ?? null;
      const book = bookId ? await c.catalog_books.findOne({ _id: bookId }) : null;
      if (!book) throw new Error('book not found (give bookId or a confirmed ISBN)');
      const kind = e.kind as (typeof KINDS)[number];
      if (!KINDS.includes(kind)) throw new Error(`kind must be ${KINDS.join('|')}`);
      const amount = e.amount;
      if (!Number.isInteger(amount) || (amount as number) < 1000 || (amount as number) > 10_000_000)
        throw new Error('amount must be an integer VND 1000..10000000');
      const condition = (e.condition ?? null) as PriceReferenceDoc['condition'];
      if (condition !== null && !CONDITIONS.includes(condition))
        throw new Error(`condition must be null or ${CONDITIONS.join('|')}`);
      const observed = text(e, 'observedAt', 10)!;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(observed) || Number.isNaN(Date.parse(observed)))
        throw new Error('observedAt must be YYYY-MM-DD');
      const observedAt = new Date(`${observed}T00:00:00Z`);
      if (observedAt > new Date()) throw new Error('observedAt is in the future');
      const sourceUrl = text(e, 'sourceUrl', 500, false);
      if (sourceUrl && !sourceUrl.startsWith('https://'))
        throw new Error('sourceUrl must be https');
      const sourceLabel = text(e, 'sourceLabel', 160)!;
      docs.push({
        _id: stableId([bookId, kind, amount, condition, sourceLabel, observed]),
        bookId: book._id,
        isbn,
        kind,
        amount: amount as number,
        condition,
        sourceLabel,
        sourceUrl,
        observedAt,
        enteredBy: text(e, 'enteredBy', 80)!,
        rightsNote: text(e, 'rightsNote', 300)!,
        retiredAt: null,
        createdAt: new Date(),
      });
    } catch (err) {
      problems.push(`#${i + 1}: ${(err as Error).message}`);
    }
  }
  if (problems.length) {
    console.error(`Rejected ${problems.length} entr(ies); nothing written:`);
    for (const p of problems) console.error(`  ${p}`);
    process.exitCode = 1;
  } else {
    let inserted = 0;
    for (const doc of docs) {
      const exists = await c.price_references.findOne({ _id: doc._id });
      if (exists) continue;
      if (apply) await c.price_references.insertOne(doc);
      inserted++;
    }
    console.log(
      `${docs.length} valid entr(ies); ${inserted} new ${apply ? 'inserted' : '(dry run, use --apply)'}.`,
    );
  }
} finally {
  await client.close();
}
