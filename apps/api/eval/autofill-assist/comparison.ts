import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { scoreAutofill, type ExpectedAutofill } from './quality.js';
import type { AutofillFields } from '../../src/modules/autofill-assist/autofill-check.js';

export interface ComparisonCase {
  id: string;
  bookKey: string;
  workKey: string;
  source: 'cover-scan';
  reviewed: false;
  photos: { path: string; sha256: string }[];
  expected: ExpectedAutofill;
  titleAlternatives: string[];
}
export interface ComparisonPlan {
  schemaVersion: number;
  models: { baseline: string; candidates: string[] };
  budget: { maxEstimatedUsd: number; maxCalls: number; timeoutMs: number };
  selection: { minimumTitleGain: number };
  promotion: {
    holdoutCases: number;
    minimumCorrectTitles: number;
    minimumTitleGain: number;
    maxWrongIsbn: number;
    maxFailures: number;
    maxP95Ms: number;
    noAuthorRegression: boolean;
    requiresHumanRealCameraBeforeAcceptance: boolean;
  };
  screen: ComparisonCase[];
  holdout: ComparisonCase[];
}
export interface ComparisonRow {
  phase: 'screen' | 'holdout';
  id: string;
  model: string;
  status: 'Pending' | 'Suggested' | 'NeedsMoreData' | 'Failed';
  failure: string | null;
  latencyMs: number | null;
  tokens: { input: number; output: number };
  costMicroUsd: number;
  fields: AutofillFields | null;
  score: ReturnType<typeof scoreCase> | null;
}
const titleKey = (s: string) =>
  s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
export const hash = (data: string | Buffer) =>
  createHash('sha256').update(data).digest('hex');

