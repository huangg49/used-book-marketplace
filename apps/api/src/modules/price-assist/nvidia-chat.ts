// NVIDIA NIM over its OpenAI-compatible chat API (build.nvidia.com or a
// self-hosted NIM). Shared by the price model and the photo autofill model;
// the key goes only in the Authorization header and is never logged.

export const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

export type NvidiaFailure = 'Timeout' | 'InvalidOutput' | 'ProviderError' | 'Refusal';

export class NvidiaChatError extends Error {
  constructor(
    readonly kind: NvidiaFailure,
    message: string,
    readonly usage: { inputTokens: number; outputTokens: number } | null = null,
  ) {
    super(message);
  }
}

export type NvidiaContent =
  | string
  | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[];

export interface NvidiaChatOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  baseUrl?: string;
  fetcher?: typeof fetch;
}

export interface NvidiaChatResult {
  output: unknown;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

type ChatBody = {
  model?: string;
  choices?: {
    finish_reason?: string | null;
    message?: { content?: string | null; refusal?: string | null };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

// Provider status and message for the server log, cut short; never the key.
async function errorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string } | string;
      detail?: string;
    };
    const raw =
      typeof body.error === 'string'
        ? body.error
        : (body.error?.message ?? body.detail ?? '');
    return raw ? `: ${String(raw).slice(0, 300)}` : '';
  } catch {
    return '';
  }
}

// Reasoning models may emit <think>…</think> before the answer, and a model
// without guided decoding may wrap JSON in a code fence.
export function answerText(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

// One bounded call, no retries: each call matches one reserved quota unit.
export async function nvidiaChat(
  options: NvidiaChatOptions,
  system: string,
  user: NvidiaContent,
  // null when the model has no guided decoding (some hosted VLMs).
  schema: Record<string, unknown> | null,
  maxTokens = 4000,
): Promise<NvidiaChatResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  let body: ChatBody;
  try {
    const response = await (options.fetcher ?? fetch)(
      `${options.baseUrl ?? NVIDIA_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.2,
          max_tokens: maxTokens,
          stream: false,
          // NIM guided decoding; the strict check still runs on our side.
          ...(schema ? { nvext: { guided_json: schema } } : {}),
        }),
      },
    );
    if (!response.ok)
      throw new NvidiaChatError(
        'ProviderError',
        `Provider error ${response.status}${await errorDetail(response)}`,
      );
    body = (await response.json()) as ChatBody;
  } catch (e) {
    if (e instanceof NvidiaChatError) throw e;
    if (controller.signal.aborted)
      throw new NvidiaChatError('Timeout', 'Provider timed out');
    throw new NvidiaChatError('ProviderError', 'Provider call failed');
  } finally {
    clearTimeout(timer);
  }
  const usage = {
    inputTokens: Number(body.usage?.prompt_tokens ?? 0),
    outputTokens: Number(body.usage?.completion_tokens ?? 0),
  };
  const choice = body.choices?.[0];
  if (choice?.finish_reason === 'content_filter' || choice?.message?.refusal)
    throw new NvidiaChatError('Refusal', 'Provider declined', usage);
  if (choice?.finish_reason === 'length')
    throw new NvidiaChatError('InvalidOutput', 'Output truncated', usage);
  let output: unknown;
  try {
    output = JSON.parse(answerText(choice?.message?.content ?? ''));
  } catch {
    throw new NvidiaChatError('InvalidOutput', 'Output is not JSON', usage);
  }
  return { output, model: body.model ?? options.model, ...usage };
}
