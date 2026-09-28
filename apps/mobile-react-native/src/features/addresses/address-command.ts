import { ApiError, type SessionClient } from "../../core/api/session-client";
import { addressBook, addressReceipt } from "./contracts";
export type AddressIntent = {
  path: string;
  method: "POST" | "PUT";
  body: string;
  key: string;
  acknowledged?: boolean;
  stopped?: boolean;
};
export async function executeAddress(
  client: Pick<SessionClient, "request">,
  intent: AddressIntent,
) {
  if (intent.stopped)
    throw new Error("Reconcile a rejected address command before a new intent");
  if (!intent.acknowledged) {
    try {
      await client.request(intent.path, addressReceipt, {
        method: intent.method,
        body: intent.body,
        headers: { "Idempotency-Key": intent.key },
      });
      intent.acknowledged = true;
    } catch (e) {
      if (
        e instanceof ApiError &&
        [400, 403, 404, 409, 422, 429].includes(e.status)
      )
        intent.stopped = true;
      throw e;
    }
  }
  return client.request("/me/addresses", addressBook);
}
