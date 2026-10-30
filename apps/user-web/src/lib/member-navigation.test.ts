import { describe, expect, it } from "vitest";
import { memberNavigationSection } from "./member-navigation";

describe("member navigation", () => {
  it("keeps the search destination active with filters and pagination", () => {
    expect(memberNavigationSection("/books", "?q=sách&condition=Good&page=2")).toBe("books");
    expect(memberNavigationSection("/books/a-book", "")).toBe("books");
  });
  it("selects one exchange destination regardless of query parameter order", () => {
    expect(memberNavigationSection("/books", "?q=sách&mode=Exchange&sort=newest")).toBe("exchange");
    expect(memberNavigationSection("/exchange/mine", "?tab=done")).toBe("exchange");
  });
  it("recognizes auction detail without matching unrelated paths", () => {
    expect(memberNavigationSection("/auctions/a-session", "")).toBe("auction");
    expect(memberNavigationSection("/my-auctions", "")).toBeUndefined();
    expect(memberNavigationSection("/account", "")).toBeUndefined();
  });
});
