import { PriceModelError } from './price-model.js';

export const OPENAI_LISTING_MODEL = 'gpt-5.4-mini';

export interface OpenAiOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  fetcher?: typeof fetch;
}

type OutputPart = {
  type: string;
  text?: string;
  annotations?: { type: string; url?: string }[];
};
type ResponseBody = {
  model?: string;
  status?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  output?: {
    type: string;
    status?: string;
    content?: OutputPart[];
    action?: { sources?: { url?: string }[] };
  }[];
};

const tokenCount = (value: number | undefined): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;

export function isTransientProviderStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

// No automatic retries. The calling feature owns its deadline and fallback.
export async function openAiResponses(options: OpenAiOptions, request: Record<string, unknown>) {
  const signal = AbortSignal.timeout(options.timeoutMs);
  const started = Date.now();
  const detail = (status: number | null) => ({
    status, code: null, attempts: 1, elapsedMs: Date.now() - started,
  });
  let body: ResponseBody;
  try {
    const response = await (options.fetcher ?? fetch)('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal,
      redirect: 'error',
      headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, model: options.model, store: false }),
    });
    if (!response.ok)
      throw new PriceModelError('ProviderError', 'OpenAI request failed', null, detail(response.status));
    body = await response.json() as ResponseBody;
  } catch (e) {
    if (e instanceof PriceModelError) throw e;
    if (signal.aborted) throw new PriceModelError('Timeout', 'OpenAI timed out', null, detail(null));
    if (e instanceof SyntaxError) throw new PriceModelError('InvalidOutput', 'Invalid OpenAI response');
    throw new PriceModelError('ProviderError', 'OpenAI connection failed', null, detail(null));
  }
  const usage = {
    inputTokens: tokenCount(body?.usage?.input_tokens),
    outputTokens: tokenCount(body?.usage?.output_tokens),
  };
  const output = Array.isArray(body?.output) ? body.output : [];
  const parts = output.filter((item) => item.type === 'message').flatMap((item) => item.content ?? []);
  const textParts = parts.filter((part) => part.type === 'output_text');
  return {
    ...usage,
    model: body?.model || options.model,
    completed: body?.status === 'completed',
    refused: parts.some((part) => part.type === 'refusal'),
    text: textParts.map((part) => part.text ?? '').join(''),
    searches: output.filter((item) => item.type === 'web_search_call'),
    citations: textParts.flatMap((part) => part.annotations ?? [])
      .filter((annotation) => annotation.type === 'url_citation'),
  };
}
