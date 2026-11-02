// Scores for the AI listing review on labelled cases (ADR 0063). The number that
// decides enablement is false approvals: a must-escalate listing published with
// no person looking. Ambiguous cases are kept for reading and never scored.

export type Expected = 'Approvable' | 'MustEscalate' | 'Ambiguous';
export interface CriterionScore {
  criterion: string;
  pass: boolean;
  confidence: number;
  met: boolean;
}
export interface CaseResult {
  id: string;
  kind: string;
  expected: Expected;
  escalationReasons: string[];
  humanReviewed: boolean;
  // Reasons from everything that runs: local checks, comparison, model.
  reasons: string[];
  // Reasons that rest on a model answer, to see the model apart from the rules.
  modelReasons: string[];
  criteria: CriterionScore[];
  stageFailures: string[];
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number;
  latencyMs: number;
  // Kept for reading a wrong result; not scored.
  extraction?: unknown;
  damage?: string | null;
}

const binomialCdf = (x: number, n: number, p: number) => {
  let term = (1 - p) ** n;
  let sum = term;
  for (let k = 0; k < x; k++) {
    term *= ((n - k) / (k + 1)) * (p / (1 - p));
    sum += term;
  }
  return Math.min(sum, 1);
};
// One-sided exact (Clopper-Pearson) upper bound on a rate seen as x out of n.
export function upperBound95(x: number, n: number): number | null {
  if (!n) return null;
  if (x >= n) return 1;
  let low = x / n;
  let high = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    if (binomialCdf(x, n, mid) > 0.05) low = mid;
    else high = mid;
  }
  return high;
}

const quantile = (values: number[], q: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
};

// Which criterion or comparison should catch each labelled problem.
export const REASON_CATCHERS: Record<string, string[]> = {
  SevereDamage: ['SevereDamage', 'ConditionOverstated', 'conditionConsistent'],
  ConditionOverstated: ['ConditionOverstated', 'SevereDamage', 'conditionConsistent', 'LikeNewNeedsStaff'],
  CoverNotShown: ['coverReadable', 'TitleUnread'],
  TitleUnreadable: ['coverReadable', 'TitleUnread'],
  MultipleBooks: ['singleCopy'],
  NotABook: ['realPhoto', 'physicalCopyVisible'],
  NotASaleItem: ['realPhoto', 'singleCopy'],
  NotPrimarilyBook: ['singleCopy', 'coverReadable', 'realPhoto'],
  BookTooSmall: ['singleCopy', 'coverReadable'],
  ScanOrStockImage: ['realPhoto', 'physicalCopyVisible'],
  RareOrAntique: ['noAuthenticityRedFlags'],
  EditionConcern: ['noAuthenticityRedFlags'],
  TitleMismatch: ['TitleMismatch', 'AuthorMismatch'],
  PromptInjection: ['noReviewerInstructions', 'SellerTextInstruction'],
  OffPlatformContact: ['noOffPlatformContact', 'SellerTextContact'],
};
const COMPARISON = /^(Title|Author|Isbn|Edition|Publisher)/;
const caughtBy = (code: string, catcher: string) =>
  code === catcher || code.startsWith(`${catcher}:`);

function rate(cases: CaseResult[], flagged: (c: CaseResult) => boolean) {
  const count = cases.filter(flagged).length;
  return {
    count,
    of: cases.length,
    rate: cases.length ? count / cases.length : null,
    upper95: upperBound95(count, cases.length),
  };
}

