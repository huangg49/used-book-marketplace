// NVIDIA NIM over its OpenAI-compatible chat API (build.nvidia.com or a
// self-hosted NIM). Shared by the price model and the photo autofill model;
// the key goes only in the Authorization header and is never logged.

export const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

export type NvidiaFailure = 'Timeout' | 'InvalidOutput' | 'ProviderError' | 'Refusal';

// What the server log may say about a failed call: HTTP status, the network
// error code (e.g. ECONNRESET, UND_ERR_CONNECT_TIMEOUT), attempts and time
// spent. Never the key, the prompt, photos or the provider's free text.
export interface ProviderFailureDetail {
  status: number | null;
  code: string | null;
  attempts: number;
  elapsedMs: number;
}

export class NvidiaChatError extends Error {
  constructor(
    readonly kind: NvidiaFailure,
    message: string,
    readonly usage: { inputTokens: number; outputTokens: number } | null = null,
    readonly detail: ProviderFailureDetail | null = null,
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
  // Covers every attempt, so callers keep one bound per call.
  timeoutMs: number;
  retry?: boolean;
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

// The hosted API queues: most answers take a second or two, a few hang until
// the timeout and then succeed when asked again (ADR 0063 measured 12/118).
// One retry is kept for a busy or silent provider, never for an answer.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAY_MS = 1_000;
const RETRY_JITTER_MS = 500;
const RETRY_MAX_WAIT_MS = 3_000;
const RETRY_MIN_LEFT_MS = 8_000;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Provider status and message, cut short; kept in the error message for tests
// and local debugging, not written to the log.
async function errorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string } | string;
      detail?: string;
      message?: string;
    };
    const raw =
      typeof body.error === 'string'
        ? body.error
        : (body.error?.message ?? body.detail ?? body.message ?? '');
    return raw ? `: ${String(raw).slice(0, 300)}` : '';
  } catch {
    return '';
  }
}

// Seconds only; an HTTP date or a missing header leaves the default pause.
function retryAfterMs(response: Response): number | null {
  const raw = response.headers.get('retry-after');
  if (!raw || !/^\d{1,4}$/.test(raw.trim())) return null;
  return Number(raw.trim()) * 1000;
}

// undici reports "fetch failed" with the socket error as its cause.
function causeCode(e: unknown): string | null {
  const code = (e as { cause?: { code?: unknown } } | null)?.cause?.code;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,39}$/.test(code) ? code : null;
}

// Reasoning models may emit <think>…</think> before the answer (or only the
// closing tag when the template opened it), and a model without guided
// decoding may wrap JSON in a code fence or a sentence.
export function answerText(raw: string): string {
  const closed = raw.lastIndexOf('</think>');
  const text = (closed >= 0 ? raw.slice(closed + '</think>'.length) : raw)
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  if (text.startsWith('{') || text.startsWith('[')) return text;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

type Attempt =
  | { ok: true; body: ChatBody; status: number }
  | {
      ok: false;
      kind: 'Timeout' | 'ProviderError';
      message: string;
      status: number | null;
      code: string | null;
      retryable: boolean;
      waitMs: number | null;
    };

async function attempt(
  options: NvidiaChatOptions,
  payload: string,
  timeoutMs: number,
): Promise<Attempt> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
        body: payload,
      },
    );
    if (!response.ok)
      return {
        ok: false,
        kind: 'ProviderError',
        message: `Provider error ${response.status}${await errorDetail(response)}`,
        status: response.status,
        code: null,
        retryable: RETRYABLE_STATUS.has(response.status),
        waitMs: retryAfterMs(response),
      };
    return { ok: true, body: (await response.json()) as ChatBody, status: response.status };
  } catch (e) {
    if (controller.signal.aborted)
      return {
        ok: false,
        kind: 'Timeout',
        message: 'Provider timed out',
        status: null,
        code: null,
        retryable: true,
        // A silent provider was not throttling: ask again at once.
        waitMs: 0,
      };
    return {
      ok: false,
      kind: 'ProviderError',
      message: 'Provider call failed',
      status: null,
      code: causeCode(e),
      retryable: true,
      waitMs: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

// One bounded call within timeoutMs. A busy, failing or silent provider gets
// one more attempt when enough time is left; both attempts belong to the one
// reserved quota unit, and a failed attempt is unbilled.
export async function nvidiaChat(
  options: NvidiaChatOptions,
  system: string,
  user: NvidiaContent,
  // null when the model has no guided decoding (some hosted VLMs).
  schema: Record<string, unknown> | null,
  maxTokens = 4000,
): Promise<NvidiaChatResult> {
  const started = Date.now();
  const deadline = started + options.timeoutMs;
  const payload = JSON.stringify({
    model: options.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
    max_tokens: maxTokens,
    stream: false,
    // Nemotron 3.x reasons by default into reasoning_content, which
    // spends the token budget and leaves content empty.
    chat_template_kwargs: { enable_thinking: false },
    // Structured output (the hosted API rejects the older
    // nvext.guided_json); the strict check still runs on our side.
    ...(schema
      ? {
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'answer', schema, strict: true },
          },
        }
      : {}),
  });
  // The first attempt leaves room for a second only when the bound allows one
  // (25 s: 16 s, then 9 s; 20 s: 11 s, then 9 s).
  const firstLimit =
    options.retry !== false && options.timeoutMs >= 2 * RETRY_MIN_LEFT_MS + RETRY_DELAY_MS
      ? options.timeoutMs - RETRY_MIN_LEFT_MS - RETRY_DELAY_MS
      : options.timeoutMs;
  let attempts = 0;
  let body: ChatBody;
  let status: number;
  for (;;) {
    attempts++;
    const left = deadline - Date.now();
    const result = await attempt(
      options,
      payload,
      attempts === 1 ? Math.min(firstLimit, left) : left,
    );
    if (result.ok) {
      body = result.body;
      status = result.status;
      break;
    }
    const wait =
      result.waitMs ?? RETRY_DELAY_MS + Math.floor(Math.random() * RETRY_JITTER_MS);
    if (
      options.retry === false ||
      attempts >= 2 ||
      !result.retryable ||
      wait > RETRY_MAX_WAIT_MS ||
      deadline - Date.now() - wait < RETRY_MIN_LEFT_MS
    )
      throw new NvidiaChatError(result.kind, result.message, null, {
        status: result.status,
        code: result.code,
        attempts,
        elapsedMs: Date.now() - started,
      });
    await delay(wait);
  }
  const usage = {
    inputTokens: Number(body.usage?.prompt_tokens ?? 0),
    outputTokens: Number(body.usage?.completion_tokens ?? 0),
  };
  const fail = (kind: NvidiaFailure, message: string) =>
    new NvidiaChatError(kind, message, usage, {
      status,
      code: null,
      attempts,
      elapsedMs: Date.now() - started,
    });
  const choice = body.choices?.[0];
  if (choice?.finish_reason === 'content_filter' || choice?.message?.refusal)
    throw fail('Refusal', 'Provider declined');
  if (choice?.finish_reason === 'length') throw fail('InvalidOutput', 'Output truncated');
  let output: unknown;
  try {
    output = JSON.parse(answerText(choice?.message?.content ?? ''));
  } catch {
    throw fail('InvalidOutput', 'Output is not JSON');
  }
  return { output, model: body.model ?? options.model, ...usage };
}
