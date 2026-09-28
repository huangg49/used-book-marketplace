import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError } from "@used-books/session-client";
import { createIntent, executeIntent, validReason } from "./decision-command";

const body = {
  expectedVersion: 2,
  revisionId: crypto.randomUUID(),
  decision: "Reject" as const,
  reason: "Ảnh bìa cần rõ hơn để đối chiếu.",
};
const receipt = {
  id: crypto.randomUUID(),
  entityId: crypto.randomUUID(),
  version: 3,
  revisionId: body.revisionId,
};
describe("decision recovery", () => {
  it("retains the same key and frozen payload after a committed response is lost", async () => {
    const input = { ...body };
    const intent = createIntent("listings", receipt.entityId, input);
    input.reason = "Edited after submission";
    const calls: RequestInit[] = [];
    const commits = new Set<string>();
    const request = async <T>(
      _path: string,
      schema: z.ZodType<T>,
      init?: RequestInit,
    ) => {
      calls.push(init!);
      commits.add(new Headers(init?.headers).get("Idempotency-Key")!);
      if (calls.length === 1) throw new ApiError(0, "NETWORK_ERROR", "lost");
      return schema.parse(receipt);
    };
    const reconcile = vi.fn(async () => {});
    await expect(executeIntent(intent, request, reconcile)).rejects.toThrow(
      "lost",
    );
    expect(reconcile).not.toHaveBeenCalled();
    await executeIntent(intent, request, reconcile);
    expect(commits.size).toBe(1);
    expect(calls[0]).toEqual(calls[1]);
    expect(JSON.parse(calls[1].body as string).reason).toBe(body.reason);
    expect(reconcile).toHaveBeenCalledOnce();
  });
  it("only repeats GET when the receipt arrived but reconciliation failed", async () => {
    const intent = createIntent("catalog-requests", receipt.entityId, body);
    const calls = vi.fn();
    const request = async <T>(_path: string, schema: z.ZodType<T>) => {
      calls();
      return schema.parse(receipt);
    };
    const reconcile = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    await expect(executeIntent(intent, request, reconcile)).rejects.toThrow(
      "offline",
    );
    await executeIntent(intent, request, reconcile);
    expect(calls).toHaveBeenCalledOnce();
    expect(reconcile).toHaveBeenCalledTimes(2);
  });
  it.each([400, 403, 404, 409, 422])(
    "does not resend a definitively refused decision (%s)",
    async (status) => {
      const intent = createIntent("listings", receipt.entityId, body);
      const request = vi.fn(async () => {
        throw new ApiError(status, "REFUSED", "refused");
      });
      const reconcile = vi.fn(async () => {});
      await expect(executeIntent(intent, request, reconcile)).rejects.toThrow(
        "refused",
      );
      expect(intent.stopped).toBe(true);
      await executeIntent(intent, request, reconcile);
      expect(request).toHaveBeenCalledOnce();
      expect(reconcile).toHaveBeenCalledOnce();
    },
  );
  it("retains intent after malformed acknowledgement instead of guessing success", async () => {
    const intent = createIntent("listings", receipt.entityId, body);
    const request = async <T>(_path: string, schema: z.ZodType<T>) =>
      schema.parse({});
    await expect(
      executeIntent(intent, request, async () => {}),
    ).rejects.toThrow();
    expect(intent.acknowledged).toBe(false);
    expect(intent.stopped).toBe(false);
  });
  it("counts trimmed Unicode code points for rejection reasons", () => {
    expect(validReason("         ")).toBe(false);
    expect(validReason("x".repeat(9))).toBe(false);
    expect(validReason("  " + "📚".repeat(10) + "  ")).toBe(true);
    expect(validReason("📚".repeat(1000))).toBe(true);
    expect(validReason("x".repeat(1001))).toBe(false);
  });
});
