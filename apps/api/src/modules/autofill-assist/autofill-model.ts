import {
  NvidiaChatError,
  nvidiaChat,
  type NvidiaChatOptions,
} from '../price-assist/nvidia-chat.js';
import { PriceModelError, type ModelDraft } from '../price-assist/price-model.js';

// Provider boundary for reading book photos. Production uses NVIDIA NIM;
// tests substitute a fake (never as live evidence).
export abstract class AutofillModel {
  abstract readonly model: string;
  abstract readonly fallback: string | null;
  // images: data URLs, best first. useFallback picks the second model.
  abstract read(
    system: string,
    user: string,
    images: string[],
    useFallback?: boolean,
  ): Promise<ModelDraft>;
}

export const AUTOFILL_DEFAULT_MODEL = 'nvidia/llama-3.1-nemotron-nano-vl-8b-v1';

export class NvidiaAutofillModel extends AutofillModel {
  readonly model: string;
  readonly fallback: string | null;
  constructor(
    private readonly options: NvidiaChatOptions & { fallbackModel?: string | null },
  ) {
    super();
    this.model = options.model;
    this.fallback = options.fallbackModel || null;
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
        throw new PriceModelError(e.kind, e.message, e.usage);
      throw new PriceModelError('ProviderError', 'Provider call failed');
    }
  }
}

// null without a key or with the feature flag off.
export function autofillModelFromConfig(
  get: (key: string) => string | undefined,
): AutofillModel | null {
  const apiKey = get('AUTOFILL_API_KEY') ?? '';
  if (!apiKey || get('AUTOFILL_ENABLED') !== 'true') return null;
  return new NvidiaAutofillModel({
    apiKey,
    model: get('AUTOFILL_MODEL') || AUTOFILL_DEFAULT_MODEL,
    fallbackModel: get('AUTOFILL_FALLBACK_MODEL') || null,
    timeoutMs: Number(get('AUTOFILL_TIMEOUT_MS') || 25_000),
    baseUrl: get('NVIDIA_BASE_URL') || undefined,
  });
}
