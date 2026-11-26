import { describe, expect, it } from "vitest";
import {
  actionText,
  auditEventPage,
  auditRequest,
  auditSearchParams,
  entityHref,
  readAuditFilters,
} from "./audit-filters";

const id = "11111111-1111-4111-8111-111111111111";

describe("activity log filters", () => {
  it("defaults to Staff/Admin actions and drops invalid values", () => {
    const f = readAuditFilters(
      new URLSearchParams({
        actorRole: "MEMBER",
        entityType: "Order",
        actorId: "nope",
        action: "drop table",
        from: "2026-11-26",
        reason: "x".repeat(150),
      }),
    );
    expect(f).toMatchObject({ actorRole: "Operations", entityType: "", actorId: "", action: "", from: "" });
    expect(f.reason).toHaveLength(100);
  });

  it("keeps the URL short and normalises ids", () => {
    const f = readAuditFilters(new URLSearchParams({ actorId: id.toUpperCase(), actorRole: "Operations" }));
    expect(auditSearchParams(f).toString()).toBe(`actorId=${id}`);
  });

  it("builds the contract query with role, ISO times, limit and cursor", () => {
    const f = readAuditFilters(
      new URLSearchParams({ actorRole: "ADMIN", entityType: "Account", entityId: id, from: "2026-11-01T08:00" }),
    );
    const url = new URL(auditRequest(f, "c1"), "http://x");
    expect(url.pathname).toBe("/operations/audit-events");
    expect(url.searchParams.get("actorRole")).toBe("ADMIN");
    expect(url.searchParams.get("entityId")).toBe(id);
    expect(url.searchParams.get("from")).toBe(new Date("2026-11-01T08:00").toISOString());
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("cursor")).toBe("c1");
    expect(new URL(auditRequest(readAuditFilters(new URLSearchParams())), "http://x").searchParams.get("actorRole"))
      .toBe("Operations");
  });

  it("links only entities that have an admin page", () => {
    expect(entityHref({ type: "Account", id })).toBe(`/users/${id}`);
    expect(entityHref({ type: "Withdrawal", id })).toBe(`/withdrawals/${id}`);
    expect(entityHref({ type: "Quote", id })).toBeNull();
    expect(entityHref(null)).toBeNull();
    expect(actionText("lockUserAccount")).toBe("Lock User Account");
  });

  it("parses a contract-shaped page", () => {
    const page = auditEventPage.parse({
      items: [
        {
          id,
          createdAt: "2026-11-26T01:00:00.000Z",
          action: "lockUserAccount",
          actor: { kind: "User", id, displayName: "Admin", roles: ["ADMIN"], systemActor: null },
          entity: { type: "Account", id },
          reason: "QA",
          requestId: id,
          receiptId: null,
          before: { status: "ACTIVE" },
          after: { state: "LOCKED", tags: ["a", 1] },
          redactedFields: 1,
        },
      ],
      nextCursor: null,
      serverTime: "2026-11-26T01:00:00.000Z",
    });
    expect(page.items[0].entity?.type).toBe("Account");
  });
});
