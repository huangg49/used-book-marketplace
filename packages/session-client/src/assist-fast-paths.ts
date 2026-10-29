import { z } from "zod";
import {
  priceSuggestion,
  suggestionInput,
  type AssistState,
} from "./listing-assist";
import { catalogMatches } from "./catalog-recovery";
import { ApiError, type SessionClient } from "./session-client";
export const isbnMatches = z.object({
  listingId: z.string().uuid(),
  status: z.enum(["Found", "NotFound", "Ambiguous", "Unavailable"]),
  isbns: z.array(z.string().regex(/^97[89][0-9]{10}$/)).max(6),
  catalog: catalogMatches.nullable(),
  serverTime: z.string(),
});
export type IsbnMatches = z.infer<typeof isbnMatches>;
export const priceReference = priceSuggestion
  .omit({ id: true, model: true, factors: true, cached: true })
  .extend({ status: z.enum(["Ready", "NeedsMoreData", "Refused"]) });
export type PriceReference = z.infer<typeof priceReference>;
export type PriceReferenceState = { key: string; value: PriceReference } | null;
// Manual reference choices must stay manual even when a refresh replays an
// earlier AI suggestion that the seller had previously applied.
export function clearAiPriceAttribution(state: AssistState): AssistState {
  if (state.status === "ready") return { ...state, appliedPrice: null };
  if (state.status === "loading" && state.previous)
    return { ...state, previous: { ...state.previous, appliedPrice: null } };
  return state;
}
export function currentReference(
  state: PriceReferenceState,
  key: string,
  now = Date.now(),
) {
  return state &&
    state.key === key &&
    Number.isFinite(Date.parse(state.value.expiresAt)) &&
    Date.parse(state.value.expiresAt) > now
    ? state.value
    : null;
}
async function read<T>(
  client: Pick<SessionClient, "request" | "getSnapshot">,
  path: string,
  schema: z.ZodType<T>,
  body: object,
) {
  const before = client.getSnapshot();
  if (before.status !== "authenticated")
    throw new ApiError(401, "UNAUTHORIZED", "Đăng nhập để dùng trợ lý.");
  const result = await client.request(path, schema, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const after = client.getSnapshot();
  if (after.status !== "authenticated" || after.user.id !== before.user.id)
    throw new ApiError(401, "SESSION_CHANGED", "Phiên đăng nhập đã thay đổi.");
  return result;
}
export async function findIsbnMatches(
  client: SessionClient,
  listingId: string,
  mediaIds: string[],
) {
  const value = await read(
    client,
    `/listings/${listingId}/isbn-matches`,
    isbnMatches,
    { mediaIds },
  );
  if (value.listingId !== listingId)
    throw new ApiError(
      0,
      "INVALID_RESPONSE",
      "Kết quả không thuộc bài đăng hiện tại.",
    );
  return value;
}
export async function findPriceReference(
  client: SessionClient,
  listingId: string,
  input: ReturnType<typeof suggestionInput> | object,
) {
  const value = await read(
    client,
    `/listings/${listingId}/price-reference`,
    priceReference,
    input,
  );
  if (
    value.listingId !== listingId ||
    value.bookId !== (input as { bookId?: string }).bookId
  )
    throw new ApiError(
      0,
      "INVALID_RESPONSE",
      "Khoảng tham chiếu không thuộc đầu sách hiện tại.",
    );
  return value;
}
