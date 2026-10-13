import {
  createCommand,
  runCommand,
  type Intent,
  type Request,
} from "../../core/command";
import { receipt, type DecisionBody, type Kind } from "./contracts";

export type { Intent };
export function createIntent(
  kind: Kind,
  id: string,
  body: DecisionBody,
): Intent {
  return createCommand(`/operations/${kind}/${id}/decision`, body);
}
export async function executeIntent(
  intent: Intent,
  request: Request,
  reconcile: () => Promise<void>,
) {
  await runCommand(intent, receipt, request, reconcile);
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
  return createCommand(`/operations/listings/${id}/remove`, {
    expectedVersion: version,
    reason: reason.trim(),
  });
}
