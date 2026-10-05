import { z } from "zod";
import { ApiError } from "../../core/api/session-client";
import { bookCondition } from "./book-condition";
import { price, type Form } from "./listing-form";

const uuid = z.string().uuid();
const source = z.object({
  ref: z.string(),
  kind: z.enum([
    "CoverPrice",
    "EditorialReference",
    "InternalAsking",
    "CompletedSale",
    "OnlineRetail",
  ]),
  label: z.string(),
  amount: z.number().int(),
  condition: bookCondition.nullable(),
  observedAt: z.string(),
  url: z.string().nullable(),
  excluded: z
    .enum(["Outlier", "Stale", "OtherEdition", "AskingPrice"])
    .nullable(),
});
export const priceSuggestion = z.object({
  id: uuid,
  listingId: uuid,
  bookId: uuid,
  inputFingerprint: z.string(),
  status: z.enum(["Suggested", "NeedsMoreData", "Refused"]),
  evidenceLevel: z.enum(["Strong", "Limited", "Insufficient"]),
  rules: z.array(z.string()),
  range: z.object({ low: z.number().int(), high: z.number().int() }).nullable(),
  factors: z.array(
    z.object({ text: z.string(), sourceRefs: z.array(z.string()) }),
  ),
  sources: z.array(source),
  missing: z.array(z.string()),
  dataAsOf: z.string().nullable(),
  generatedAt: z.string(),
  expiresAt: z.string(),
  model: z.string().nullable(),
  cached: z.boolean(),
});
export type PriceSuggestion = z.infer<typeof priceSuggestion>;

// The inputs a suggestion depends on. Any change makes a shown suggestion stale.
export function suggestionInput(form: Form) {
  return {
    bookId: form.bookId,
    condition: form.condition,
    readable: form.readable,
    hasMissingPages: form.hasMissingPages,
    missingEssentialContent: form.missingEssentialContent,
    conditionNote: [form.pages, form.coverNote, form.notes]
      .map((t) => t.trim())
      .filter(Boolean)
      .join(" · ")
      .slice(0, 600),
  };
}
export const suggestionKey = (listingId: string, form: Form) =>
  JSON.stringify({ listingId, ...suggestionInput(form) });

type Ready = {
  status: "ready";
  key: string;
  suggestion: PriceSuggestion;
  appliedPrice: number | null;
  // A later refresh failed; the suggestion shown is still the current one.
  message?: string;
};
export type AssistState =
  | { status: "idle" }
  | { status: "loading"; key: string; token: number; previous?: Ready }
  | { status: "error"; key: string; message: string }
  | Ready;

// A refresh for unchanged inputs keeps the delivered suggestion (and the
// seller's pick) as a fallback if the refresh fails.
export function startLoading(state: AssistState, key: string, token: number): AssistState {
  const previous =
    state.status === "ready" && state.key === key
      ? state
      : state.status === "loading" && state.key === key
        ? state.previous
        : undefined;
  return { status: "loading", key, token, previous };
}
export function finishLoading(
  state: AssistState,
  token: number,
  listingId: string,
  suggestion: PriceSuggestion,
): AssistState {
  if (!acceptResponse(state, token, listingId, suggestion) || state.status !== "loading")
    return state;
  const same = state.previous?.suggestion.id === suggestion.id;
  return {
    status: "ready",
    key: state.key,
    suggestion,
    appliedPrice: same ? state.previous!.appliedPrice : null,
  };
}
export function failLoading(state: AssistState, token: number, message: string): AssistState {
  if (state.status !== "loading" || state.token !== token) return state;
  return state.previous
    ? { ...state.previous, message }
    : { status: "error", key: state.key, message };
}

// A late response for another listing or an older form state is dropped.
export function acceptResponse(
  state: AssistState,
  token: number,
  listingId: string,
  suggestion: PriceSuggestion,
) {
  return (
    state.status === "loading" &&
    state.token === token &&
    suggestion.listingId === listingId
  );
}

export const isStale = (state: AssistState, currentKey: string) =>
  state.status !== "idle" && state.key !== currentKey;

export function pricePoints(range: { low: number; high: number }) {
  const mid = Math.round((range.low + range.high) / 2 / 1000) * 1000;
  return [...new Set([range.low, mid, range.high])];
}

// Sent with a save only for a current, delivered suggestion; "applied" means the
// saved price is the value the seller picked from it, not a later manual edit.
export function decisionFor(state: AssistState, currentKey: string, form: Form) {
  if (state.status !== "ready" || state.key !== currentKey) return undefined;
  if (state.suggestion.status !== "Suggested") return undefined;
  if (form.mode !== "Sale" && form.mode !== "Both") return undefined;
  const chosen = price(form.salePrice);
  return {
    suggestionId: state.suggestion.id,
    applied: state.appliedPrice !== null && chosen === state.appliedPrice,
  };
}

export function assistError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 429)
      return "Bạn vừa yêu cầu nhiều gợi ý. Thử lại sau ít phút; bạn vẫn có thể tự nhập giá.";
    if (error.status === 503)
      return "Trợ lý gợi ý giá tạm thời không dùng được. Bạn vẫn có thể tự nhập giá.";
    if (error.status === 409)
      return "Bài đăng hiện không sửa được nên chưa thể gợi ý giá.";
    if (error.status === 422)
      return "Chọn đầu sách trong danh mục trước khi xem gợi ý giá.";
    if (error.status === 0)
      return "Chưa kết nối được máy chủ. Bạn vẫn có thể tự nhập giá.";
  }
  return "Chưa lấy được gợi ý giá. Bạn vẫn có thể tự nhập giá.";
}

export const evidenceLabel: Record<PriceSuggestion["evidenceLevel"], string> = {
  Strong: "Căn cứ khá đủ: nhiều nguồn gần đây",
  Limited: "Căn cứ còn hạn chế",
  Insufficient: "Chưa đủ căn cứ",
};
export const sourceKindLabel: Record<PriceSuggestion["sources"][number]["kind"], string> = {
  CoverPrice: "Giá bìa",
  EditorialReference: "Giá tham khảo do nhóm biên tập kiểm",
  InternalAsking: "Giá đang rao (chưa phải giá đã bán)",
  CompletedSale: "Giá đã bán",
  OnlineRetail: "Giá sách mới tại nhà sách trực tuyến",
};
export const excludedLabel = {
  Outlier: "không dùng: chênh lệch bất thường",
  Stale: "không dùng: dữ liệu cũ",
  OtherEdition: "không dùng: ấn bản khác",
  AskingPrice: "chỉ để tham khảo, không dùng tính khoảng giá",
} as const;
