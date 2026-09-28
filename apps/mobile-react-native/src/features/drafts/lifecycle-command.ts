import { ApiError, type SessionClient } from "../../core/api/session-client";
import { receipt } from "./contracts";
export type LifecycleIntent = {
  id: string;
  action: "archive" | "Hidden" | "Visible";
  key: string;
  body: string;
  acknowledged?: boolean;
  stopped?: boolean;
};
export function lifecycleIntent(
  id: string,
  version: number,
  action: LifecycleIntent["action"],
  key: string,
): LifecycleIntent {
  return {
    id,
    action,
    key,
    body: JSON.stringify({
      expectedVersion: version,
      ...(action === "archive" ? {} : { visibility: action }),
    }),
  };
}
export async function executeLifecycle(
  client: Pick<SessionClient, "request">,
  intent: LifecycleIntent,
) {
  if (intent.acknowledged || intent.stopped) return;
  try {
    await client.request(
      `/listings/${intent.id}/${intent.action === "archive" ? "archive" : "visibility"}`,
      receipt,
      {
        method: intent.action === "archive" ? "POST" : "PUT",
        headers: { "Idempotency-Key": intent.key },
        body: intent.body,
      },
    );
    intent.acknowledged = true;
  } catch (error) {
    if (
      error instanceof ApiError &&
      [400, 403, 404, 409, 422].includes(error.status)
    )
      intent.stopped = true;
    throw error;
  }
}
