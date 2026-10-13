import { ApiError } from "@used-books/session-client";
import type { z } from "zod";

export type Intent = {
  path: string;
  key: string;
  body: string;
  acknowledged: boolean;
  stopped: boolean;
  // The parsed receipt once the server acknowledged the command.
  response?: unknown;
};
// The body is serialized now, so later edits to the form cannot change a retry.
export function createCommand(path: string, body: unknown): Intent {
  return {
    path,
    key: crypto.randomUUID(),
    body: JSON.stringify(body),
    acknowledged: false,
    stopped: false,
  };
}
export type Request = <T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
) => Promise<T>;
// The same frozen payload/key survives ambiguous failures. After an acknowledgement,
// only reconcile with GET. Never infer success from a changed version alone.
export async function runCommand<T>(
  intent: Intent,
  schema: z.ZodType<T>,
  request: Request,
  reconcile: () => Promise<void>,
): Promise<T | undefined> {
  if (!intent.acknowledged && !intent.stopped) {
    try {
      intent.response = await request(intent.path, schema, {
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
  return intent.response as T | undefined;
}
