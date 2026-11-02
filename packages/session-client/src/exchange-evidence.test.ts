import { describe, it, expect, vi } from "vitest";
import { ApiError, type SessionClient } from "./session-client";
import {
  sendEvidence,
  pendingEvidence,
  resumeEvidence,
} from "./exchange-evidence";
const input = {
  bytes: new Uint8Array([1, 2, 3]),
  mimeType: "image/png" as const,
  fileName: "evidence.png",
  sha256: "a".repeat(64),
  expectedVersion: 4,
};
function fixture() {
  let owner = "one";
  const callbacks = new Set<() => void>();
  const request = vi.fn();
  return {
    request,
    client: {
      request,
      getSnapshot: () => ({ status: "authenticated", user: { id: owner } }),
      subscribe: (fn: () => void) => {
        callbacks.add(fn);
        return () => callbacks.delete(fn);
      },
    } as unknown as SessionClient,
    change(next: string) {
      owner = next;
      callbacks.forEach((fn) => fn());
    },
  };
}
describe("exchange evidence exact upload recovery", () => {
  it("replays the same create key/body after lost receipt and copies immutable bytes", async () => {
    const f = fixture();
    f.request
      .mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "lost"))
      .mockResolvedValueOnce({ entityId: "asset" })
      .mockResolvedValueOnce({ state: "Ready" });
    const bytes = Uint8Array.from(input.bytes);
    await expect(
      sendEvidence(f.client, "exchange", { ...input, bytes }, () =>
        crypto.randomUUID(),
      ),
    ).rejects.toThrow();
    bytes[0] = 99;
    expect(pendingEvidence(f.client, "exchange")?.fileName).toBe(
      input.fileName,
    );
    await sendEvidence(f.client, "exchange", null, () => crypto.randomUUID());
    expect(f.request.mock.calls[0]).toEqual(f.request.mock.calls[1]);
    expect(Array.from(f.request.mock.calls[2][2].body)).toEqual([1, 2, 3]);
    expect(pendingEvidence(f.client, "exchange")).toBeUndefined();
  });
  it("retries only upload with identical bytes/key after committed lost upload ACK", async () => {
    const f = fixture();
    f.request
      .mockResolvedValueOnce({ entityId: "asset" })
      .mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "lost"))
      .mockResolvedValueOnce({ state: "Ready" });
    await expect(
      sendEvidence(f.client, "exchange", input, () => crypto.randomUUID()),
    ).rejects.toThrow();
    await sendEvidence(f.client, "exchange", null, () => crypto.randomUUID());
    expect(f.request.mock.calls[1]).toEqual(f.request.mock.calls[2]);
    expect(
      f.request.mock.calls.filter((c) => c[2].method === "POST"),
    ).toHaveLength(1);
  });
  it("clears private intent on identity change and refuses a late create ACK before upload", async () => {
    const f = fixture();
    let done!: (v: unknown) => void;
    f.request.mockImplementationOnce(() => new Promise((r) => (done = r)));
    const action = sendEvidence(f.client, "exchange", input, () =>
      crypto.randomUUID(),
    );
    const rejected = expect(action).rejects.toThrow("Phiên đã đổi");
    f.change("two");
    done({ entityId: "asset" });
    await rejected;
    expect(f.request).toHaveBeenCalledTimes(1);
    expect(pendingEvidence(f.client, "exchange")).toBeUndefined();
  });
  it.each([401, 403, 429, 503])(
    "preserves exact pending bytes on ambiguous/permission HTTP %s",
    async (status) => {
      const f = fixture();
      f.request.mockRejectedValue(new ApiError(status, "UNAVAILABLE", "retry"));
      await expect(
        sendEvidence(f.client, "exchange", input, () => crypto.randomUUID()),
      ).rejects.toThrow();
      expect(pendingEvidence(f.client, "exchange")).toBeDefined();
    },
  );
  it("allows correction after a definite validation rejection; durable Pending can resume after restart", async () => {
    const f = fixture();
    f.request
      .mockResolvedValueOnce({ entityId: "asset" })
      .mockRejectedValueOnce(new ApiError(422, "VALIDATION_ERROR", "bad"));
    await expect(
      sendEvidence(f.client, "exchange", input, () => crypto.randomUUID()),
    ).rejects.toThrow();
    expect(pendingEvidence(f.client, "exchange")).toBeUndefined();
    f.request.mockResolvedValueOnce({ state: "Ready" });
    await resumeEvidence(f.client, "exchange", "asset", input, () =>
      crypto.randomUUID(),
    );
    expect(f.request.mock.calls.at(-1)?.[0]).toBe(
      "/exchanges/exchange/evidence/asset/content",
    );
  });
});
