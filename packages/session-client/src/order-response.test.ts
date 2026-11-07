import { describe, expect, it } from "vitest";
import {
  ApiError,
  type SessionClient,
  type SessionState,
} from "./session-client";
import {
  acknowledgedBuyNowOrder,
  forgetBuyNowOrder,
  pendingBuyNowOrder,
  pendingBuyNowOrderInput,
  pendingOrderResponse,
  sendBuyNowOrder,
  sendOrderResponse,
} from "./order-response";

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
  it("exposes a copy of the pinned purchase revision and clears it on account change", async () => {
    const f=fake();
    const body={quoteId:id,expectedQuoteVersion:1,expectedListingVersion:4,expectedListingRevisionId:id};
    await expect(sendBuyNowOrder(f.client,id,body,()=>"bundle-key")).rejects.toThrow();
    const snapshot=pendingBuyNowOrderInput(f.client,id)!;
    snapshot.expectedListingVersion=99;
    expect(pendingBuyNowOrderInput(f.client,id)).toEqual(body);
    f.state({status:"anonymous"});
    expect(pendingBuyNowOrderInput(f.client,id)).toBeUndefined();
  });
  it.each(
    (["accept", "reject", "pay", "cancel"] as const).flatMap((action) =>
      [408, 429].map((status) => ({ action, status })),
    ),
  )("retains $action after lost ACK followed by HTTP $status", async ({
    action,
    status,
  }) => {
    const f = fake();
    await expect(
      sendOrderResponse(f.client, id, action, 1, () => "original"),
    ).rejects.toBeInstanceOf(ApiError);
    f.fail(new ApiError(status, "HTTP_ERROR", "Receipt unavailable"));
    await expect(
      sendOrderResponse(f.client, id, action, 9, () => "replacement"),
    ).rejects.toBeInstanceOf(ApiError);
    expect(pendingOrderResponse(f.client, id)).toBe(action);
    await expect(
      sendOrderResponse(
        f.client,
        id,
        action === "cancel" ? "pay" : "cancel",
        9,
        () => "opposite",
      ),
    ).rejects.toThrow("trước khi đổi");
    f.fail(null);
    await sendOrderResponse(f.client, id, action, 9, () => "replacement");
    expect(f.calls).toHaveLength(3);
    expect(
      f.calls.every(
        (call) =>
          call.key === "original" &&
          call.body === JSON.stringify({ expectedVersion: 1 }),
      ),
    ).toBe(true);
    expect(pendingOrderResponse(f.client, id)).toBeUndefined();
  });

  it.each([408, 429])(
    "retains the original buy-now creation after lost ACK followed by HTTP %s",
    async (status) => {
      const f = fake();
      const body = {
        quoteId: id,
        expectedQuoteVersion: 1,
        expectedListingVersion: 2,
        expectedListingRevisionId: id,
      };
      await expect(
        sendBuyNowOrder(f.client, id, body, () => "original"),
      ).rejects.toBeInstanceOf(ApiError);
      f.fail(new ApiError(status, "HTTP_ERROR", "Receipt unavailable"));
      await expect(
        sendBuyNowOrder(f.client, id, null, () => "replacement"),
      ).rejects.toBeInstanceOf(ApiError);
      expect(pendingBuyNowOrder(f.client, id)).toBe(true);
      f.fail(null);
      await sendBuyNowOrder(
        f.client,
        id,
        { ...body, expectedListingVersion: 9 },
        () => "replacement",
      );
      expect(f.calls).toHaveLength(3);
      expect(
        f.calls.every(
          (call) => call.key === "original" && call.body === JSON.stringify(body),
        ),
      ).toBe(true);
      expect(pendingBuyNowOrder(f.client, id)).toBe(false);
      expect(acknowledgedBuyNowOrder(f.client, id)).toBe(id);
    },
  );

  it.each(["pay", "cancel"] as const)(
    "pins %s across navigation and blocks its opposite after lost ACK or permission denial",
    async (action) => {
      const f = fake();
      await expect(
        sendOrderResponse(f.client, id, action, 1, () => "original"),
      ).rejects.toBeInstanceOf(ApiError);
      f.fail(new ApiError(403, "FORBIDDEN", "Current permission unavailable"));
      await expect(
        sendOrderResponse(f.client, id, action, 9, () => "must-not-replace"),
      ).rejects.toBeInstanceOf(ApiError);
      expect(pendingOrderResponse(f.client, id)).toBe(action);
      await expect(
        sendOrderResponse(
          f.client,
          id,
          action === "pay" ? "cancel" : "pay",
          9,
          () => "opposite",
        ),
      ).rejects.toThrow("trước khi đổi");
      f.fail(null);
      await sendOrderResponse(
        f.client,
        id,
        action,
        9,
        () => "must-not-replace",
      );
      expect(f.calls).toHaveLength(3);
      expect(
        f.calls.every(
          (call) =>
            call.key === "original" &&
            call.body === JSON.stringify({ expectedVersion: 1 }),
        ),
      ).toBe(true);
      expect(pendingOrderResponse(f.client, id)).toBeUndefined();
    },
  );

  it("pins the original buy-now quote after lost ACK, remount and edited inputs", async () => {
    const f = fake();
    const input = {
      quoteId: id,
      expectedQuoteVersion: 1,
      expectedListingVersion: 2,
      expectedListingRevisionId: id,
    };
    await expect(
      sendBuyNowOrder(f.client, id, input, () => "create-original"),
    ).rejects.toBeInstanceOf(ApiError);
    input.expectedListingVersion = 99;
    expect(pendingBuyNowOrder(f.client, id)).toBe(true);
    f.fail(new ApiError(403, "FORBIDDEN", "Current permission unavailable"));
    await expect(
      sendBuyNowOrder(f.client, id, null, () => "new"),
    ).rejects.toBeInstanceOf(ApiError);
    f.fail(null);
    await sendBuyNowOrder(
      f.client,
      id,
      { ...input, quoteId: "different" },
      () => "new",
    );
    expect(f.calls).toHaveLength(3);
    expect(
      f.calls.every(
        (call) =>
          call.path === "/orders/buy-now" &&
          call.key === "create-original" &&
          JSON.parse(call.body).expectedListingVersion === 2,
      ),
    ).toBe(true);
    expect(pendingBuyNowOrder(f.client, id)).toBe(false);
    expect(acknowledgedBuyNowOrder(f.client, id)).toBe(id);
    forgetBuyNowOrder(f.client, id, "different-order");
    expect(acknowledgedBuyNowOrder(f.client, id)).toBe(id);
    forgetBuyNowOrder(f.client, id, id);
    expect(acknowledgedBuyNowOrder(f.client, id)).toBeUndefined();
  });

  it("replaces only a definitively rejected creation and drops pending creation on identity change", async () => {
    const f = fake();
    const body = {
      quoteId: id,
      expectedQuoteVersion: 1,
      expectedListingVersion: 2,
      expectedListingRevisionId: id,
    };
    f.fail(new ApiError(409, "VersionConflict", "Rejected"));
    await expect(
      sendBuyNowOrder(f.client, id, body, () => "rejected"),
    ).rejects.toBeInstanceOf(ApiError);
    expect(pendingBuyNowOrder(f.client, id)).toBe(false);
    f.fail(new TypeError("Network"));
    await expect(
      sendBuyNowOrder(f.client, id, body, () => "uncertain"),
    ).rejects.toThrow("Network");
    f.state({ status: "anonymous" });
    f.state(f.authenticated);
    expect(pendingBuyNowOrder(f.client, id)).toBe(false);
    f.fail(null);
    await sendBuyNowOrder(
      f.client,
      id,
      { ...body, expectedListingVersion: 3 },
      () => "new-identity",
    );
    expect(f.calls[2].key).toBe("new-identity");
  });

  it("does not apply a late creation ACK to a changed identity or clear its new intent", async () => {
    const f = fake();
    const body = {
      quoteId: id,
      expectedQuoteVersion: 1,
      expectedListingVersion: 2,
      expectedListingRevisionId: id,
    };
    let release!: () => void;
    f.delay(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    f.fail(null);
    const old = sendBuyNowOrder(f.client, id, body, () => "old");
    const rejected = expect(old).rejects.toBeInstanceOf(ApiError);
    f.state({ status: "anonymous" });
    f.state(f.authenticated);
    f.delay(null);
    f.fail(new TypeError("Network"));
    await expect(
      sendBuyNowOrder(f.client, id, body, () => "new"),
    ).rejects.toThrow("Network");
    release();
    await rejected;
    expect(pendingBuyNowOrder(f.client, id)).toBe(true);
    f.fail(null);
    await sendBuyNowOrder(f.client, id, null, () => "wrong");
    expect(f.calls[2].key).toBe("new");
  });
  it("keeps the acknowledged ID across closing checkout, but clears it when identity changes", async () => {
    const f = fake();
    f.fail(null);
    await sendBuyNowOrder(
      f.client,
      id,
      {
        quoteId: id,
        expectedQuoteVersion: 1,
        expectedListingVersion: 2,
        expectedListingRevisionId: id,
      },
      () => "ack",
    );
    expect(acknowledgedBuyNowOrder(f.client, id)).toBe(id);
    f.state({ status: "anonymous" });
    f.state(f.authenticated);
    expect(acknowledgedBuyNowOrder(f.client, id)).toBeUndefined();
  });
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
  it("keeps a receipt acknowledgement intent across lost response and a newer order read", async () => {
    const f=fake();
    await expect(sendOrderResponse(f.client,id,"confirm-receipt",4,()=>"receipt-key")).rejects.toBeInstanceOf(ApiError);
    expect(f.calls[0]).toMatchObject({path:`/orders/${id}/confirm-receipt`,key:"receipt-key",body:JSON.stringify({expectedVersion:4})});
    f.fail(null);
    await sendOrderResponse(f.client,id,"confirm-receipt",5,()=>{throw Error("must retain key");});
    expect(f.calls[1]).toEqual(f.calls[0]);
    expect(pendingOrderResponse(f.client,id)).toBeUndefined();
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
