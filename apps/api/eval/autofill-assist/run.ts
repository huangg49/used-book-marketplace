import { scoreAutofill, qualityGate, type ExpectedAutofill } from './quality.js';
import 'dotenv/config';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { checkAutofill, type CheckedAutofill } from '../../src/modules/autofill-assist/autofill-check.js';
import { shrinkForModel } from '../../src/modules/autofill-assist/autofill-images.js';
import { autofillModelFromConfig } from '../../src/modules/autofill-assist/autofill-model.js';
import { AUTOFILL_SYSTEM, AUTOFILL_USER } from '../../src/modules/autofill-assist/autofill-prompt.js';
import { processImage } from '../../src/modules/media/image-processor.js';
import { digest } from '../../src/modules/media/media-storage.js';
import { costMicroUsd, PriceModelError, rateFor } from '../../src/modules/price-assist/price-model.js';

// Photo autofill evaluation (ADR 0048 §5: ≥ 80% titles right, 0 wrong ISBNs).
//   pnpm --filter @used-books/api eval:autofill --dir <folder> --init
//   pnpm --filter @used-books/api eval:autofill --dir <folder> [--max-usd 0.5] [--only id]
// --init writes <folder>/cases.json with one case per photo; fill in the
// expected title/authors/ISBN as printed on the book, group a book's photos
// into one case, and set "source" to "real-camera" only for phone photos.
// Calls the real provider with AUTOFILL_API_KEY from apps/api/.env, using the
// same derivative + shrink steps as uploads. Photos stay outside Git: they can
// show people, rooms or dedications. Only the read fields and scores are saved.

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const dir = arg('--dir') ? resolve(arg('--dir')!) : null;
const only = arg('--only');
const maxUsd = Number(arg('--max-usd') ?? 0.5);
if (!Number.isFinite(maxUsd) || maxUsd <= 0) throw new Error('--max-usd must be a finite positive number.');
if (!dir || !existsSync(dir)) throw new Error('Pass --dir <folder with photos>.');

type Expected = ExpectedAutofill;
type Case = { id: string; bookKey?: string; reviewed?: boolean; photos: string[]; expected: Expected };
// cover-scan: real published covers, but flat scans rather than phone photos.
type CaseFile = { source: 'real-camera' | 'cover-scan' | 'synthetic' | 'unknown'; cases: Case[] };
const casesPath = join(dir, 'cases.json');

if (args.includes('--init')) {
  if (existsSync(casesPath)) throw new Error(`${casesPath} exists; edit it instead.`);
  const photos = readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
  const template: CaseFile = {
    source: 'unknown',
    cases: photos.map((f) => ({
      id: f.slice(0, -extname(f).length),
      bookKey: '', reviewed: false,
      photos: [f],
      expected: { title: '', authors: [], isbn: null },
    })),
  };
  writeFileSync(casesPath, JSON.stringify(template, null, 2) + '\n');
  console.log(`Wrote ${casesPath} with ${photos.length} cases. Fill in "expected" and "source".`);
  process.exit(0);
}

const file = JSON.parse(readFileSync(casesPath, 'utf8')) as CaseFile;
const model = autofillModelFromConfig((key) => process.env[key]);
if (!model) {
  console.error('BLOCKED: AUTOFILL_ENABLED=true and AUTOFILL_API_KEY are needed in apps/api/.env.');
  process.exit(2);
}

// Same path as an upload: derivative (EXIF stripped, rotated) then the shrink.
const MIME: Record<string, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
async function asProvided(path: string) {
  const bytes = readFileSync(path);
  const { format } = await sharp(bytes).metadata();
  const { bytes: derivative } = await processImage(bytes, {
    byteSize: bytes.length,
    sha256: digest(bytes),
    mimeType: MIME[format ?? ''] ?? 'unsupported',
  });
  return shrinkForModel(derivative);
}

