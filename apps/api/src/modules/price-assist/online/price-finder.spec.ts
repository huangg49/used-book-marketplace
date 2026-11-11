import { describe, expect, it } from 'vitest';
import { FinderError, GeminiPriceFinder, OpenAiPriceFinder, priceFinderFromConfig } from './price-finder.js';

const book = { title: 'Dế Mèn phiêu lưu ký', authors: ['Tô Hoài'], publisher: 'Kim Đồng', publicationYear: 2020, isbn: '9786042000000' };
const finder = (fetcher: typeof fetch) =>
  new GeminiPriceFinder({ apiKey: 'test-key', model: 'gemini-test', timeoutMs: 1000, fetcher });

describe('Gemini price finder', () => {
  it('asks with Google Search and only catalog facts; returns page and allowed grounding URLs', async () => {
    let seen: RequestInit | null = null;
    const fetcher = (async (_url: string, init: RequestInit) => {
      seen = init;
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: '```json\n{"pages":[{"url":"https://www.fahasa.com/de-men.html","shop":"fahasa.com"}]}\n```' }] },
              groundingMetadata: {
                groundingChunks: [
                  { web: { uri: 'https://vertexaisearch.cloud.google.com/r/a', title: 'tiki.vn' } },
                  { web: { uri: 'https://vertexaisearch.cloud.google.com/r/b', title: 'shopee.vn' } },
                ],
              },
            },
          ],
          usageMetadata: { promptTokenCount: 300, toolUsePromptTokenCount: 200, candidatesTokenCount: 50 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const result = await finder(fetcher).find(book, ['fahasa.com', 'tiki.vn']);
    expect(result).toEqual({
      urls: ['https://www.fahasa.com/de-men.html', 'https://vertexaisearch.cloud.google.com/r/a'],
      inputTokens: 500,
      outputTokens: 50,
      searches: 1,
    });
    const body = JSON.parse(String(seen!.body));
    expect(body.tools).toEqual([{ google_search: {} }]);
    expect((seen!.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    expect(body.contents[0].parts[0].text).toContain('"isbn":"9786042000000"');
    expect(body.systemInstruction.parts[0].text).toContain('fahasa.com, tiki.vn');
  });

  it('maps HTTP errors and empty answers', async () => {
    const status = (code: number, body: unknown = {}) =>
      (async () => new Response(JSON.stringify(body), { status: code })) as unknown as typeof fetch;
    await expect(finder(status(400)).find(book, ['tiki.vn'])).rejects.toMatchObject({ kind: 'ProviderError' });
    const empty = await finder(status(200, { candidates: [{ content: { parts: [] } }] }))
      .find(book, ['tiki.vn'])
      .catch((e: FinderError) => e);
    expect(empty).toMatchObject({ kind: 'InvalidOutput' });
  });
});

