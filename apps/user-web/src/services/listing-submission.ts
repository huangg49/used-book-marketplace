import { createAssistRequest } from "@used-books/session-client";
import { z } from "zod";
import { session } from "./api";
import type { Attributes } from "@used-books/api-contract/catalog-taxonomy";
import type { BookBundle } from "../lib/book-bundle";

const receipt = z.object({
  entityId: z.string().uuid(),
  version: z.number().int(),
});
const media = z.object({
  id: z.string().uuid(),
  version: z.number().int(),
  status: z.enum(["Pending", "Processing", "Ready", "Failed"]),
});
const ticket = z.object({
  path: z.string(),
  headers: z.record(z.string(), z.string()),
});
const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
export type Remember = <T>(
  stage: string,
  run: (idempotencyKey: string) => Promise<T>,
) => Promise<T>;

// One in-memory attempt keeps acknowledged stages and the key of a lost response.
// A retry resumes this attempt instead of creating another catalog request/draft.
export function rememberCommands(): Remember {
  const stages = new Map<string, { key: string; result?: Promise<unknown> }>();
  return <T>(stage: string, run: (idempotencyKey: string) => Promise<T>) => {
    let entry = stages.get(stage);
    if (!entry) {
      entry = { key: crypto.randomUUID() };
      stages.set(stage, entry);
    }
    const current = entry;
    current.result ??= run(current.key).catch((error) => {
      current.result = undefined;
      throw error;
    });
    return current.result as Promise<T>;
  };
}

// One draft shared by photo autofill (ADR 0048) and the final submission:
// the same stage keys resume the same draft, and a file already uploaded to
// it is reused instead of creating a second media reservation.
export type DraftAttempt = {
  id: string;
  ask: ReturnType<typeof createAssistRequest>;
  remember: Remember;
  uploaded: Map<File, string>;
  index: WeakMap<File, number>;
  next: number;
};
export function createDraftAttempt(): DraftAttempt {
  return {
    id: crypto.randomUUID(),
    ask: createAssistRequest(session, () => crypto.randomUUID()),
    remember: rememberCommands(),
    uploaded: new Map(),
    index: new WeakMap(),
    next: 0,
  };
}

export function ensureDraft(attempt: DraftAttempt, channel?: "Auction") {
  return attempt.remember("draft", (key) =>
    session.request("/listings", receipt, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({
        // ADR 0042: the auction flow creates its own Auction listing.
        ...(channel === "Auction" ? { channel: "Auction" } : {}),
        content: {
          bookId: null,
          mode: channel === "Auction" ? "Sale" : null,
          condition: null,
          pages: "",
          coverNote: "",
          notes: "",
          accessories: "",
          description: "",
          readable: null,
          hasMissingPages: null,
          missingEssentialContent: null,
          salePrice: null,
          exchangeValue: null,
          mediaIds: [],
        },
      }),
    }),
  );
}

// Stable per-file stage index, so a retry resumes the same upload keys.
export async function uploadOnce(
  attempt: DraftAttempt,
  draft: { entityId: string; version: number },
  file: File,
) {
  const done = attempt.uploaded.get(file);
  if (done) return done;
  let index = attempt.index.get(file);
  if (index === undefined) {
    index = attempt.next++;
    attempt.index.set(file, index);
  }
  const id = await upload(
    draft.entityId,
    draft.version,
    file,
    attempt.remember,
    index,
  );
  attempt.uploaded.set(file, id);
  return id;
}

export type ListingInput = {
  priceAssist?: { suggestionId: string; applied: boolean };
  bundle?: BookBundle | null;
  channel?: "Auction";
  title: string;
  author: string;
  category: string;
  bookId?: string;
  categoryId?: string;
  attributes?: Attributes;
  language?: string;
  series?: string;
  // Accepted photo-autofill values for a new catalog request (ADR 0048).
  publisher?: string | null;
  publicationYear?: number | null;
  edition?: string | null;
  isbn?: string | null;
  condition: "LikeNew" | "Good" | "Fair" | "Worn";
  pages: string;
  coverNote: string;
  notes: string;
  accessories: string;
  description: string;
  mode: "Sale" | "Exchange" | "Both";
  salePrice: number | null;
  exchangeValue: number | null;
  exchangePreferences?: {
    targetCategory?: string | null;
    targetAuthor?: string | null;
    targetDescription?: string | null;
  } | null;
  files: File[];
  readable: boolean;
  hasMissingPages: boolean;
  missingEssentialContent: boolean;
  ownershipDeclared: boolean;
  fulfillment: {
    originAddressId: string;
    originAddressVersion: number;
    method: "DirectDelivery";
  } | null;
};

