import { describe, expect, it, vi } from 'vitest';
import {
  GeminiPriceModel,
  PriceModelError,
  priceModelFromConfig,
  AnthropicPriceModel,
} from './price-model.js';

// Adapter-only tests with a stubbed fetch: no network, no real key.
const reply = (body: unknown, status = 200) =>
  (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;
const model = (fetcher: typeof fetch, timeoutMs = 1000) =>
  new GeminiPriceModel({ apiKey: 'test-key', model: 'gemini-test', timeoutMs, fetcher });
const ok = {
  candidates: [
    {
      finishReason: 'STOP',
      content: {
        parts: [
          { thought: true, text: 'reasoning that must be ignored' },
          { text: '{"low":40000,"high":50000,"factors":[],"missing":[]}' },
        ],
      },
    },
  ],
  usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 60, thoughtsTokenCount: 140 },
  modelVersion: 'gemini-test-001',
};

describe('Gemini adapter', () => {
  it('sends the key in a header with a JSON schema and counts thinking as output', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fetcher = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify(ok), { status: 200 });
    }) as unknown as typeof fetch;
    const draft = await model(fetcher).draft('system', 'user');
    expect(draft).toMatchObject({
      output: { low: 40000, high: 50000 },
      model: 'gemini-test-001',
      inputTokens: 800,
      outputTokens: 200,
    });
    expect(seen!.url).not.toContain('test-key');
    expect((seen!.init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(String(seen!.init.body));
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.systemInstruction.parts[0].text).toBe('system');
  });

  it.each([
    ['HTTP error', reply({ error: {} }, 429), 'ProviderError'],
    ['blocked prompt', reply({ promptFeedback: { blockReason: 'SAFETY' } }), 'Refusal'],
    ['safety stop', reply({ candidates: [{ finishReason: 'SAFETY' }] }), 'Refusal'],
    ['truncated', reply({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{' }] } }] }), 'InvalidOutput'],
    ['not JSON', reply({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'khoảng 50k' }] } }] }), 'InvalidOutput'],
  ])('maps %s to %s', async (_name, fetcher, kind) => {
    await expect(model(fetcher).draft('s', 'u')).rejects.toMatchObject({ kind });
  });

  it('retries once when the provider is busy and time allows', async () => {
    vi.useFakeTimers();
    try {
      const statuses = [503, 200];
      let calls = 0;
      const busyThenOk = (async () => {
        const status = statuses[calls++];
        return new Response(
          JSON.stringify(status === 200 ? ok : { error: { status: 'UNAVAILABLE' } }),
          { status },
        );
      }) as unknown as typeof fetch;
      const pending = model(busyThenOk, 20_000).draft('s', 'u');
      await vi.advanceTimersByTimeAsync(1_500);
      await expect(pending).resolves.toMatchObject({ inputTokens: 800 });
      expect(calls).toBe(2);

      calls = 0;
      statuses.splice(0, 2, 503, 503);
      const twice = model(busyThenOk, 20_000).draft('s', 'u').catch((e) => e);
      await vi.advanceTimersByTimeAsync(1_500);
      expect(await twice).toMatchObject({ kind: 'ProviderError' });
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not retry without time to spare or on other errors', async () => {
    let calls = 0;
    const counted = (status: number) =>
      (async () => {
        calls++;
        return new Response('{}', { status });
      }) as unknown as typeof fetch;
    await expect(model(counted(503), 5_000).draft('s', 'u')).rejects.toMatchObject({
      kind: 'ProviderError',
    });
    await expect(model(counted(400), 20_000).draft('s', 'u')).rejects.toMatchObject({
      kind: 'ProviderError',
    });
    expect(calls).toBe(2);
  });

  it('times out instead of waiting on a slow provider', async () => {
    const slow = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) =>
        init.signal!.addEventListener('abort', () => reject(new Error('aborted'))),
      )) as unknown as typeof fetch;
    const error = await model(slow, 30).draft('s', 'u').catch((e) => e);
    expect(error).toBeInstanceOf(PriceModelError);
    expect(error.kind).toBe('Timeout');
  });

  it('selects the provider from configuration and stays off without a key or flag', () => {
    const cfg = (values: Record<string, string>) => (key: string) => values[key];
    expect(priceModelFromConfig(cfg({ PRICE_ASSIST_ENABLED: 'true' }))).toBeNull();
    expect(
      priceModelFromConfig(cfg({ PRICE_ASSIST_API_KEY: 'k', PRICE_ASSIST_PROVIDER: 'gemini' })),
    ).toBeNull();
    const gemini = priceModelFromConfig(
      cfg({ PRICE_ASSIST_API_KEY: 'k', PRICE_ASSIST_PROVIDER: 'gemini', PRICE_ASSIST_ENABLED: 'true' }),
    );
    expect(gemini).toBeInstanceOf(GeminiPriceModel);
    expect(gemini!.model).toBe('gemini-3.8-flash');
    expect(
      priceModelFromConfig(cfg({ PRICE_ASSIST_API_KEY: 'k', PRICE_ASSIST_ENABLED: 'true' })),
    ).toBeInstanceOf(AnthropicPriceModel);
    // The eval runner may build a model without the API feature flag.
    expect(
      priceModelFromConfig(cfg({ PRICE_ASSIST_API_KEY: 'k', PRICE_ASSIST_PROVIDER: 'gemini' }), false),
    ).toBeInstanceOf(GeminiPriceModel);
  });
});
