// Reuse signed media only inside the server-issued lifetime, with room for
// network/clock jitter. This is not an extension of storage authorization.
const EXPIRY_MARGIN_MS = 5_000;
export const PUBLIC_MEDIA_GC_MS = 120_000;

export function signedMediaRemainingMs(
  expiresAt: string | undefined,
  now = Date.now(),
): number {
  const expiry = expiresAt ? Date.parse(expiresAt) : NaN;
  return Number.isFinite(expiry)
    ? Math.max(0, expiry - EXPIRY_MARGIN_MS - now)
    : 0;
}

export function signedMediaStaleTime(
  expiresAt: string | undefined,
  receivedAt: number,
): number {
  return signedMediaRemainingMs(expiresAt, receivedAt);
}