export function validatePlan(plan: ComparisonPlan, exposedTitles: string[]) {
  if (plan.schemaVersion !== 1 || !plan.screen?.length || !plan.holdout?.length)
    throw new Error('Non-empty development and holdout sets required.');
  if (
    !Number.isFinite(plan.budget.maxEstimatedUsd) ||
    plan.budget.maxEstimatedUsd <= 0 ||
    !Number.isSafeInteger(plan.budget.maxCalls) ||
    plan.budget.maxCalls <= 0 ||
    !Number.isSafeInteger(plan.budget.timeoutMs) ||
    plan.budget.timeoutMs <= 0
  )
    throw new Error('Invalid bounded evaluation budget.');
  if (
    plan.holdout.length !== plan.promotion.holdoutCases ||
    plan.promotion.minimumCorrectTitles > plan.holdout.length ||
    plan.promotion.minimumCorrectTitles <= 0 ||
    plan.promotion.minimumTitleGain < 1 ||
    plan.selection.minimumTitleGain < 1 ||
    plan.promotion.maxWrongIsbn !== 0 ||
    plan.promotion.maxFailures !== 0 ||
    plan.promotion.noAuthorRegression !== true ||
    plan.promotion.requiresHumanRealCameraBeforeAcceptance !== true ||
    !Number.isFinite(plan.promotion.maxP95Ms) ||
    plan.promotion.maxP95Ms <= 0
  )
    throw new Error('Missing or inconsistent promotion gates.');
  const models = [plan.models.baseline, ...plan.models.candidates];
  if (models.some((m) => !m?.trim()) || new Set(models).size !== models.length)
    throw new Error('Distinct model IDs required.');
  const ids = new Set<string>(),
    work = new Set<string>(),
    photos = new Set<string>();
  const exposed = new Set(
    [...exposedTitles, ...plan.screen.map((c) => c.expected.title)].map(
      titleKey,
    ),
  );
  const exposedWork = new Set(plan.screen.map((c) => c.workKey));
  for (const [phase, cases] of [
    ['screen', plan.screen],
    ['holdout', plan.holdout],
  ] as const) {
    for (const c of cases) {
      if (
        !c.id?.trim() ||
        ids.has(c.id) ||
        !c.workKey?.trim() ||
        !c.bookKey?.trim() ||
        c.source !== 'cover-scan' ||
        c.reviewed !== false ||
        !c.expected?.title?.trim() ||
        !Array.isArray(c.titleAlternatives) ||
        c.titleAlternatives.some((t) => !t.trim()) ||
        !Array.isArray(c.photos) ||
        c.photos.length < 1 ||
        c.photos.length > 3 ||
        (c.expected.authors !== undefined &&
          (!Array.isArray(c.expected.authors) ||
            c.expected.authors.some((a) => !a?.trim())))
      )
        throw new Error(
          'Invalid, duplicate or falsely reviewed comparison case.',
        );
      const isbn = c.expected.isbn;
      if (
        isbn !== null &&
        (typeof isbn !== 'string' ||
          !/^\d{13}$/.test(isbn) ||
          [...isbn].reduce(
            (sum, digit, index) => sum + Number(digit) * (index % 2 ? 3 : 1),
            0,
          ) %
            10 !==
            0)
      )
        throw new Error(
          'Explicit null or valid ISBN-13 answer required before paid calls.',
        );
      ids.add(c.id);
      if (phase === 'holdout') {
        if (
          work.has(c.workKey) ||
          exposedWork.has(c.workKey) ||
          [c.expected.title, ...c.titleAlternatives].some((t) =>
            exposed.has(titleKey(t)),
          )
        )
          throw new Error(
            'Holdout overlaps exposed work identity or repeats a work.',
          );
        work.add(c.workKey);
      }
      for (const p of c.photos) {
        if (!/^[a-f0-9]{64}$/.test(p.sha256) || photos.has(p.sha256))
          throw new Error('Missing or duplicate photo hash.');
        photos.add(p.sha256);
      }
    }
  }
}
// Validate the complete image set before a single paid call, including symlinks.
export async function readComparisonPhotos(
  dir: string,
  cases: ComparisonCase[],
) {
  const root = await realpath(dir),
    result = new Map<string, Buffer[]>();
  for (const c of cases) {
    const bytes: Buffer[] = [];
    for (const photo of c.photos) {
      if (!photo.path || isAbsolute(photo.path))
        throw new Error('Relative image path required.');
      const full = await realpath(resolve(root, photo.path)),
        rel = relative(root, full);
      if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
        throw new Error('Image outside comparison folder.');
      const data = await readFile(full);
      if (data.length > 10_000_000 || hash(data) !== photo.sha256)
        throw new Error('Image size/hash differs from frozen plan.');
      bytes.push(data);
    }
    result.set(c.id, bytes);
  }
  return result;
}
export function scoreCase(c: ComparisonCase, fields: AutofillFields | null) {
  const canonical = scoreAutofill(c.expected, fields);
  const alias = c.titleAlternatives.find(
    (title) => scoreAutofill({ ...c.expected, title }, fields).titleExact,
  );
  return {
    ...canonical,
    canonicalTitleExact: canonical.titleExact,
    titleExact: canonical.titleExact || !!alias,
    matchedTitleAlternative: alias ?? null,
  };
}
export function summarize(
  model: string,
  cases: ComparisonCase[],
  rows: ComparisonRow[],
) {
  const selected = rows.filter(
    (r) => r.model === model && cases.some((c) => c.id === r.id),
  );
  const complete =
    selected.length === cases.length &&
    cases.every((c) => selected.filter((r) => r.id === c.id).length === 1) &&
    selected.every((r) => r.status !== 'Pending');
  const times = selected
    .flatMap((r) => (r.latencyMs === null ? [] : [r.latencyMs]))
    .sort((a, b) => a - b);
  const percentile = (p: number) =>
    times.length ? times[Math.ceil(times.length * p) - 1] : null;
  return {
    model,
    complete,
    expectedCases: cases.length,
    attempted: selected.length,
    successfulResponses: selected.filter(
      (r) => r.status === 'Suggested' || r.status === 'NeedsMoreData',
    ).length,
    unpricedFailures: selected.filter(
      (r) =>
        r.status === 'Failed' && r.tokens.input === 0 && r.tokens.output === 0,
    ).length,
    titleExact: selected.filter((r) => r.score?.titleExact).length,
    canonicalTitleExact: selected.filter((r) => r.score?.canonicalTitleExact)
      .length,
    authorsScored: selected.filter(
      (r) => typeof r.score?.authorsExact === 'boolean',
    ).length,
    authorsExact: selected.filter((r) => r.score?.authorsExact).length,
    wrongIsbn: selected.filter((r) => r.score?.isbnWrong).length,
    failures: selected.filter(
      (r) => r.status === 'Failed' || r.status === 'Pending',
    ).length,
    latencyMs: { p50: percentile(0.5), p95: percentile(0.95) },
    costUsd: selected.reduce((s, r) => s + r.costMicroUsd, 0) / 1e6,
  };
}
export function selectCandidate(plan: ComparisonPlan, rows: ComparisonRow[]) {
  const baseline = summarize(plan.models.baseline, plan.screen, rows);
  if (!baseline.complete || baseline.failures) return null;
  const candidates = plan.models.candidates
    .map((m) => summarize(m, plan.screen, rows))
    .filter(
      (s) =>
        s.complete &&
        !s.failures &&
        !s.wrongIsbn &&
        s.titleExact >= baseline.titleExact + plan.selection.minimumTitleGain,
    );
  candidates.sort(
    (a, b) =>
      b.titleExact - a.titleExact ||
      b.authorsExact - a.authorsExact ||
      (a.latencyMs.p95 ?? Infinity) - (b.latencyMs.p95 ?? Infinity) ||
      a.model.localeCompare(b.model),
  );
  return candidates[0]?.model ?? null;
}
export function promotionDecision(
  plan: ComparisonPlan,
  candidate: string | null,
  rows: ComparisonRow[],
) {
  if (!candidate || !plan.models.candidates.includes(candidate))
    return {
      recommended: false,
      reason: 'No qualifying development candidate',
      acceptance: 'NOT_RUN: human real-camera evidence required',
    };
  const baseline = summarize(plan.models.baseline, plan.holdout, rows),
    next = summarize(candidate, plan.holdout, rows);
  const failures = [
    ...(!baseline.complete || !next.complete
      ? ['Incomplete paired holdout']
      : []),
    ...(baseline.failures ? ['Baseline provider/check failure'] : []),
    ...(next.titleExact < plan.promotion.minimumCorrectTitles
      ? ['Title threshold']
      : []),
    ...(next.titleExact - baseline.titleExact < plan.promotion.minimumTitleGain
      ? ['Paired title gain']
      : []),
    ...(next.authorsExact < baseline.authorsExact ||
    next.authorsScored !== baseline.authorsScored
      ? ['Author regression/coverage']
      : []),
    ...(next.wrongIsbn > plan.promotion.maxWrongIsbn ? ['Wrong ISBN'] : []),
    ...(next.failures > plan.promotion.maxFailures
      ? ['Provider/check failure']
      : []),
    ...(next.latencyMs.p95 === null ||
    next.latencyMs.p95 > plan.promotion.maxP95Ms
      ? ['Latency threshold']
      : []),
  ];
  return {
    recommended: failures.length === 0,
    reason: failures.length
      ? failures.join('; ')
      : 'Frozen exploratory comparison gates met',
    acceptance: 'NOT_RUN: human real-camera evidence required',
  };
}
