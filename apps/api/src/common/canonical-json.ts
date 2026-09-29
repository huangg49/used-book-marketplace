// Stable JSON with sorted object keys; used for request hashes and checksums.
// Unchanged from the PostgreSQL baseline so stored payload hashes stay valid.
export const canonicalJson = (value: unknown): string =>
  JSON.stringify(canonical(value));
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          canonical((value as Record<string, unknown>)[key]),
        ]),
    );
  return value;
}
