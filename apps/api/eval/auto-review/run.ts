import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shrinkForModel } from '../../src/modules/autofill-assist/autofill-images.js';
import { autofillModelFromConfig } from '../../src/modules/autofill-assist/autofill-model.js';
import { IsbnBarcodeReader } from '../../src/modules/autofill-assist/isbn-barcode-reader.js';
import { bytesOf, photoSignal } from '../../src/modules/listings/auto-review-photos.js';
import { runAutoReviewPipeline } from '../../src/modules/listings/auto-review-pipeline.js';
import { POLICY_VERSION } from '../../src/modules/listings/auto-review-policy.js';
import { photoReasons, sellerTextSignals } from '../../src/modules/listings/auto-review-signals.js';
import { score, type CaseResult, type Expected } from './metrics.js';

// Evaluates the AI listing review on labelled real photos (ADR 0063).
//   pnpm --filter @used-books/api eval:auto-review [--max-usd 1] [--limit 5] [--only id] [--fresh]
// Calls the real provider configured in apps/api/.env, through the same pipeline
// the worker runs, and touches no database. It runs every stage of every case so
// each criterion is measured, and answers are kept per case so a stopped run
// resumes without paying twice. What it does not exercise: stored facts (price
// references, account age, duplicates), because a dataset case has no such records,
// and the rule requiring two photos, because each case holds one.

interface Case {
  id: string;
  photos: string[];
  kind: string;
  expected: Expected;
  escalationReasons: string[];
  humanReviewed: boolean;
  listing: {
    title: string;
    authors: string[];
    condition: 'LikeNew' | 'Good' | 'Fair' | 'Worn';
    description: string;
  };
}

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../../qa-data/listing-auto-review');
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const maxUsd = Number(flag('max-usd') ?? 1);
const limit = Number(flag('limit') ?? Infinity);
const only = flag('only');
const resultsPath = join(root, 'incoming', 'results.json');

const model = autofillModelFromConfig((key) => process.env[key]);
if (!model) {
  console.error('Provider not configured: AUTOFILL_ENABLED and AUTOFILL_API_KEY are required.');
  process.exit(2);
}
const cases = (JSON.parse(readFileSync(join(root, 'cases.draft.json'), 'utf8')) as { cases: Case[] }).cases;
const saved: Record<string, CaseResult> =
  !args.includes('--fresh') && existsSync(resultsPath)
    ? (JSON.parse(readFileSync(resultsPath, 'utf8')) as { policy: string; model: string; results: Record<string, CaseResult> }).results
    : {};
const barcode = new IsbnBarcodeReader();
const minConfidence = Number(process.env.LISTING_AUTO_REVIEW_MIN_CONFIDENCE ?? 0.85);
const spent = () => Object.values(saved).reduce((sum, r) => sum + r.costMicroUsd, 0) / 1e6;
const save = () => {
  mkdirSync(dirname(resultsPath), { recursive: true });
  writeFileSync(
    resultsPath,
    JSON.stringify({ policy: POLICY_VERSION, model: model.model, results: saved }, null, 1),
  );
};

let done = 0;
let stopped = false;
let retried = 0;
for (const c of cases) {
  if (only && c.id !== only) continue;
  if (saved[c.id]) continue;
  if (done >= limit) break;
  if (spent() >= maxUsd) {
    stopped = true;
    break;
  }
  const original = readFileSync(join(root, 'incoming', 'images', c.photos[0]));
  const url = await shrinkForModel(original);
  const bytes = bytesOf(url);
  const local = [
    ...photoReasons([await photoSignal(bytes)]),
    ...sellerTextSignals([c.listing.description]),
    ...(c.listing.condition === 'LikeNew' ? ['LikeNewNeedsStaff'] : []),
  ];
  let barcodes: string[] = [];
  try {
    barcodes = await barcode.read(bytes);
  } catch {
    // Optional evidence, same as in the worker.
  }
  const p = await runAutoReviewPipeline(model, {
    condition: c.listing.condition,
    seller: { description: c.listing.description },
    images: [url],
    catalog: {
      title: c.listing.title,
      authors: c.listing.authors,
      isbn: null,
      edition: null,
      publisher: null,
    },
    barcodes,
    minConfidence,
    exhaustive: true,
  });
  const providerDown = p.failures.some((f) => f !== 'InvalidOutput');
  // A provider outage is not a model answer: leave the case to a later run.
  if (providerDown) {
    retried++;
    console.log(`${c.id}: provider failure (${[...new Set(p.failures)].join(',')}), will retry on the next run`);
    await new Promise((d) => setTimeout(d, 5000));
    continue;
  }
  saved[c.id] = {
    id: c.id,
    kind: c.kind,
    expected: c.expected,
    escalationReasons: c.escalationReasons,
    humanReviewed: c.humanReviewed,
    reasons: [...local, ...p.reasons],
    modelReasons: p.reasons,
    criteria: p.criteria.map(({ criterion, pass, confidence, met }) => ({ criterion, pass, confidence, met })),
    stageFailures: p.failures,
    calls: p.usage.calls,
    inputTokens: p.usage.inputTokens,
    outputTokens: p.usage.outputTokens,
    costMicroUsd: p.usage.costMicroUsd,
    latencyMs: p.latencyMs,
    extraction: p.extraction,
    damage: p.damage,
  };
  save();
  done++;
  console.log(
    `${c.id}: ${c.expected} -> ${saved[c.id].reasons.length ? 'Staff' : 'APPROVE'} [${saved[c.id].reasons.slice(0, 4).join(', ')}] $${spent().toFixed(3)}`,
  );
}

const summary = score(Object.values(saved));
const out = {
  policy: POLICY_VERSION,
  model: model.model,
  ranAt: new Date().toISOString(),
  stoppedAtSpendCap: stopped,
  casesLeftAfterProviderFailure: retried,
  labels: 'AI draft unless humanReviewed; a pilot on Commons photos, not phone photos; no holdout',
  notExercised: ['stored facts', 'two-photo rule', 'edition and ISBN against a catalog record'],
  note: 'Prompt changed after reading v2 on these same cases, so v3 is a development result, not a holdout.',
  ...summary,
};
const summaryPath = join(here, 'results', `pilot-${POLICY_VERSION}.json`);
mkdirSync(dirname(summaryPath), { recursive: true });
writeFileSync(summaryPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
