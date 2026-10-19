import { z } from "zod";
import { session } from "./api";
import type { Attributes } from "@used-books/api-contract/catalog-taxonomy";

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
type Remember = <T>(
  stage: string,
  run: (idempotencyKey: string) => Promise<T>,
) => Promise<T>;

// One in-memory attempt keeps acknowledged stages and the key of a lost response.
// A retry resumes this attempt instead of creating another catalog request/draft.
function rememberCommands(): Remember {
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

export type ListingInput = {
  channel?: "Auction";
  title: string;
  author: string;
  category: string;
  bookId?: string;
  categoryId?: string;
  attributes?: Attributes;
  language?: string;
  series?: string;
  condition: "LikeNew" | "Good" | "Fair" | "Worn";
  pages: string;
  coverNote: string;
  notes: string;
  accessories: string;
  description: string;
  mode: "Sale" | "Exchange" | "Both";
  salePrice: number | null;
  exchangeValue: number | null;
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

async function upload(
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

export function createListingSubmission(value: ListingInput) {
  const input = {
    ...value,
    attributes: structuredClone(value.attributes ?? {}),
    files: [...value.files],
  };
  const remember = rememberCommands();
  return async () => {
    if (!input.files.length) throw new Error("Cần ít nhất một ảnh sách.");
    const catalog = input.bookId
      ? { entityId: input.bookId }
      : await remember("catalog", (key) =>
          session.request("/catalog/requests", receipt, {
            method: "POST",
            headers: { "Idempotency-Key": key },
            body: JSON.stringify({
              metadata: {
                title: input.title.trim(),
                authors: [input.author.trim()],
                publisher: null,
                publicationYear: null,
                language: input.language || "vi",
                edition: null,
                category: input.category.trim() || "Khác",
                ...(input.categoryId
                  ? {
                      categoryId: input.categoryId,
                      attributes: input.attributes,
                      series: input.series?.trim() || null,
                    }
                  : {}),
                isbn: null,
              },
            }),
          }),
        );
    const draft = await remember("draft", (key) =>
      session.request("/listings", receipt, {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({
          // ADR 0041: the auction flow creates its own Auction listing.
          ...(input.channel === "Auction" ? { channel: "Auction" } : {}),
          content: {
            bookId: null,
            mode: input.channel === "Auction" ? "Sale" : null,
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
    const mediaIds: string[] = [];
    for (const file of input.files.slice(0, 8))
      mediaIds.push(
        await upload(
          draft.entityId,
          draft.version,
          file,
          remember,
          mediaIds.length,
        ),
      );
    const saved = await remember("save", (key) =>
      session.request(`/listings/${draft.entityId}/draft`, receipt, {
        method: "PUT",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({
          expectedVersion: draft.version,
          content: {
            bookId: catalog.entityId,
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
