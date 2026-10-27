import type { Intent } from "../../core/command";
import { receipt, type Kind, type Listing, type Catalog } from "./contracts";

export type RecordedDecision = {
  entityId: string;
  revisionId: string;
  version: number;
  decision: "Approve" | "Confirm";
};
export function recordedDecision(
  intent: Intent,
  kind: Kind,
  id: string,
): RecordedDecision | null {
  if (
    !intent.acknowledged ||
    intent.stopped ||
    intent.path !== `/operations/${kind}/${id}/decision`
  )
    return null;
  const parsed = receipt.safeParse(intent.response);
  if (!parsed.success || parsed.data.entityId !== id || !parsed.data.revisionId)
    return null;
  try {
    const body = JSON.parse(intent.body);
    if (
      !Number.isInteger(body.expectedVersion) ||
      parsed.data.version <= body.expectedVersion ||
      body.revisionId !== parsed.data.revisionId ||
      (kind === "listings"
        ? body.decision !== "Approve"
        : body.decision !== "Confirm")
    )
      return null;
    return {
      entityId: id,
      revisionId: parsed.data.revisionId,
      version: parsed.data.version,
      decision: body.decision,
    };
  } catch {
    return null;
  }
}
export function matchesRecordedDecision(
  value: Listing | Catalog,
  recorded: RecordedDecision | null,
) {
  if (
    !recorded ||
    value.id !== recorded.entityId ||
    value.version < recorded.version ||
    value.currentRevision.id !== recorded.revisionId
  )
    return false;
  return "state" in value
    ? value.state.moderation === "Approved" &&
        value.state.visibility !== "Removed" &&
        value.latestDecision?.revisionId === recorded.revisionId &&
        value.latestDecision.decision === recorded.decision
    : value.status === "Confirmed" &&
        value.decisions.some(
          (decision) =>
            decision.revisionId === recorded.revisionId &&
            decision.decision === recorded.decision,
        );
}
