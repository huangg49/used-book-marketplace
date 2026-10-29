import 'dotenv/config';
import { readFile, writeFile, mkdir, open, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { NvidiaAutofillModel } from '../../src/modules/autofill-assist/autofill-model.js';
import {
  AUTOFILL_SYSTEM,
  AUTOFILL_USER,
} from '../../src/modules/autofill-assist/autofill-prompt.js';
import { checkAutofill } from '../../src/modules/autofill-assist/autofill-check.js';
import { shrinkForModel } from '../../src/modules/autofill-assist/autofill-images.js';
import { processImage } from '../../src/modules/media/image-processor.js';
import {
  PriceModelError,
  rateFor,
  costMicroUsd,
} from '../../src/modules/price-assist/price-model.js';
import {
  hash,
  validatePlan,
  readComparisonPhotos,
  scoreCase,
  summarize,
  selectCandidate,
  promotionDecision,
  type ComparisonPlan,
  type ComparisonRow,
} from './comparison.js';

// Explicit paid run; all candidates stay on the configured NVIDIA endpoint.
// pnpm eval:compare --phase screen|holdout
const args = process.argv.slice(2);
if (
  args.length !== 2 ||
  args[0] !== '--phase' ||
  !['screen', 'holdout'].includes(args[1])
)
  throw new Error('Use --phase screen or --phase holdout.');
const phase = args[1] as 'screen' | 'holdout';
const root = new URL('../../../../', import.meta.url);
const planBytes = await readFile(
  new URL('qa-data/listing-ai/comparison-plan.json', root),
);
const plan = JSON.parse(planBytes.toString()) as ComparisonPlan;
const exposed = JSON.parse(
  await readFile(
    new URL('qa-data/listing-ai/incoming/autofill/cover-scan/cases.json', root),
    'utf8',
  ),
) as { cases: { expected: { title: string } }[] };
validatePlan(
  plan,
  exposed.cases.map((c) => c.expected.title),
);
const base =
  process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
if (
  new URL(base).origin !== 'https://integrate.api.nvidia.com' ||
  process.env.AUTOFILL_ENABLED !== 'true' ||
  !process.env.AUTOFILL_API_KEY
)
  throw new Error(
    'Configured NVIDIA credentials/enabled flag required; values withheld.',
  );
const output = new URL('.tmp/listing-ai-model-selection/', root);
await mkdir(output, { recursive: true });
const lockUrl = new URL('comparison.lock', output);
const lock = await open(lockUrl, 'wx');
try {
  const journalUrl = new URL('comparison.json', output);
  const planHash = hash(planBytes),
    promptHash = hash(AUTOFILL_SYSTEM + '\n' + AUTOFILL_USER);
  type Journal = {
    planHash: string;
    promptHash: string;
    startedAt: string;
    updatedAt: string;
    rows: ComparisonRow[];
    selected: string | null;
    report?: unknown;
  };
  let journal: Journal;
  try {
    journal = JSON.parse(await readFile(journalUrl, 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    journal = {
      planHash,
      promptHash,
      startedAt: new Date().toISOString(),
      updatedAt: '',
      rows: [],
      selected: null,
    };
  }
  if (journal.planHash !== planHash || journal.promptHash !== promptHash)
    throw new Error(
      'Frozen plan/prompt changed: cannot reuse comparison journal.',
    );
  // Do not repeat a call whose response was lost; its cost/result is unknown.
  if (journal.rows.some((r) => r.status === 'Pending'))
    throw new Error(
      'Uncertain provider call in journal; no automatic paid replay.',
    );
  const save = async () => {
    journal.updatedAt = new Date().toISOString();
    await writeFile(journalUrl, JSON.stringify(journal, null, 2) + '\n');
  };
  const all = [...plan.screen, ...plan.holdout];
  const photos = await readComparisonPhotos(
    fileURLToPath(
      new URL('qa-data/listing-ai/incoming/model-comparison/', root),
    ),
    all,
  );
  const prepared = new Map<string, string[]>();
  const mime: Record<string, string> = {
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  for (const c of all) {
    const images: string[] = [];
    for (const bytes of photos.get(c.id)!) {
      const { format } = await sharp(bytes).metadata();
      const image = await processImage(bytes, {
        byteSize: bytes.length,
        sha256: hash(bytes),
        mimeType: mime[format ?? ''] ?? 'unsupported',
      });
      images.push(await shrinkForModel(image.bytes));
    }
    prepared.set(c.id, images);
  }
  if (phase === 'holdout') {
    const selected = selectCandidate(
      plan,
      journal.rows.filter((r) => r.phase === 'screen'),
    );
    if (!selected || selected !== journal.selected)
      throw new Error('No frozen development winner; holdout calls blocked.');
  }
  const models =
    phase === 'screen'
      ? [plan.models.baseline, ...plan.models.candidates]
      : [plan.models.baseline, journal.selected!];
  // Paired/interleaved ordering avoids running one model entirely at a different time.
  for (let index = 0; index < plan[phase].length; index++) {
    const c = plan[phase][index];
    const order = index % 2 ? [...models].reverse() : models;
    for (const model of order) {
      if (
        journal.rows.some(
          (r) => r.phase === phase && r.id === c.id && r.model === model,
        )
      )
        continue;
      const spent = journal.rows.reduce((sum, r) => sum + r.costMicroUsd, 0);
      if (
        spent >= plan.budget.maxEstimatedUsd * 1e6 ||
        journal.rows.length >= plan.budget.maxCalls
      )
        break;
      const row: ComparisonRow = {
        phase,
        id: c.id,
        model,
        status: 'Pending',
        failure: null,
        latencyMs: null,
        tokens: { input: 0, output: 0 },
        costMicroUsd: 0,
        fields: null,
        score: null,
      };
      journal.rows.push(row);
      await save(); // Record intent before network; never auto-repeat an uncertain call.
      const started = Date.now();
      const adapter = new NvidiaAutofillModel({
        apiKey: process.env.AUTOFILL_API_KEY!,
        model,
        fallbackModel: null,
        baseUrl: base,
        timeoutMs: plan.budget.timeoutMs,
      });
      try {
        const draft = await adapter.read(
          AUTOFILL_SYSTEM,
          AUTOFILL_USER,
          prepared.get(c.id)!,
        );
        row.tokens = { input: draft.inputTokens, output: draft.outputTokens };
        row.fields = checkAutofill(draft.output).fields;
        row.status = row.fields.title ? 'Suggested' : 'NeedsMoreData';
      } catch (e) {
        row.status = 'Failed';
        row.failure = e instanceof PriceModelError ? e.kind : 'InvalidOutput';
        if (e instanceof PriceModelError && e.usage)
          row.tokens = {
            input: e.usage.inputTokens,
            output: e.usage.outputTokens,
          };
      }
      row.latencyMs = Date.now() - started;
      row.costMicroUsd = costMicroUsd(
        rateFor(model, null),
        row.tokens.input,
        row.tokens.output,
      );
      row.score = scoreCase(c, row.fields);
      await save();
      console.log(
        `${phase} ${c.id} ${model}: ${row.status}, title=${row.score.titleExact}, ${row.latencyMs}ms`,
      );
    }
  }
  journal.selected = selectCandidate(
    plan,
    journal.rows.filter((r) => r.phase === 'screen'),
  );
  const summary = {
    phase,
    selected: journal.selected,
    knownEstimatedCostUsd:
      journal.rows.reduce((sum, r) => sum + r.costMicroUsd, 0) / 1e6,
    unpricedFailures: journal.rows.filter(
      (r) =>
        r.status === 'Failed' && r.tokens.input === 0 && r.tokens.output === 0,
    ).length,
    calls: journal.rows.length,
    costLimit:
      'Repository conservative token estimates, not a hard billing cap; errors without usage unpriced',
    latencyScope:
      'Same prepared image pipeline; provider and output check only, not HTTP/upload',
    screen: [plan.models.baseline, ...plan.models.candidates].map((m) =>
      summarize(
        m,
        plan.screen,
        journal.rows.filter((r) => r.phase === 'screen'),
      ),
    ),
    holdout: [
      plan.models.baseline,
      ...(journal.selected ? [journal.selected] : []),
    ].map((m) =>
      summarize(
        m,
        plan.holdout,
        journal.rows.filter((r) => r.phase === 'holdout'),
      ),
    ),
    decision: promotionDecision(
      plan,
      journal.selected,
      journal.rows.filter((r) => r.phase === 'holdout'),
    ),
    realCamera: 'NOT_RUN',
    humanReview: 'NOT_RUN',
    positiveIsbn: 'NOT_RUN',
  };
  journal.report = summary;
  await save();
  console.log(JSON.stringify(summary, null, 2));
  if (
    (phase === 'screen' ? summary.screen : summary.holdout).some(
      (s) => !s.complete || s.failures,
    )
  )
    process.exitCode = 1;
} finally {
  await lock.close();
  await unlink(lockUrl);
}
