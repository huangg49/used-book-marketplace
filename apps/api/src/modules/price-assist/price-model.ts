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

// USD per million tokens (input, output); tokens × rate = micro-USD.
const KNOWN_RATES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-4-5': [1, 5],
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
