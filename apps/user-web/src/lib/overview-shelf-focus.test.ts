import { describe, expect, it } from "vitest";
import { overviewShelfFocus } from "./overview-shelf-focus";

describe("overview next action from bounded filtered reads", () => {
  it("prioritizes rejected work before drafts and waiting", () => {
    expect(overviewShelfFocus(["present", "present", "present"]).to).toBe(
      "/my-books?moderation=Rejected",
    );
    expect(overviewShelfFocus(["empty", "present", "present"]).to).toBe(
      "/my-books?moderation=Draft",
    );
    expect(overviewShelfFocus(["empty", "empty", "present"]).to).toBe(
      "/my-books?moderation=PendingReview",
    );
  });
  it("does not infer no work from a failed or incomplete read", () => {
    expect(overviewShelfFocus(["error", "empty", "empty"]).kind).toBe("error");
    expect(overviewShelfFocus(["loading", "present", "empty"]).to).toBeNull();
    expect(overviewShelfFocus([]).kind).toBe("loading");
    expect(overviewShelfFocus(["forbidden", "present", "present"]).to).toBe(
      "/profile",
    );
  });
  it("offers posting only when all three scoped reads are empty", () => {
    expect(overviewShelfFocus(["empty", "empty", "empty"]).to).toBe("/sell");
  });
});
