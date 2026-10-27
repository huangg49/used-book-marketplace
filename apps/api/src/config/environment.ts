export function validateEnvironment(env: Record<string, unknown>) {
  const mongoUrl = String(env.MONGODB_URL ?? '');
  if (!/^mongodb(\+srv)?:\/\/[^/]+\/[^?/]+/.test(mongoUrl))
    throw new Error(
      'MONGODB_URL must be a MongoDB URL that names the application database.',
    );
  const secret = String(env.JWT_ACCESS_SECRET ?? '');
  if (secret.length < 32 || secret.startsWith('replace-')) {
    throw new Error(
      'JWT_ACCESS_SECRET must contain at least 32 random characters. Run pnpm setup:local.',
    );
  }
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT is invalid.');
  const nodeEnv = String(env.NODE_ENV ?? 'development');
  const storageUrl = String(env.SUPABASE_URL ?? '').replace(/\/$/, '');
  const storageKey = String(env.SUPABASE_STORAGE_KEY ?? '');
  const bucket = String(env.SUPABASE_MEDIA_BUCKET ?? 'latlai-media');
  if (!!storageUrl !== !!storageKey)
    throw new Error(
      'Set both SUPABASE_URL and SUPABASE_STORAGE_KEY, or neither.',
    );
  if (storageUrl && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(storageUrl))
    throw new Error('SUPABASE_URL must be the HTTPS project URL.');
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(bucket))
    throw new Error('Invalid SUPABASE_MEDIA_BUCKET.');
  const budget = Number(env.MEDIA_STORAGE_BUDGET_BYTES ?? 800_000_000);
  if (!Number.isSafeInteger(budget) || budget < 1 || budget > 800_000_000)
    throw new Error('Media reservation budget must be 1..800000000 bytes.');
  if (!['development', 'test', 'production'].includes(nodeEnv))
    throw new Error('NODE_ENV is invalid.');
  const simulatorSecret = String(env.PAYMENT_SIMULATOR_SECRET ?? '');
  if (
    simulatorSecret &&
    (simulatorSecret.length < 32 || simulatorSecret.startsWith('replace-'))
  )
    throw new Error(
      'PAYMENT_SIMULATOR_SECRET must contain at least 32 random characters or be unset.',
    );
  if (simulatorSecret && nodeEnv === 'production')
    throw new Error('Payment simulator must be disabled in production.');
  const priceAssist = validatePriceAssist(env);
  const accountMail = validateAccountMail(env, nodeEnv, secret);
  return {
    ...env,
    ...priceAssist,
    ...accountMail,
    MONGODB_URL: mongoUrl,
    JWT_ACCESS_SECRET: secret,
    PORT: port,
    NODE_ENV: nodeEnv,
    PAYMENT_SIMULATOR_SECRET: simulatorSecret,
    SUPABASE_URL: storageUrl,
    SUPABASE_STORAGE_KEY: storageKey,
    SUPABASE_MEDIA_BUCKET: bucket,
    MEDIA_STORAGE_BUDGET_BYTES: budget,
  };
}

