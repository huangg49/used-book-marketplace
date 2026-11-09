import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  ApiError,
  type SessionClient,
  type SessionState,
} from "./session-client";
import {
  auctionFlagBody,
  auctionFlagCasesPath,
  auctionFlagCategories,
  openAuctionFlag,
  pendingSupportIntent,
  pendingSupportCreateDraft,
  sendSupportIntent,
  supportDraft,
  supportRelatedState,
} from "./support";
const owner = "1101d28c-80c3-4223-b289-e9446ba940be",
  other = "2201d28c-80c3-4223-b289-e9446ba940be",
  id = "3301d28c-80c3-4223-b289-e9446ba940be";
function fixture() {
  let user = owner,
    failure: unknown,
    gate: Promise<void> | undefined;
  const listeners = new Set<() => void>(),
    calls: { path: string; key: string; body: unknown }[] = [];
  const client = {
    getSnapshot: () =>
      ({ status: "authenticated", user: { id: user } }) as SessionState,
    subscribe: (f: () => void) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    request: async (path: string, schema: z.ZodType, init: RequestInit) => {
      calls.push({
        path,
        key: (init.headers as Record<string, string>)["Idempotency-Key"],
        body: init.body,
      });
      await gate;
      if (failure) throw failure;
      return schema.parse({
        id: owner,
        entityType: "SupportCase",
        entityId: id,
        version: 2,
        state: "InReview",
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
    gate: (p: Promise<void>) => {
      gate = p;
    },
    switch: () => {
      user = other;
      listeners.forEach((f) => f());
    },
  };
}
describe("support exact intents and private memory drafts", () => {
  it("restores the visible create form from the pinned request after Back/remount", async () => {
    const f = fixture();
    f.fail(new ApiError(503, "UNAVAILABLE", "Unknown"));
    await expect(
      sendSupportIntent(
        f.client,
        "support:create",
        "/me/support-cases",
        {
          kind: "Bug",
          title: "Bản gốc",
          description: "Nội dung bản gốc",
          target: { type: "Exchange", id },
        },
        () => owner,
      ),
    ).rejects.toBeDefined();
    expect(pendingSupportCreateDraft(f.client)).toEqual({
      kind: "Bug",
      title: "Bản gốc",
      description: "Nội dung bản gốc",
      targetType: "Exchange",
      targetId: id,
    });
    f.switch();
    expect(pendingSupportCreateDraft(f.client)).toBeUndefined();
  });
  it.each([401, 403, 408, 429, 503])(
    "retains exact path/body/key after uncertain HTTP %s and remount",
    async (status) => {
      const f = fixture();
      f.fail(new ApiError(status, "UNAVAILABLE", "Unknown"));
      await expect(
        sendSupportIntent(
          f.client,
          "s",
          `/operations/support-cases/${id}/actions`,
          { expectedVersion: 1, action: "Answer", text: "Nội dung gốc" },
          () => owner,
        ),
      ).rejects.toBeDefined();
      expect(pendingSupportIntent(f.client, "s")).toBe(true);
      f.fail(null);
      await sendSupportIntent(
        f.client,
        "s",
        `/operations/support-cases/${id}/messages`,
        { expectedVersion: 99, text: "Nội dung mới" },
        () => other,
      );
      expect(f.calls[0]).toEqual(f.calls[1]);
      expect(pendingSupportIntent(f.client, "s")).toBe(false);
    },
  );
  it("coalesces double submit and prevents a late ACK from crossing accounts", async () => {
    const f = fixture();
    let release!: () => void;
    f.gate(
      new Promise<void>((r) => {
        release = r;
      }),
    );
    const first = sendSupportIntent(
        f.client,
        "s",
        "/me/support-cases",
        {},
        () => owner,
      ),
      second = sendSupportIntent(
        f.client,
        "s",
        "/me/support-cases",
        {},
        () => other,
      );
    expect(first).toBe(second);
    expect(f.calls).toHaveLength(1);
    f.switch();
    release();
    await expect(first).rejects.toMatchObject({ code: "SESSION_CHANGED" });
    expect(pendingSupportIntent(f.client, "s")).toBe(false);
  });
  it("releases a definite stale-version refusal while preserving the caller draft", async () => {
    const f = fixture(),
      draft = {
        kind: "Feedback" as const,
        title: "Góp ý",
        description: "Nội dung cần giữ",
        targetType: "" as const,
        targetId: "",
      };
    supportDraft(f.client, "draft", draft);
    f.fail(new ApiError(409, "VersionConflict", "Stale"));
    await expect(
      sendSupportIntent(f.client, "s", "/me/support-cases", {}, () => owner),
    ).rejects.toBeDefined();
    expect(pendingSupportIntent(f.client, "s")).toBe(false);
    expect(supportDraft(f.client, "draft")).toEqual(draft);
    f.switch();
    expect(supportDraft(f.client, "draft")).toBeUndefined();
  });
  it("keeps an uncertain malformed receipt for reconciliation", async () => {
    const f = fixture();
    f.fail(new Error("Invalid response schema"));
    await expect(
      sendSupportIntent(f.client, "s", "/me/support-cases", {}, () => owner),
    ).rejects.toBeDefined();
    expect(pendingSupportIntent(f.client, "s")).toBe(true);
  });
});

describe("ADR 0078 auction flag", () => {
  const auction = { id, title: "Truyện Kiều bản 1925" };
  it("maps each category to a support kind aimed at the auction", () => {
    const money = auctionFlagCategories.find((c) => c.id === "MoneyIssue")!;
    expect(auctionFlagBody(money, auction, "  Tiền cọc chưa được hoàn sau khi phiên kết thúc  ")).toEqual({
      kind: "TransactionIssue",
      title: "Tiền cọc, khoản giữ hoặc thanh toán: Truyện Kiều bản 1925",
      description: "Tiền cọc chưa được hoàn sau khi phiên kết thúc",
      target: { type: "Auction", id },
    });
    expect(auctionFlagCategories.map((c) => c.kind)).toEqual([
      "Violation",
      "Violation",
      "TransactionIssue",
      "Bug",
      "Feedback",
    ]);
  });
  it("keeps the title within the contract limit", () => {
    const body = auctionFlagBody(auctionFlagCategories[0], { id, title: "x".repeat(300) }, "Nội dung đủ dài để gửi");
    expect(body.title).toHaveLength(160);
  });
  it("finds only an open case and asks the server for this auction", () => {
    expect(auctionFlagCasesPath(id)).toBe(`/me/support-cases?targetType=Auction&targetId=${id}&limit=20`);
    const row = (state: "Closed" | "Open") => ({
      id, kind: "Bug" as const, title: "t", reporterId: owner, reporterName: "A",
      target: { type: "Auction" as const, id }, assigneeId: null, state, version: 1,
      createdAt: "2026-11-08T00:00:00.000Z", updatedAt: "2026-11-08T00:00:00.000Z",
    });
    const page = (items: ReturnType<typeof row>[]) => ({ items, nextCursor: null, serverTime: "2026-11-08T00:00:00.000Z" });
    expect(openAuctionFlag(page([row("Closed")]))).toBeNull();
    expect(openAuctionFlag(page([row("Closed"), row("Open")]))?.state).toBe("Open");
    expect(openAuctionFlag(undefined)).toBeNull();
  });
  it("labels auction states on a case", () => {
    expect(supportRelatedState("OnHold")).toBe("Phiên tạm dừng để xem xét");
    expect(supportRelatedState("Unsold")).toBe("Phiên không bán được");
  });
});