describe('OpenAI price finder', () => {
  it('limits search to configured shops and returns tool-grounded URLs only', async () => {
    const sources = [{ url: 'https://tiki.vn/de-men.html' }];
    const fetcher: typeof fetch = async (_url, init) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        store: false, tool_choice: 'required', max_tool_calls: 2,
        tools: [{ type: 'web_search', filters: { allowed_domains: ['tiki.vn'] }, search_context_size: 'medium' }],
        include: ['web_search_call.action.sources'],
      });
      return Response.json({
        status: 'completed',
        output: [
          { type: 'web_search_call', status: 'completed', action: { sources } },
          { type: 'message', content: [{
            type: 'output_text', text: 'ignore invented https://tiki.vn/wrong.html',
            annotations: [{ type: 'url_citation', ...sources[0] }],
          }] },
        ],
        usage: { input_tokens: 50, output_tokens: 5 },
      });
    };
    const adapter = new OpenAiPriceFinder({ apiKey: 'test', model: 'gpt-5.4-mini', timeoutMs: 1000, fetcher });
    await expect(adapter.find(book, ['tiki.vn'])).resolves.toEqual({
      urls: [sources[0]!.url], inputTokens: 50, outputTokens: 5, searches: 1,
    });
  });

  it('prefers the matching publisher and makes one call when it returns an allowed URL', async () => {
    const shops = ['tiki.vn', 'nxbkimdong.com.vn', 'nxbtre.com.vn'];
    const scopes: string[][] = [];
    const fetcher: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      scopes.push(body.tools[0].filters.allowed_domains);
      return Response.json({ status: 'completed', output: [{ type: 'web_search_call', status: 'completed', action: {
        sources: [
          { url: 'https://www.nxbkimdong.com.vn/de-men#title' },
          { url: 'https://www.nxbkimdong.com.vn/de-men' },
          { url: 'https://www.nxbkimdong.com.vn/de-men?utm_source=example' },
          { url: 'https://www.nxbkimdong.com.vn/de-men?sku=variant&utm_medium=search&gclid=example' },
          { url: 'https://nxbkimdong.com.vn.example.test/wrong' },
        ],
      } }] });
    };
    const adapter = new OpenAiPriceFinder({ apiKey: 'test', model: 'gpt-5.4-mini', timeoutMs: 15_000, fetcher });
    const result = await adapter.find({ ...book, publisher: 'Nhà xuất bản Kim Đồng' }, shops);
    expect(scopes).toEqual([['nxbkimdong.com.vn']]);
    expect(result.urls).toEqual([
      'https://www.nxbkimdong.com.vn/de-men', 'https://www.nxbkimdong.com.vn/de-men?sku=variant',
    ]);
  });

  it.each([false, true])('expands once and carries the first search usage (expanded failure: %s)', async (fail) => {
    const requests: { domains: string[]; calls: number }[] = [];
    const fetcher: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      requests.push({ domains: body.tools[0].filters.allowed_domains, calls: body.max_tool_calls });
      if (fail && requests.length === 2) return Response.json({}, { status: 429 });
      return Response.json({ status: 'completed', output: [{ type: 'web_search_call', status: 'completed', action: {
        sources: [{ url: 'https://tiki.vn/de-men' }],
      } }], usage: { input_tokens: 100, output_tokens: 20 } });
    };
    const adapter = new OpenAiPriceFinder({ apiKey: 'test', model: 'gpt-5.4-mini', timeoutMs: 15_000, fetcher });
    const lookup = adapter.find(book, ['tiki.vn', 'nxbkimdong.com.vn']);
    if (fail) await expect(lookup).rejects.toMatchObject({
      kind: 'ProviderError', transient: true, usage: { inputTokens: 100, outputTokens: 20, searches: 1 },
    });
    else await expect(lookup).resolves.toEqual({
      urls: ['https://tiki.vn/de-men'], inputTokens: 200, outputTokens: 40, searches: 2,
    });
    expect(requests).toEqual([
      { domains: ['nxbkimdong.com.vn'], calls: 2 }, { domains: ['tiki.vn'], calls: 1 },
    ]);
  });

  it('asks the backend to verify scoped URLs before deciding whether to expand', async () => {
    const scoped = 'https://nxbkimdong.com.vn/wrong-edition';
    const other = 'https://tiki.vn/right-edition';
    let calls = 0;
    const fetcher: typeof fetch = async () => Response.json({
      status: 'completed', output: [{ type: 'web_search_call', status: 'completed', action: {
        sources: [{ url: ++calls === 1 ? scoped : other }],
      } }],
    });
    const adapter = new OpenAiPriceFinder({ apiKey: 'test', model: 'gpt-5.4-mini', timeoutMs: 15_000, fetcher });
    const checked: string[] = [];
    const result = await adapter.find(book, ['nxbkimdong.com.vn', 'tiki.vn'], async (urls) => {
      checked.push(...urls);
      return false;
    });
    expect(checked).toEqual([scoped]);
    expect(result).toMatchObject({ urls: [other], searches: 2 });
  });

  it.each([[429, true], [503, true], [401, false]])('maps HTTP %i without logging a provider body', async (status, transient) => {
    const adapter = new OpenAiPriceFinder({
      apiKey: 'test', model: 'gpt-5.4-mini', timeoutMs: 1000,
      fetcher: async () => Response.json({ error: 'private payload' }, { status }),
    });
    await expect(adapter.find(book, ['tiki.vn'])).rejects.toMatchObject({
      kind: 'ProviderError', message: 'OpenAI request failed', transient,
    });
  });

  it('supports OpenAI independently of the price model and keeps the legacy Gemini route', () => {
    const env: Record<string, string> = {
      PRICE_LOOKUP_ENABLED: 'true', PRICE_LOOKUP_PROVIDERS: 'openai,gemini',
      PRICE_LOOKUP_OPENAI_API_KEY: 'test-openai', PRICE_LOOKUP_GEMINI_API_KEY: 'test-gemini',
    };
    const config = (name: string) => env[name];
    expect(priceFinderFromConfig(config)).toMatchObject({ provider: 'openai', fallback: { provider: 'gemini' } });
    delete env.PRICE_LOOKUP_GEMINI_API_KEY;
    expect(priceFinderFromConfig(config)).toMatchObject({ provider: 'openai', fallback: null });
    delete env.PRICE_LOOKUP_PROVIDERS;
    Object.assign(env, { PRICE_ASSIST_ENABLED: 'true', PRICE_ASSIST_PROVIDER: 'gemini', PRICE_ASSIST_API_KEY: 'legacy' });
    expect(priceFinderFromConfig(config)).toMatchObject({ provider: 'gemini', fallback: null });
  });
});