export async function upload(
  listingId: string,
  expectedVersion: number,
  file: File,
  remember: Remember,
  index: number,
) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 10_000_000
  )
    throw new Error("Ảnh cần là JPEG, PNG hoặc WebP và không quá 10 MB.");
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = [...new Uint8Array(digest)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  const created = await remember(`photo-${index}-reserve`, (key) =>
    session.request(`/listings/${listingId}/media`, receipt, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({
        expectedVersion,
        mimeType: file.type,
        byteSize: file.size,
        sha256,
      }),
    }),
  );
  const base = `/listings/${listingId}/media/${created.entityId}`;
  const grant = await remember(`photo-${index}-ticket`, () =>
    session.request(`${base}/upload-ticket`, ticket),
  );
  await remember(`photo-${index}-bytes`, (key) =>
    session.request(
      grant.path,
      z.unknown(),
      {
        method: "PUT",
        headers: { ...grant.headers, "Idempotency-Key": key },
        body: bytes,
      },
      120_000,
    ),
  );
  let current = await remember(`photo-${index}-uploaded`, () =>
    session.request(`/me${base}`, media),
  );
  await remember(`photo-${index}-finalize`, (key) =>
    session.request(`${base}/finalize`, receipt, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({ expectedVersion: current.version }),
    }),
  );
  for (let attempt = 0; attempt < 30; attempt += 1) {
    current = await session.request(`/me${base}`, media);
    if (current.status === "Ready") return current.id;
    if (current.status === "Failed")
      throw new Error("Ảnh không đạt yêu cầu xử lý.");
    await wait(1000);
  }
  throw new Error("Ảnh đang xử lý, hãy thử gửi lại sau ít phút.");
}

export type CatalogInput = Pick<
  ListingInput,
  | "bookId"
  | "title"
  | "author"
  | "publisher"
  | "publicationYear"
  | "language"
  | "edition"
  | "category"
  | "categoryId"
  | "attributes"
  | "series"
  | "isbn"
>;
export async function ensureCatalog(
  attempt: DraftAttempt,
  input: CatalogInput,
) {
  if (input.bookId) return { entityId: input.bookId };
  const body = JSON.stringify({
    metadata: {
      title: input.title.trim(),
      authors: input.author
        .split(";")
        .map((author) => author.trim())
        .filter(Boolean),
      publisher: input.publisher ?? null,
      publicationYear: input.publicationYear ?? null,
      language: input.language || "vi",
      edition: input.edition ?? null,
      category: input.category.trim() || "Khác",
      ...(input.categoryId
        ? {
            categoryId: input.categoryId,
            attributes: input.attributes,
            series: input.series?.trim() || null,
          }
        : {}),
      isbn: input.isbn ?? null,
    },
  });
  return attempt.remember(`catalog:${body}`, (key) =>
    session.request("/catalog/requests", receipt, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body,
    }),
  );
}

export function createListingSubmission(
  value: ListingInput,
  attempt: DraftAttempt = createDraftAttempt(),
) {
  const input = {
    ...value,
    ...(value.priceAssist ? { priceAssist: { ...value.priceAssist } } : {}),
    attributes: structuredClone(value.attributes ?? {}),
    bundle: value.bundle ? structuredClone(value.bundle) : null,
    files: [...value.files],
  };
  const { remember } = attempt;
  return async () => {
    if (!input.files.length) throw new Error("Cần ít nhất một ảnh sách.");
    const catalog = await ensureCatalog(attempt, input);
    const draft = await ensureDraft(attempt, input.channel);
    const mediaIds: string[] = [];
    for (const file of input.files.slice(0, 8))
      mediaIds.push(await uploadOnce(attempt, draft, file));
    const saved = await remember("save", (key) =>
      session.request(`/listings/${draft.entityId}/draft`, receipt, {
        method: "PUT",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({
          expectedVersion: draft.version,
          ...(input.priceAssist ? { priceAssist: input.priceAssist } : {}),
          content: {
            bookId: catalog.entityId,
            ...(input.bundle ? { bundle: input.bundle } : {}),
            mode: input.mode,
            condition: input.condition,
            pages: input.pages,
            coverNote: input.coverNote,
            notes: input.notes,
            accessories: input.accessories,
            description: input.description,
            readable: input.readable,
            hasMissingPages: input.hasMissingPages,
            missingEssentialContent: input.missingEssentialContent,
            salePrice: input.salePrice,
            exchangeValue: input.exchangeValue,
            exchangePreferences: input.exchangePreferences ?? null,
            mediaIds,
            fulfillment: input.fulfillment,
          },
        }),
      }),
    );
    await remember("submit", (key) =>
      session.request(`/listings/${draft.entityId}/submit`, receipt, {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({
          expectedVersion: saved.version,
          ownershipDeclared: input.ownershipDeclared,
        }),
      }),
    );
    return draft.entityId;
  };
}
