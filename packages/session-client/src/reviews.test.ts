import { describe, it, expect } from "vitest";
import { sendReviewIntent, pendingReviewIntent } from "./reviews";
import {
  ApiError,
  type SessionClient,
  type SessionState,
} from "./session-client";
const id = "1101d28c-80c3-4223-b289-e9446ba940be";
const review = {
  id,
  transactionType: "Exchange",
  transactionId: id,
  authorId: id,
  targetUserId: id,
  authorName: "QA",
  bookRating: 4,
  partnerRating: 5,
  tags: [],
  comment: "QA",
  version: 1,
  status: "Pending",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  editDeadline: "2026-01-03T00:00:00Z",
  publishedAt: null,
  evidenceHeld: false,
  legacyDisclosed: false,
  reply: null,
};
function fake() {
  let state: SessionState = {
    status: "authenticated",
    user: {
      id,
      email: "qa@example.test",
      displayName: "QA",
      roles: ["MEMBER"],
      status: "ACTIVE",
    },
  };
  const subscribers = new Set<() => void>(),
    calls: { path: string; body: string; key: string }[] = [];
  let failure: unknown = new ApiError(503, "UNAVAILABLE", "unknown commit");
  const client = {
    getSnapshot: () => state,
    subscribe: (f: () => void) => {
      subscribers.add(f);
      return () => subscribers.delete(f);
    },
    request: async (path: string, schema: any, init: RequestInit) => {
      calls.push({
        path,
        body: init.body as string,
        key: (init.headers as Record<string, string>)["Idempotency-Key"],
      });
      if (failure) throw failure;
      return schema.parse(review);
    },
  } as unknown as SessionClient;
  return {
    client,
    calls,
    setFailure: (v: unknown) => {
      failure = v;
    },
    logout: () => {
      state = { status: "anonymous" };
      subscribers.forEach((f) => f());
    },
  };
}
describe("review command recovery", () => {
  it("keeps exact key/path/body/version after uncertain ACK even if screen remounted with new draft", async () => {
    const f = fake();
    await expect(
      sendReviewIntent(
        f.client,
        "review",
        "/first",
        { expectedVersion: 1, comment: "first" },
        () => id,
      ),
    ).rejects.toBeInstanceOf(ApiError);
    expect(pendingReviewIntent(f.client, "review")).toBe(true);
    f.setFailure(null);
    await sendReviewIntent(
      f.client,
      "review",
      "/different",
      { expectedVersion: 2, comment: "changed" },
      () => {
        throw Error("must not create key");
      },
    );
    expect(f.calls[1]).toEqual(f.calls[0]);
    expect(pendingReviewIntent(f.client, "review")).toBe(false);
  });
  it("releases a definitely rejected intent but retains one with invalid success data", async () => {
    const f = fake();
    f.setFailure(new ApiError(409, "VersionConflict", "stale"));
    await expect(
      sendReviewIntent(
        f.client,
        "review",
        "/first",
        { expectedVersion: 1 },
        () => id,
      ),
    ).rejects.toBeInstanceOf(ApiError);
    expect(pendingReviewIntent(f.client, "review")).toBe(false);
    f.setFailure(new Error("invalid response after commit"));
    await expect(
      sendReviewIntent(
        f.client,
        "review",
        "/first",
        { expectedVersion: 2 },
        () => id,
      ),
    ).rejects.toThrow();
    expect(pendingReviewIntent(f.client, "review")).toBe(true);
    f.logout();
    expect(pendingReviewIntent(f.client, "review")).toBe(false);
  });
});
