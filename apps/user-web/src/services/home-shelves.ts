import catalog from "../data/preview-catalog.json";
import { getPublicListings, type PublicListing } from "./public-listings";

export type CatalogBook = (typeof catalog.items)[number];
export interface PreviewShelfBook {
  preview: true;
  id: string;
  book: CatalogBook;
  mode: PublicListing["mode"];
  condition: PublicListing["condition"];
  salePrice: number | null;
  exchangeValue: number | null;
}
export type HomeShelfBook = PublicListing | PreviewShelfBook;

export function isCatalogPreview(search: string) {
  const choice = new URLSearchParams(search).get("data");
  return (
    import.meta.env.DEV &&
    (choice === "preview" ||
      (choice !== "live" && import.meta.env.VITE_CATALOG_PREVIEW === "true"))
  );
}

export function homeShelfUrl(params: Record<string, string>, preview: boolean) {
  const query = new URLSearchParams(
    preview ? { data: "preview", ...params } : params,
  );
  return preview
    ? `/?${query}#latest-title`
    : `/books${query.size ? `?${query}` : ""}`;
}

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export function previewShelf(query: URLSearchParams): {
  items: PreviewShelfBook[];
  nextCursor: null;
} {
  const mode = query.get("mode");
  const max = query.get("maxSalePrice");
  const q = fold(query.get("q")?.trim() ?? "");
  const books = catalog.items.map((book, index): PreviewShelfBook => {
    const mode = (["Sale", "Exchange", "Both"] as const)[index % 3];
    const price = 35000 + (index % 12) * 10000;
    return {
      preview: true,
      id: book.id,
      book,
      mode,
      condition: (["LikeNew", "Good", "Fair", "Worn"] as const)[index % 4],
      salePrice: mode === "Exchange" ? null : price,
      exchangeValue: mode === "Sale" ? null : price + 10000,
    };
  });
  return {
    items: books
      .filter(
        (item) =>
          (!mode || item.mode === mode || item.mode === "Both") &&
          (!max ||
            (item.salePrice !== null && item.salePrice <= Number(max))) &&
          (!q ||
            fold(
              [
                item.book.title,
                ...item.book.authors,
                item.book.isbn,
                item.book.category,
              ].join(" "),
            ).includes(q)),
      )
      .slice(0, Number(query.get("limit")) || catalog.items.length),
    nextCursor: null,
  };
}

export async function getHomeShelf(
  query: URLSearchParams,
  preview: boolean,
): Promise<{ items: HomeShelfBook[]; nextCursor: string | null }> {
  // Explicit source selection: backend errors never fall back to sample data.
  return preview ? previewShelf(query) : getPublicListings(query);
}

export const previewCatalogCount = catalog.items.length;
export const budgetCoverUrls = [
  "Naruto",
  "Spy x Family",
  "Chainsaw Man",
  "Overlord",
].map(
  (series) =>
    catalog.items.find((book) => book.series === series)?.coverUrl ?? "",
);
