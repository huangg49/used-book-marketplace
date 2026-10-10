import { previewShelf, type HomeShelfBook } from "./home-shelves";
import { getPublicListings } from "./public-listings";

/** Preview editions keep their source links; they are never listing IDs. */
export function previewSearch(query: URLSearchParams) {
  let items = previewShelf(
    new URLSearchParams({
      q: query.get("q") || "",
      mode: query.get("mode") || "",
    }),
  ).items;
  const condition = query.get("condition");
  const min = query.get("minSalePrice");
  const max = query.get("maxSalePrice");
  items = items.filter(
    (item) =>
      (!condition || item.condition === condition) &&
      ((!min && !max) ||
        (item.salePrice !== null &&
          (!min || item.salePrice >= Number(min)) &&
          (!max || item.salePrice <= Number(max)))),
  );
  const sort = query.get("sort");
  if (sort === "salePriceAsc" || sort === "salePriceDesc") {
    items.sort((a, b) => {
      if (a.salePrice === null) return b.salePrice === null ? 0 : 1;
      if (b.salePrice === null) return -1;
      return sort === "salePriceAsc"
        ? a.salePrice - b.salePrice
        : b.salePrice - a.salePrice;
    });
  }
  const limit = Math.min(50, Math.max(1, Number(query.get("limit")) || 20));
  const cursor = query.get("cursor") || "";
  // Invalid/outdated preview cursors safely reopen the first page.
  const offset = /^preview:\d+$/.test(cursor) ? Number(cursor.slice(8)) : 0;
  const start =
    Number.isSafeInteger(offset) && offset < items.length ? offset : 0;
  return {
    items: items.slice(start, start + limit),
    nextCursor:
      start + limit < items.length ? `preview:${start + limit}` : null,
  };
}

export async function getSearchShelf(
  query: URLSearchParams,
  preview: boolean,
): Promise<{ items: HomeShelfBook[]; nextCursor: string | null }> {
  return preview ? previewSearch(query) : getPublicListings(query);
}
