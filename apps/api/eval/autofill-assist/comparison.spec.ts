import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { join, relative, isAbsolute, sep } from 'node:path';
import { tmpdir } from 'node:os';
import {
  validatePlan,
  scoreCase,
  selectCandidate,
  promotionDecision,
  summarize,
  readComparisonPhotos,
  hash,
  type ComparisonPlan,
  type ComparisonRow,
} from './comparison.js';
const frozen = JSON.parse(
  readFileSync(
    new URL(
      '../../../../qa-data/listing-ai/comparison-plan.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as ComparisonPlan;
const fields = {
  title: 'Book',
  authors: ['Writer'],
  isbn: null,
  publisher: null,
  publicationYear: null,
  language: 'vi',
  edition: null,
};
const rowsFor = (
  model: string,
  phase: 'screen' | 'holdout',
  right: number,
): ComparisonRow[] =>
  frozen[phase].map((c, i) => {
    const read = {
      ...fields,
      title: i < right ? c.expected.title : 'Wrong',
      authors: c.expected.authors ?? [],
    };
    return {
      model,
      phase,
      id: c.id,
      fields: read,
      score: scoreCase(c, read),
      status: 'Suggested',
      failure: null,
      latencyMs: 1000,
      tokens: { input: 1, output: 1 },
      costMicroUsd: 1,
    };
  });
describe('frozen paired model comparison', () => {
  it('accepts the frozen plan without labelling AI transcription as human review', () => {
    expect(() => validatePlan(frozen, [])).not.toThrow();
    expect(frozen.holdout.every((c) => c.reviewed === false)).toBe(true);
  });
  it.each(['title', 'work', 'hash', 'human', 'duplicate'] as const)(
    'rejects %s leakage or invalid evidence before calls',
    (kind) => {
      const p = structuredClone(frozen);
      if (kind === 'title')
        p.holdout[0].expected.title = p.screen[0].expected.title;
      if (kind === 'work') p.holdout[0].workKey = p.screen[0].workKey;
      if (kind === 'hash')
        p.holdout[0].photos[0].sha256 = p.screen[0].photos[0].sha256;
      if (kind === 'human')
        (p.holdout[0] as unknown as { reviewed: boolean }).reviewed = true;
      if (kind === 'duplicate') p.holdout[1].id = p.holdout[0].id;
      expect(() => validatePlan(p, [])).toThrow();
    },
  );
  it('scores only frozen explicit title alternatives and keeps canonical misses visible', () => {
    const c = {
      ...frozen.holdout[0],
      titleAlternatives: ['Book'],
      expected: { title: 'Canonical', authors: ['Writer'], isbn: null },
    };
    expect(scoreCase(c, fields)).toMatchObject({
      titleExact: true,
      canonicalTitleExact: false,
      matchedTitleAlternative: 'Book',
    });
    expect(scoreCase(c, { ...fields, title: 'Bóok' }).titleExact).toBe(false);
  });
  it('rejects malformed ISBN answers before spending on a provider', () => {
    const p = structuredClone(frozen);
    p.holdout[0].expected.isbn = '9780000000000';
    expect(() => validatePlan(p, [])).toThrow('ISBN-13');
  });
  it('selects on development only; incomplete or failed models cannot win', () => {
    const base = rowsFor(frozen.models.baseline, 'screen', 2);
    const good = rowsFor(frozen.models.candidates[0], 'screen', 5);
    expect(selectCandidate(frozen, [...base, ...good])).toBe(
      frozen.models.candidates[0],
    );
    expect(selectCandidate(frozen, [...base, ...good.slice(1)])).toBeNull();
    good[0].status = 'Failed';
    expect(selectCandidate(frozen, [...base, ...good])).toBeNull();
  });
  it('requires complete paired gains and never converts recommendation into acceptance', () => {
    const candidate = frozen.models.candidates[0];
    const base = rowsFor(frozen.models.baseline, 'holdout', 7),
      next = rowsFor(candidate, 'holdout', 11);
    expect(
      promotionDecision(frozen, candidate, [...base, ...next]),
    ).toMatchObject({
      recommended: true,
      acceptance: expect.stringContaining('NOT_RUN'),
    });
    expect(
      promotionDecision(frozen, candidate, [...base, ...next.slice(1)])
        .recommended,
    ).toBe(false);
    expect(
      promotionDecision(frozen, 'unplanned-model', [...base, ...next])
        .recommended,
    ).toBe(false);
    next[0].latencyMs = 9000;
    expect(
      promotionDecision(frozen, candidate, [...base, ...next]).reason,
    ).toContain('Latency');
  });
  it('blocks author regression, wrong ISBN, provider failures and duplicate receipts', () => {
    const candidate = frozen.models.candidates[0];
    const base = rowsFor(frozen.models.baseline, 'holdout', 7),
      next = rowsFor(candidate, 'holdout', 11);
    next[0].score!.authorsExact = false;
    next[0].score!.isbnWrong = true;
    next[1].status = 'Failed';
    const decision = promotionDecision(frozen, candidate, [...base, ...next]);
    expect(decision.reason).toMatch(/Author regression/);
    expect(decision.reason).toMatch(/Wrong ISBN/);
    expect(decision.reason).toMatch(/Provider\/check failure/);
    expect(
      summarize(candidate, frozen.holdout, [...next.slice(1), next[1]])
        .complete,
    ).toBe(false);
  });
  it('checks physical paths and hashes before reading model inputs', async () => {
    const temp = await mkdtemp(join(tmpdir(), 'latlai-comparison-'));
    try {
      const corpus = join(temp, 'corpus');
      await mkdir(corpus);
      const bytes = Buffer.from('fixture');
      await writeFile(join(corpus, 'book.jpg'), bytes);
      await writeFile(join(temp, 'outside.jpg'), bytes);
      const c = {
        ...frozen.screen[0],
        photos: [{ path: 'book.jpg', sha256: hash(bytes) }],
      };
      expect((await readComparisonPhotos(corpus, [c])).get(c.id)).toEqual([
        bytes,
      ]);
      c.photos[0].sha256 = 'a'.repeat(64);
      await expect(readComparisonPhotos(corpus, [c])).rejects.toThrow('hash');
      c.photos[0] = { path: '../outside.jpg', sha256: hash(bytes) };
      await expect(readComparisonPhotos(corpus, [c])).rejects.toThrow(
        'outside',
      );
    } finally {
      const parent = await realpath(tmpdir()),
        full = await realpath(temp),
        rel = relative(parent, full);
      assert.ok(
        rel.startsWith('latlai-comparison-') &&
          !rel.includes(sep) &&
          !isAbsolute(rel),
        'Unsafe fixture cleanup',
      );
      await rm(full, { recursive: true });
    }
  });
});
