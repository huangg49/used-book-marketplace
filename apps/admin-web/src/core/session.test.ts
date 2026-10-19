import { describe, expect, it } from "vitest";
import type { CurrentUser } from "@used-books/session-client";
import {
  canEnterWorkspace,
  canOperatePoint,
  canResolve,
  canReview,
  canReviewCatalog,
  canSimulate,
} from "./session";
const base: CurrentUser = {
  id: crypto.randomUUID(),
  email: "review@example.test",
  displayName: "Reviewer",
  status: "ACTIVE",
  roles: [],
};
describe("operations capability gates", () => {
  it.each(["MEMBER", "TEST_OPERATOR"] as const)(
    "rejects %s without a review role",
    (role) => {
      expect(canReview({ ...base, roles: [role] })).toBe(false);
    },
  );
  it("allows staff listings but reserves catalog for admin", () => {
    const user = { ...base, roles: ["STAFF"] } satisfies CurrentUser;
    expect(canReview(user)).toBe(true);
    expect(canReviewCatalog(user)).toBe(false);
  });
  it("allows active admin and rejects restricted admin even with all roles", () => {
    const user = { ...base, roles: ["STAFF", "ADMIN"] } satisfies CurrentUser;
    expect(canReviewCatalog(user)).toBe(true);
    expect(canReview({ ...user, status: "RESTRICTED" })).toBe(false);
    expect(canReviewCatalog({ ...user, status: "RESTRICTED" })).toBe(false);
    expect(canReview({ ...user, status: "LOCKED" })).toBe(false);
    expect(canReviewCatalog({ ...user, status: "LOCKED" })).toBe(false);
  });
});
describe("simulator gate (ADR 0044)", () => {
  it("admits only an active TEST_OPERATOR, never staff or admin by role alone", () => {
    expect(canSimulate({ ...base, roles: ["TEST_OPERATOR"] })).toBe(true);
    expect(canEnterWorkspace({ ...base, roles: ["TEST_OPERATOR"] })).toBe(true);
    expect(canSimulate({ ...base, roles: ["STAFF", "ADMIN"] })).toBe(false);
    expect(canSimulate({ ...base, roles: ["MEMBER"] })).toBe(false);
    expect(canEnterWorkspace({ ...base, roles: ["MEMBER"] })).toBe(false);
    for (const status of ["RESTRICTED", "LOCKED"] as const)
      expect(
        canSimulate({ ...base, status, roles: ["TEST_OPERATOR"] }),
      ).toBe(false);
  });
});
describe("point operations gates", () => {
  it.each(["MEMBER", "TEST_OPERATOR"] as const)(
    "rejects %s for point desks and resolutions",
    (role) => {
      const user = { ...base, roles: [role] } satisfies CurrentUser;
      expect(canOperatePoint(user)).toBe(false);
      expect(canResolve(user)).toBe(false);
    },
  );
  it("gives staff the point desks but not resolutions", () => {
    const user = { ...base, roles: ["STAFF"] } satisfies CurrentUser;
    expect(canOperatePoint(user)).toBe(true);
    expect(canResolve(user)).toBe(false);
  });
  it("keeps point desks from an admin without the staff role", () => {
    const user = { ...base, roles: ["ADMIN"] } satisfies CurrentUser;
    expect(canOperatePoint(user)).toBe(false);
    expect(canResolve(user)).toBe(true);
  });
  it("rejects every inactive status even with both roles", () => {
    const user = { ...base, roles: ["STAFF", "ADMIN"] } satisfies CurrentUser;
    expect(canOperatePoint(user)).toBe(true);
    expect(canResolve(user)).toBe(true);
    for (const status of ["RESTRICTED", "LOCKED"] as const) {
      expect(canOperatePoint({ ...user, status })).toBe(false);
      expect(canResolve({ ...user, status })).toBe(false);
    }
  });
});
