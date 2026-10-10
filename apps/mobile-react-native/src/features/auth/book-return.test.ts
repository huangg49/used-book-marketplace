import { describe, expect, it } from "vitest";
import { returnBookId } from "./book-return";

describe("login return destination", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  it("accepts one book UUID", () => {
    expect(returnBookId(id)).toBe(id);
  });
  it.each([
    undefined,
    "https://example.com",
    "//example.com",
    "/wallet",
    "bad-id",
    [id, id],
  ])("does not redirect for an invalid or repeated parameter: %j", (value) => {
    expect(returnBookId(value)).toBeUndefined();
  });
});
