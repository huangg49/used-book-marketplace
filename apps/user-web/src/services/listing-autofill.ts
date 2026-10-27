import { z } from "zod";
import { ApiError } from "@used-books/session-client";
import { session } from "./api";
import { ensureDraft, uploadOnce, type DraftAttempt } from "./listing-submission";

const book = z.object({
  id: z.string().uuid(),
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
const suggestion = z.object({
  id: z.string().uuid(),
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
      book,
      matchedBy: z.enum(["Isbn", "TitleAuthor"]),
      pending: z.boolean(),
    }),
  ),
  missing: z.array(z.string()),
  cached: z.boolean(),
});
export type AutofillSuggestion = z.infer<typeof suggestion>;
export type AutofillMatch = AutofillSuggestion["matches"][number];

// Catalog-request facts the seller accepted from photo autofill.
export type AutofillFacts = {
  publisher?: string | null;
  publicationYear?: number | null;
  edition?: string | null;
  isbn?: string | null;
};
// Review rows for those facts: they go into the catalog request, so the
// seller sees them before sending.
export function autofillFactRows(facts: AutofillFacts): [string, string][] {
  return (
    [
      ["Nhà xuất bản", facts.publisher],
      ["Năm xuất bản", facts.publicationYear],
      ["Lần xuất bản", facts.edition],
      ["ISBN", facts.isbn],
    ] as const
  )
    .filter(([, value]) => value != null)
    .map(([label, value]) => [label, String(value)]);
}

// ADR 0048: uploads 1-3 photos to the shared draft, then asks the server to
// read them. A lost response retries with the same key; an answered error
// (e.g. a stored timeout) needs a new key, or the server would replay it.
export function createAutofillRequest(attempt: DraftAttempt, channel?: "Auction") {
  let pending: { body: string; key: string } | null = null;
  return async (files: File[]): Promise<AutofillSuggestion> => {
    if (!files.length || files.length > 3)
      throw new Error("Chọn từ 1 đến 3 ảnh: bìa trước, gáy hoặc trang bản quyền.");
    const draft = await ensureDraft(attempt, channel);
    const mediaIds: string[] = [];
    for (const file of files) mediaIds.push(await uploadOnce(attempt, draft, file));
    const body = JSON.stringify({ mediaIds });
    if (pending?.body !== body) pending = { body, key: crypto.randomUUID() };
    try {
      const result = await session.request(
        `/listings/${draft.entityId}/autofill-suggestions`,
        suggestion,
        { method: "POST", headers: { "Idempotency-Key": pending.key }, body },
        60_000,
      );
      pending = null;
      return result;
    } catch (error) {
      if (error instanceof ApiError) pending = null;
      throw error;
    }
  };
}