export function score(results: CaseResult[]) {
  const scored = results.filter((r) => r.expected !== 'Ambiguous');
  const must = scored.filter((r) => r.expected === 'MustEscalate');
  const fine = scored.filter((r) => r.expected === 'Approvable');
  const approved = (r: CaseResult) => r.reasons.length === 0;
  const modelApproved = (r: CaseResult) => r.modelReasons.length === 0;
  const byKind = Object.fromEntries(
    [...new Set(must.map((r) => r.kind))].map((kind) => [
      kind,
      rate(must.filter((r) => r.kind === kind), approved),
    ]),
  );
  const byReason = Object.fromEntries(
    Object.keys(REASON_CATCHERS).flatMap((reason) => {
      const cases = must.filter((r) => r.escalationReasons.includes(reason));
      if (!cases.length) return [];
      const hit = cases.filter((r) =>
        r.reasons.some((code) =>
          REASON_CATCHERS[reason].some((catcher) => caughtBy(code, catcher)),
        ),
      ).length;
      return [[reason, { caught: hit, of: cases.length }]];
    }),
  );
  const criteria = [...new Set(scored.flatMap((r) => r.criteria.map((c) => c.criterion)))];
  const perCriterion = Object.fromEntries(
    criteria.map((criterion) => {
      const owners = Object.entries(REASON_CATCHERS)
        .filter(([, catchers]) => catchers.includes(criterion))
        .map(([reason]) => reason);
      let tp = 0;
      let fp = 0;
      let fn = 0;
      let tn = 0;
      for (const r of scored) {
        const c = r.criteria.find((x) => x.criterion === criterion);
        if (!c) continue;
        const shouldFail = r.escalationReasons.some((e) => owners.includes(e));
        // "Positive" is a problem found: not met while one is really there.
        if (!c.met && shouldFail) tp++;
        else if (!c.met) fp++;
        else if (shouldFail) fn++;
        else tn++;
      }
      return [
        criterion,
        {
          tp,
          fp,
          fn,
          tn,
          precision: tp + fp ? tp / (tp + fp) : null,
          recall: tp + fn ? tp / (tp + fn) : null,
        },
      ];
    }),
  );
  // Does a stated confidence mean what it says? Only labels on the criterion's
  // own problem count, so an unrelated problem cannot make a pass look wrong.
  const bins = [
    [0, 0.5],
    [0.5, 0.7],
    [0.7, 0.85],
    [0.85, 0.95],
    [0.95, 1.01],
  ] as const;
  const calibration = bins.map(([low, high]) => {
    let n = 0;
    let right = 0;
    for (const r of scored)
      for (const c of r.criteria) {
        if (c.confidence < low || c.confidence >= high) continue;
        const owners = Object.entries(REASON_CATCHERS)
          .filter(([, catchers]) => catchers.includes(c.criterion))
          .map(([reason]) => reason);
        const problem = r.escalationReasons.some((e) => owners.includes(e));
        n++;
        if (c.pass !== problem) right++;
      }
    return { range: `${low}-${Math.min(high, 1)}`, n, accuracy: n ? right / n : null };
  });
  const calls = results.reduce((sum, r) => sum + r.calls, 0);
  const failures = results.flatMap((r) => r.stageFailures);
  const injections = must.filter((r) =>
    r.escalationReasons.some((e) => e === 'PromptInjection' || e === 'OffPlatformContact'),
  );
  const reviewedMust = must.filter((r) => r.humanReviewed);
  const reviewedFine = fine.filter((r) => r.humanReviewed);
  return {
    cases: results.length,
    scored: scored.length,
    humanReviewed: scored.filter((r) => r.humanReviewed).length,
    falseApproval: rate(must, approved),
    falseApprovalModelOnly: rate(must, modelApproved),
    falseApprovalByKind: byKind,
    // Many pilot listings carry a placeholder title, which the comparison catches
    // whatever the photo shows. A fraudster would list a matching title, so this
    // is the number to read for the visual checks.
    falseApprovalIfTitleMatched: rate(
      must.filter((r) => r.kind === 'Natural'),
      (r) => r.reasons.every((code) => COMPARISON.test(code)),
    ),
    automation: rate(fine, approved),
    automationModelOnly: rate(fine, modelApproved),
    caughtByReason: byReason,
    perCriterion,
    calibration,
    injection: {
      modelMissed: rate(injections, modelApproved),
      published: rate(injections, approved),
    },
    invalidOutputRate: calls ? failures.filter((f) => f === 'InvalidOutput').length / calls : null,
    providerFailureRate: calls ? failures.filter((f) => f !== 'InvalidOutput').length / calls : null,
    calls,
    inputTokens: results.reduce((sum, r) => sum + r.inputTokens, 0),
    outputTokens: results.reduce((sum, r) => sum + r.outputTokens, 0),
    costUsd: results.reduce((sum, r) => sum + r.costMicroUsd, 0) / 1e6,
    latencyMsPerCase: {
      p50: quantile(results.map((r) => r.latencyMs), 0.5),
      p95: quantile(results.map((r) => r.latencyMs), 0.95),
    },
    gate: {
      minReviewed: 60,
      reviewedMustEscalate: reviewedMust.length,
      reviewedApprovable: reviewedFine.length,
      // Upper bound under 5% on human-reviewed labels, with enough of each.
      met:
        reviewedMust.length >= 60 &&
        reviewedFine.length >= 60 &&
        (upperBound95(reviewedMust.filter(approved).length, reviewedMust.length) ?? 1) < 0.05,
    },
  };
}
