import { findPriceReference, type PriceReference } from '@used-books/session-client';
import { session } from './api';
import {
  priceSuggestion,
  suggestionInput,
  type AssistForm,
} from "@used-books/session-client";
import {
  ensureCatalog,
  ensureDraft,
  uploadOnce,
  type CatalogInput,
  type DraftAttempt,
} from "./listing-submission";
export type PricePhase = "catalog" | "upload" | "model";
export function createListingPriceRequest(attempt: DraftAttempt) {
  const ask = attempt.ask;
  return async (
    form: AssistForm,
    catalog: CatalogInput,
    files: File[],
    phase: (value: PricePhase) => void,
    onReference?: (value: PriceReference) => void,
  ) => {
    if (!files.length)
      throw new Error("Thêm ít nhất một ảnh bản sách trước khi gợi ý giá.");
    phase("catalog");
    const input = structuredClone(suggestionInput(form));
    const book = await ensureCatalog(attempt, structuredClone(catalog));
    const draft = await ensureDraft(attempt);
    phase("upload");
    // A single Ready photo is sufficient evidence to request a suggestion.
    // Final submission reuses it and uploads the remaining selected photos.
    await uploadOnce(attempt, draft, files[0]!);
    if (onReference) {
      try { onReference(await findPriceReference(session, draft.entityId, { ...input, bookId: book.entityId })); } catch { /* AI/manual entry remain available if the fast reference cannot be read. */ }
    }
    phase("model");
    return {
      listingId: draft.entityId,
      suggestion: await ask(
        `/listings/${draft.entityId}/price-suggestions`,
        priceSuggestion,
        { ...input, bookId: book.entityId },
        30_000,
      ),
    };
  };
}
