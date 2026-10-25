import type { MyListing } from "../services/my-listings";

// Owner-side rules for "Sửa bài đã duyệt" (SRS §7.2, LISTING_SLICE LS-D05,
// ADR 0012). The server rechecks every rule under the listing lock; this module
// only decides what the UI offers and validates input before the command.

export const PRICE_MIN = 10_000;
export const PRICE_MAX = 1_000_000;
export const MAX_PHOTOS = 8;
export const DETAIL_MAX = 1_000;
export const DESCRIPTION_MIN = 30;
export const DESCRIPTION_MAX = 5_000;

type EditableListing = Pick<MyListing, "channel" | "state">;

// Returns why an approved-edit cannot start, or null when it can.
export function editApprovedBlock(item: EditableListing): string | null {
  const { moderation, visibility, trade } = item.state;
  if (item.channel === "Auction")
    return "Bài đấu giá được quản lý ở mục Đấu giá của tôi.";
  if (visibility === "Removed") return "Bài đã bị gỡ nên không thể sửa.";
  if (trade === "Reserved")
    return "Sách đang có giao dịch, chưa sửa được lúc này.";
  if (trade !== "Available")
    return "Sách đã hoàn tất giao dịch nên không thể sửa.";
  if (moderation === "PendingReview")
    return "Bài đang chờ duyệt. Hãy chờ kết quả rồi sửa tiếp.";
  if (moderation !== "Approved")
    return "Chỉ bài đã duyệt mới sửa theo cách này.";
  return null;
}

export const canEditApproved = (item: EditableListing) =>
  editApprovedBlock(item) === null;

// A row only explains a blocked edit when the owner could reasonably expect the
// button (an approved or pending listing); drafts and rejections use other flows.
export const shouldExplainEditBlock = (item: EditableListing) =>
  !canEditApproved(item) &&
  item.channel !== "Auction" &&
  item.state.visibility !== "Removed" &&
  (item.state.moderation === "Approved" ||
    item.state.moderation === "PendingReview");

export type Condition = "LikeNew" | "Good" | "Fair" | "Worn";
export type Mode = "Sale" | "Exchange" | "Both";

export type RevisionFormValue = {
  condition: Condition | "";
  pages: string;
  coverNote: string;
  notes: string;
  accessories: string;
  description: string;
  readable: boolean | null;
  hasMissingPages: boolean | null;
  missingEssentialContent: boolean | null;
  mode: Mode;
  salePrice: string;
  exchangeValue: string;
  originAddressId: string;
  photoCount: number;
  ownershipDeclared: boolean;
};

export type RevisionField = keyof RevisionFormValue;
export type RevisionErrors = Partial<Record<RevisionField, string>>;

const text = (value: unknown) => (typeof value === "string" ? value : "");
const flag = (value: unknown) => (typeof value === "boolean" ? value : null);
const money = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) ? String(value) : "";
const isCondition = (value: unknown): value is Condition =>
  value === "LikeNew" ||
  value === "Good" ||
  value === "Fair" ||
  value === "Worn";

// Reads the editable content of the current revision into form strings.
export function formFromListing(
  item: Pick<MyListing, "currentRevision">,
): RevisionFormValue {
  const c = item.currentRevision.content as Record<string, unknown>;
  const fulfillment = c.fulfillment as { originAddressId?: unknown } | undefined;
  const mode = c.mode;
  return {
    condition: isCondition(c.condition) ? c.condition : "",
    pages: text(c.pages),
    coverNote: text(c.coverNote),
    notes: text(c.notes),
    accessories: text(c.accessories),
    description: text(c.description),
    readable: flag(c.readable),
    hasMissingPages: flag(c.hasMissingPages),
    missingEssentialContent: flag(c.missingEssentialContent),
    mode: mode === "Exchange" || mode === "Both" ? mode : "Sale",
    salePrice: money(c.salePrice),
    exchangeValue: money(c.exchangeValue),
    originAddressId: text(fulfillment?.originAddressId),
    photoCount: Array.isArray(c.mediaIds) ? c.mediaIds.length : 0,
    ownershipDeclared: false,
  };
}

// Unicode code points, consistent with the server count.
export const codePoints = (value: string) => Array.from(value.trim()).length;

export type PriceResult = { value: number | null; error?: string };