export function validateAccountMail(
  env: Record<string, unknown>,
  nodeEnv: string,
  jwtSecret: string,
) {
  const provider = String(
    env.AUTH_MAIL_PROVIDER || (nodeEnv === 'production' ? 'disabled' : 'local'),
  );
  if (!['disabled', 'local', 'resend', 'brevo'].includes(provider))
    throw new Error('Invalid AUTH_MAIL_PROVIDER.');
  if (nodeEnv === 'production' && provider === 'local')
    throw new Error('Local auth mailbox is forbidden in production.');
  const origin = String(env.AUTH_WEB_ORIGIN || 'http://127.0.0.1:5186');
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error('Invalid AUTH_WEB_ORIGIN.');
  }
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    !['http:', 'https:'].includes(url.protocol) ||
    (url.protocol === 'http:' &&
      (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        (nodeEnv === 'production' && provider !== 'disabled')))
  )
    throw new Error(
      'AUTH_WEB_ORIGIN must be an HTTPS origin (loopback HTTP only in development/test).',
    );
  const key = String(
    env.AUTH_MAIL_ENCRYPTION_KEY || (nodeEnv !== 'production' ? jwtSecret : ''),
  );
  const apiKey = String(env.RESEND_API_KEY || '');
  const from = String(env.AUTH_MAIL_FROM || 'Lật Lại <onboarding@resend.dev>');
  const brevoKey = String(env.BREVO_API_KEY || '');
  const brevoEmail = String(env.BREVO_SENDER_EMAIL || '');
  const brevoName = String(env.BREVO_SENDER_NAME || 'Lật Lại');
  if (
    provider !== 'disabled' &&
    (key.length < 32 || key.startsWith('replace-'))
  )
    throw new Error(
      'AUTH_MAIL_ENCRYPTION_KEY must be at least 32 random characters.',
    );
  if (
    provider === 'resend' &&
    (!apiKey ||
      apiKey.startsWith('replace-') ||
      /[\r\n]/.test(from) ||
      !from.includes('@'))
  )
    throw new Error('Resend requires RESEND_API_KEY and AUTH_MAIL_FROM.');
  if (
    provider === 'brevo' &&
    (!brevoKey ||
      brevoKey.startsWith('replace-') ||
      /[\r\n]/.test(brevoKey) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(brevoEmail) ||
      brevoEmail.length > 254 ||
      !brevoName.trim() ||
      brevoName.length > 100 ||
      /[\r\n]/.test(brevoName))
  )
    throw new Error(
      'Brevo requires BREVO_API_KEY, a valid BREVO_SENDER_EMAIL and BREVO_SENDER_NAME.',
    );
  return {
    AUTH_MAIL_PROVIDER: provider,
    AUTH_WEB_ORIGIN: origin,
    AUTH_MAIL_ENCRYPTION_KEY: key,
    RESEND_API_KEY: apiKey,
    AUTH_MAIL_FROM: from,
    BREVO_API_KEY: brevoKey,
    BREVO_SENDER_EMAIL: brevoEmail,
    BREVO_SENDER_NAME: brevoName,
    AUTH_MAIL_LOCAL_DIR: String(env.AUTH_MAIL_LOCAL_DIR || '.tmp/auth-mail'),
  };
}

const intIn = (raw: unknown, fallback: number, min: number, max: number, name: string) => {
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`${name} must be an integer ${min}..${max}.`);
  return value;
};
const rateOf = (raw: unknown, name: string) => {
  if (raw === undefined || raw === '') return '';
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 1000)
    throw new Error(`${name} must be a positive USD per million tokens rate.`);
  return String(value);
};

