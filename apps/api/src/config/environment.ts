export function validateEnvironment(env: Record<string, unknown>) {
  const databaseUrl = String(env.DATABASE_URL ?? '');
  try {
    if (!['postgresql:', 'postgres:'].includes(new URL(databaseUrl).protocol))
      throw new Error();
  } catch {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL.');
  }
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
  return {
    ...env,
    DATABASE_URL: databaseUrl,
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
