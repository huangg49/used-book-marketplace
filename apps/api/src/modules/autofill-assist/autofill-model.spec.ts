import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { PriceModelError } from '../price-assist/price-model.js';
import { MAX_INLINE_IMAGE_BYTES, shrinkForModel } from './autofill-images.js';
import { autofillModelFromConfig, NvidiaAutofillModel } from './autofill-model.js';

// Adapter-only tests with a stubbed fetch: no network, no real key.
const reply = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const answer = (content: string, finish = 'stop', model = 'nvidia/vl-test') => ({
  model,
  choices: [{ finish_reason: finish, message: { content } }],
  usage: { prompt_tokens: 1500, completion_tokens: 80 },
});

describe('NVIDIA autofill adapter', () => {
  it('sends text plus inline images, no guided decoding, and parses fenced JSON', async () => {
    let body: Record<string, unknown> = {};
    const fetcher = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify(answer('```json\n{"title":"Mắt biếc"}\n```')), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const model = new NvidiaAutofillModel({
      apiKey: 'nvapi-test',
      model: 'nvidia/vl-test',
      timeoutMs: 1000,
      fetcher,
    });
    const draft = await model.read('sys', 'user', ['data:image/jpeg;base64,AAAA']);
    expect(draft).toMatchObject({ output: { title: 'Mắt biếc' }, inputTokens: 1500 });
    expect(body.nvext).toBeUndefined();
    const messages = body.messages as { content: unknown }[];
    expect(messages[1].content).toEqual([
      { type: 'text', text: 'user' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
    ]);
  });

  it('uses the fallback model only when asked and maps provider failures', async () => {
    let used = '';
    const fetcher = (async (_url: string, init: RequestInit) => {
      used = JSON.parse(String(init.body)).model;
      return new Response(JSON.stringify(answer('{}', 'stop', used)), { status: 200 });
    }) as unknown as typeof fetch;
    const model = new NvidiaAutofillModel({
      apiKey: 'k',
      model: 'nvidia/a',
      fallbackModel: 'meta/b',
      timeoutMs: 1000,
      fetcher,
    });
    await model.read('s', 'u', [], true);
    expect(used).toBe('meta/b');
    await model.read('s', 'u', []);
    expect(used).toBe('nvidia/a');
    const failing = new NvidiaAutofillModel({
      apiKey: 'k',
      model: 'nvidia/a',
      timeoutMs: 1000,
      fetcher: reply({ error: 'busy' }, 503),
    });
    const error = await failing.read('s', 'u', []).catch((e) => e);
    expect(error).toBeInstanceOf(PriceModelError);
    expect(error.kind).toBe('ProviderError');
  });

  it('stays off without the flag or key', () => {
    const cfg = (v: Record<string, string>) => (k: string) => v[k];
    expect(autofillModelFromConfig(cfg({ AUTOFILL_API_KEY: 'k' }))).toBeNull();
    expect(autofillModelFromConfig(cfg({ AUTOFILL_ENABLED: 'true' }))).toBeNull();
    const on = autofillModelFromConfig(cfg({ AUTOFILL_ENABLED: 'true', AUTOFILL_API_KEY: 'k' }));
    expect(on?.model).toBe('nvidia/llama-3.1-nemotron-nano-vl-8b-v1');
    expect(on?.fallback).toBeNull();
  });
});

describe('photo shrinking for the provider', () => {
  it('produces a JPEG data URL under the inline limit from a large noisy photo', async () => {
    const raw = Buffer.alloc(1600 * 1600 * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24;
    const webp = await sharp(raw, { raw: { width: 1600, height: 1600, channels: 3 } })
      .webp({ quality: 90 })
      .toBuffer();
    const url = await shrinkForModel(webp);
    expect(url.startsWith('data:image/jpeg;base64,')).toBe(true);
    const bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    expect(bytes.length).toBeLessThanOrEqual(MAX_INLINE_IMAGE_BYTES);
  });
});
