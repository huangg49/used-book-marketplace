import type { AutofillModel } from '../autofill-assist/autofill-model.js';
import {
  costMicroUsd,
  PriceModelError,
  rateFor,
} from '../price-assist/price-model.js';
import {
  compareExtraction,
  comparisonReasons,
  damageReasons,
  judgeCriteria,
  parseExtraction,
  parseText,
  parseVisual,
  TEXT_CRITERIA,
  VISUAL_CRITERIA,
  type CatalogFacts,
  type Comparison,
  type Condition,
  type CriterionResult,
  type Damage,
  type Extraction,
} from './auto-review-policy.js';
import {
  EXTRACT_SYSTEM,
  EXTRACT_USER,
  TEXT_SYSTEM,
  textUser,
  VISUAL_SYSTEM,
  visualUser,
} from './auto-review-prompt.js';

export type StageName = 'Text' | 'Extraction' | 'Visual';
export interface StageStatus {
  stage: StageName;
  status: 'Completed' | 'Unavailable' | 'NotRun';
}
export interface PipelineInput {
  condition: Condition;
  seller: Record<string, string>;
  images: string[];
  catalog: CatalogFacts;
  barcodes: string[];
  minConfidence: number;
  // Evaluation only: run every stage so each criterion gets measured.
  exhaustive?: boolean;
}
export interface PipelineResult {
  reasons: string[];
  stages: StageStatus[];
  criteria: CriterionResult[];
  extraction: Extraction | null;
  comparison: Comparison | null;
  damage: Damage | null;
  usage: { calls: number; inputTokens: number; outputTokens: number; costMicroUsd: number };
  latencyMs: number;
  // Why a stage had no assessment: provider failure kinds, for logs and evaluation.
  failures: string[];
}

// Stops at the first stage that sends the listing to Staff, so a listing that
// will reach a person anyway costs fewer calls. Provider failure and malformed
// output are no assessment, never an approval. Also the entry point of the
// evaluation harness, so what is measured is what runs.
export async function runAutoReviewPipeline(
  model: AutofillModel,
  input: PipelineInput,
): Promise<PipelineResult> {
  const started = Date.now();
  const result: PipelineResult = {
    reasons: [],
    stages: [
      { stage: 'Text', status: 'NotRun' },
      { stage: 'Extraction', status: 'NotRun' },
      { stage: 'Visual', status: 'NotRun' },
    ],
    criteria: [],
    extraction: null,
    comparison: null,
    damage: null,
    usage: { calls: 0, inputTokens: 0, outputTokens: 0, costMicroUsd: 0 },
    latencyMs: 0,
    failures: [],
  };
  const stop = () => result.reasons.length > 0 && !input.exhaustive;
  const count = (usage: { inputTokens: number; outputTokens: number }) => {
    result.usage.inputTokens += usage.inputTokens;
    result.usage.outputTokens += usage.outputTokens;
    result.usage.costMicroUsd += costMicroUsd(
      rateFor(model.model, null),
      usage.inputTokens,
      usage.outputTokens,
    );
  };
  async function call<T>(
    stage: StageName,
    system: string,
    user: string,
    images: string[],
    parse: (raw: unknown) => T | null,
  ): Promise<T | null> {
    const status = result.stages.find((s) => s.stage === stage)!;
    result.usage.calls++;
    let parsed: T | null = null;
    try {
      const draft = await model.read(system, user, images);
      count(draft);
      parsed = parse(draft.output);
      if (!parsed) result.failures.push('InvalidOutput');
    } catch (e) {
      if (e instanceof PriceModelError && e.usage) count(e.usage);
      result.failures.push(e instanceof PriceModelError ? e.kind : 'ProviderError');
    }
    status.status = parsed ? 'Completed' : 'Unavailable';
    if (!parsed) result.reasons.push(`${stage}:AssessmentUnavailable`);
    return parsed;
  }
  const finish = () => ({ ...result, latencyMs: Date.now() - started });

  const text = await call('Text', TEXT_SYSTEM, textUser(input.condition, input.seller), [], parseText);
  if (text) {
    const judged = judgeCriteria('Text', text, TEXT_CRITERIA, input.minConfidence);
    result.criteria.push(...judged.results);
    result.reasons.push(...judged.reasons);
  }
  if (stop()) return finish();

  const read = await call('Extraction', EXTRACT_SYSTEM, EXTRACT_USER, input.images, parseExtraction);
  if (read) {
    result.extraction = read;
    result.comparison = compareExtraction(read, input.catalog, input.barcodes);
    result.reasons.push(...comparisonReasons(result.comparison, read));
  }
  if (stop()) return finish();

  const visual = await call('Visual', VISUAL_SYSTEM, visualUser(input.condition), input.images, parseVisual);
  if (visual) {
    result.damage = visual.damage;
    const judged = judgeCriteria('Visual', visual, VISUAL_CRITERIA, input.minConfidence);
    result.criteria.push(...judged.results);
    result.reasons.push(...judged.reasons, ...damageReasons(input.condition, visual.damage));
  }
  return finish();
}
