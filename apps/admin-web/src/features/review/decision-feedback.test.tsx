import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createIntent, executeIntent } from "./decision-command";
import { recordedDecision, matchesRecordedDecision } from "./decision-feedback";
import { DecisionRecord } from "./DecisionRecord";
import { catalog, type Listing } from "./contracts";
import { ApiError } from "@used-books/session-client";
import type { Request } from "../../core/command";
const id = crypto.randomUUID(),
  revisionId = crypto.randomUUID(),
  time = "2026-10-26T10:00:00Z";
const body = { expectedVersion: 2, revisionId, decision: "Confirm" as const };
const ack = { id: crypto.randomUUID(), entityId: id, revisionId, version: 3 };
const value = catalog.parse({
  id,
  version: 3,
  status: "Confirmed",
  requesterId: crypto.randomUUID(),
  currentRevision: {
    id: revisionId,
    number: 1,
    submittedAt: time,
    metadata: {
      title: "Hồ sơ QA",
      authors: [],
      publisher: null,
      publicationYear: null,
      language: "vi",
      edition: null,
      category: "Văn học",
      isbn: null,
    },
  },
  decisions: [
    {
      id: crypto.randomUUID(),
      revisionId,
      decision: "Confirm",
      reason: null,
      decidedAt: time,
    },
  ],
  createdAt: time,
  updatedAt: time,
});

describe("recorded decision feedback", () => {
  it("requires parsed acknowledgement of the same entity, revision, action and a newer version", () => {
    const intent = createIntent("catalog-requests", id, body);
    intent.response = ack;
    expect(recordedDecision(intent, "catalog-requests", id)).toBeNull();
    intent.acknowledged = true;
    expect(recordedDecision(intent, "catalog-requests", id)).toMatchObject({
      entityId: id,
      revisionId,
      decision: "Confirm",
      version: 3,
    });
    for (const response of [
      {},
      { ...ack, entityId: crypto.randomUUID() },
      { ...ack, revisionId: crypto.randomUUID() },
      { ...ack, version: 2 },
    ]) {
      intent.response = response;
      expect(recordedDecision(intent, "catalog-requests", id)).toBeNull();
    }
    intent.response = ack;
    intent.stopped = true;
    expect(recordedDecision(intent, "catalog-requests", id)).toBeNull();
  });
  it("never animates merely because a read says Confirmed or another reviewer changed a version", () => {
    expect(matchesRecordedDecision(value, null)).toBe(false);
    const intent = createIntent("catalog-requests", id, body);
    intent.acknowledged = true;
    intent.response = ack;
    const recorded = recordedDecision(intent, "catalog-requests", id);
    expect(matchesRecordedDecision(value, recorded)).toBe(true);
    expect(
      matchesRecordedDecision({ ...value, status: "Pending" }, recorded),
    ).toBe(false);
    expect(matchesRecordedDecision({ ...value, decisions: [] }, recorded)).toBe(
      false,
    );
    expect(
      matchesRecordedDecision(
        {
          ...value,
          currentRevision: {
            ...value.currentRevision,
            id: crypto.randomUUID(),
          },
        },
        recorded,
      ),
    ).toBe(false);
  });
  it("does not celebrate a definitively refused command after GET reconciliation", async () => {
    const intent = createIntent("catalog-requests", id, body);
    const request: Request = async () => {
      throw new ApiError(409, "Conflict", "Changed");
    };
    await expect(
      executeIntent(intent, request, async () => {}),
    ).rejects.toThrow();
    await executeIntent(intent, request, async () => {});
    expect(recordedDecision(intent, "catalog-requests", id)).toBeNull();
  });
  it("requires the acknowledged approval to match the current listing decision and refuses removed or resubmitted listings", () => {
    const intent = createIntent("listings", id, {
      expectedVersion: 2,
      revisionId,
      decision: "Approve",
      checklist: {
        catalogMatches: true,
        photosClear: true,
        conditionDisclosed: true,
        readable: true,
        pricingValid: true,
        contentAppropriate: true,
      },
    });
    intent.acknowledged = true;
    intent.response = ack;
    const recorded = recordedDecision(intent, "listings", id);
    const projection = {
      id,
      version: 3,
      currentRevision: { id: revisionId },
      state: { moderation: "Approved", visibility: "Visible" },
      latestDecision: { revisionId, decision: "Approve" },
    } as Listing;
    expect(matchesRecordedDecision(projection, recorded)).toBe(true);
    expect(
      matchesRecordedDecision(
        {
          ...projection,
          state: { ...projection.state, visibility: "Removed" },
        },
        recorded,
      ),
    ).toBe(false);
    expect(
      matchesRecordedDecision(
        { ...projection, latestDecision: null },
        recorded,
      ),
    ).toBe(false);
    expect(
      matchesRecordedDecision(
        {
          ...projection,
          currentRevision: {
            ...projection.currentRevision,
            id: crypto.randomUUID(),
          },
        },
        recorded,
      ),
    ).toBe(false);
    const rejected = createIntent("listings", id, {
      expectedVersion: 2,
      revisionId,
      decision: "Reject",
      reason: "Cần ảnh rõ hơn để đối chiếu.",
    });
    rejected.acknowledged = true;
    rejected.response = ack;
    expect(recordedDecision(rejected, "listings", id)).toBeNull();
  });
  it("keeps lost acknowledgement uncertain, then accepts the same-key replay after reconciliation", async () => {
    const intent = createIntent("catalog-requests", id, body);
    let calls = 0;
    const request: Request = async (_path, schema) => {
      if (++calls === 1) throw new ApiError(0, "NETWORK_ERROR", "lost");
      return schema.parse(ack);
    };
    await expect(
      executeIntent(intent, request, async () => {}),
    ).rejects.toThrow("lost");
    expect(recordedDecision(intent, "catalog-requests", id)).toBeNull();
    await expect(
      executeIntent(intent, request, async () => {
        throw Error("GET failed");
      }),
    ).rejects.toThrow("GET failed");
    // The form only publishes feedback after executeIntent completes, even when
    // the underlying intent already holds its valid receipt.
    await executeIntent(intent, request, async () => {});
    expect(calls).toBe(2);
    expect(
      matchesRecordedDecision(
        value,
        recordedDecision(intent, "catalog-requests", id),
      ),
    ).toBe(true);
  });
  it("keeps rejection and historical records static and legible without animation support", () => {
    const rejected = renderToStaticMarkup(
      <DecisionRecord
        decision="Reject"
        reason="Cần ảnh rõ hơn."
        decidedAt={time}
        revisionId={revisionId}
        animate
      />,
    );
    expect(rejected).not.toContain("ĐÃ DUYỆT");
    expect(rejected).toContain('data-confirmed-motion="false"');
    expect(rejected).toContain("Cần ảnh rõ hơn.");
    const historical = renderToStaticMarkup(
      <DecisionRecord
        decision="Approve"
        reason={null}
        decidedAt={time}
        revisionId={revisionId}
      />,
    );
    expect(historical).toContain("ĐÃ DUYỆT");
    expect(historical).toContain('data-confirmed-motion="false"');
  });
});
