import test from "node:test";
import assert from "node:assert/strict";
import { resetWishlist } from "./fixtures.mjs";

test("reset reads all pages before deleting any QA items", async () => {
  const calls = [];
  const http = async (route, options) => {
    calls.push([route, options.method ?? "GET"]);
    if (options.method === "DELETE") return;
    if (calls.length === 1)
      return {
        items: [{ subjectType: "LISTING", subjectId: "one" }],
        nextCursor: "later",
      };
    if (calls.length === 2)
      return {
        items: [{ subjectType: "CATALOG_BOOK", subjectId: "two" }],
        nextCursor: null,
      };
    return { items: [], nextCursor: null };
  };
  await resetWishlist(http);
  assert.deepEqual(
    calls.map((c) => c[1]),
    ["GET", "GET", "DELETE", "DELETE", "GET"],
  );
  assert.equal(calls[3][0], "/me/wishlist/catalog-books/two");
});

test("reset preserves saved items when a later page cannot be read", async () => {
  let reads = 0,
    deletes = 0;
  const http = async (_route, options) => {
    if (options.method === "DELETE") {
      deletes++;
      return;
    }
    if (++reads === 1)
      return {
        items: [{ subjectType: "LISTING", subjectId: "one" }],
        nextCursor: "later",
      };
    throw new Error("offline");
  };
  await assert.rejects(resetWishlist(http), /offline/);
  assert.equal(deletes, 0);
});

test("reset rejects looping cursors before modifying anything", async () => {
  let deletes = 0;
  const http = async (_route, options) => {
    if (options.method === "DELETE") deletes++;
    return {
      items: [{ subjectType: "LISTING", subjectId: "one" }],
      nextCursor: "loop",
    };
  };
  await assert.rejects(resetWishlist(http), /cursor repeated/);
  assert.equal(deletes, 0);
});
