import { ApiError, type SessionClient } from "../../core/api/session-client";
import { media, receipt, ticket } from "./contracts";

export type UploadAttempt = {
  listingId: string;
  expectedVersion: number;
  mimeType: string;
  bytes: Uint8Array<ArrayBuffer>;
  sha256: string;
  createKey: string;
  uploadKey: string;
  finalizeKey: string;
  mediaId?: string;
  finalizeVersion?: number;
};
// Caller keeps this attempt in memory across retries. Never generates a new intent on a timeout.
export async function uploadPhoto(
  client: SessionClient,
  attempt: UploadAttempt,
) {
  const base = `/listings/${attempt.listingId}/media`;
  if (!attempt.mediaId) {
    const result = await client.request(base, receipt, {
      method: "POST",
      headers: { "Idempotency-Key": attempt.createKey },
      body: JSON.stringify({
        expectedVersion: attempt.expectedVersion,
        mimeType: attempt.mimeType,
        byteSize: attempt.bytes.length,
        sha256: attempt.sha256,
      }),
    });
    attempt.mediaId = result.entityId;
  }
  const path = `${base}/${attempt.mediaId}`;
  let current = await client.request(`/me${path}`, media);
  if (current.status === "Failed") throw new ApiError(422, "MEDIA_FAILED", "");
  if (current.status === "Ready" || current.status === "Processing")
    return current;
  const grant = await client.request(`${path}/upload-ticket`, ticket);
  if (grant.path !== `${path}/content`)
    throw new ApiError(502, "INVALID_UPLOAD_TARGET", "");
  await client.request(
    grant.path,
    receipt,
    {
      method: "PUT",
      headers: { ...grant.headers, "Idempotency-Key": attempt.uploadKey },
      // A Uint8Array can reference only part of a larger buffer. Never upload
      // adjacent bytes outside the image view used for length and SHA-256.
      body:
        attempt.bytes.byteOffset === 0 &&
        attempt.bytes.byteLength === attempt.bytes.buffer.byteLength
          ? attempt.bytes.buffer
          : attempt.bytes.buffer.slice(
              attempt.bytes.byteOffset,
              attempt.bytes.byteOffset + attempt.bytes.byteLength,
            ),
    },
    120000,
  );
  current = await client.request(`/me${path}`, media);
  attempt.finalizeVersion ??= current.version;
  await client.request(`${path}/finalize`, receipt, {
    method: "POST",
    headers: { "Idempotency-Key": attempt.finalizeKey },
    body: JSON.stringify({ expectedVersion: attempt.finalizeVersion }),
  });
  return client.request(`/me${path}`, media);
}