// Price assistant (ADR 0028): off unless explicitly enabled. The provider key
// is read only by the API process and never logged or returned.
export function validatePriceAssist(env: Record<string, unknown>) {
  const enabled = String(env.PRICE_ASSIST_ENABLED ?? 'false');
  if (!['true', 'false'].includes(enabled))
    throw new Error('PRICE_ASSIST_ENABLED must be true or false.');
  const apiKey = String(env.PRICE_ASSIST_API_KEY ?? '');
  if (apiKey && apiKey.startsWith('replace-'))
    throw new Error('PRICE_ASSIST_API_KEY still holds the example value.');
  const provider = String(env.PRICE_ASSIST_PROVIDER || 'anthropic');
  if (!['anthropic', 'gemini', 'nvidia'].includes(provider))
    throw new Error('PRICE_ASSIST_PROVIDER must be anthropic, gemini or nvidia.');
  const model = String(
    env.PRICE_ASSIST_MODEL || DEFAULT_PRICE_MODELS[provider],
  );
  // NVIDIA ids carry a publisher prefix (nvidia/..., meta/...).
  const modelPattern =
    provider === 'nvidia'
      ? /^[a-z0-9][a-z0-9_.-]{1,39}\/[a-z0-9][a-z0-9_.-]{1,79}$/
      : /^[a-z0-9][a-z0-9.-]{2,79}$/;
  if (!modelPattern.test(model))
    throw new Error('PRICE_ASSIST_MODEL is invalid.');
  const nvidiaBase = String(env.NVIDIA_BASE_URL ?? '');
  if (nvidiaBase && !/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(nvidiaBase))
    throw new Error('NVIDIA_BASE_URL must be an https URL.');
  const effort = String(env.PRICE_ASSIST_EFFORT || 'low');
  if (!['low', 'medium', 'high', 'none'].includes(effort))
    throw new Error('PRICE_ASSIST_EFFORT must be low, medium, high or none.');
  // Online price lookup (ADR 0029): Gemini with Google Search, off by default.
  const lookup = String(env.PRICE_LOOKUP_ENABLED ?? 'false');
  if (!['true', 'false'].includes(lookup))
    throw new Error('PRICE_LOOKUP_ENABLED must be true or false.');
  const shops = String(env.PRICE_LOOKUP_SHOPS || DEFAULT_LOOKUP_SHOPS)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!shops.length || shops.some((s) => !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s)))
    throw new Error('PRICE_LOOKUP_SHOPS must be a comma-separated list of domains.');
  const searchUsd = Number(env.PRICE_LOOKUP_SEARCH_USD ?? 0.035);
  if (!Number.isFinite(searchUsd) || searchUsd < 0 || searchUsd > 1)
    throw new Error('PRICE_LOOKUP_SEARCH_USD must be 0..1.');
  const budget = Number(env.PRICE_ASSIST_DAILY_BUDGET_USD ?? 2);
  if (!Number.isFinite(budget) || budget < 0 || budget > 100)
    throw new Error('PRICE_ASSIST_DAILY_BUDGET_USD must be 0..100.');
  return {
    PRICE_ASSIST_ENABLED: enabled,
    PRICE_ASSIST_API_KEY: apiKey,
    PRICE_ASSIST_PROVIDER: provider,
    PRICE_ASSIST_MODEL: model,
    PRICE_ASSIST_EFFORT: effort,
    NVIDIA_BASE_URL: nvidiaBase.replace(/\/+$/, ''),
    PRICE_ASSIST_TIMEOUT_MS: intIn(env.PRICE_ASSIST_TIMEOUT_MS, 20_000, 2_000, 60_000, 'PRICE_ASSIST_TIMEOUT_MS'),
    PRICE_ASSIST_USER_DAILY_LIMIT: intIn(env.PRICE_ASSIST_USER_DAILY_LIMIT, 20, 1, 500, 'PRICE_ASSIST_USER_DAILY_LIMIT'),
    PRICE_ASSIST_DAILY_BUDGET_USD: budget,
    PRICE_ASSIST_INPUT_USD_PER_MTOK: rateOf(env.PRICE_ASSIST_INPUT_USD_PER_MTOK, 'PRICE_ASSIST_INPUT_USD_PER_MTOK'),
    PRICE_ASSIST_OUTPUT_USD_PER_MTOK: rateOf(env.PRICE_ASSIST_OUTPUT_USD_PER_MTOK, 'PRICE_ASSIST_OUTPUT_USD_PER_MTOK'),
    PRICE_LOOKUP_ENABLED: lookup,
    PRICE_LOOKUP_SHOPS: shops.join(','),
    PRICE_LOOKUP_TTL_DAYS: intIn(env.PRICE_LOOKUP_TTL_DAYS, 30, 1, 180, 'PRICE_LOOKUP_TTL_DAYS'),
    PRICE_LOOKUP_DAILY_LIMIT: intIn(env.PRICE_LOOKUP_DAILY_LIMIT, 50, 1, 1000, 'PRICE_LOOKUP_DAILY_LIMIT'),
    PRICE_LOOKUP_SEARCH_USD: searchUsd,
  };
}

const DEFAULT_PRICE_MODELS: Record<string, string> = {
  anthropic: 'claude-opus-5-5',
  gemini: 'gemini-3.8-flash',
  nvidia: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
};

// Proposal for the owner to confirm: shops that sell new books in Vietnam.
export const DEFAULT_LOOKUP_SHOPS =
  'fahasa.com,tiki.vn,nhanam.vn,nxbtre.com.vn,nxbkimdong.com.vn';
