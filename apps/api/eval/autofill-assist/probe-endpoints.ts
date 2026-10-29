import 'dotenv/config';
import {
  mkdir,
  readFile,
  writeFile,
  open,
  rename,
  unlink,
} from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  readComparisonPhotos,
  hash,
  type ComparisonPlan,
} from './comparison.js';
import {
  callProbe,
  probeBody,
  validateProbePlan,
  validateProbeRows,
  endpointReport,
  PROBE_ENDPOINT,
  type ProbePlan,
  type ProbeRow,
} from './endpoint-probe.js';
import { processImage } from '../../src/modules/media/image-processor.js';
import { shrinkForModel } from '../../src/modules/autofill-assist/autofill-images.js';
import {
  costMicroUsd,
  rateFor,
} from '../../src/modules/price-assist/price-model.js';

if (
  process.argv.length !== 3 ||
  !['--live', '--report'].includes(process.argv[2])
)
  throw new Error(
    'Use --report for read-only results, or --live only with authorization for at most four paid provider calls.',
  );
const root = new URL('../../../../', import.meta.url);
const bytes = await readFile(
  new URL('qa-data/listing-ai/endpoint-probe-plan.json', root),
);
const plan = JSON.parse(bytes.toString()) as ProbePlan;
validateProbePlan(plan);
const dir = new URL('.tmp/listing-ai-endpoint-verification/', root);
const journalUrl = new URL('probe.json', dir);
if (process.argv[2] === '--report') {
  const journal = JSON.parse(await readFile(journalUrl, 'utf8')) as {
    planHash: string;
    rows: ProbeRow[];
  };
  if (journal.planHash !== hash(bytes))
    throw new Error('Report refers to a different plan.');
  const report = endpointReport(plan, journal.rows);
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'READY_FOR_DEVELOPMENT_ONLY') process.exitCode = 1;
} else {
  if (
    process.env.AUTOFILL_ENABLED !== 'true' ||
    !process.env.AUTOFILL_API_KEY ||
    (process.env.NVIDIA_BASE_URL &&
      process.env.NVIDIA_BASE_URL !== 'https://integrate.api.nvidia.com/v1')
  )
    throw new Error(
      'Configured NVIDIA server credentials/endpoint required; values withheld.',
    );
  const old = JSON.parse(
    await readFile(
      new URL('qa-data/listing-ai/comparison-plan.json', root),
      'utf8',
    ),
  ) as ComparisonPlan;
  const c = old.screen.find((c) => c.id === plan.developmentCaseId);
  if (!c)
    throw new Error('Only a previously exposed development case may be used.');
  const photo = (
    await readComparisonPhotos(
      fileURLToPath(
        new URL('qa-data/listing-ai/incoming/model-comparison/', root),
      ),
      [c],
    )
  ).get(c.id)![0];
  const derivative = await processImage(photo, {
    byteSize: photo.length,
    sha256: hash(photo),
    mimeType: 'image/jpeg',
  });
  const image = await shrinkForModel(derivative.bytes);
  await mkdir(dir, { recursive: true });
  const lockUrl = new URL('probe.lock', dir);
  const lock = await open(lockUrl, 'wx');
  try {
    type Journal = {
      planHash: string;
      photoSha256: string;
      endpoint: string;
      startedAt: string;
      rows: ProbeRow[];
    };
    let journal: Journal;
    try {
      journal = JSON.parse(await readFile(journalUrl, 'utf8'));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      journal = {
        planHash: hash(bytes),
        photoSha256: hash(photo),
        endpoint: PROBE_ENDPOINT,
        startedAt: new Date().toISOString(),
        rows: [],
      };
    }
    validateProbeRows(plan, journal.rows);
    if (
      journal.planHash !== hash(bytes) ||
      journal.photoSha256 !== hash(photo) ||
      journal.endpoint !== PROBE_ENDPOINT ||
      journal.rows.some((r) => r.state === 'Pending')
    )
      throw new Error(
        'Changed plan/photo or uncertain call; automatic replay prohibited.',
      );
    const save = async () => {
      const temp = new URL('probe.json.tmp', dir);
      await writeFile(temp, JSON.stringify(journal, null, 2) + '\n');
      await rename(temp, journalUrl);
    };
    for (const probe of plan.probes) {
      const requestHash = hash(JSON.stringify(probeBody(probe, image)));
      const prior = journal.rows.find((r) => r.id === probe.id);
      if (prior) {
        if (prior.requestHash !== requestHash)
          throw new Error(
            'Changed prompt/request; old journal cannot be reused.',
          );
        continue;
      }
      if (
        journal.rows.length >= plan.maxCalls ||
        journal.rows.reduce((s, r) => s + (r.costMicroUsd ?? 0), 0) >=
          plan.maxKnownEstimatedUsd * 1e6
      )
        break;
      const row: ProbeRow = { id: probe.id, requestHash, state: 'Pending' };
      journal.rows.push(row);
      await save();
      row.result = await callProbe(probe, image, process.env.AUTOFILL_API_KEY!);
      row.costMicroUsd = row.result.tokens
        ? costMicroUsd(
            rateFor(probe.model, null),
            row.result.tokens.input,
            row.result.tokens.output,
          )
        : 0;
      row.state = 'Complete';
      await save();
      console.log(
        JSON.stringify({
          id: row.id,
          status: row.result.status,
          httpStatus: row.result.httpStatus,
          headersMs: row.result.headersMs,
          latencyMs: row.result.latencyMs,
        }),
      );
    }
    const report = endpointReport(plan, journal.rows);
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== 'READY_FOR_DEVELOPMENT_ONLY') process.exitCode = 1;
  } finally {
    await lock.close();
    await unlink(lockUrl);
  }
}
