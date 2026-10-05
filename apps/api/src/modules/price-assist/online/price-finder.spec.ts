import { describe, expect, it } from 'vitest';
import { FinderError, GeminiPriceFinder } from './price-finder.js';

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
