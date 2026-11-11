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
    phase("model");
    const body = { ...input, bookId: book.entityId };
    const readReference = async () => {
      if (!onReference) return;
      const value = await findPriceReference(session, draft.entityId, body).catch(() => null);
      if (value) onReference(value);
      return value;
    };
    const initialReference = await readReference();
    try {
      const suggestion = await ask(
        `/listings/${draft.entityId}/price-suggestions`,
        priceSuggestion,
        body,
        30_000,
      );
      return { listingId: draft.entityId, suggestion };
    } catch (error) {
      // A lookup can finish between the first reference read and the model call.
      if (initialReference?.status !== "Ready") await readReference();
      throw error;
    }
  };
}
