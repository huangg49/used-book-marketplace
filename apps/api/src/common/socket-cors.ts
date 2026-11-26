export const DEFAULT_CORS_ORIGINS =
  'http://localhost:5173,http://localhost:5174,http://localhost:8081';

export function parseCorsOrigins(raw = process.env.CORS_ORIGINS): string[] {
  const value = raw?.trim() ? raw : DEFAULT_CORS_ORIGINS;
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isAllowedSocketOrigin(
  origin: string | undefined,
  rawEnv = process.env.CORS_ORIGINS,
): boolean {
  // Native React Native clients and Node integration tests omit Origin.
  if (!origin) return true;
  return parseCorsOrigins(rawEnv).includes(origin.trim());
}

export function socketCorsOptions() {
  return {
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      callback(null, isAllowedSocketOrigin(origin));
    },
    credentials: false,
  };
}
