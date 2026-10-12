import catalog from "../data/preview-catalog.json";
import { getPublicListings, type PublicListing } from "./public-listings";
import {
  descendantIds,
  categoryFor,
} from "@used-books/api-contract/catalog-taxonomy";

export interface CatalogBook {
  id: string;
  title: string;
  authors: string[];
  category: string;
  language: string;
  isbn: string | null;
  coverId: number;
  coverUrl: string;
  sourceUrl: string;
  series: string;
  categoryId?: string;
  attributes?: Record<string, string[]>;
}
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
export const homeShelfPageSize = 10;

export const previewTopics = [
  {
    id: "stories",
    title: "Văn học, truyện & hồi ký",
    description:
      "Từ tiểu thuyết đến hồi ký và những câu chuyện cho bạn đọc nhỏ tuổi.",
    categories: ["literature", "children", "biography"],
  },
  {
    id: "knowledge",
    title: "Khoa học, lịch sử & xã hội",
    description: "Tìm hiểu thế giới tự nhiên và những câu chuyện của quá khứ.",
    categories: ["science", "history", "society"],
  },
  {
    id: "growth",
    title: "Công việc & đời sống",
    description: "Kinh doanh, kỹ năng, gia đình và những sở thích mỗi ngày.",
    categories: [
      "psychology",
      "business",
      "parenting",
      "health",
      "arts",
      "lifestyle",
    ],
  },
];

export function isCatalogPreview(search: string) {
  const choice = new URLSearchParams(search).get("data");
  return (
    import.meta.env.DEV &&
    (choice === "preview" ||
      (choice !== "live" && import.meta.env.VITE_CATALOG_PREVIEW === "true"))
  );
}

export function homeShelfUrl(params: Record<string, string>, preview: boolean) {
  const query = new URLSearchParams({
    data: preview ? "preview" : "live",
    ...params,
  });
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
  const topic = previewTopics.find((item) => item.id === query.get("topic"));
  const books = catalog.items.map((book, index): PreviewShelfBook => {
    const mode = (["Sale", "Exchange", "Both"] as const)[index % 3];
    const price = 35000 + (index % 12) * 10000;
    return {
      preview: true,
      id: book.id,
      book: {
        ...book,
        attributes: book.attributes
          ? Object.fromEntries(
              Object.entries(book.attributes).filter(
                (entry): entry is [string, string[]] => Array.isArray(entry[1]),
              ),
            )
          : undefined,
      },
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
          (!topic ||
            topic.categories.some((id) =>
              descendantIds(id).includes(
                item.book.categoryId ||
                  categoryFor(item.book.category)?.id ||
                  "",
              ),
            )) &&
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
export function previewTopicBooks(topicId: string) {
  const topic = previewTopics.find((item) => item.id === topicId);
  // Skip the opening shelf, keeping these shelves useful rather than repeating
  // the same covers immediately below the main shelf.
  return previewShelf(new URLSearchParams())
    .items.slice(homeShelfPageSize)
    .filter((item) =>
      topic?.categories.some((id) =>
        descendantIds(id).includes(
          item.book.categoryId || categoryFor(item.book.category)?.id || "",
        ),
      ),
    )
    .slice(0, homeShelfPageSize);
}
export const budgetCoverUrls = [
  "The Great Gatsby",
  "Atomic Habits",
  "A Brief History of Time",
  "Matilda",
].map(
  (series) =>
    catalog.items.find((book) => book.series === series)?.coverUrl ?? "",
);