const results = [];
let spentMicro = 0;
for (const c of file.cases) {
  if (only && c.id !== only) continue;
  if (spentMicro >= maxUsd * 1e6) {
    results.push({ id: c.id, skipped: 'budget' });
    continue;
  }
  const started = Date.now();
  let checked: CheckedAutofill | null = null;
  let failure: string | null = null;
  let usedFallback = false;
  let modelId = model.model;
  const tokens = { input: 0, output: 0 };
  const call = async (images: string[], useFallback: boolean) => {
    const id = useFallback ? model.fallback! : model.model;
    try {
      const draft = await model.read(AUTOFILL_SYSTEM, AUTOFILL_USER, images, useFallback);
      tokens.input += draft.inputTokens;
      tokens.output += draft.outputTokens;
      spentMicro += costMicroUsd(rateFor(id, null), draft.inputTokens, draft.outputTokens);
      modelId = draft.model;
      return checkAutofill(draft.output);
    } catch (e) {
      if (e instanceof PriceModelError && e.usage)
        spentMicro += costMicroUsd(rateFor(id, null), e.usage.inputTokens, e.usage.outputTokens);
      throw e;
    }
  };
  try {
    const images = await Promise.all(c.photos.map((p) => asProvided(join(dir, p))));
    checked = await call(images, false).catch((e) => {
      if (!model.fallback) throw e;
      return null;
    });
    if (model.fallback && !checked?.fields.title) {
      usedFallback = true;
      const second = await call(images, true).catch((e) => {
        if (!checked) throw e;
        return null;
      });
      if (second && (second.fields.title || !checked)) checked = second;
    }
  } catch (e) {
    failure = e instanceof PriceModelError ? e.kind : e instanceof Error ? e.message : 'Error';
  }
  const latencyMs = Date.now() - started;
  const fields = checked?.fields ?? null;
  const title = fields?.title ?? null;

  results.push({
    id: c.id,
    photos: c.photos.length,
    status: failure ? 'Failed' : title ? 'Suggested' : 'NeedsMoreData',
    failure,
    usedFallback,
    expected: c.expected,
    read: fields,
    missing: checked?.missing ?? [],
    ...scoreAutofill(c.expected, fields),
    bookKey: c.bookKey, reviewed: c.reviewed === true,
    model: modelId,
    latencyMs,
    tokens,
  });
  console.log(`${c.id.padEnd(24)} ${(failure ?? title ?? '(no title)').slice(0, 50)}`);
}

type Row = Exclude<(typeof results)[number], { skipped: string }>;
const ran = results.filter((r) => 'status' in r) as Row[];
const scored = ran.filter((r) => r.scored);
const latencies = ran.map((r) => r.latencyMs).sort((a, b) => a - b);
const pct = (p: number) => (latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(p * latencies.length) - 1)] : null);
const ratio = (n: number, d: number) => (d ? `${n}/${d}` : 'NOT SCORED');
const titleRight = scored.filter((r) => r.titleExact).length;
const wrongIsbn = scored.filter((r) => r.isbnWrong).length;
const summary = {
  source: file.source,
  model: model.model,
  fallback: model.fallback,
  ranAt: new Date().toISOString(),
  cases: ran.length,
  scoredCases: scored.length,
  titleExact: ratio(titleRight, scored.length),
  titleIgnoringAccents: ratio(scored.filter((r) => r.titleIgnoringAccents).length, scored.length),
  ...Object.fromEntries(['publisherExact', 'publicationYearExact', 'editionExact', 'languageExact'].map(key => {
    const judged = scored.filter(row => row[key as keyof typeof row] !== null);
    return [key, ratio(judged.filter(row => row[key as keyof typeof row] === true).length, judged.length)];
  })),
  authorsFound: ratio(scored.filter((r) => r.authorsFound).length, scored.filter((r) => r.authorsFound !== null).length),
  isbnFound: ratio(scored.filter((r) => r.isbnFound).length, scored.filter((r) => r.isbnFound !== null).length),
  wrongIsbn,
  needsMoreData: ran.filter((r) => r.status === 'NeedsMoreData').length,
  failed: ran.filter((r) => r.status === 'Failed').length,
  latencyMs: { p50: pct(0.5), p95: pct(0.95) },
  tokens: {
    input: ran.reduce((t, r) => t + r.tokens.input, 0),
    output: ran.reduce((t, r) => t + r.tokens.output, 0),
  },
  costUsd: spentMicro / 1e6,
  // ADR 0048 §5 counts only real phone photos, 20 or more books.
  meetsAdr0048: qualityGate(file.source, results),
  skipped: results.filter((r) => 'skipped' in r).map((r) => r.id),
};
console.log(JSON.stringify(summary, null, 2));
const out = join(here, 'results', file.source === 'real-camera' ? '' : file.source);
mkdirSync(out, { recursive: true });
const stamp = summary.ranAt.replace(/[:.]/g, '-');
writeFileSync(join(out, `${stamp}.json`), JSON.stringify({ summary, results }, null, 2) + '\n');
console.log(`Saved ${join(out, `${stamp}.json`)}`);
