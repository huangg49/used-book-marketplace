import Anthropic from '@anthropic-ai/sdk';
import { MODEL_OUTPUT_SCHEMA } from './output-check.js';

export type ModelFailure = 'Timeout' | 'InvalidOutput' | 'ProviderError' | 'Refusal';

export class PriceModelError extends Error {
  constructor(
    readonly kind: ModelFailure,
    message: string,
    readonly usage: { inputTokens: number; outputTokens: number } | null = null,
  ) {
    super(message);
  }
}

export interface ModelDraft {
  output: unknown;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

// Provider boundary. Production uses AnthropicPriceModel; tests substitute a
// fake to exercise timeout/invalid-output paths (never as live evidence).
export abstract class PriceModel {
  abstract readonly model: string;
  abstract draft(system: string, user: string): Promise<ModelDraft>;
}

export interface AnthropicOptions {
  apiKey: string;
  model: string;
  effort: 'low' | 'medium' | 'high' | null;
  timeoutMs: number;
}

export class AnthropicPriceModel extends PriceModel {
  readonly model: string;
  private readonly client: Anthropic;
  constructor(private readonly options: AnthropicOptions) {
    super();
    this.model = options.model;
    // No SDK retries: one bounded call per reserved quota unit.
    this.client = new Anthropic({
      apiKey: options.apiKey,
      timeout: options.timeoutMs,
      maxRetries: 0,
    });
  }
  async draft(system: string, user: string): Promise<ModelDraft> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.options.model,
        max_tokens: 4000,
        system,
        messages: [{ role: 'user', content: user }],
        output_config: {
          ...(this.options.effort ? { effort: this.options.effort } : {}),
          format: {
            type: 'json_schema',
            schema: MODEL_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
          },
        },
      });
    } catch (e) {
      if (e instanceof Anthropic.APIConnectionTimeoutError)
        throw new PriceModelError('Timeout', 'Provider timed out');
      if (e instanceof Anthropic.APIError)
        throw new PriceModelError(
          'ProviderError',
          `Provider error ${e.status ?? 'connection'}`,
        );
      throw new PriceModelError('ProviderError', 'Provider call failed');
    }
    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
    if (response.stop_reason === 'refusal')
      throw new PriceModelError('Refusal', 'Provider declined', usage);
    if (response.stop_reason === 'max_tokens')
      throw new PriceModelError('InvalidOutput', 'Output truncated', usage);
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    let output: unknown;
    try {
      output = JSON.parse(text);
    } catch {
      throw new PriceModelError('InvalidOutput', 'Output is not JSON', usage);
    }
    return { output, model: response.model, ...usage };
  }
}

// Gemini structured output takes an OpenAPI-style schema without
// additionalProperties; the strict check still runs in output-check.ts.
const GEMINI_SCHEMA = {
  type: 'object',
  required: ['low', 'high', 'factors', 'missing'],
  properties: {
    low: { type: 'integer' },
    high: { type: 'integer' },
    factors: {
      type: 'array',
      items: {
        type: 'object',
        required: ['text', 'sourceRefs'],
        properties: {
          text: { type: 'string' },
          sourceRefs: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    missing: { type: 'array', items: { type: 'string' } },
  },
};
const GEMINI_BLOCKED = new Set([
  'SAFETY',
  'RECITATION',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'SPII',
]);
type GeminiPart = { thought?: boolean; text?: string };
type GeminiBody = {
  candidates?: { finishReason?: string; content?: { parts?: GeminiPart[] } }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  modelVersion?: string;
};

// Google's own error status and message (e.g. "INVALID_ARGUMENT: ..."), for
// the server log. Never contains the key; cut short so it cannot carry much.
async function geminiErrorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { status?: string; message?: string };
    };
    const status = body.error?.status ?? '';
    const message = (body.error?.message ?? '').slice(0, 300);
    return status || message ? ` ${status}: ${message}` : '';
  } catch {
    return '';
  }
}

export interface GeminiOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  fetcher?: typeof fetch;
}

