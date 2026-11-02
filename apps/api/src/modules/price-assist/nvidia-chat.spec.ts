import { afterEach, describe, expect, it, vi } from 'vitest';
import { answerText, NvidiaChatError, nvidiaChat } from './nvidia-chat.js';

// Stubbed fetch only: no network, no real key.
const ok = {
  model: 'nvidia/test',
  choices: [{ finish_reason: 'stop', message: { content: '{"a":1}' } }],
  usage: { prompt_tokens: 50, completion_tokens: 5 },
};
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });
// Each call takes the next step: a status, 'hang' (until aborted) or 'reset'.
const scripted = (steps: (number | 'hang' | 'reset')[]) => {
  const calls: number[] = [];
  const fetcher = ((_url: string, init: RequestInit) => {
    const step = steps[calls.length];
    calls.push(Date.now());
    if (step === 'hang')
      return new Promise((_resolve, reject) =>
        init.signal!.addEventListener('abort', () => reject(new Error('aborted'))),
      );
    if (step === 'reset')
      return Promise.reject(
        Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }),
      );
    return Promise.resolve(step === 200 ? json(ok) : json({ error: { message: 'busy' } }, step));
  }) as unknown as typeof fetch;
  return { fetcher, calls };
};
const call = (fetcher: typeof fetch, timeoutMs: number) =>
  nvidiaChat({ apiKey: 'nvapi-test', model: 'nvidia/test', timeoutMs, fetcher }, 's', 'u', null);
const settle = <T>(p: Promise<T>) => p.then((v) => ({ v }), (e: unknown) => ({ e }));

describe('nvidiaChat retry', () => {
  afterEach(() => vi.useRealTimers());

  it.each([429, 500, 502, 503, 504])('retries once after HTTP %i', async (status) => {
    vi.useFakeTimers();
    const { fetcher, calls } = scripted([status, 200]);
    const pending = settle(call(fetcher, 25_000));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await pending).toMatchObject({ v: { output: { a: 1 }, inputTokens: 50 } });
    expect(calls).toHaveLength(2);
  });

  it('cuts a hung first attempt short and answers from the second', async () => {
    vi.useFakeTimers();
    const { fetcher, calls } = scripted(['hang', 200]);
    const pending = settle(call(fetcher, 25_000));
    await vi.advanceTimersByTimeAsync(15_900);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await pending).toMatchObject({ v: { output: { a: 1 } } });
    expect(calls).toHaveLength(2);
  });

  it('reports a dropped connection with its code after the second try', async () => {
    vi.useFakeTimers();
    const { fetcher, calls } = scripted(['reset', 'reset']);
    const pending = settle(call(fetcher, 25_000));
    await vi.advanceTimersByTimeAsync(2_000);
    const { e } = (await pending) as { e: NvidiaChatError };
    expect(e).toBeInstanceOf(NvidiaChatError);
    expect(e.kind).toBe('ProviderError');
    expect(e.detail).toMatchObject({ status: null, code: 'ECONNRESET', attempts: 2 });
    expect(calls).toHaveLength(2);
  });

  it('keeps both attempts within the one timeout', async () => {
    vi.useFakeTimers();
    const { fetcher, calls } = scripted(['hang', 'hang']);
    const pending = settle(call(fetcher, 25_000));
    await vi.advanceTimersByTimeAsync(25_000);
    const { e } = (await pending) as { e: NvidiaChatError };
    expect(e.kind).toBe('Timeout');
    expect(e.detail).toMatchObject({ attempts: 2 });
    expect(e.detail!.elapsedMs).toBeLessThanOrEqual(25_000);
    expect(calls).toHaveLength(2);
  });

  it('does not retry a client error, a short bound or a long Retry-After', async () => {
    const rejected = scripted([400, 200]);
    const bad = (await settle(call(rejected.fetcher, 25_000))) as { e: NvidiaChatError };
    expect(bad.e.detail).toMatchObject({ status: 400, attempts: 1 });
    expect(rejected.calls).toHaveLength(1);

    const short = scripted([503, 200]);
    await expect(call(short.fetcher, 5_000)).rejects.toMatchObject({ kind: 'ProviderError' });
    expect(short.calls).toHaveLength(1);

    let calls = 0;
    const later = (async () => {
      calls++;
      return json({}, 429, { 'Retry-After': '30' });
    }) as unknown as typeof fetch;
    await expect(call(later, 25_000)).rejects.toMatchObject({ kind: 'ProviderError' });
    expect(calls).toBe(1);
  });

  it('never retries an answer, even a malformed one', async () => {
    let calls = 0;
    const prose = (async () => {
      calls++;
      return json({ ...ok, choices: [{ finish_reason: 'stop', message: { content: 'không rõ' } }] });
    }) as unknown as typeof fetch;
    const { e } = (await settle(call(prose, 25_000))) as { e: NvidiaChatError };
    expect(e.kind).toBe('InvalidOutput');
    expect(e.usage).toEqual({ inputTokens: 50, outputTokens: 5 });
    expect(e.detail).toMatchObject({ status: 200, attempts: 1 });
    expect(calls).toBe(1);
  });
});

describe('answerText', () => {
  it.each([
    ['<think>x</think>\n{"a":1}', '{"a":1}'],
    ['lý do dài\n</think>\n{"a":1}', '{"a":1}'],
    ['```json\n{"a":1}\n```', '{"a":1}'],
    ['Đây là kết quả: {"a":{"b":2}} xong.', '{"a":{"b":2}}'],
    ['[1,2]', '[1,2]'],
    ['không có JSON', 'không có JSON'],
  ])('reads %j as %j', (raw, expected) => {
    expect(answerText(raw)).toBe(expected);
  });
});
