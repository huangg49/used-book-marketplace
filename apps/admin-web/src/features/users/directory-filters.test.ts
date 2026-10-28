import { describe, expect, it } from "vitest";
import { directoryRequest, directorySearchParams, readDirectoryFilters } from "./directory-filters";

describe("directory URL filters", () => {
  it("restores all applied filters from a deep link", () => {
    expect(readDirectoryFilters(new URLSearchParams("q=Minh&status=ACTIVE&role=STAFF")))
      .toEqual({ q: "Minh", status: "ACTIVE", role: "STAFF" });
  });
  it("ignores unknown roles, states and URL cursors", () => {
    expect(directoryRequest(readDirectoryFilters(new URLSearchParams("role=ROOT&status=Deleted&cursor=untrusted&limit=999"))))
      .toBe("/operations/users?limit=20");
  });
  it("normalizes whitespace and bounds URL search to the input limit", () => {
    expect(readDirectoryFilters(new URLSearchParams({ q: "  Minh  " })).q).toBe("Minh");
    expect(readDirectoryFilters(new URLSearchParams({ q: "a".repeat(101) })).q).toHaveLength(100);
  });
  it("encodes Vietnamese and reserved characters without injecting another filter", () => {
    const filters = { q: "Lật & role=ADMIN", status: "ACTIVE", role: "MEMBER" };
    const url = new URL(directoryRequest(filters), "http://localhost");
    expect(url.searchParams.get("q")).toBe(filters.q);
    expect(url.searchParams.getAll("role")).toEqual(["MEMBER"]);
    expect(readDirectoryFilters(directorySearchParams(filters))).toEqual(filters);
  });
  it("resets pagination when filters change and only sends a server cursor explicitly", () => {
    const filters = { q: "", status: "LOCKED", role: "" };
    expect(directorySearchParams(filters).toString()).toBe("status=LOCKED");
    const url = new URL(directoryRequest(filters, "opaque+/=?cursor"), "http://localhost");
    expect(url.searchParams.get("cursor")).toBe("opaque+/=?cursor");
    expect(directoryRequest(filters)).not.toContain("cursor");
  });
  it("clears the URL when all filters are removed", () => {
    expect(directorySearchParams({ q: " ", status: "", role: "" }).toString()).toBe("");
  });
});
