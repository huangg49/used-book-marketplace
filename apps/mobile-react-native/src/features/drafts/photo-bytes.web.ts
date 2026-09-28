export async function photoBytes(
  uri: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(uri, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("PhotoUnavailable");
  const blob = await response.blob();
  if (blob.size > 10_000_000) throw new Error("PhotoTooLarge");
  return new Uint8Array(await blob.arrayBuffer());
}
