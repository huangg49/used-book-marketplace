import { checkAutofill } from '../../src/modules/autofill-assist/autofill-check.js';
import {
  AUTOFILL_SYSTEM,
  AUTOFILL_USER,
} from '../../src/modules/autofill-assist/autofill-prompt.js';
import { answerText } from '../../src/modules/price-assist/nvidia-chat.js';

export const PROBE_ENDPOINT =
  'https://integrate.api.nvidia.com/v1/chat/completions';
export interface Probe {
  id: string;
  model: string;
  profile:
    | 'text-control'
    | 'image-control'
    | 'single-user-autofill'
    | 'production-autofill';
  timeoutMs: number;
  maxTokens: number;
}
export interface ProbePlan {
  schemaVersion: number;
  endpoint: string;
  developmentCaseId: string;
  maxCalls: number;
  maxKnownEstimatedUsd: number;
  probes: Probe[];
}
export function validateProbePlan(plan: ProbePlan) {
  const allowedProfiles = [
    'text-control',
    'image-control',
    'single-user-autofill',
    'production-autofill',
  ];
  if (
    plan.schemaVersion !== 1 ||
    plan.endpoint !== PROBE_ENDPOINT ||
    !plan.developmentCaseId?.trim() ||
    !Number.isSafeInteger(plan.maxCalls) ||
    plan.maxCalls < 1 ||
    plan.maxCalls > 4 ||
    !Number.isFinite(plan.maxKnownEstimatedUsd) ||
    plan.maxKnownEstimatedUsd <= 0 ||
    plan.maxKnownEstimatedUsd > 0.05 ||
    !Array.isArray(plan.probes) ||
    !plan.probes.length ||
    plan.probes.length > plan.maxCalls ||
    new Set(plan.probes.map((p) => p.id)).size !== plan.probes.length
  )
    throw new Error('Invalid bounded endpoint plan.');
  for (const p of plan.probes) {
    if (
      !p.id?.trim() ||
      ![
        'google/gemma-4-31b-it',
        'nvidia/nemotron-3.5-super-vl-120b-a12b',
      ].includes(p.model) ||
      !allowedProfiles.includes(p.profile) ||
      !Number.isSafeInteger(p.timeoutMs) ||
      p.timeoutMs < 1 ||
      p.timeoutMs > 25000 ||
      !Number.isSafeInteger(p.maxTokens) ||
      p.maxTokens < 1 ||
      p.maxTokens > 1200
    )
      throw new Error('Invalid endpoint probe.');
  }
}
export function probeBody(probe: Probe, image: string) {
  if (!image.startsWith('data:image/jpeg;base64,'))
    throw new Error('Prepared JPEG required.');
  const part = { type: 'image_url', image_url: { url: image } };
  const messages =
    probe.profile === 'text-control'
      ? [{ role: 'user', content: 'Return only JSON: {"ok":true}' }]
      : probe.profile === 'image-control'
        ? [
            {
              role: 'user',
              content: [
                part,
                {
                  type: 'text',
                  text: 'Chép tên sách in trên bìa. Chỉ trả JSON {"title":string|null}. Không đoán.',
                },
              ],
            },
          ]
        : probe.profile === 'single-user-autofill'
          ? [
              {
                role: 'user',
                content: [
                  part,
                  {
                    type: 'text',
                    text: AUTOFILL_SYSTEM + '\n' + AUTOFILL_USER,
                  },
                ],
              },
            ]
          : [
              { role: 'system', content: AUTOFILL_SYSTEM },
              {
                role: 'user',
                content: [{ type: 'text', text: AUTOFILL_USER }, part],
              },
            ];
  return {
    model: probe.model,
    messages,
    temperature: 0.2,
    max_tokens: probe.maxTokens,
    stream: false,
    chat_template_kwargs: { enable_thinking: false },
  };
}
// Do not persist provider error details, thought traces, headers, keys or image data.
// Channel tags are parsed only for diagnostics; the production parser is unchanged.
export function probeAnswer(body: unknown, probe: Probe) {
  const b =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const usage = b.usage as
    { prompt_tokens?: unknown; completion_tokens?: unknown } | undefined;
  const usageKnown =
    !!usage &&
    [usage.prompt_tokens, usage.completion_tokens].every(
      (n) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0,
    );
  const tokens = usageKnown
    ? {
        input: usage!.prompt_tokens as number,
        output: usage!.completion_tokens as number,
      }
    : null;
  const choice = (
    b.choices as
      | {
          finish_reason?: string;
          message?: { content?: unknown; refusal?: unknown };
        }[]
      | undefined
  )?.[0];
  const base = {
    usageKnown,
    tokens,
    fields: null as ReturnType<typeof checkAutofill>['fields'] | null,
    title: null as string | null,
    channelEnvelope: false,
  };
  if (choice?.finish_reason === 'length')
    return { ...base, status: 'Truncated' };
  if (choice?.finish_reason === 'content_filter' || choice?.message?.refusal)
    return { ...base, status: 'Refused' };
  if (typeof choice?.message?.content !== 'string')
    return { ...base, status: 'NoContent' };
  let raw = choice.message.content;
  if (raw.startsWith('<|channel>thought') && raw.includes('<channel|>')) {
    raw = raw.slice(raw.indexOf('<channel|>') + '<channel|>'.length);
    base.channelEnvelope = true;
  }
  try {
    const output = JSON.parse(answerText(raw)) as Record<string, unknown>;
    if (probe.profile === 'text-control')
      return {
        ...base,
        status: output.ok === true ? 'Available' : 'InvalidOutput',
      };
    if (probe.profile === 'image-control')
      return {
        ...base,
        status:
          typeof output.title === 'string' && output.title.trim()
            ? 'Available'
            : 'NeedsMoreData',
        title:
          typeof output.title === 'string' ? output.title.slice(0, 300) : null,
      };
    const checked = checkAutofill(output);
    return {
      ...base,
      fields: checked.fields,
      title: checked.fields.title,
      status: checked.fields.title ? 'Available' : 'NeedsMoreData',
    };
  } catch {
    return { ...base, status: 'InvalidOutput' };
  }
}
export async function callProbe(
  probe: Probe,
  image: string,
  apiKey: string,
  fetcher: typeof fetch = fetch,
) {
  const started = Date.now(),
    controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), probe.timeoutMs);
  let httpStatus: number | null = null,
    headersMs: number | null = null;
  try {
    const response = await fetcher(PROBE_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(probeBody(probe, image)),
    });
    headersMs = Date.now() - started;
    httpStatus = response.status;
    if (httpStatus !== 200) {
      await response.body?.cancel();
      return {
        status: httpStatus === 202 ? 'AsyncPending' : 'HttpError',
        httpStatus,
        headersMs,
        latencyMs: Date.now() - started,
        usageKnown: false,
        tokens: null,
        fields: null,
        title: null,
        channelEnvelope: false,
      };
    }
    return {
      ...probeAnswer(await response.json(), probe),
      httpStatus,
      headersMs,
      latencyMs: Date.now() - started,
    };
  } catch {
    return {
      status: controller.signal.aborted ? 'Timeout' : 'ConnectionOrBodyError',
      httpStatus,
      headersMs,
      latencyMs: Date.now() - started,
      usageKnown: false,
      tokens: null,
      fields: null,
      title: null,
      channelEnvelope: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

export interface ProbeRow {
  id: string;
  requestHash: string;
  state: 'Pending' | 'Complete';
  result?: Awaited<ReturnType<typeof callProbe>>;
  costMicroUsd?: number;
}
export function validateProbeRows(plan: ProbePlan, rows: ProbeRow[]) {
  if (
    !Array.isArray(rows) ||
    rows.length > plan.maxCalls ||
    new Set(rows.map((r) => r.id)).size !== rows.length
  )
    throw new Error(
      'Corrupt probe journal; call count/identity cannot be trusted.',
    );
  for (const r of rows) {
    if (
      !plan.probes.some((p) => p.id === r.id) ||
      !/^[a-f0-9]{64}$/.test(r.requestHash) ||
      !['Pending', 'Complete'].includes(r.state) ||
      (r.state === 'Complete' &&
        (!r.result ||
          !Number.isSafeInteger(r.costMicroUsd) ||
          r.costMicroUsd! < 0))
    )
      throw new Error('Corrupt or incomplete probe journal.');
  }
}
export function endpointReport(plan: ProbePlan, rows: ProbeRow[]) {
  validateProbeRows(plan, rows);
  const complete =
    rows.length === plan.probes.length &&
    rows.every((r) => r.state === 'Complete');
  const baseline = plan.probes.find((p) => p.profile === 'production-autofill');
  const controlAvailable =
    !!baseline &&
    rows.find((r) => r.id === baseline.id)?.result?.status === 'Available';
  const candidate = plan.probes.find(
    (p) => p.profile === 'single-user-autofill',
  );
  const candidateAvailable =
    !!candidate &&
    rows.find((r) => r.id === candidate.id)?.result?.status === 'Available';
  return {
    status: !complete
      ? 'INCOMPLETE'
      : !controlAvailable
        ? 'BLOCKED_CONTROL'
        : !candidateAvailable
          ? 'BLOCKED_CANDIDATE'
          : 'READY_FOR_DEVELOPMENT_ONLY',
    complete,
    calls: rows.length,
    controlAvailable,
    candidateAvailable,
    knownEstimatedUsd:
      rows.reduce((sum, r) => sum + (r.costMicroUsd ?? 0), 0) / 1e6,
    unpricedCalls: rows.filter((r) => !r.result?.usageKnown).length,
    probes: plan.probes.map((p) => {
      const row = rows.find((r) => r.id === p.id);
      return {
        id: p.id,
        model: p.model,
        profile: p.profile,
        status: row?.result?.status ?? row?.state ?? 'NOT_RUN',
        httpStatus: row?.result?.httpStatus ?? null,
        headersMs: row?.result?.headersMs ?? null,
        latencyMs: row?.result?.latencyMs ?? null,
      };
    }),
    billing:
      'Only usage-reported token estimates; errors without usage are unpriced, not free. Not an invoice or hard cap.',
    holdout: 'NOT_RUN',
    productionChange: false,
    humanRealCameraAcceptance: 'NOT_RUN',
  };
}
