import type { SessionClient } from "../../core/api/session-client";
import { ApiError } from "../../core/api/session-client";
import { privateDraft, receipt, type Content } from "./contracts";
// The owner keeps this intent in memory until a fresh server read succeeds.
// Never rebuild a body/version/key after an ambiguous network result.
export type ListingIntent = {
  id: string;
  saveBody: string;
  saveKey: string;
  submitKey: string;
  submit: boolean;
  savedVersion?: number;
  submitted?: boolean;
  stopped?: boolean;
  approved?: boolean;
};
export function listingIntent(
  id: string,
  version: number,
  content: Content,
  submit: boolean,
  key: () => string,
  approved = false,
): ListingIntent {
  return {
    id,
    saveBody: JSON.stringify({
      expectedVersion: version,
      content,
      ...(approved ? { ownershipDeclared: true } : {}),
    }),
    saveKey: key(),
    submitKey: key(),
    submit,
    approved,
  };
}
export async function runListingIntent(
  client: Pick<SessionClient, "request">,
  intent: ListingIntent,
) {
  try {
    if (!intent.stopped && intent.savedVersion === undefined) {
      const saved = await client.request(
        `/listings/${intent.id}/${intent.approved ? "revision" : "draft"}`,
        receipt,
        {
          method: intent.approved ? "POST" : "PUT",
          headers: { "Idempotency-Key": intent.saveKey },
          body: intent.saveBody,
        },
      );
      intent.savedVersion = saved.version;
      if (intent.approved) intent.submitted = true;
    }
    if (!intent.stopped && intent.submit && !intent.submitted) {
      await client.request(`/listings/${intent.id}/submit`, receipt, {
        method: "POST",
        headers: { "Idempotency-Key": intent.submitKey },
        body: JSON.stringify({
          expectedVersion: intent.savedVersion,
          ownershipDeclared: true,
        }),
      });
      intent.submitted = true;
    }
  } catch (e) {
    // Definitive rejection allows reconciliation, never a silent write at a new version.
    if (e instanceof ApiError && [400, 403, 404, 409, 422].includes(e.status))
      intent.stopped = true;
    throw e;
  }
  return client.request(`/me/listings/${intent.id}`, privateDraft);
}
