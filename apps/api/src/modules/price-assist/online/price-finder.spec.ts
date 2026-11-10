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
        store: false, tool_choice: 'required', max_tool_calls: 1,
        tools: [{ type: 'web_search', filters: { allowed_domains: ['tiki.vn'] } }],
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
