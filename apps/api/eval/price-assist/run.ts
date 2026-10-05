import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluate,
  type BookFacts,
  type PriceInput,
  type RawSource,
} from '../../src/modules/price-assist/evidence.js';
import { checkOutput, InvalidModelOutput } from '../../src/modules/price-assist/output-check.js';
import { buildUserPrompt, SYSTEM_PROMPT } from '../../src/modules/price-assist/prompt.js';
import {
  AnthropicPriceModel,
  costMicroUsd,
  PriceModel,
  PriceModelError,
  rateFor,
  type ModelDraft,
} from '../../src/modules/price-assist/price-model.js';

// Price assistant evaluation (ADR 0028, docs/features/PRICE_ASSIST_REPORT.md).
//   pnpm --filter @used-books/api eval:price --live [--max-usd 1] [--only id]
//   pnpm --filter @used-books/api eval:price --fake   (harness check only)
// --live calls the real provider with PRICE_ASSIST_API_KEY from apps/api/.env.
// Cases marked inject=timeout|invalid always use a local fault injector: those
// measure the failure path, not model quality. Accuracy is scored only for
// cases a person has reviewed (case.review.reviewedBy).

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const live = args.includes('--live');
const fake = args.includes('--fake');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const maxUsd = args.includes('--max-usd') ? Number(args[args.indexOf('--max-usd') + 1]) : 1;
if (live === fake) throw new Error('Choose exactly one of --live or --fake.');

type Case = {
  id: string;
  category: string;
  book: Omit<BookFacts, 'id'>;
  copy: Omit<PriceInput, 'bookId'>;
  sources: (Omit<RawSource, 'id' | 'observedAt' | 'url'> & { daysAgo: number })[];
  expected: { status: string; range: [number, number] | null };
  inject: 'timeout' | 'invalid' | null;
  review: { reviewedBy: string | null; reviewedAt: string | null };
};
const file = JSON.parse(readFileSync(join(here, 'cases.json'), 'utf8')) as {
  asOf: string;
  cases: Case[];
};
const asOf = new Date(`${file.asOf}T00:00:00Z`);

class Injector extends PriceModel {
  readonly model = 'fault-injector';
  constructor(private readonly kind: 'timeout' | 'invalid' | 'fake') {
    super();
  }
  async draft(_s: string, user: string): Promise<ModelDraft> {
    if (this.kind === 'timeout') throw new PriceModelError('Timeout', 'injected');
    if (this.kind === 'invalid')
      return { output: { low: 5, high: 1, confidence: 0.97 }, model: this.model, inputTokens: 0, outputTokens: 0 };
    const data = JSON.parse(user.slice(user.indexOf('{'), user.lastIndexOf('}') + 1));
    const mid = Math.round((data.bounds.low + data.bounds.high) / 2 / 1000) * 1000;
    return {
      output: {
        low: Math.max(data.bounds.low, Math.round((mid * 0.8) / 1000) * 1000),
        high: mid,
        factors: [{ text: 'Harness.', sourceRefs: [data.sources[0].ref] }],
        missing: [],
      },
      model: this.model,
      inputTokens: 0,
      outputTokens: 0,
    };
  }
}

let real: PriceModel | null = null;
if (live) {
  const apiKey = process.env.PRICE_ASSIST_API_KEY ?? '';
  if (!apiKey) {
    console.error('BLOCKED: PRICE_ASSIST_API_KEY is not set in apps/api/.env; no live run.');
    process.exit(2);
  }
  const effort = process.env.PRICE_ASSIST_EFFORT || 'low';
  real = new AnthropicPriceModel({
    apiKey,
    model: process.env.PRICE_ASSIST_MODEL || 'claude-opus-5-5',
    effort: effort === 'none' ? null : (effort as 'low'),
    timeoutMs: Number(process.env.PRICE_ASSIST_TIMEOUT_MS || 20000),
  });
}
const rate = rateFor(real?.model ?? '', null);