// Google Gemini over the public REST API (key in a header, never in the URL).
export class GeminiPriceModel extends PriceModel {
  readonly model: string;
  constructor(private readonly options: GeminiOptions) {
    super();
    this.model = options.model;
  }
  async draft(system: string, user: string): Promise<ModelDraft> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    let body: GeminiBody;
    try {
      const response = await (this.options.fetcher ?? fetch)(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.options.model)}:generateContent`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.options.apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: GEMINI_SCHEMA,
              maxOutputTokens: 4000,
              temperature: 0.2,
            },
          }),
        },
      );
      if (!response.ok)
        throw new PriceModelError(
          'ProviderError',
          `Provider error ${response.status}${await geminiErrorDetail(response)}`,
        );
      body = (await response.json()) as GeminiBody;
    } catch (e) {
      if (e instanceof PriceModelError) throw e;
      if (controller.signal.aborted)
        throw new PriceModelError('Timeout', 'Provider timed out');
      throw new PriceModelError('ProviderError', 'Provider call failed');
    } finally {
      clearTimeout(timer);
    }
    const meta = body.usageMetadata ?? {};
    // Thinking tokens are billed as output.
    const usage = {
      inputTokens: Number(meta.promptTokenCount ?? 0),
      outputTokens:
        Number(meta.candidatesTokenCount ?? 0) +
        Number(meta.thoughtsTokenCount ?? 0),
    };
    const candidate = body.candidates?.[0];
    if (
      body.promptFeedback?.blockReason ||
      GEMINI_BLOCKED.has(candidate?.finishReason ?? '')
    )
      throw new PriceModelError('Refusal', 'Provider declined', usage);
    if (candidate?.finishReason === 'MAX_TOKENS')
      throw new PriceModelError('InvalidOutput', 'Output truncated', usage);
    const text = (candidate?.content?.parts ?? [])
      .filter((p) => !p.thought && typeof p.text === 'string')
      .map((p) => p.text)
      .join('');
    let output: unknown;
    try {
      output = JSON.parse(text);
    } catch {
      throw new PriceModelError('InvalidOutput', 'Output is not JSON', usage);
    }
    return { output, model: body.modelVersion ?? this.options.model, ...usage };
  }
}

// Builds the configured provider; null without a key (or, for the API, when
// the feature flag is off).
export function priceModelFromConfig(
  get: (key: string) => string | undefined,
  requireEnabled = true,
): PriceModel | null {
  const apiKey = get('PRICE_ASSIST_API_KEY') ?? '';
  if (!apiKey || (requireEnabled && get('PRICE_ASSIST_ENABLED') !== 'true'))
    return null;
  const provider = get('PRICE_ASSIST_PROVIDER') || 'anthropic';
  const timeoutMs = Number(get('PRICE_ASSIST_TIMEOUT_MS') || 20_000);
  if (provider === 'gemini')
    return new GeminiPriceModel({
      apiKey,
      model: get('PRICE_ASSIST_MODEL') || 'gemini-3.8-flash',
      timeoutMs,
    });
  const effort = get('PRICE_ASSIST_EFFORT') || 'low';
  return new AnthropicPriceModel({
    apiKey,
    model: get('PRICE_ASSIST_MODEL') || 'claude-opus-5-5',
    effort: effort === 'none' ? null : (effort as 'low' | 'medium' | 'high'),
    timeoutMs,
  });
}

// USD per million tokens (input, output); tokens x rate = micro-USD.
// Gemini rows are paid-tier list prices as last known; confirm on Google's
// pricing page or set PRICE_ASSIST_INPUT/OUTPUT_USD_PER_MTOK.
// gemini-3.8-flash: the list price from 2027-01-01 (0.75/3.75 until then), so
// the budget cap never under-counts. 2.5 models are closed to new API users.
const KNOWN_RATES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-4-5': [1, 5],
  'gemini-3.8-flash': [1.5, 7.5],
  'gemini-2.5-flash': [0.3, 2.5],
  'gemini-2.5-flash-lite': [0.1, 0.4],
  'gemini-2.5-pro': [1.25, 10],
};
export function rateFor(
  model: string,
  override: [number, number] | null,
): [number, number] {
  return override ?? KNOWN_RATES[model] ?? [4, 20];
}
export const costMicroUsd = (
  rate: [number, number],
  inputTokens: number,
  outputTokens: number,
) => Math.ceil(inputTokens * rate[0] + outputTokens * rate[1]);
