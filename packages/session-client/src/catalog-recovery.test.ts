import { describe, it, expect, vi } from "vitest";
import {
  catalogHints,
  initialCatalogFields,
  findCatalogMatches,
  catalogMatches,
} from "./catalog-recovery";
import type { SessionClient } from "./session-client";
const user = { id: "actor", status: "ACTIVE" };
describe("catalog search recovery", () => {
  it("normalizes only the explicit search fields and preserves semicolon-separated authors", () => {
    expect(
      catalogHints({
        title: " Mắt biếc ",
        authors: "A; B",
        isbn: "978-604-1",
        edition: " Tập 1 ",
      }),
    ).toMatchObject({
      title: "Mắt biếc",
      authors: ["A", "B"],
      isbn: "9786041",
      edition: "Tập 1",
      publisher: null,
    });
    expect(initialCatalogFields().title).toBe("");
  });
  it("never sends an AI command key or auto-applies the result", async () => {
    const client = {
      getSnapshot: () => ({ status: "authenticated", user }),
      request: vi
        .fn()
        .mockResolvedValue({ items: [], truncated: false, serverTime: "now" }),
    } as unknown as Pick<SessionClient, "request" | "getSnapshot">;
    await findCatalogMatches(
      client,
      "draft",
      catalogHints(initialCatalogFields()),
    );
    expect(client.request).toHaveBeenCalledWith(
      "/listings/draft/catalog-matches",
      catalogMatches,
      { method: "POST", body: expect.any(String) },
    );
  });
  it("rejects a result after an account switch or logout", async () => {
    let state: unknown = { status: "authenticated", user };
    const client = {
      getSnapshot: () => state,
      request: vi.fn(async () => {
        state = { status: "authenticated", user: { id: "other" } };
        return { items: [] };
      }),
    } as unknown as Pick<SessionClient, "request" | "getSnapshot">;
    await expect(
      findCatalogMatches(client, "draft", catalogHints(initialCatalogFields())),
    ).rejects.toMatchObject({ code: "SESSION_CHANGED" });
    state = { status: "anonymous" };
    await expect(
      findCatalogMatches(client, "draft", catalogHints(initialCatalogFields())),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
