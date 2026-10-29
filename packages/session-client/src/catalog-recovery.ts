import { z } from "zod";
import { ApiError, type SessionClient } from "./session-client";
import { autofillSuggestion, type AutofillSuggestion } from "./listing-assist";

const book = autofillSuggestion.shape.matches.element.shape.book;
export const catalogMatch = z.object({
  book,
  matchedBy: z.enum(["Isbn", "TitleAuthor", "SimilarTitle", "SwappedText"]),
  pending: z.boolean(),
  warnings: z.array(
    z.enum([
      "CheckEdition",
      "AuthorDiffers",
      "PublisherDiffers",
      "YearDiffers",
      "LanguageDiffers",
      "VolumeUnclear",
    ]),
  ),
});
export const catalogMatches = z.object({
  items: z.array(catalogMatch).max(5),
  truncated: z.boolean(),
  serverTime: z.string(),
});
export type CatalogMatch = z.infer<typeof catalogMatch>;
export type CatalogHints = AutofillSuggestion["fields"];
export type CatalogSearchFields = {
  title: string;
  authors: string;
  isbn: string;
  edition: string;
};
export const matchReason: Record<CatalogMatch["matchedBy"], string> = {
  Isbn: "Khớp ISBN — kiểm tra bản sách",
  TitleAuthor: "Khớp tên và tác giả — kiểm tra ấn bản",
  SimilarTitle: "Tên gần giống — cần kiểm tra",
  SwappedText: "Có thể tên sách và tác giả bị đọc lẫn",
};
export const matchWarning: Record<CatalogMatch["warnings"][number], string> = {
  CheckEdition: "Đối chiếu tập và ấn bản với cuốn sách của bạn.",
  AuthorDiffers: "Tác giả khác thông tin đang tìm.",
  PublisherDiffers: "Nhà xuất bản khác thông tin đang tìm.",
  YearDiffers: "Năm xuất bản khác thông tin đang tìm.",
  LanguageDiffers: "Ngôn ngữ khác thông tin đang tìm.",
  VolumeUnclear:
    "Chưa xác định cùng tập; xem số tập trên bìa hoặc trang bản quyền.",
};
export const initialCatalogFields = (
  hints?: CatalogHints | null,
): CatalogSearchFields => ({
  title: hints?.title ?? "",
  authors: hints?.authors.join("; ") ?? "",
  isbn: hints?.isbn ?? "",
  edition: hints?.edition ?? "",
});
export const catalogHints = (fields: CatalogSearchFields): CatalogHints => ({
  title: fields.title.trim() || null,
  authors: fields.authors
    .split(";")
    .map((a) => a.trim())
    .filter(Boolean),
  isbn: fields.isbn.replace(/[\s-]/g, "") || null,
  edition: fields.edition.trim() || null,
  publisher: null,
  publicationYear: null,
  language: null,
});
export const catalogBookFacts = (b: CatalogMatch["book"]) =>
  [
    b.authors.join("; "),
    b.publisher,
    b.publicationYear && `Năm ${b.publicationYear}`,
    b.edition,
    b.language && `Ngôn ngữ ${b.language}`,
    b.isbn ? `ISBN ${b.isbn}` : "Chưa có ISBN",
  ]
    .filter(Boolean)
    .join(" · ");
// POST is read-only: no command key/quota/model. SessionClient rejects stale session responses.
export async function findCatalogMatches(
  client: Pick<SessionClient, "request" | "getSnapshot">,
  listingId: string,
  hints: CatalogHints,
) {
  const snapshot = client.getSnapshot();
  if (snapshot.status !== "authenticated")
    throw new ApiError(401, "UNAUTHORIZED", "Đăng nhập để tìm đầu sách.");
  const owner = snapshot.user.id;
  const result = await client.request(
    `/listings/${listingId}/catalog-matches`,
    catalogMatches,
    { method: "POST", body: JSON.stringify(hints) },
  );
  const current = client.getSnapshot();
  if (current.status !== "authenticated" || current.user.id !== owner)
    throw new ApiError(401, "SESSION_CHANGED", "Phiên đăng nhập đã thay đổi.");
  return result;
}
