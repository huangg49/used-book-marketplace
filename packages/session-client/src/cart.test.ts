import { describe, it, expect } from "vitest";
import {
  ApiError,
  type SessionClient,
  type SessionState,
} from "./session-client";
import { changeCart, pendingCartCommand } from "./cart";
import { z } from "zod";
const owner = "1101d28c-80c3-4223-b289-e9446ba940be",
  listing = "2201d28c-80c3-4223-b289-e9446ba940be",
  other = "3301d28c-80c3-4223-b289-e9446ba940be";
function fake() {
  let identity = owner,
    failure: unknown = new ApiError(503, "UNAVAILABLE", "Unknown"),
    afterRead: (() => void) | undefined;
  const listeners = new Set<() => void>(),
    calls: { path: string; body?: string; key?: string }[] = [];
  const snapshot = () =>
    ({
      status: "authenticated",
      user: {
        id: identity,
        email: "qa@example.test",
        displayName: "QA",
        status: "ACTIVE",
        roles: ["MEMBER"],
      },
    }) as SessionState;
  const client = {
    getSnapshot: snapshot,
    subscribe: (f: () => void) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    request: async (path: string, schema: z.ZodType, init?: RequestInit) => {
      calls.push({
        path,
        body: init?.body as string | undefined,
        key: (init?.headers as Record<string, string>)?.["Idempotency-Key"],
      });
      if (!init) {
        afterRead?.();
        return schema.parse({ id: owner, version: 7 });
      }
      if (failure) throw failure;
      return schema.parse({
        id: other,
        entityType: "Cart",
        entityId: owner,
        version: 8,
        state: "Updated",
        serverTime: new Date().toISOString(),
      });
    },
  } as unknown as SessionClient;
  return {
    client,
    calls,
    fail: (e: unknown) => {
      failure = e;
    },
    afterRead: (fn: () => void) => {
      afterRead = fn;
    },
    switchOwner: () => {
      identity = other;
      listeners.forEach((f) => f());
    },
  };
}
describe("cart intents", () => {
  it.each([403, 408, 429, 503])(
    "retains original add operation after uncertain HTTP%s, even if retry is initiated from Remove",
    async (status) => {
      const f = fake();
      f.fail(new ApiError(status, "UNAVAILABLE", "Unknown"));
      await expect(
        changeCart(
          f.client,
          { action: "add", listingId: listing, listingVersion: 3 },
          () => owner,
        ),
      ).rejects.toBeDefined();
      expect(pendingCartCommand(f.client)).toBe(true);
      f.fail(null);
      await changeCart(
        f.client,
        { action: "remove", listingId: other },
        () => other,
      );
      const writes = f.calls.filter((c) => c.body);
      expect(writes).toHaveLength(2);
      expect(writes[0]).toEqual(writes[1]);
      expect(writes[0].path).toBe("/me/cart/add");
      expect(JSON.parse(writes[0].body!)).toEqual({
        expectedVersion: 7,
        listingId: listing,
        expectedListingVersion: 3,
      });
      expect(pendingCartCommand(f.client)).toBe(false);
    },
  );
  it("allows editing after a definite version refusal and rereads current cart before a new decision", async () => {
    const f = fake();
    f.fail(new ApiError(409, "VersionConflict", "Stale"));
    await expect(
      changeCart(
        f.client,
        { action: "add", listingId: listing, listingVersion: 3 },
        () => owner,
      ),
    ).rejects.toBeDefined();
    expect(pendingCartCommand(f.client)).toBe(false);
    f.fail(null);
    await changeCart(
      f.client,
      { action: "remove", listingId: listing },
      () => other,
    );
    expect(f.calls.filter((c) => !c.body)).toHaveLength(2);
    expect(f.calls.at(-1)?.path).toBe("/me/cart/remove");
  });
  it("clears an uncertain old cart when identity changes and never replays it as the new owner", async () => {
    const f = fake();
    await expect(
      changeCart(
        f.client,
        { action: "remove", listingId: listing },
        () => owner,
      ),
    ).rejects.toBeDefined();
    f.switchOwner();
    expect(pendingCartCommand(f.client)).toBe(false);
    await expect(changeCart(f.client, null, () => other)).rejects.toBeDefined();
    expect(f.calls.filter((c) => c.body)).toHaveLength(1);
  });
  it("rejects an identity switch during preparation before any write", async () => {
    const f = fake();
    f.afterRead(f.switchOwner);
    await expect(
      changeCart(
        f.client,
        { action: "add", listingId: listing, listingVersion: 3 },
        () => owner,
      ),
    ).rejects.toMatchObject({ code: "SESSION_CHANGED" });
    expect(f.calls.filter((c) => c.body)).toHaveLength(0);
  });
});
