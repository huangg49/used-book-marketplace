import {
  NvidiaChatError,
  nvidiaChat,
  type NvidiaChatOptions,
} from '../price-assist/nvidia-chat.js';
import { PriceModelError, type ModelDraft } from '../price-assist/price-model.js';
import {
  isTransientProviderStatus,
  OPENAI_LISTING_MODEL,
  openAiResponses,
  type OpenAiOptions,
} from '../price-assist/openai-responses.js';

// Provider boundary for reading book photos. Production uses NVIDIA NIM;
// tests substitute a fake (never as live evidence).
export abstract class AutofillModel {
  abstract readonly model: string;
  abstract readonly fallback: string | null;
  readonly supportsDetail: boolean = false;
  readonly fallbackOnEmpty: boolean = true;
  canFallback(_error: unknown): boolean { return true; }
  // images: data URLs, best first. useFallback picks the second model.
  abstract read(
    system: string,
    user: string,
    images: string[],
    useFallback?: boolean,
  ): Promise<ModelDraft>;
}

export const AUTOFILL_DEFAULT_MODEL = 'nvidia/nemotron-3.5-super-vl-120b-a12b';

export class NvidiaAutofillModel extends AutofillModel {
  readonly model: string;
  readonly fallback: string | null;
  override readonly supportsDetail: boolean;
  constructor(
    private readonly options: NvidiaChatOptions & { fallbackModel?: string | null },
  ) {
    super();
    this.model = options.model;
    this.fallback = options.fallbackModel || null;
    // The deployed model is verified with three photos plus one close-up.
    this.supportsDetail = this.model === AUTOFILL_DEFAULT_MODEL;
  }
  async read(system: string, user: string, images: string[], useFallback = false) {
    const model = useFallback && this.fallback ? this.fallback : this.model;
    try {
      // No guided decoding: not every hosted VLM accepts it. The prompt asks
      // for bare JSON and autofill-check.ts validates every field.
      return await nvidiaChat(
        { ...this.options, model },
        system,
        [
          { type: 'text', text: user },
          ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
        ],
        null,
        1200,
      );
    } catch (e) {
      if (e instanceof NvidiaChatError)
        throw new PriceModelError(e.kind, e.message, e.usage, e.detail);
      throw new PriceModelError('ProviderError', 'Provider call failed');
    }
  }
}

export class OpenAiAutofillModel extends AutofillModel {
  readonly model: string;
  readonly fallback: string | null;
  override readonly supportsDetail = true;
  override readonly fallbackOnEmpty = false;

  constructor(
    private readonly options: OpenAiOptions,
    private readonly secondary: NvidiaAutofillModel | null,
  ) {
    super();
    this.model = options.model;
    this.fallback = secondary?.model ?? null;
  }

  override canFallback(error: unknown): boolean {
    if (!(error instanceof PriceModelError)) return false;
    const status = error.detail?.status;
    return error.kind === 'Timeout' ||
      (error.kind === 'ProviderError' && (status == null || isTransientProviderStatus(status)));
  }

  async read(system: string, user: string, images: string[], useFallback = false): Promise<ModelDraft> {
    if (useFallback && this.secondary) return this.secondary.read(system, user, images);
    const result = await openAiResponses(this.options, {
      instructions: system,
      input: [{ role: 'user', content: [
        { type: 'input_text', text: user },
        ...images.map((image_url) => ({ type: 'input_image', image_url, detail: 'high' })),
      ] }],
      text: { format: { type: 'json_object' } },
      max_output_tokens: 1200,
    });
    const { model, inputTokens, outputTokens } = result;
    const usage = { inputTokens, outputTokens };
    if (result.refused) throw new PriceModelError('Refusal', 'OpenAI refused the image request', usage);
    if (!result.completed || !result.text)
      throw new PriceModelError('InvalidOutput', 'OpenAI returned an incomplete answer', usage);
    try {
      return { ...usage, model, output: JSON.parse(result.text) as unknown };
    } catch {
      throw new PriceModelError('InvalidOutput', 'OpenAI returned invalid JSON', usage);
    }
  }
}

export function nvidiaAutofillModelFromConfig(
  get: (key: string) => string | undefined,
  timeoutMs = Number(get('AUTOFILL_TIMEOUT_MS') || 25_000),
  retry = true,
): NvidiaAutofillModel | null {
  const apiKey = get('AUTOFILL_API_KEY') ?? '';
  if (!apiKey || get('AUTOFILL_ENABLED') !== 'true') return null;
  return new NvidiaAutofillModel({
    apiKey,
    model: get('AUTOFILL_MODEL') || AUTOFILL_DEFAULT_MODEL,
    fallbackModel: get('AUTOFILL_FALLBACK_MODEL') || null,
    timeoutMs,
    retry,
    baseUrl: get('NVIDIA_BASE_URL') || undefined,
  });
}

export function autofillModelFromConfig(get: (key: string) => string | undefined): AutofillModel | null {
  if (get('AUTOFILL_ENABLED') !== 'true') return null;
  if (get('AUTOFILL_PROVIDER') !== 'openai') return nvidiaAutofillModelFromConfig(get);
  const apiKey = get('AUTOFILL_OPENAI_API_KEY');
  if (!apiKey) return null;
  const totalMs = Number(get('AUTOFILL_TIMEOUT_MS') || 25_000);
  const primaryMs = Math.floor(totalMs * 0.6);
  const secondary = nvidiaAutofillModelFromConfig(get, totalMs - primaryMs, false);
  return new OpenAiAutofillModel({
    apiKey,
    model: get('AUTOFILL_OPENAI_MODEL') || OPENAI_LISTING_MODEL,
    timeoutMs: secondary ? primaryMs : totalMs,
  }, secondary);
}
