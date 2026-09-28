import type { components } from "@used-books/api-contract";
import type { Content, Draft, Media } from "./contracts";
export type Mode = NonNullable<components["schemas"]["DraftContent"]["mode"]>;
export type Form = Omit<Content, "salePrice" | "exchangeValue"> & {
  salePrice: string;
  exchangeValue: string;
};
export type Errors = Partial<Record<keyof Form | "ownershipDeclared", string>>;
export const fromContent = (c: Content): Form => ({
  ...c,
  fulfillment: c.fulfillment ?? null,
  mediaIds: [...c.mediaIds],
  salePrice: c.salePrice?.toString() ?? "",
  exchangeValue: c.exchangeValue?.toString() ?? "",
});
export function price(value: string): number | null {
  if (!value.trim()) return null;
  return /^\d{1,7}$/.test(value.trim()) ? Number(value.trim()) : NaN;
}
export function displayPrice(value: string) {
  const amount = price(value);
  return amount !== null && Number.isFinite(amount)
    ? `${amount.toLocaleString("vi-VN")} đồng`
    : "Chưa có giá hợp lệ";
}
export function toContent(f: Form): Content {
  return {
    ...f,
    pages: f.pages.trim(),
    coverNote: f.coverNote.trim(),
    notes: f.notes.trim(),
    accessories: f.accessories.trim(),
    description: f.description.trim(),
    salePrice:
      f.mode === "Sale" || f.mode === "Both" ? price(f.salePrice) : null,
    exchangeValue:
      f.mode === "Exchange" || f.mode === "Both"
        ? price(f.exchangeValue)
        : null,
  };
}
export const editableListing = (d: Draft) =>
  ["Draft", "Rejected"].includes(d.state.moderation) &&
  d.state.visibility !== "Removed" &&
  d.state.trade === "Available" &&
  !d.state.deletedAt;
export const moderationLabel: Record<string, string> = {
  Draft: "Bản nháp",
  PendingReview: "Đang chờ duyệt",
  Rejected: "Cần chỉnh sửa",
  Approved: "Đã được duyệt",
};
export function validateForm(
  f: Form,
  images: Media[],
  declared: boolean,
  submit: boolean,
): Errors {
  const e: Errors = {};
  const c = toContent(f);
  for (const k of ["salePrice", "exchangeValue"] as const)
    if (
      c[k] !== null &&
      (!Number.isInteger(c[k]) || c[k]! < 10000 || c[k]! > 1000000)
    )
      e[k] =
        "Nhập số nguyên từ 10.000 đến 1.000.000 đồng, không kèm dấu hoặc ký hiệu.";
  for (const field of [
    "pages",
    "coverNote",
    "notes",
    "accessories",
    "description",
  ] as const) {
    const max = field === "description" ? 5000 : 1000;
    if ([...c[field]].length > max)
      e[field] = `Nhập tối đa ${max.toLocaleString("vi-VN")} ký tự.`;
  }
  if (f.mediaIds.length > 8 || new Set(f.mediaIds).size !== f.mediaIds.length)
    e.mediaIds = "Chọn tối đa 8 ảnh khác nhau.";
  if (!submit) return e;
  if (!f.bookId)
    e.bookId = "Chọn đầu sách có sẵn hoặc gửi thông tin đầu sách mới.";
  if (!f.condition) e.condition = "Chọn tình trạng gần nhất với cuốn sách.";
  for (const k of ["pages", "coverNote", "notes", "accessories"] as const)
    if (!c[k]) e[k] = "Mô tả mục này; ghi ‘Không có’ nếu không có.";
  if ([...c.description].length < 30 || [...c.description].length > 5000)
    e.description = "Viết từ 30 đến 5.000 ký tự về cuốn sách của bạn.";
  if (f.readable !== true)
    e.readable = "Chỉ gửi sách còn đọc được rõ nội dung.";
  if (f.hasMissingPages === null)
    e.hasMissingPages = "Cho biết sách có thiếu trang hay không.";
  if (f.missingEssentialContent !== false)
    e.missingEssentialContent =
      "Sách thiếu phần nội dung trọng yếu chưa đủ điều kiện đăng.";
  if (!f.mode) e.mode = "Chọn bán, đổi hoặc cả hai.";
  if ((f.mode === "Sale" || f.mode === "Both") && c.salePrice === null)
    e.salePrice = "Nhập giá bán.";
  if ((f.mode === "Exchange" || f.mode === "Both") && c.exchangeValue === null)
    e.exchangeValue = "Nhập giá trị dùng để đổi sách.";
  if (
    !f.mediaIds.length ||
    f.mediaIds.some(
      (id) => !images.some((m) => m.id === id && m.status === "Ready"),
    )
  )
    e.mediaIds = "Chọn từ 1 đến 8 ảnh đã xử lý xong trước khi gửi.";
  if (!declared)
    e.ownershipDeclared =
      "Xác nhận quyền đăng và tính trung thực của thông tin.";
  return e;
}
export function errorStep(e: Errors) {
  if (e.bookId) return 0;
  if (
    [
      "condition",
      "pages",
      "coverNote",
      "notes",
      "accessories",
      "description",
      "readable",
      "hasMissingPages",
      "missingEssentialContent",
      "mediaIds",
    ].some((k) => e[k as keyof Errors])
  )
    return 1;
  if (e.mode || e.salePrice || e.exchangeValue || e.fulfillment) return 2;
  return 3;
}
