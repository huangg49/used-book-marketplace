import { describe, expect, it } from 'vitest';
import { score, upperBound95, type CaseResult } from './metrics.js';

const result = (over: Partial<CaseResult>): CaseResult => ({
  id: 'x',
  kind: 'Natural',
  expected: 'MustEscalate',
  escalationReasons: [],
  humanReviewed: false,
  reasons: ['realPhoto:Failed'],
  modelReasons: ['realPhoto:Failed'],
  criteria: [],
  stageFailures: [],
  calls: 3,
  inputTokens: 10,
  outputTokens: 1,
  costMicroUsd: 100,
  latencyMs: 1000,
  ...over,
});

describe('upperBound95', () => {
  it('matches the exact bound for zero events', () => {
    expect(upperBound95(0, 59)).toBeCloseTo(1 - 0.05 ** (1 / 59), 6);
    expect(upperBound95(0, 59)!).toBeLessThan(0.05);
    expect(upperBound95(0, 58)!).toBeGreaterThan(0.05);
  });
  it('widens with events and handles the edges', () => {
    expect(upperBound95(3, 100)!).toBeCloseTo(0.0757, 3);
    expect(upperBound95(0, 0)).toBeNull();
    expect(upperBound95(5, 5)).toBe(1);
  });
});

describe('score', () => {
  it('counts a must-escalate case with no reason as a false approval', () => {
    const s = score([
      result({ id: 'a', reasons: [], modelReasons: [] }),
      result({ id: 'b' }),
      result({ id: 'c', expected: 'Approvable', reasons: [], modelReasons: [] }),
      result({ id: 'd', expected: 'Approvable' }),
    ]);
    expect(s.falseApproval).toMatchObject({ count: 1, of: 2, rate: 0.5 });
    expect(s.automation).toMatchObject({ count: 1, of: 2, rate: 0.5 });
  });
  it('never scores ambiguous cases', () => {
    const s = score([result({ expected: 'Ambiguous', reasons: [] })]);
    expect(s.scored).toBe(0);
    expect(s.falseApproval.rate).toBeNull();
  });
  it('separates what the rules caught from what the model caught', () => {
    const s = score([result({ reasons: ['SellerTextInstruction'], modelReasons: [] })]);
    expect(s.falseApproval.count).toBe(0);
    expect(s.falseApprovalModelOnly.count).toBe(1);
  });
  it('shows what only the catalog comparison stopped', () => {
    const s = score([
      result({ id: 'a', reasons: ['TitleMismatch', 'AuthorMismatch'] }),
      result({ id: 'b', reasons: ['TitleMismatch', 'realPhoto:Failed'] }),
      result({ id: 'c', kind: 'ConstructedMismatch', reasons: ['TitleMismatch'] }),
    ]);
    expect(s.falseApproval.count).toBe(0);
    expect(s.falseApprovalIfTitleMatched).toMatchObject({ count: 1, of: 2 });
  });
  it('credits a reason only to a catcher meant for it', () => {
    const s = score([
      result({ escalationReasons: ['MultipleBooks'], reasons: ['singleCopy:Failed'] }),
      result({ escalationReasons: ['MultipleBooks'], reasons: ['realPhoto:Failed'] }),
    ]);
    expect(s.caughtByReason.MultipleBooks).toEqual({ caught: 1, of: 2 });
  });
  it('scores a criterion and bins its confidence against its own problem', () => {
    const c = (met: boolean, confidence: number) => ({
      criterion: 'singleCopy',
      pass: met,
      met,
      confidence,
    });
    const s = score([
      result({ escalationReasons: ['MultipleBooks'], criteria: [c(false, 0.9)] }),
      result({ escalationReasons: ['MultipleBooks'], criteria: [c(true, 0.9)] }),
      result({ expected: 'Approvable', reasons: [], criteria: [c(true, 0.9)] }),
    ]);
    expect(s.perCriterion.singleCopy).toMatchObject({ tp: 1, fn: 1, tn: 1, fp: 0, recall: 0.5 });
    expect(s.calibration.find((b) => b.range === '0.85-0.95')).toMatchObject({ n: 3 });
  });
  it('keeps the gate closed until enough human-reviewed cases exist', () => {
    const many = (n: number, over: Partial<CaseResult>) =>
      Array.from({ length: n }, (_, i) => result({ id: String(i), ...over }));
    const unreviewed = [
      ...many(70, {}),
      ...many(70, { expected: 'Approvable', reasons: [], modelReasons: [] }),
    ];
    expect(score(unreviewed).gate.met).toBe(false);
    const reviewed = [
      ...many(70, { humanReviewed: true }),
      ...many(70, { expected: 'Approvable', humanReviewed: true, reasons: [], modelReasons: [] }),
    ];
    expect(score(reviewed).gate.met).toBe(true);
    reviewed[0] = result({ humanReviewed: true, reasons: [], modelReasons: [] });
    reviewed[1] = result({ humanReviewed: true, reasons: [], modelReasons: [] });
    expect(score(reviewed).gate.met).toBe(false);
  });
});
