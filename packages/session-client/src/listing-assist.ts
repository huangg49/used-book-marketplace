import { z } from "zod";
import { ApiError, type SessionClient } from "./session-client";
const bookCondition = z.enum(["LikeNew", "Good", "Fair", "Worn"]);
export type AssistForm = {
  bookId: string | null;
  condition: z.infer<typeof bookCondition> | null;
  readable: boolean | null;
  hasMissingPages: boolean | null;
  missingEssentialContent: boolean | null;
  pages: string;
  coverNote: string;
  notes: string;
  salePrice: string;
  mode: "Sale" | "Exchange" | "Both" | null;
};
const price = (value: string) =>
  !value.trim()
    ? null
    : /^\d{1,7}$/.test(value.trim())
      ? Number(value.trim())
      : NaN;

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
  originGroup: z.string().nullable().optional(),
  excluded: z
    .enum(["Outlier", "Stale", "OtherEdition", "AskingPrice", "DuplicateSource"])
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
export function suggestionInput(form: AssistForm) {
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
export const suggestionKey = (listingId: string, form: AssistForm) =>
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
export function startLoading(
  state: AssistState,
  key: string,
  token: number,
): AssistState {
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
  if (
    !acceptResponse(state, token, listingId, suggestion) ||
    state.status !== "loading"
  )
    return state;
  const same = state.previous?.suggestion.id === suggestion.id;
  return {
    status: "ready",
    key: state.key,
    suggestion,
    appliedPrice: same ? state.previous!.appliedPrice : null,
  };
}
export function failLoading(
  state: AssistState,
  token: number,
  message: string,
): AssistState {
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

export const isStale = (
  state: AssistState,
  currentKey: string,
  now = Date.now(),
) =>
  state.status !== "idle" &&
  (state.key !== currentKey ||
    (state.status === "ready" &&
      (!Number.isFinite(Date.parse(state.suggestion.expiresAt)) ||
        Date.parse(state.suggestion.expiresAt) <= now)));

export function pricePoints(range: { low: number; high: number }) {
  const mid = Math.round((range.low + range.high) / 2 / 1000) * 1000;
  return [...new Set([range.low, mid, range.high])];
}

// Sent with a save only for a current, delivered suggestion; "applied" means the
// saved price is the value the seller picked from it, not a later manual edit.
export function decisionFor(
  state: AssistState,
  currentKey: string,
  form: AssistForm,
) {
  if (state.status !== "ready" || isStale(state, currentKey)) return undefined;
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
export const sourceKindLabel: Record<
  PriceSuggestion["sources"][number]["kind"],
  string
> = {
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
  DuplicateSource: "không dùng: trùng nguồn gốc với quan sát đã chọn",
} as const;

const autofillBook = z.object({
  id: uuid,
  title: z.string(),
  authors: z.array(z.string()),
  publisher: z.string().nullable(),
  publicationYear: z.number().int().nullable(),
  language: z.string(),
  edition: z.string().nullable(),
  category: z.string(),
  categoryId: z.string().nullable().optional(),
  attributes: z.record(z.string(), z.array(z.string())).optional(),
  series: z.string().nullable().optional(),
  isbn: z.string().nullable(),
});
export const autofillSuggestion = z.object({
  id: uuid,
  status: z.enum(["Suggested", "NeedsMoreData"]),
  fields: z.object({
    title: z.string().nullable(),
    authors: z.array(z.string()),
    publisher: z.string().nullable(),
    publicationYear: z.number().int().nullable(),
    language: z.string().nullable(),
    edition: z.string().nullable(),
    isbn: z.string().nullable(),
  }),
  matches: z.array(
    z.object({
      book: autofillBook,
      matchedBy: z.enum(["Isbn", "TitleAuthor"]),
      pending: z.boolean(),
    }),
  ),
  missing: z.array(z.string()),
  cached: z.boolean(),
});
export type AutofillSuggestion = z.infer<typeof autofillSuggestion>;
export type AutofillMatch = AutofillSuggestion["matches"][number];
export type AutofillField = keyof AutofillSuggestion["fields"];
export const autofillLabels: Record<AutofillField, string> = {
  title: "Tên sách",
  authors: "Tác giả",
  publisher: "Nhà xuất bản",
  publicationYear: "Năm xuất bản",
  language: "Ngôn ngữ",
  edition: "Lần xuất bản",
  isbn: "ISBN",
};
export function autofillValue(
  fields: AutofillSuggestion["fields"],
  field: AutofillField,
) {
  const value = fields[field];
  return Array.isArray(value)
    ? value.join("; ")
    : value == null
      ? null
      : String(value);
}

// One identity/path/body retains its intent after an unknown response. In-flight
// duplicates share a promise; a definitive AI failure may start a new attempt.
// No token store, network call, identifier or user text is persisted here.
export function createAssistRequest(
  client: Pick<SessionClient, "request" | "getSnapshot">,
  newKey: () => string,
) {
  const intents = new Map<string, { key: string; task?: Promise<unknown> }>();
  return async <T>(
    path: string,
    schema: z.ZodType<T>,
    value: unknown,
    timeoutMs = 60_000,
  ): Promise<T> => {
    const state = client.getSnapshot();
    if (state.status !== "authenticated")
      throw new ApiError(401, "UNAUTHORIZED", "Đăng nhập để dùng trợ lý.");
    const owner = state.user.id;
    const body = JSON.stringify(value);
    const identity = JSON.stringify([owner, path, body]);
    let intent = intents.get(identity);
    if (!intent) {
      intent = { key: newKey() };
      intents.set(identity, intent);
    }
    const current = intent;
    if (!current.task) {
      current.task = client
        .request(
          path,
          schema,
          { method: "POST", headers: { "Idempotency-Key": current.key }, body },
          timeoutMs,
        )
        .then((result) => {
          intents.delete(identity);
          return result;
        })
        .catch((error) => {
          current.task = undefined;
          if (
            error instanceof ApiError &&
            (error.code === "AI_ASSIST_FAILED" ||
              [400, 401, 403, 404, 409, 422].includes(error.status))
          )
            intents.delete(identity);
          throw error;
        });
    }
    const result = (await current.task) as T;
    const after = client.getSnapshot();
    if (after.status !== "authenticated" || after.user.id !== owner)
      throw new ApiError(
        401,
        "SESSION_CHANGED",
        "Phiên đăng nhập đã thay đổi.",
      );
    return result;
  };
}
