import { expect, it } from "vitest";
import { readAttributes } from "./catalog-filters";

it("rejects malformed URL facet values before controls and chips consume them", () => {
  for (const facets of [
    '{"genre":"action"}',
    '{"genre":null}',
    '{"genre":[{"id":"action"}]}',
    '{"genre":[1]}',
    'null',
    '[]',
  ]) {
    expect(() => readAttributes(facets)).toThrow();
  }
  expect(readAttributes('{"genre":["action","comedy"]}')).toEqual({
    genre: ["action", "comedy"],
  });
});
