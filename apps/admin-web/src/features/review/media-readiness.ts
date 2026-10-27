// A cached signed URL alone is not evidence that this browser loaded the image.
// Renewed URLs and any failed read invalidate readiness until an image loads again.
export function reviewImageReady(
  url: string | undefined,
  loaded: string | undefined,
  failed: string | undefined,
  readError: boolean,
) {
  return !!url && loaded === url && failed !== url && !readError;
}