const results = [];
let spentMicro = 0;
for (const c of file.cases) {
  if (only && c.id !== only) continue;
  if (spentMicro >= maxUsd * 1e6) {
    results.push({ id: c.id, skipped: 'budget' });
    continue;
  }
  const book: BookFacts = { ...c.book, id: '00000000-0000-4000-8000-000000000000' };
  const input: PriceInput = { ...c.copy, bookId: book.id };
  const raw: RawSource[] = c.sources.map((s, i) => ({
    ...s,
    id: `${c.id}-${i}`,
    url: null,
    observedAt: new Date(asOf.getTime() - s.daysAgo * 86_400_000),
  }));
  const evidence = evaluate(input, book, raw, asOf);
  let status: string = evidence.status === 'Proceed' ? 'Pending' : evidence.status;
  let range: [number, number] | null = null;
  let failure: string | null = null;
  let tokens = { input: 0, output: 0 };
  let latencyMs: number | null = null;
  let modelId: string | null = null;
  if (evidence.status === 'Proceed') {
    const model = c.inject ? new Injector(c.inject) : (real ?? new Injector('fake'));
    const started = Date.now();
    try {
      const draft = await model.draft(SYSTEM_PROMPT, buildUserPrompt(input, book, evidence));
      tokens = { input: draft.inputTokens, output: draft.outputTokens };
      modelId = draft.model;
      const checked = checkOutput(draft.output, evidence);
      range = [checked.low, checked.high];
      status = 'Suggested';
    } catch (e) {
      status = 'Failed';
      failure =
        e instanceof PriceModelError
          ? e.kind
          : e instanceof InvalidModelOutput
            ? `InvalidOutput: ${e.message}`
            : 'ProviderError';
      if (e instanceof PriceModelError && e.usage)
        tokens = { input: e.usage.inputTokens, output: e.usage.outputTokens };
    }
    latencyMs = Date.now() - started;
  }
  const cost = c.inject || !real ? 0 : costMicroUsd(rate, tokens.input, tokens.output);
  spentMicro += cost;
  const reviewed = !!c.review.reviewedBy;
  const exp = c.expected.range;
  const mid = range ? (range[0] + range[1]) / 2 : null;
  results.push({
    id: c.id,
    category: c.category,
    injected: !!c.inject,
    reviewed,
    expectedStatus: c.expected.status,
    status,
    statusOk: status === c.expected.status,
    evidenceLevel: evidence.level,
    rules: evidence.rules,
    range,
    expectedRange: exp,
    midInExpected: reviewed && exp && mid !== null ? mid >= exp[0] && mid <= exp[1] : null,
    midErrorPct:
      reviewed && exp && mid !== null
        ? Math.round((Math.abs(mid - (exp[0] + exp[1]) / 2) / ((exp[0] + exp[1]) / 2)) * 1000) / 10
        : null,
    failure,
    model: modelId,
    latencyMs,
    tokens,
    costMicroUsd: cost,
  });
  console.log(`${c.id.padEnd(18)} ${status.padEnd(14)} ${range ? range.join('-') : ''}`);
}

const scored = results.filter((r) => 'status' in r) as Exclude<(typeof results)[number], { skipped: string }>[];
const modelCalls = scored.filter((r) => !r.injected && r.latencyMs !== null);
const latencies = modelCalls.map((r) => r.latencyMs!).sort((a, b) => a - b);
const pct = (p: number) => (latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(p * latencies.length) - 1)] : null);
const reviewedSuggest = scored.filter((r) => r.reviewed && r.expectedStatus === 'Suggested' && r.expectedRange);
const summary = {
  mode: live ? 'live' : 'fake-harness (not evidence)',
  model: real?.model ?? 'fault-injector',
  ranAt: new Date().toISOString(),
  cases: scored.length,
  statusCorrect: scored.filter((r) => r.statusOk).length,
  suggested: scored.filter((r) => r.status === 'Suggested').length,
  refusedOrNeedsData: scored.filter((r) => ['Refused', 'NeedsMoreData'].includes(r.status)).length,
  failed: scored.filter((r) => r.status === 'Failed').length,
  coverage: scored.filter((r) => r.expectedStatus === 'Suggested').length
    ? scored.filter((r) => r.expectedStatus === 'Suggested' && r.status === 'Suggested').length /
      scored.filter((r) => r.expectedStatus === 'Suggested').length
    : null,
  reviewedCases: scored.filter((r) => r.reviewed).length,
  midInExpected: reviewedSuggest.length
    ? `${reviewedSuggest.filter((r) => r.midInExpected).length}/${reviewedSuggest.length}`
    : 'NOT SCORED (no reviewed cases)',
  latencyMs: { p50: pct(0.5), p95: pct(0.95) },
  tokens: {
    input: modelCalls.reduce((t, r) => t + r.tokens.input, 0),
    output: modelCalls.reduce((t, r) => t + r.tokens.output, 0),
  },
  costUsd: spentMicro / 1e6,
  skipped: results.filter((r) => 'skipped' in r).map((r) => r.id),
};
console.log(JSON.stringify(summary, null, 2));
const out = join(here, 'results', live ? '' : 'harness');
mkdirSync(out, { recursive: true });
const stamp = summary.ranAt.replace(/[:.]/g, '-');
writeFileSync(join(out, `${stamp}.json`), JSON.stringify({ summary, results }, null, 2) + '\n');
console.log(`Saved ${join(out, `${stamp}.json`)}`);
