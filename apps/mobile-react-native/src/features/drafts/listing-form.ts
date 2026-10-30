import type { components } from "@used-books/api-contract";
import type { Content, Draft, Media } from "./contracts";
import { formatVnd } from "../../core/ui/format";
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
    ? formatVnd(amount)
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
    exchangePreferences:
      f.mode !== "Sale" && f.exchangePreferences
        ? {
            targetCategory: f.exchangePreferences.targetCategory || null,
            targetAuthor: f.exchangePreferences.targetAuthor || null,
            targetDescription: f.exchangePreferences.targetDescription || null,
          }
        : null,
  };
}
export const editableListing = (d: Draft) =>
  ["Draft", "Rejected"].includes(d.state.moderation) &&
  d.state.visibility !== "Removed" &&
  d.state.trade === "Available" &&
  !d.state.deletedAt;
const tradeLabel: Record<string, string> = {
  Reserved: "Đang giữ cho một đơn",
  Sold: "Đã bán",
  Exchanged: "Đã đổi",
  ClosedUnavailable: "Đã đóng",
};
// List row copy: state, an explanation from real fields and the next action.
// Never claims the book is on the shelf; shelf visibility also depends on the account.
export function listingSummary(d: Draft, position: number) {
  const n = position;
  if (d.state.visibility === "Removed")
    return {
      status: "Đã gỡ",
      note: d.removalReason ? `Lý do gỡ: ${d.removalReason}` : null,
      action: `Xem sách ${n} đã gỡ`,
    };
  if (d.state.deletedAt)
    return {
      status: "Đã lưu trữ",
      note: null,
      action: `Xem sách ${n} đã lưu trữ`,
    };
  const catalogNote =
    d.catalogStatus === "Pending" ? "Đầu sách đang chờ xác nhận." : null;
  switch (d.state.moderation) {
    case "Draft":
      return {
        status: "Bản nháp",
        note: "Chưa gửi duyệt.",
        action: `Hoàn thiện sách ${n}`,
      };
    case "PendingReview":
      return {
        status: "Đang chờ duyệt",
        note: catalogNote ?? "Chưa thể sửa trong lúc chờ duyệt.",
        action: `Xem sách ${n} đang chờ duyệt`,
      };
    case "Rejected":
      return {
        status: "Cần chỉnh sửa",
        note: d.latestDecision?.reason
          ? `Góp ý: ${d.latestDecision.reason}`
          : null,
        action: `Sửa sách ${n} theo góp ý`,
      };
    case "Approved":
      return {
        status: [
          "Đã được duyệt",
          d.state.visibility === "Hidden" ? "Đang ẩn" : null,
          tradeLabel[d.state.trade] ?? null,
        ]
          .filter(Boolean)
          .join(" · "),
        note:
          d.state.visibility === "Hidden"
            ? "Bài đang ẩn khỏi kệ; bạn có thể mở lại."
            : null,
        action: `Quản lý sách ${n}`,
      };
    default:
      return { status: "Đang cập nhật", note: null, action: `Xem sách ${n}` };
  }
}
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
// Keeps only flagged errors the current input still fails; fixing a field clears
// its message without surfacing fields the member has not been asked about yet.
export function stillFailing(flagged: Errors, current: Errors): Errors {
  const e: Errors = {};
  for (const key of Object.keys(flagged) as (keyof Errors)[])
    if (current[key]) e[key] = current[key];
  return e;
}
// Fields per editor step, in on-screen order (5 steps matching web), so errors land on the first visible one.
export const stepFields: readonly (readonly (keyof Errors)[])[] = [
  // 1: Thông tin sách
  ["bookId"],
  // 2: Ảnh bản sách
  ["mediaIds"],
  // 3: Tình trạng
  [
    "condition",
    "readable",
    "hasMissingPages",
    "missingEssentialContent",
    "pages",
    "coverNote",
    "notes",
    "accessories",
    "description",
  ],
  // 4: Bán hoặc đổi
  ["mode", "salePrice", "exchangeValue", "fulfillment"],
  // 5: Kiểm tra
  ["ownershipDeclared"],
];
export function firstError(e: Errors): keyof Errors | null {
  for (const fields of stepFields)
    for (const field of fields) if (e[field]) return field;
  return null;
}
export function errorStep(e: Errors) {
  const field = firstError(e);
  return field !== null ? stepFields.findIndex((f) => f.includes(field)) : 4;
}
// Progress comes from the submit rules applied to what is entered now, never from step visits.
export function stepComplete(f: Form, images: Media[], step: number): boolean {
  const e = validateForm(f, images, true, true);
  return !stepFields[step]?.some((field) => e[field]);
}
