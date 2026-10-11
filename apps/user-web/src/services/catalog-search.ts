import { previewShelf, type HomeShelfBook } from "./home-shelves";
import { getPublicListings } from "./public-listings";
import catalog from "../data/preview-catalog.json";
import { matchesClassification } from "@used-books/api-contract/catalog-taxonomy";
import { classificationQuery } from "../lib/catalog-filters";
import { previewClassification } from "../data/preview-classification";

export const previewCategories = [
  ...new Set(catalog.items.map((book) => book.category)),
];

/** Preview editions keep their source links; they are never listing IDs. */
export function previewSearch(query: URLSearchParams) {
  const classification = classificationQuery(query);
  let items = previewShelf(
    new URLSearchParams({
      q: query.get("q") || "",
      mode: query.get("mode") || "",
    }),
  ).items.map((item) => ({
    ...item,
    book: { ...item.book, ...previewClassification(item.book) },
  }));
  const condition = query.get("condition");
  const category = query.get("category");
  const min = query.get("minSalePrice");
  const max = query.get("maxSalePrice");
  const minExchange = query.get("minExchangeValue");
  const maxExchange = query.get("maxExchangeValue");
  items = items.filter(
    (item) =>
      (!category || item.book.category === category) &&
      (!condition || item.condition === condition) &&
      matchesClassification(item.book, classification) &&
      ((!minExchange && !maxExchange) ||
        (item.exchangeValue !== null &&
          (!minExchange || item.exchangeValue >= Number(minExchange)) &&
          (!maxExchange || item.exchangeValue <= Number(maxExchange)))) &&
      ((!min && !max) ||
        (item.salePrice !== null &&
          (!min || item.salePrice >= Number(min)) &&
          (!max || item.salePrice <= Number(max)))),
  );
  const sort = query.get("sort");
  if (
    sort === "salePriceAsc" ||
    sort === "salePriceDesc" ||
    sort === "exchangeValueAsc" ||
    sort === "exchangeValueDesc"
  ) {
    items.sort((a, b) => {
      const av = sort.startsWith("sale") ? a.salePrice : a.exchangeValue;
      const bv = sort.startsWith("sale") ? b.salePrice : b.exchangeValue;
      if (av === null) return bv === null ? 0 : 1;
      if (bv === null) return -1;
      return sort.endsWith("Asc") ? av - bv : bv - av;
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
  if (preview) return previewSearch(query);
  const liveQuery = new URLSearchParams(query);
  const classification = classificationQuery(liveQuery);
  if (classification.categoryId)
    liveQuery.set("categoryId", classification.categoryId);
  liveQuery.delete("category");
  return getPublicListings(liveQuery);
}
