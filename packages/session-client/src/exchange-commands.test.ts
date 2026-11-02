import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, type SessionClient } from "./session-client";
import {
  acknowledgedExchange,
  acknowledgedExchangeProposal,
  confirmExchangeRead,
  exchangeCommandIdentity,
  pendingExchangeIntent,
  pendingExchangeProposal,
  readExchange,
  retryExchangeCommand,
  sendExchangeCommand,
  sendExchangeProposal,
  subscribeExchangeRecovery,
} from "./exchange-commands";

const id = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const book = "44444444-4444-4444-8444-444444444444";
const schema = z.object({
  id: z.string(),
  initiatorId: z.string(),
  recipientId: z.string(),
  revision: z.number(),
  status: z.string(),
  recipientListingId: z.string().optional(),
  initiatorFundedAt: z.string().optional(),
});
const row = {
  id,
  initiatorId: actor,
  recipientId: other,
  revision: 8,
  status: "AcceptedAwaitingFunding",
  initiatorFundedAt: "2026-11-02T00:00:00.000Z",
};
function fixture() {
  let user: string | null = actor;
  const listeners = new Set<() => void>();
  const request = vi.fn();
  const client = {
    request,
    getSnapshot: () =>
      user
        ? { status: "authenticated", user: { id: user } }
        : { status: "anonymous" },
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  } as unknown as SessionClient;
  return {
    client,
    request,
    change: (next: string | null) => {
      user = next;
      listeners.forEach((fn) => fn());
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

describe("exchange command recovery", () => {
  it.each([
    new ApiError(401, "SESSION_EXPIRED", "expired"),
    new ApiError(403, "FORBIDDEN", "denied"),
    new ApiError(408, "TIMEOUT", "timeout"),
    new ApiError(429, "RATE_LIMITED", "limited"),
    new ApiError(409, "IdempotencyConflict", "conflict"),
    new ApiError(503, "UNAVAILABLE", "busy"),
  ])(
    "pins the original key/body across an unknown ACK and %s",
    async (error) => {
      const f = fixture(),
        key = vi.fn(() => "same-key");
      f.request
        .mockRejectedValueOnce(new Error("lost ACK"))
        .mockRejectedValueOnce(error)
        .mockResolvedValue(row);
      await expect(
        sendExchangeCommand(
          f.client,
          id,
          "accept",
          { revision: 7 },
          key,
          schema,
        ),
      ).rejects.toThrow();
      await expect(
        sendExchangeCommand(
          f.client,
          id,
          "accept",
          { revision: 99 },
          key,
          schema,
        ),
      ).rejects.toThrow();
      expect(pendingExchangeIntent(f.client, id)?.body).toBe('{"revision":7}');
      await expect(
        sendExchangeCommand(
          f.client,
          id,
          "cancel",
          { expectedVersion: 99 },
          key,
          schema,
        ),
      ).rejects.toThrow();
      expect(f.request).toHaveBeenCalledTimes(2);
      await retryExchangeCommand(f.client, id, key, schema);
      expect(key).toHaveBeenCalledTimes(1);
      expect(f.request.mock.calls.map((call) => call[2])).toEqual(
        Array(3).fill({
          method: "POST",
          headers: { "Idempotency-Key": "same-key" },
          body: '{"revision":7}',
        }),
      );
      expect(pendingExchangeIntent(f.client, id)).toBeUndefined();
      expect(acknowledgedExchange(f.client, id, schema)).toEqual(row);
    },
  );

  it("coalesces concurrent clicks and blocks a different command while the first is flying", async () => {
    const f = fixture(),
      ack = deferred<typeof row>(),
      key = vi.fn(() => "one-key");
    f.request.mockReturnValue(ack.promise);
    const first = sendExchangeCommand(f.client, id, "funding", {}, key, schema);
    const second = sendExchangeCommand(
      f.client,
      id,
      "funding",
      {},
      key,
      schema,
    );
    await expect(
      sendExchangeCommand(
        f.client,
        id,
        "cancel",
        { expectedVersion: 8 },
        key,
        schema,
      ),
    ).rejects.toThrow();
    expect(f.request).toHaveBeenCalledTimes(1);
    ack.resolve(row);
    expect(await first).toEqual(row);
    expect(await second).toEqual(row);
  });

  it("keeps the acknowledged result when GET fails or reads behind it, then enables commands only after a fresh GET", async () => {
    const f = fixture();
    f.request
      .mockResolvedValueOnce(row)
      .mockRejectedValueOnce(new Error("GET failed"))
      .mockResolvedValueOnce({ ...row, revision: 7 })
      .mockResolvedValueOnce({ ...row, revision: 9 });
    await sendExchangeCommand(f.client, id, "funding", {}, () => "key", schema);
    await expect(readExchange(f.client, id, schema)).rejects.toThrow();
    await expect(
      sendExchangeCommand(
        f.client,
        id,
        "cancel",
        { expectedVersion: 8 },
        () => "new",
        schema,
      ),
    ).rejects.toThrow();
    expect(await readExchange(f.client, id, schema)).toEqual(row);
    expect(acknowledgedExchange(f.client, id, schema)).toEqual(row);
    expect((await readExchange(f.client, id, schema)).revision).toBe(9);
    confirmExchangeRead(f.client, id, 7);
    expect(acknowledgedExchange(f.client, id, schema)?.revision).toBe(9);
    confirmExchangeRead(f.client, id, 9);
    expect(acknowledgedExchange(f.client, id, schema)).toBeUndefined();
    expect(
      f.request.mock.calls.filter((call) => call[2]?.method === "POST"),
    ).toHaveLength(1);
  });

  it("never clears an uncertain intent merely because GET shows a newer record", async () => {
    const f = fixture();
    f.request.mockRejectedValueOnce(new Error("lost")).mockResolvedValue(row);
    await expect(
      sendExchangeCommand(f.client, id, "funding", {}, () => "key", schema),
    ).rejects.toThrow();
    await readExchange(f.client, id, schema);
    expect(pendingExchangeIntent(f.client, id)).toBeDefined();
  });

  it("never regresses below an acknowledged/read version after recovery has finished", async () => {
    const f = fixture();
    f.request
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce({ ...row, revision: 9 })
      .mockResolvedValueOnce({
        ...row,
        revision: 7,
        initiatorFundedAt: undefined,
      });
    await sendExchangeCommand(f.client, id, "funding", {}, () => "key", schema);
    await readExchange(f.client, id, schema);
    confirmExchangeRead(f.client, id, 9);
    expect(acknowledgedExchange(f.client, id, schema)).toBeUndefined();
    const later = await readExchange(f.client, id, schema);
    expect(later.revision).toBe(9);
    expect(later.initiatorFundedAt).toBe(row.initiatorFundedAt);
  });

  it("does not acknowledge funding if the response lacks proof of this participant funding", async () => {
    const f = fixture();
    f.request.mockResolvedValue({ ...row, initiatorFundedAt: undefined });
    await expect(
      sendExchangeCommand(f.client, id, "funding", {}, () => "key", schema),
    ).rejects.toThrow();
    expect(pendingExchangeIntent(f.client, id)).toBeDefined();
  });

  it.each([400, 404, 409, 422])(
    "allows a corrected intent after definite rejection %i",
    async (status) => {
      const f = fixture(),
        key = vi
          .fn()
          .mockReturnValueOnce("first")
          .mockReturnValueOnce("corrected");
      f.request
        .mockRejectedValueOnce(
          new ApiError(status, "VersionConflict", "rejected"),
        )
        .mockResolvedValue(row);
      await expect(
        sendExchangeCommand(
          f.client,
          id,
          "accept",
          { revision: 6 },
          key,
          schema,
        ),
      ).rejects.toThrow();
      expect(pendingExchangeIntent(f.client, id)).toBeUndefined();
      await sendExchangeCommand(
        f.client,
        id,
        "accept",
        { revision: 7 },
        key,
        schema,
      );
      expect(f.request.mock.calls[1][2].headers["Idempotency-Key"]).toBe(
        "corrected",
      );
    },
  );

  it.each([
    { ...row, id: other },
    { ...row, initiatorId: other, recipientId: id },
    { ...row, revision: 1 },
    { ...row, status: "made-up" },
  ])(
    "retains uncertainty for a malformed/wrong acknowledgement",
    async (response) => {
      const f = fixture();
      f.request.mockResolvedValue(response);
      await expect(
        sendExchangeCommand(
          f.client,
          id,
          "accept",
          { revision: 7 },
          () => "key",
          schema,
        ),
      ).rejects.toThrow();
      expect(pendingExchangeIntent(f.client, id)).toBeDefined();
    },
  );

  it("clears private state on identity change and rejects a late ACK without touching the new account", async () => {
    const f = fixture(),
      ack = deferred<typeof row>();
    f.request.mockReturnValueOnce(ack.promise);
    const identity = exchangeCommandIdentity(f.client);
    const first = sendExchangeCommand(
      f.client,
      id,
      "funding",
      {},
      () => "old",
      schema,
    );
    f.change(null);
    f.change(other);
    expect(exchangeCommandIdentity(f.client)).not.toBe(identity);
    expect(pendingExchangeIntent(f.client, id)).toBeUndefined();
    ack.resolve(row);
    await expect(first).rejects.toMatchObject({ code: "SESSION_CHANGED" });
    expect(acknowledgedExchange(f.client, id, schema)).toBeUndefined();
  });

  it("rejects a late GET after sign-out/sign-in as the same user", async () => {
    const f = fixture(),
      response = deferred<typeof row>();
    f.request.mockReturnValue(response.promise);
    const read = readExchange(f.client, id, schema);
    f.change(null);
    f.change(actor);
    response.resolve(row);
    await expect(read).rejects.toMatchObject({ code: "SESSION_CHANGED" });
  });

  it("recovers one proposal across navigation and keeps its acknowledged ID if the room GET fails", async () => {
    const f = fixture(),
      key = vi.fn(() => "create-key");
    const body = {
      initiatorListingIds: [id],
      recipientListingId: book,
      conversationId: other,
      expectedConversationVersion: 4,
    };
    const created = {
      ...row,
      revision: 1,
      status: "Proposed",
      recipientListingId: book,
    };
    f.request
      .mockRejectedValueOnce(new Error("lost"))
      .mockRejectedValueOnce(new ApiError(429, "RATE_LIMITED", "limited"))
      .mockResolvedValue(created);
    await expect(
      sendExchangeProposal(f.client, body, key, schema),
    ).rejects.toThrow();
    expect(pendingExchangeProposal(f.client)).toEqual(body);
    await expect(
      sendExchangeProposal(
        f.client,
        { ...body, recipientListingId: id },
        key,
        schema,
      ),
    ).rejects.toThrow();
    await expect(
      sendExchangeProposal(f.client, null, key, schema),
    ).rejects.toThrow();
    await sendExchangeProposal(f.client, null, key, schema);
    expect(key).toHaveBeenCalledTimes(1);
    expect(acknowledgedExchangeProposal(f.client, book)).toBe(id);
    expect(pendingExchangeProposal(f.client)).toBeUndefined();
    await expect(
      sendExchangeProposal(f.client, body, key, schema),
    ).rejects.toThrow();
    f.request.mockResolvedValue(created);
    await readExchange(f.client, id, schema);
    confirmExchangeRead(f.client, id, 1);
    expect(acknowledgedExchangeProposal(f.client, book)).toBe(id);
    f.request.mockResolvedValue({
      ...created,
      revision: 2,
      status: "Cancelled",
    });
    await readExchange(f.client, id, schema);
    confirmExchangeRead(f.client, id, 2);
    expect(acknowledgedExchangeProposal(f.client, book)).toBeUndefined();
  });

  it("publishes start/error/ACK/read/identity transitions for both UI clients", async () => {
    const f = fixture(),
      listener = vi.fn();
    const unsubscribe = subscribeExchangeRecovery(f.client, listener);
    f.request.mockRejectedValueOnce(new Error("lost")).mockResolvedValue(row);
    await expect(
      sendExchangeCommand(f.client, id, "funding", {}, () => "key", schema),
    ).rejects.toThrow();
    await retryExchangeCommand(f.client, id, () => "unused", schema);
    await readExchange(f.client, id, schema);
    confirmExchangeRead(f.client, id, 8);
    f.change(null);
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(5);
    unsubscribe();
    const calls = listener.mock.calls.length;
    f.change(actor);
    expect(listener).toHaveBeenCalledTimes(calls);
  });
});
