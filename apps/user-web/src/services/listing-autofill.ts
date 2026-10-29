import {
  autofillSuggestion,
  findIsbnMatches,
  type AutofillSuggestion,
} from "@used-books/session-client";
import { session } from './api';
import {
  ensureDraft,
  uploadOnce,
  type DraftAttempt,
} from "./listing-submission";

export {
  type AutofillSuggestion,
  type AutofillMatch,
} from "@used-books/session-client";
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
export function createAutofillRequest(
  attempt: DraftAttempt,
  channel?: "Auction",
) {
  return async (files: File[]): Promise<AutofillSuggestion> => {
    if (!files.length || files.length > 3)
      throw new Error(
        "Chọn từ 1 đến 3 ảnh: bìa trước, gáy hoặc trang bản quyền.",
      );
    const draft = await ensureDraft(attempt, channel);
    const mediaIds: string[] = [];
    for (const file of files)
      mediaIds.push(await uploadOnce(attempt, draft, file));
    return attempt.ask(
      `/listings/${draft.entityId}/autofill-suggestions`,
      autofillSuggestion,
      { mediaIds },
    );
  };
}

export function createIsbnLookup(attempt: DraftAttempt, channel?: 'Auction') {
  return async (files: File[]) => {
    if (!files.length || files.length > 3) throw new Error('Chọn từ 1 đến 3 ảnh để tìm ISBN.');
    const draft = await ensureDraft(attempt, channel), ids: string[] = [];
    for (const file of files) ids.push(await uploadOnce(attempt, draft, file));
    return findIsbnMatches(session, draft.entityId, ids);
  };
}