// Money is an integer VND amount in the contract range, never a formatted string.
export function parsePrice(raw: string): PriceResult {
  const value = raw.trim();
  if (!value) return { value: null };
  if (!/^\d+$/.test(value))
    return { value: null, error: "Nhập số nguyên, không dấu chấm hay phẩy." };
  const amount = Number(value);
  if (amount < PRICE_MIN || amount > PRICE_MAX)
    return {
      value: null,
      error: `Giá từ ${PRICE_MIN.toLocaleString("vi-VN")} đến ${PRICE_MAX.toLocaleString("vi-VN")} đ.`,
    };
  return { value: amount };
}

export const needsOrigin = (mode: Mode) => mode !== "Exchange";

const DETAIL_FIELDS = [
  ["pages", "Tình trạng các trang"],
  ["coverNote", "Tình trạng bìa"],
  ["notes", "Ghi chú thêm"],
  ["accessories", "Phụ kiện đi kèm"],
] as const;

export function validateRevision(value: RevisionFormValue): RevisionErrors {
  const errors: RevisionErrors = {};
  if (!value.condition) errors.condition = "Chọn tình trạng sách.";
  for (const [field, label] of DETAIL_FIELDS) {
    const length = codePoints(value[field]);
    if (length < 1 || length > DETAIL_MAX)
      errors[field] = `${label}: nhập 1–${DETAIL_MAX} ký tự. Ghi “Không có” nếu không áp dụng.`;
  }
  const description = codePoints(value.description);
  if (description < DESCRIPTION_MIN || description > DESCRIPTION_MAX)
    errors.description = `Mô tả cần ${DESCRIPTION_MIN}–${DESCRIPTION_MAX} ký tự.`;
  if (value.readable !== true)
    errors.readable = "Sách phải đọc được bình thường để đăng bán.";
  if (value.hasMissingPages === null)
    errors.hasMissingPages = "Cho biết sách có thiếu trang không.";
  if (value.missingEssentialContent !== false)
    errors.missingEssentialContent =
      "Sách thiếu phần nội dung trọng yếu không đăng được.";

  const sale = parsePrice(value.salePrice);
  const exchange = parsePrice(value.exchangeValue);
  if (value.mode !== "Exchange") {
    if (sale.error) errors.salePrice = sale.error;
    else if (sale.value === null) errors.salePrice = "Nhập giá bán.";
  }
  if (value.mode !== "Sale") {
    if (exchange.error) errors.exchangeValue = exchange.error;
    else if (exchange.value === null)
      errors.exchangeValue = "Nhập giá trị trao đổi.";
  }
  if (needsOrigin(value.mode) && !value.originAddressId)
    errors.originAddressId = "Chọn nơi gửi sách.";
  if (value.photoCount < 1 || value.photoCount > MAX_PHOTOS)
    errors.photoCount = `Cần từ 1 đến ${MAX_PHOTOS} ảnh thật của cuốn sách.`;
  if (!value.ownershipDeclared)
    errors.ownershipDeclared = "Xác nhận bạn có quyền đăng cuốn sách này.";
  return errors;
}

export type RevisionContent = {
  bookId: string;
  mode: Mode;
  condition: Condition;
  pages: string;
  coverNote: string;
  notes: string;
  accessories: string;
  description: string;
  readable: true;
  hasMissingPages: boolean;
  missingEssentialContent: false;
  salePrice: number | null;
  exchangeValue: number | null;
  mediaIds: string[];
  fulfillment: {
    originAddressId: string;
    originAddressVersion: number;
    method: "DirectDelivery";
  } | null;
};

// Call only after validateRevision returned no errors. bookId always comes from
// the listing under edit, never from user input: the book identity is locked.
export function buildRevisionContent(
  value: RevisionFormValue,
  bookId: string,
  mediaIds: string[],
  origin: { id: string; version: number } | null,
): RevisionContent {
  const sale = parsePrice(value.salePrice).value;
  const exchange = parsePrice(value.exchangeValue).value;
  return {
    bookId,
    mode: value.mode,
    condition: value.condition as Condition,
    pages: value.pages.trim(),
    coverNote: value.coverNote.trim(),
    notes: value.notes.trim(),
    accessories: value.accessories.trim(),
    description: value.description.trim(),
    readable: true,
    hasMissingPages: value.hasMissingPages === true,
    missingEssentialContent: false,
    // A price outside the chosen mode must be null, never carried over.
    salePrice: value.mode === "Exchange" ? null : sale,
    exchangeValue: value.mode === "Sale" ? null : exchange,
    mediaIds,
    fulfillment:
      needsOrigin(value.mode) && origin
        ? {
            originAddressId: origin.id,
            originAddressVersion: origin.version,
            method: "DirectDelivery",
          }
        : null,
  };
}
