import { ApiError } from "@used-books/session-client";
import type { z } from "zod";
import { receipt, type DecisionBody, type Kind } from "./contracts";

export type Intent = {
  path: string;
  key: string;
  body: string;
  acknowledged: boolean;
  stopped: boolean;
};
export function createIntent(
  kind: Kind,
  id: string,
  body: DecisionBody,
): Intent {
  return {
    path: `/operations/${kind}/${id}/decision`,
    key: crypto.randomUUID(),
    body: JSON.stringify(body),
    acknowledged: false,
    stopped: false,
  };
}
type Request = <T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
) => Promise<T>;
// The same frozen payload/key survives ambiguous failures. After an acknowledgement,
// only reconcile with GET. Never infer success from a changed version alone.
export async function executeIntent(
  intent: Intent,
  request: Request,
  reconcile: () => Promise<void>,
) {
  if (!intent.acknowledged && !intent.stopped) {
    try {
      await request(intent.path, receipt, {
        method: "POST",
        headers: { "Idempotency-Key": intent.key },
        body: intent.body,
      });
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
  await reconcile();
}
export function validReason(value: string) {
  const n = [...value.trim()].length;
  return n >= 10 && n <= 1000;
}
export function createRemovalIntent(
  id: string,
  version: number,
  reason: string,
): Intent {
  return {
    path: `/operations/listings/${id}/remove`,
    key: crypto.randomUUID(),
    body: JSON.stringify({ expectedVersion: version, reason: reason.trim() }),
    acknowledged: false,
    stopped: false,
  };
}
