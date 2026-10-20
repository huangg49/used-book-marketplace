import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError } from "@used-books/session-client";
import { createCommand, runCommand } from "./command";

const schema = z.object({ outcome: z.string() });
describe("operations command", () => {
  it("freezes the body at creation", () => {
    const body = { expectedVersion: 1, code: "123456" };
    const intent = createCommand("/x", body);
    body.code = "000000";
    expect(JSON.parse(intent.body).code).toBe("123456");
  });
  it("keeps a caller's key, so a carrier event retries under its own id", async () => {
    const eventId = crypto.randomUUID();
    const intent = createCommand("/x", { eventId }, eventId);
    expect(intent.key).toBe(eventId);
    const keys: string[] = [];
    const request = async <T>(_p: string, s: z.ZodType<T>, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      keys.push(headers["Idempotency-Key"]);
      if (keys.length === 1) throw new Error("network");
      return s.parse({ outcome: "Recorded" });
    };
    await expect(runCommand(intent, schema, request, async () => {})).rejects.toThrow("network");
    await runCommand(intent, schema, request, async () => {});
    expect(keys).toEqual([eventId, eventId]);
    expect(createCommand("/x", {}).key).not.toBe(eventId);
  });
  it("returns the receipt, and keeps it when only the reload failed", async () => {
    const intent = createCommand("/x", { expectedVersion: 1 });
    let sent = 0;
    const request = async <T>(_p: string, s: z.ZodType<T>) => {
      sent++;
      return s.parse({ outcome: "WrongCode" });
    };
    const reconcile = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    await expect(
      runCommand(intent, schema, request, reconcile),
    ).rejects.toThrow("offline");
    await expect(runCommand(intent, schema, request, reconcile)).resolves.toEqual(
      { outcome: "WrongCode" },
    );
    expect(sent).toBe(1);
  });
  it("resends the same key and body after a lost response", async () => {
    const intent = createCommand("/x", { expectedVersion: 1 });
    const calls: RequestInit[] = [];
    const request = async <T>(_p: string, s: z.ZodType<T>, init?: RequestInit) => {
      calls.push(init!);
      if (calls.length === 1) throw new ApiError(0, "NETWORK_ERROR", "lost");
      return s.parse({ outcome: "HandedOver" });
    };
    await expect(
      runCommand(intent, schema, request, async () => {}),
    ).rejects.toThrow("lost");
    await runCommand(intent, schema, request, async () => {});
    expect(calls[0]).toEqual(calls[1]);
  });
  it("does not resend after a definite refusal", async () => {
    const intent = createCommand("/x", { expectedVersion: 1 });
    const request = vi.fn(async () => {
      throw new ApiError(409, "VersionConflict", "changed");
    });
    await expect(
      runCommand(intent, schema, request, async () => {}),
    ).rejects.toThrow("changed");
    await expect(
      runCommand(intent, schema, request, async () => {}),
    ).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledOnce();
  });
});
