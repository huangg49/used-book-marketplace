import { describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@used-books/session-client";
import { dashboardSources } from "./sources";
import type { Request } from "../../core/command";
const base: CurrentUser = { id: crypto.randomUUID(), displayName: "Operator", email: "operator@example.test", status: "ACTIVE", roles: [] };
const paths = (roles: CurrentUser["roles"]) => dashboardSources({ ...base, roles }).map(source => source.path);
describe("dashboard API sources", () => {
  it("never asks TEST_OPERATOR to read moderation, users, point administration or fund data", () => {
    expect(paths(["TEST_OPERATOR"])).toEqual(["/operations/simulator/point-deliveries"]);
  });
  it("limits Staff to review and assigned-point lists", () => {
    expect(paths(["STAFF"])).toEqual(["/operations/listings?moderation=PendingReview&limit=20", "/operations/auction-intakes", "/operations/point-orders", "/operations/incidents"]);
  });
  it("does not infer Staff or TEST_OPERATOR from ADMIN", () => {
    const sources = paths(["ADMIN"]);
    expect(sources).toContain("/operations/users?limit=20");
    expect(sources).toContain("/operations/incident-fund");
    expect(sources).not.toContain("/operations/auction-intakes");
    expect(sources).not.toContain("/operations/point-orders");
    expect(sources).not.toContain("/operations/simulator/point-deliveries");
  });
  it.each(["RESTRICTED", "LOCKED"] as const)("has no API source for %s accounts", status => {
    expect(dashboardSources({ ...base, status, roles: ["ADMIN", "STAFF", "TEST_OPERATOR"] })).toEqual([]);
  });
  it("preserves pagination as a lower bound rather than a fake global total", async () => {
    const source = dashboardSources({ ...base, roles: ["ADMIN"] }).find(value => value.id === "users")!;
    const user = { ...base, emailVerifiedAt: null, createdAt: "2026-10-26T10:00:00.000Z", updatedAt: "2026-10-26T10:00:00.000Z" };
    const request: Request = async (_path, schema) => schema.parse({ items: [user], nextCursor: crypto.randomUUID(), serverTime: user.updatedAt });
    expect(await source.load(request)).toMatchObject({ value: 1, more: true });
  });
  it("propagates read and contract errors instead of manufacturing an empty result", async () => {
    const source = dashboardSources({ ...base, roles: ["TEST_OPERATOR"] })[0];
    const failed = vi.fn(async () => { throw Error("offline"); });
    await expect(source.load(failed)).rejects.toThrow("offline");
    const malformed: Request = async (_path, schema) => schema.parse({ items: [], serverTime: "bad" });
    await expect(source.load(malformed)).rejects.toThrow();
  });
  it("uses fund balance from the receipt projection, not a revenue formula", async () => {
    const source = dashboardSources({ ...base, roles: ["ADMIN"] }).find(value => value.id === "fund")!;
    const request: Request = async (_path, schema) => schema.parse({ opening: 100000, approved: 12500, balance: 87500, entries: [], serverTime: "2026-10-26T10:00:00.000Z" });
    expect(await source.load(request)).toMatchObject({ value: 87500, money: true });
  });
});
