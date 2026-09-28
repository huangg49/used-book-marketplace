import { describe, expect, it } from "vitest";
import type { CurrentUser } from "@used-books/session-client";
import { canReview, canReviewCatalog } from "./session";
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
