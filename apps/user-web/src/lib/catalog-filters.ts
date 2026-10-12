import {
  categoryFor,
  searchClassificationErrors as classificationErrors,
  supportsSeries,
  type Attributes,
} from "@used-books/api-contract/catalog-taxonomy";
export const catalogQueryKeys = [
  "q",
  "mode",
  "condition",
  "categoryId",
  "language",
  "series",
  "facets",
  "sort",
  "minSalePrice",
  "maxSalePrice",
  "minExchangeValue",
  "maxExchangeValue",
  "cursor",
] as const;
export function readAttributes(value: string | null): Attributes {
  if (!value) return {};
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Bộ lọc thuộc tính chưa hợp lệ.");
  if (
    Object.values(parsed).some(
      (values) =>
        !Array.isArray(values) ||
        values.some((value) => typeof value !== "string"),
    )
  )
    throw new Error("Mỗi thuộc tính cần là một danh sách lựa chọn hợp lệ.");
  return parsed as Attributes;
}
export function classificationQuery(query: URLSearchParams) {
  const attributes = readAttributes(query.get("facets"));
  const categoryId =
    query.get("categoryId") ||
    categoryFor(query.get("category") || "")?.id ||
    "";
  if (
    (Object.keys(attributes).length && !categoryId) ||
    (categoryId && classificationErrors(categoryId, attributes).length)
  )
    throw new Error("Thuộc tính không phù hợp danh mục. Hãy chọn lại bộ lọc.");
  const language = query.get("language") || "";
  const series = query.get("series") || "";
  if (language && !/^[a-z]{2,3}$/.test(language))
    throw new Error("Ngôn ngữ sách chưa hợp lệ.");
  if (
    series &&
    (!supportsSeries(categoryId) || series.length > 120 || !series.trim())
  )
    throw new Error("Tên bộ truyện chỉ dùng với Manga hoặc Light novel.");
  return { categoryId, attributes, language, series };
}
