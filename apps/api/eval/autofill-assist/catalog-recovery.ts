// Offline replay of already-exposed cover scans. No model, DB, network or holdout access.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  catalogPrefixes,
  rankCatalog,
} from '../../src/modules/autofill-assist/catalog-ranking.js';
import { recoveryKeys } from '../../src/common/catalog-recovery-keys.js';
import { titleKey } from '../../src/database/mongo/migrations/0003-catalog-title-key.js';
import { normalizeSearch } from '../../src/modules/commands/contract-input.service.js';
import type { Wire } from '../../src/modules/commands/domain-error.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const authorKey = (a: string) => normalizeSearch(a).replace(/[\s.·・-]+/g, '');
const files = [
  resolve(
    root,
    'apps/api/eval/autofill-assist/results/cover-scan/2026-10-29T05-17-26-738Z.json',
  ),
  resolve(root, 'qa-data/listing-ai/incoming/catalog/books.json'),
  resolve(root, 'qa-data/listing-ai/incoming/autofill/cover-scan/cases.json'),
];
const raw = await Promise.all(files.map((f) => readFile(f, 'utf8')));
const run = JSON.parse(raw[0]) as {
  summary: { source: string };
  results: { id: string; read: Wire['AutofillFields'] }[];
};
const catalog = JSON.parse(raw[1]) as {
  books: {
    bookKey: string;
    status: string;
    metadata: Omit<Wire['PublicBook'], 'id' | 'category'>;
  }[];
};
const cases = JSON.parse(raw[2]) as {
  cases: { id: string; bookKey: string }[];
};
if (
  run.summary.source !== 'cover-scan' ||
  run.results.length !== 24 ||
  cases.cases.length !== 24
)
  throw new Error('Expected frozen 24 exposed scan cases');
const books = catalog.books
  .filter((b) => b.status !== 'blocked')
  .map((b) => ({
    book: {
      ...b.metadata,
      id: b.bookKey,
      category: 'Văn học',
    } as Wire['PublicBook'],
    pending: false,
  }));
const rows = run.results.map((row) => {
  const target = cases.cases.find((c) => c.id === row.id)?.bookKey;
  if (!target || !books.some((b) => b.book.id === target))
    throw new Error('Missing active target');
  const hints = row.read;
  const old = books
    .filter(
      ({ book }) =>
        (hints.isbn && book.isbn === hints.isbn) ||
        (hints.title &&
          titleKey(hints.title) === titleKey(book.title) &&
          (!hints.authors.length ||
            hints.authors.some((a) =>
              book.authors.some((b) => authorKey(a) === authorKey(b)),
            ))),
    )
    .sort((a, b) => a.book.id.localeCompare(b.book.id))
    .slice(0, 5);
  const prefixes = catalogPrefixes(hints);
  // Same candidate filters/caps as HTTP service; all corpus entries model Confirmed.
  const windows = hints.isbn
    ? [books.filter((b) => b.book.isbn === hints.isbn)]
    : [
        books.filter(
          (b) => titleKey(b.book.title) === titleKey(hints.title ?? ''),
        ),
        ...(prefixes.length > 1
          ? [
              books.filter((b) =>
                prefixes.every((k) =>
                  recoveryKeys(b.book.title, b.book.authors).includes(k),
                ),
              ),
            ]
          : []),
        books.filter((b) =>
          prefixes.some((k) =>
            recoveryKeys(b.book.title, b.book.authors).includes(k),
          ),
        ),
      ];
  const pool = [
    ...new Map(
      windows
        .flatMap((w) =>
          w.sort((a, b) => a.book.id.localeCompare(b.book.id)).slice(0, 120),
        )
        .map((b) => [b.book.id, b]),
    ).values(),
  ];
  const after = rankCatalog(hints, pool).slice(0, 5);
  const ids = after.map((m) => m.book.id),
    before = old.map((m) => m.book.id);
  return {
    caseId: row.id,
    target,
    before,
    after: ids,
    beforeFound: before.includes(target),
    top1: ids[0] === target,
    top3: ids.slice(0, 3).includes(target),
    top5: ids.includes(target),
    ambiguous: after.length > 1,
    reasons: after.map((m) => m.matchedBy),
  };
});
const report = {
  kind: 'OFFLINE_EXPOSED_CATALOG_REPLAY',
  limitations:
    'Unreviewed cover scans; all active corpus books modeled Confirmed. Baseline capped set hit (old DB order unspecified), not top1 comparison. No OCR improvement, real-camera/native/human acceptance or holdout evaluation.',
  sourceSha256: raw.map((data, i) => ({
    path: files[i].slice(root.length).replaceAll('\\', '/'),
    sha256: createHash('sha256').update(data).digest('hex'),
  })),
  summary: {
    cases: rows.length,
    beforeFound: rows.filter((r) => r.beforeFound).length,
    afterTop1: rows.filter((r) => r.top1).length,
    afterTop3: rows.filter((r) => r.top3).length,
    afterTop5: rows.filter((r) => r.top5).length,
    ambiguous: rows.filter((r) => r.ambiguous).length,
  },
  rows,
};
const output = resolve(
  root,
  'docs/features/evidence/listing-catalog-recovery-2026-10-29.json',
);
await mkdir(resolve(output, '..'), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.summary));
