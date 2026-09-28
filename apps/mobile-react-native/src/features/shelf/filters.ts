export const sorts = {
  newest: "Mới lên kệ",
  salePriceAsc: "Giá bán tăng dần",
  salePriceDesc: "Giá bán giảm dần",
  exchangeValueAsc: "Giá trị đổi tăng dần",
  exchangeValueDesc: "Giá trị đổi giảm dần",
} as const;
export type Filters = {
  q: string;
  mode: string;
  condition: string;
  sort: keyof typeof sorts;
  minSalePrice: string;
  maxSalePrice: string;
  minExchangeValue: string;
  maxExchangeValue: string;
};
export const initialFilters: Filters = {
  q: "",
  mode: "",
  condition: "",
  sort: "newest",
  minSalePrice: "",
  maxSalePrice: "",
  minExchangeValue: "",
  maxExchangeValue: "",
};
export function filterError(filters: Filters): string | undefined {
  if ([...filters.q.trim()].length > 200) return "Từ khóa tối đa 200 ký tự.";
  for (const field of [
    "minSalePrice",
    "maxSalePrice",
    "minExchangeValue",
    "maxExchangeValue",
  ] as const) {
    const value = filters[field].trim();
    if (
      value &&
      (!/^\d+$/.test(value) || Number(value) < 10000 || Number(value) > 1000000)
    )
      return "Giá lọc phải là số nguyên từ 10.000 đến 1.000.000 đồng. Bỏ trống nếu không giới hạn.";
  }
  for (const [min, max] of [
    ["minSalePrice", "maxSalePrice"],
    ["minExchangeValue", "maxExchangeValue"],
  ] as const)
    if (
      filters[min].trim() &&
      filters[max].trim() &&
      Number(filters[min]) > Number(filters[max])
    )
      return "Giá tối thiểu cần nhỏ hơn hoặc bằng giá tối đa.";
}
export function queryString(filters: Filters): string {
  const query = new URLSearchParams({ limit: "12", sort: filters.sort });
  for (const [key, value] of Object.entries(filters))
    if (key !== "sort" && value.trim())
      query.set(
        key,
        key.includes("Price") || key.includes("Value")
          ? String(Number(value))
          : value.trim(),
      );
  return query.toString();
}
