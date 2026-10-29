import { readFileSync } from 'node:fs';
import {
  callProbe,
  probeBody,
  probeAnswer,
  validateProbePlan,
  validateProbeRows,
  endpointReport,
  PROBE_ENDPOINT,
  type ProbePlan,
  type ProbeRow,
} from './endpoint-probe.js';
const plan = JSON.parse(
  readFileSync(
    new URL(
      '../../../../qa-data/listing-ai/endpoint-probe-plan.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as ProbePlan;
const image = 'data:image/jpeg;base64,AAAA';
const reply = (
  content: string,
  usage: unknown = { prompt_tokens: 12, completion_tokens: 8 },
) => ({ choices: [{ finish_reason: 'stop', message: { content } }], usage });
describe('bounded NVIDIA endpoint probes', () => {
  it('accepts only the exact official endpoint, bounded time/cost and model allowlist', () => {
    expect(() => validateProbePlan(plan)).not.toThrow();
    for (const key of [
      'endpoint',
      'budget',
      'calls',
      'model',
      'time',
      'duplicate',
    ] as const) {
      const changed = structuredClone(plan);
      if (key === 'endpoint')
        changed.endpoint = 'https://other.example/v1/chat/completions';
      if (key === 'budget') changed.maxKnownEstimatedUsd = Infinity;
      if (key === 'calls') changed.maxCalls = 20;
      if (key === 'model') changed.probes[0].model = 'unverified/model';
      if (key === 'time') changed.probes[0].timeoutMs = 60000;
      if (key === 'duplicate') changed.probes[1].id = changed.probes[0].id;
      expect(() => validateProbePlan(changed), key).toThrow();
    }
  });
  it('places image before text, preserves the fixed instructions and never sends an expected answer', () => {
    const minimal = probeBody(plan.probes[0], image);
    expect(JSON.stringify(minimal)).not.toContain('image_url');
    const userOnly = probeBody(plan.probes[2], image);
    expect(userOnly.messages).toHaveLength(1);
    const content = userOnly.messages[0].content as { type: string }[];
    expect(content.map((p) => p.type)).toEqual(['image_url', 'text']);
    expect(JSON.stringify(userOnly)).not.toContain('Dế Mèn');
    expect(userOnly.chat_template_kwargs).toEqual({ enable_thinking: false });
    const production = probeBody(plan.probes[3], image);
    expect(production.messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(() =>
      probeBody(plan.probes[2], 'https://other.example/private.jpg'),
    ).toThrow();
  });
  it('never treats missing, negative, fractional or partial usage as zero known cost', () => {
    for (const usage of [
      null,
      {},
      { prompt_tokens: -2, completion_tokens: 1 },
      { prompt_tokens: 1.5, completion_tokens: 1 },
      { prompt_tokens: 1 },
    ])
      expect(
        probeAnswer(reply('{"ok":true}', usage), plan.probes[0]),
      ).toMatchObject({ usageKnown: false, tokens: null });
    expect(probeAnswer(reply('{"ok":true}'), plan.probes[0])).toMatchObject({
      usageKnown: true,
      tokens: { input: 12, output: 8 },
    });
  });
  it('parses a diagnostic channel envelope without storing thought text; production parser unchanged', () => {
    const result = probeAnswer(
      reply(
        '<|channel>thoughtprivate trace<channel|>{"title":"Printed title","authors":["Writer"],"isbn":null}',
      ),
      plan.probes[2],
    );
    expect(result).toMatchObject({
      status: 'Available',
      channelEnvelope: true,
      fields: { title: 'Printed title', authors: ['Writer'], isbn: null },
    });
    expect(JSON.stringify(result)).not.toContain('private trace');
    expect(probeAnswer(reply('{"title":null}'), plan.probes[2]).status).toBe(
      'NeedsMoreData',
    );
  });
  it('keeps truncated, refused and malformed responses separate from availability', () => {
    expect(
      probeAnswer({ choices: [{ finish_reason: 'length' }] }, plan.probes[0])
        .status,
    ).toBe('Truncated');
    expect(
      probeAnswer(
        { choices: [{ finish_reason: 'content_filter' }] },
        plan.probes[0],
      ).status,
    ).toBe('Refused');
    expect(probeAnswer(reply('not JSON'), plan.probes[0]).status).toBe(
      'InvalidOutput',
    );
    expect(probeAnswer({}, plan.probes[0]).status).toBe('NoContent');
  });
  it.each([202, 404, 429, 503])(
    'does one POST and never retries or leaks provider details for HTTP%i',
    async (status) => {
      let calls = 0;
      const fetcher = (async (url, init) => {
        calls++;
        expect(url).toBe(PROBE_ENDPOINT);
        expect(init?.redirect).toBe('error');
        expect(init?.headers).toMatchObject({
          Authorization: 'Bearer test-only',
        });
        return new Response(
          JSON.stringify({ secret: 'provider-private-detail' }),
          { status },
        );
      }) as typeof fetch;
      const result = await callProbe(
        plan.probes[0],
        image,
        'test-only',
        fetcher,
      );
      expect(calls).toBe(1);
      expect(result).toMatchObject({
        httpStatus: status,
        status: status === 202 ? 'AsyncPending' : 'HttpError',
        usageKnown: false,
      });
      expect(JSON.stringify(result)).not.toMatch(
        /provider-private-detail|test-only/,
      );
    },
  );
  it('separates HTTP headers from successful structured response and uses one attempt', async () => {
    const fetcher = (async () =>
      new Response(JSON.stringify(reply('{"ok":true}')), {
        status: 200,
      })) as typeof fetch;
    expect(
      await callProbe(plan.probes[0], image, 'test-only', fetcher),
    ).toMatchObject({
      status: 'Available',
      httpStatus: 200,
      headersMs: expect.any(Number),
      latencyMs: expect.any(Number),
      usageKnown: true,
    });
  });
  it('aborts the request at its deadline without automatic network replay', async () => {
    let calls = 0;
    const fetcher = (async (_url, init) => {
      calls++;
      return new Promise((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () =>
          reject(new Error('private network detail')),
        ),
      );
    }) as typeof fetch;
    const result = await callProbe(
      { ...plan.probes[0], timeoutMs: 5 },
      image,
      'test-only',
      fetcher,
    );
    expect(result).toMatchObject({
      status: 'Timeout',
      httpStatus: null,
      usageKnown: false,
    });
    expect(calls).toBe(1);
    expect(JSON.stringify(result)).not.toContain('private network detail');
  });
  it('never makes an incomplete or failed endpoint check look ready for a comparison', () => {
    const rows: ProbeRow[] = plan.probes.map((p) => ({
      id: p.id,
      requestHash: 'a'.repeat(64),
      state: 'Complete',
      costMicroUsd: 1,
      result: {
        ...probeAnswer(
          reply(
            p.profile === 'text-control'
              ? '{"ok":true}'
              : '{"title":"Book","authors":[]}',
          ),
          p,
        ),
        httpStatus: 200,
        headersMs: 10,
        latencyMs: 10,
      },
    }));
    expect(endpointReport(plan, rows)).toMatchObject({
      status: 'READY_FOR_DEVELOPMENT_ONLY',
      productionChange: false,
      humanRealCameraAcceptance: 'NOT_RUN',
      holdout: 'NOT_RUN',
    });
    expect(endpointReport(plan, rows.slice(1)).status).toBe('INCOMPLETE');
    const waiting = structuredClone(rows);
    waiting[0].state = 'Pending';
    delete waiting[0].result;
    expect(endpointReport(plan, waiting).status).toBe('INCOMPLETE');
    rows[2].result!.status = 'Timeout';
    rows[2].result!.usageKnown = false;
    rows[2].result!.tokens = null;
    rows[2].costMicroUsd = 0;
    expect(endpointReport(plan, rows)).toMatchObject({
      status: 'BLOCKED_CANDIDATE',
      unpricedCalls: 1,
    });
    rows[3].result!.status = 'HttpError';
    expect(endpointReport(plan, rows).status).toBe('BLOCKED_CONTROL');
  });
  it('rejects corrupt or duplicate journal rows instead of skipping required calls silently', () => {
    const one: ProbeRow = {
      id: plan.probes[0].id,
      requestHash: 'a'.repeat(64),
      state: 'Pending',
    };
    expect(() => validateProbeRows(plan, [one, one])).toThrow();
    expect(() =>
      validateProbeRows(plan, [{ ...one, id: 'unexpected' }]),
    ).toThrow();
    expect(() =>
      validateProbeRows(plan, [{ ...one, state: 'Complete' }]),
    ).toThrow();
    expect(() =>
      validateProbeRows(plan, [{ ...one, requestHash: 'bad' }]),
    ).toThrow();
  });
});
