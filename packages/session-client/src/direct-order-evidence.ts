import { z } from "zod";
import type { SessionClient } from "./session-client";
import { exchangeEvidenceReadSchema } from "./exchange-evidence";

export const directOrderEvidenceMime = z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4"]);
const item = z.object({
  id: z.uuid(), mimeType: directOrderEvidenceMime, byteSize: z.number().int(),
  sha256: z.string(), status: z.enum(["Pending", "Ready"]),
});
const evidenceList = z.object({ items: z.array(item), packagingEvidenceIds: z.array(z.uuid()) });
const receipt = z.object({ id: z.uuid() });
const endpoint = (caseId: string) => `/support-cases/${caseId}/order-evidence`;

export function getDirectOrderEvidence(client: SessionClient, caseId: string) {
  return client.request(endpoint(caseId), evidenceList);
}

export function reserveDirectOrderEvidence(
  client: SessionClient, caseId: string, body: { evidenceId: string; mimeType: z.infer<typeof directOrderEvidenceMime>; byteSize: number; sha256: string }, key: string,
) {
  return client.request(endpoint(caseId), receipt, {
    method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(body),
  });
}

export function uploadDirectOrderEvidence(client: SessionClient, caseId: string, evidenceId: string, bytes: Blob, key: string) {
  return client.request(`${endpoint(caseId)}/${evidenceId}/content`, receipt, {
    method: "PUT", headers: { "Idempotency-Key": key, "Content-Type": "application/octet-stream" }, body: bytes,
  });
}

export function readDirectOrderEvidence(client: SessionClient, caseId: string, evidenceId: string, reason?: string) {
  return client.request(`${endpoint(caseId)}/${evidenceId}/read`, exchangeEvidenceReadSchema, {
    method: "POST", body: JSON.stringify(reason ? { reason } : {}),
  });
}
