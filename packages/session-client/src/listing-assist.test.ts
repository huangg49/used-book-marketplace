import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, type SessionClient } from "./session-client";
import { createAssistRequest } from "./listing-assist";
const schema = z.object({ id: z.string() });
function fixture() {
  let owner: string | null = "reader-a";
  const request = vi.fn().mockResolvedValue({ id: "answer" });
  let seq = 0;
  const client = {
    request,
    getSnapshot: () =>
      owner
        ? { status: "authenticated", user: { id: owner } }
        : { status: "anonymous" },
  } as unknown as Pick<SessionClient, "request" | "getSnapshot">;
  return {
    request,
    ask: createAssistRequest(client, () => `intent-${++seq}`),
    owner: (value: string | null) => {
      owner = value;
    },
  };
}
const options = (f: ReturnType<typeof fixture>, index: number) =>
  f.request.mock.calls[index]![2];
describe("shared AI advisory intent", () => {
  it.each([
    new TypeError("lost ACK"),
    new ApiError(0, "NETWORK", "offline"),
    new ApiError(503, "UNAVAILABLE", "commit unknown"),
    new ApiError(502, "INVALID_RESPONSE", "proxy"),
    new ApiError(429, "RATE_LIMITED", "pending"),
  ])(
    "preserves exact body/key after an uncertain response %#",
    async (error) => {
      const f = fixture();
      f.request.mockRejectedValueOnce(error);
      await expect(f.ask("/read", schema, { mediaIds: ["one"] })).rejects.toBe(
        error,
      );
      await f.ask("/read", schema, { mediaIds: ["one"] });
      expect(options(f, 0)).toEqual(options(f, 1));
    },
  );
  it("coalesces simultaneous calls for the same input", async () => {
    const f = fixture();
    let release!: (value: unknown) => void;
    f.request.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const one = f.ask("/read", schema, { a: 1 }),
      two = f.ask("/read", schema, { a: 1 });
    expect(f.request).toHaveBeenCalledTimes(1);
    release({ id: "answer" });
    await expect(Promise.all([one, two])).resolves.toEqual([
      { id: "answer" },
      { id: "answer" },
    ]);
  });
  it("takes a new key only after a persisted terminal AI failure", async () => {
    const f = fixture();
    f.request.mockRejectedValueOnce(
      new ApiError(503, "AI_ASSIST_FAILED", "stored failure"),
    );
    await expect(f.ask("/read", schema, { a: 1 })).rejects.toMatchObject({
      code: "AI_ASSIST_FAILED",
    });
    await f.ask("/read", schema, { a: 1 });
    expect(options(f, 0).headers).not.toEqual(options(f, 1).headers);
  });
  it("keeps each unresolved input across another request and a return to it", async () => {
    const f = fixture();
    f.request.mockRejectedValueOnce(new TypeError("lost"));
    await expect(f.ask("/read", schema, { a: 1 })).rejects.toThrow();
    await f.ask("/read", schema, { a: 2 });
    await f.ask("/read", schema, { a: 1 });
    expect(options(f, 0)).toEqual(options(f, 2));
    expect(options(f, 0).headers).not.toEqual(options(f, 1).headers);
  });
  it("never delivers a late result to a different account", async () => {
    const f = fixture();
    let release!: (value: unknown) => void;
    f.request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const call = f.ask("/read", schema, {});
    f.owner("reader-b");
    release({ id: "old-owner" });
    await expect(call).rejects.toMatchObject({ code: "SESSION_CHANGED" });
    await f.ask("/read", schema, {});
    expect(options(f, 0).headers).not.toEqual(options(f, 1).headers);
  });
  it("does not send requests for a signed-out viewer", async () => {
    const f = fixture();
    f.owner(null);
    await expect(f.ask("/read", schema, {})).rejects.toMatchObject({
      status: 401,
    });
    expect(f.request).not.toHaveBeenCalled();
  });
});
