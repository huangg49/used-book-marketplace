import { afterEach, expect, it, vi } from "vitest";
vi.mock("./public-listings", () => ({ getPublicListings: vi.fn() }));
import { getPublicListings } from "./public-listings";
import {
  getSearchShelf,
  previewSearch,
  previewCategories,
} from "./catalog-search";
import catalog from "../data/preview-catalog.json";
afterEach(() => vi.clearAllMocks());

it("filters the whole preview catalog by category before paging, with no lost editions", () => {
  for (const category of previewCategories) {
    const query = new URLSearchParams({ category, limit: "3" });
    const ids: string[] = [];
    let cursor: string | null;
    do {
      const page = previewSearch(query);
      expect(page.items.every((item) => item.book.category === category)).toBe(
        true,
      );
      ids.push(...page.items.map((item) => item.book.id));
      cursor = page.nextCursor;
      if (cursor) query.set("cursor", cursor);
    } while (cursor);
    expect(ids).toEqual(
      catalog.items
        .filter((book) => book.category === category)
        .map((book) => book.id),
    );
  }
  expect(
    previewSearch(new URLSearchParams({ category: "unknown" })).items,
  ).toEqual([]);
});

it("does not forward a preview category to the live API or mutate caller query", async () => {
  vi.mocked(getPublicListings).mockResolvedValue({
    items: [],
    serverTime: "2026-10-11T00:00:00.000Z",
    nextCursor: null,
  });
  const query = new URLSearchParams({
    category: "Manga",
    condition: "Good",
    limit: "20",
  });
  await getSearchShelf(query, false);
  expect(vi.mocked(getPublicListings).mock.calls[0]![0].toString()).toBe(
    "condition=Good&limit=20",
  );
  expect(query.get("category")).toBe("Manga");
});

it("paginates preview editions without repeating or dropping IDs", () => {
  const seen = new Set<string>();
  const query = new URLSearchParams({ limit: "20" });
  let nextCursor: string | null;
  do {
    const page = previewSearch(query);
    page.items.forEach((item) => {
      expect(seen.has(item.id)).toBe(false);
      seen.add(item.id);
    });
    nextCursor = page.nextCursor;
    if (nextCursor) query.set("cursor", nextCursor);
  } while (nextCursor);
  expect(seen.size).toBe(91);
});
it("combines condition, both-compatible modes, price bounds and price sort", () => {
  const query = new URLSearchParams({
    category: "Manga",
    condition: "Fair",
    mode: "Sale",
    minSalePrice: "50000",
    maxSalePrice: "150000",
    sort: "salePriceDesc",
    limit: "50",
  });
  const page = previewSearch(query);
  expect(page.items.length).toBeGreaterThan(0);
  expect(
    page.items.every(
      (item) =>
        item.book.category === "Manga" &&
        item.condition === "Fair" &&
        item.mode !== "Exchange" &&
        item.salePrice! >= 50000 &&
        item.salePrice! <= 150000,
    ),
  ).toBe(true);
  expect(page.items.map((item) => item.salePrice)).toEqual(
    page.items.map((item) => item.salePrice).sort((a, b) => b! - a!),
  );
  expect(
    previewSearch(
      new URLSearchParams({ mode: "Both", limit: "50" }),
    ).items.every((item) => item.mode === "Both"),
  ).toBe(true);
});
it("keeps live failures visible and never treats preview editions as real listings", async () => {
  vi.mocked(getPublicListings).mockRejectedValue(new Error("offline"));
  await expect(getSearchShelf(new URLSearchParams(), false)).rejects.toThrow(
    "offline",
  );
  vi.clearAllMocks();
  const result = await getSearchShelf(new URLSearchParams(), true);
  expect(getPublicListings).not.toHaveBeenCalled();
  expect(
    result.items.every(
      (item) => "preview" in item && !("seller" in item) && !("photos" in item),
    ),
  ).toBe(true);
});
