import { describe, expect, it } from "vitest";
import {
  ApiError,
  type SessionClient,
  type SessionState,
} from "./session-client";
import { pendingOrderResponse, sendOrderResponse } from "./order-response";

const id = "1101d28c-80c3-4223-b289-e9446ba940be";
function fake() {
  const authenticated: SessionState = {
    status: "authenticated",
    user: {
      id,
      displayName: "QA",
      email: "qa@example.test",
      roles: ["MEMBER"],
      status: "ACTIVE",
    },
  };
  let state = authenticated,
    failure: unknown = new ApiError(503, "UNAVAILABLE", "Lost ACK");
  let response: unknown = {
    id,
    entityType: "Order",
    entityId: id,
    version: 3,
    state: "Preparing",
  };
  let delay: Promise<void> | null = null;
  const subscribers = new Set<() => void>(),
    calls: { path: string; body: string; key: string }[] = [];
  const client = {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    request: async (
      path: string,
      schema: { parse: (value: unknown) => unknown },
      init: RequestInit,
    ) => {
      calls.push({
        path,
        body: init.body as string,
        key: (init.headers as Record<string, string>)["Idempotency-Key"],
      });
      const pendingFailure = failure,
        pendingResponse = response,
        pendingDelay = delay;
      if (pendingDelay) await pendingDelay;
      if (pendingFailure) throw pendingFailure;
      return schema.parse(pendingResponse);
    },
  } as unknown as SessionClient;
  return {
    client,
    calls,
    fail: (value: unknown) => {
      failure = value;
    },
    response: (value: unknown) => {
      response = value;
    },
    delay: (value: Promise<void> | null) => {
      delay = value;
    },
    state: (value: SessionState) => {
      state = value;
      subscribers.forEach((s) => s());
    },
    authenticated,
  };
}
describe("order decisions across navigation and uncertain responses", () => {
  it("replays the same version/body/key after lost ACK even when the screen now reads a later version", async () => {
    const f = fake();
    await expect(
      sendOrderResponse(f.client, id, "accept", 2, () => "first"),
    ).rejects.toBeInstanceOf(ApiError);
    expect(pendingOrderResponse(f.client, id)).toBe("accept");
    await expect(
      sendOrderResponse(f.client, id, "reject", 3, () => "different"),
    ).rejects.toThrow("trước khi đổi");
    expect(f.calls).toHaveLength(1);
    f.fail(null);
    await sendOrderResponse(f.client, id, "accept", 3, () => {
      throw Error("must keep first key");
    });
    expect(f.calls[1]).toEqual(f.calls[0]);
    expect(pendingOrderResponse(f.client, id)).toBeUndefined();
  });
  it("retains malformed-success/network outcomes but releases a definitive rejection", async () => {
    const f = fake();
    f.fail(null);
    f.response({});
    await expect(
      sendOrderResponse(f.client, id, "reject", 2, () => "first"),
    ).rejects.toThrow();
    expect(pendingOrderResponse(f.client, id)).toBe("reject");
    f.fail(new ApiError(409, "VersionConflict", "Changed"));
    await expect(
      sendOrderResponse(f.client, id, "reject", 9, () => "new"),
    ).rejects.toBeInstanceOf(ApiError);
    expect(f.calls[1]).toEqual(f.calls[0]);
    expect(pendingOrderResponse(f.client, id)).toBeUndefined();
    f.fail(new TypeError("Network"));
    await expect(
      sendOrderResponse(f.client, id, "accept", 10, () => "new"),
    ).rejects.toThrow("Network");
    expect(f.calls[2].key).toBe("new");
    expect(pendingOrderResponse(f.client, id)).toBe("accept");
  });
  it("clears memory on logout and rejects anonymous commands", async () => {
    const f = fake();
    await expect(
      sendOrderResponse(f.client, id, "cancel", 1, () => "first"),
    ).rejects.toThrow();
    f.state({ status: "anonymous" });
    expect(pendingOrderResponse(f.client, id)).toBeUndefined();
    await expect(
      sendOrderResponse(f.client, id, "cancel", 1, () => "new"),
    ).rejects.toBeInstanceOf(ApiError);
    expect(f.calls).toHaveLength(1);
  });
  it("an old response cannot clear a new intent even after logout/login to the same user", async () => {
    const f = fake();
    let resolve!: () => void;
    f.delay(
      new Promise<void>((done) => {
        resolve = done;
      }),
    );
    f.fail(null);
    const old = sendOrderResponse(f.client, id, "accept", 2, () => "old");
    const rejectedOld = expect(old).rejects.toBeInstanceOf(ApiError);
    f.state({ status: "anonymous" });
    f.state(f.authenticated);
    f.delay(null);
    f.fail(new ApiError(503, "UNAVAILABLE", "new unknown"));
    await expect(
      sendOrderResponse(f.client, id, "reject", 4, () => "new"),
    ).rejects.toThrow();
    resolve();
    await rejectedOld;
    expect(pendingOrderResponse(f.client, id)).toBe("reject");
    expect(f.calls[1]).toMatchObject({
      key: "new",
      body: JSON.stringify({ expectedVersion: 4 }),
    });
  });
});
