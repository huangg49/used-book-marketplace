import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@used-books/session-client";
import { createAutofillRequest } from "./listing-autofill";
import {
  createDraftAttempt,
  createListingSubmission,
  type ListingInput,
} from "./listing-submission";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./api", () => ({ session: { request } }));
const draft = "20000000-0000-4000-8000-000000000002";
const media = "20000000-0000-4000-8000-000000000003";
const suggestion = {
  id: "20000000-0000-4000-8000-000000000009",
  status: "Suggested",
  fields: {
    title: "Mắt biếc",
    authors: ["Nguyễn Nhật Ánh"],
    publisher: "NXB Trẻ",
    publicationYear: 2019,
    language: "vi",
    edition: null,
    isbn: "9786041234567",
  },
  matches: [],
  missing: [],
  cached: false,
};
let autofillAnswer: () => unknown = () => suggestion;
function respond(path: string) {
  if (path === "/catalog/requests")
    return { entityId: "20000000-0000-4000-8000-000000000001", version: 1 };
  if (path === "/listings") return { entityId: draft, version: 1 };
  if (path.endsWith("/autofill-suggestions")) return autofillAnswer();
  if (path.endsWith("/upload-ticket")) return { path: "/upload-bytes", headers: {} };
  if (path === "/upload-bytes") return undefined;
  if (path.startsWith("/me/")) return { id: media, version: 2, status: "Ready" };
  if (path.endsWith("/media")) return { entityId: media, version: 1 };
  return { entityId: draft, version: 2 };
}
const keyOf = (call: unknown[]) =>
  ((call[2] as RequestInit).headers as Record<string, string>)["Idempotency-Key"];
const calls = (suffix: string) =>
  request.mock.calls.filter((call) => String(call[0]).endsWith(suffix));

beforeEach(() => {
  autofillAnswer = () => suggestion;
  request.mockReset();
  request.mockImplementation(async (path: string) => respond(path));
});

describe("photo autofill request", () => {
  const photo = () => new File(["cover"], "cover.jpg", { type: "image/jpeg" });

  it("keeps the key after a lost response and takes a new one after an answered error", async () => {
    const attempt = createDraftAttempt();
    const ask = createAutofillRequest(attempt);
    const file = photo();
    autofillAnswer = () => {
      throw new TypeError("network");
    };
    await expect(ask([file])).rejects.toThrow("network");
    autofillAnswer = () => {
      throw new ApiError(503, "UNAVAILABLE", "Đọc ảnh mất quá lâu.");
    };
    await expect(ask([file])).rejects.toThrow("Đọc ảnh mất quá lâu.");
    autofillAnswer = () => suggestion;
    await expect(ask([file])).resolves.toMatchObject({ status: "Suggested" });
    const keys = calls("/autofill-suggestions").map(keyOf);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
    // One draft and one upload, however many times the seller asks.
    expect(calls("/listings")).toHaveLength(1);
    expect(calls("/media")).toHaveLength(1);
  });

  it("rejects an empty or oversized selection before any request", async () => {
    const ask = createAutofillRequest(createDraftAttempt());
    await expect(ask([])).rejects.toThrow("1 đến 3");
    await expect(ask([photo(), photo(), photo(), photo()])).rejects.toThrow("1 đến 3");
    expect(request).not.toHaveBeenCalled();
  });

  it("lets the submission reuse the autofill draft, its photo and accepted catalog facts", async () => {
    const attempt = createDraftAttempt();
    const file = photo();
    await createAutofillRequest(attempt)([file]);
    const input: ListingInput = {
      title: "Mắt biếc",
      author: "Nguyễn Nhật Ánh",
      category: "Văn học",
      publisher: "NXB Trẻ",
      publicationYear: 2019,
      isbn: "9786041234567",
      condition: "Good",
      pages: "Đủ trang",
      coverNote: "Không",
      notes: "Không có",
      accessories: "Không có",
      description: "Mô tả bản sách kiểm thử dài hơn ba mươi ký tự.",
      mode: "Sale",
      salePrice: 40000,
      exchangeValue: null,
      files: [file],
      readable: true,
      hasMissingPages: false,
      missingEssentialContent: false,
      ownershipDeclared: true,
      fulfillment: null,
    };
    await createListingSubmission(input, attempt)();
    expect(calls("/listings")).toHaveLength(1);
    expect(calls("/media")).toHaveLength(1);
    const catalog = JSON.parse(String((calls("/catalog/requests")[0]![2] as RequestInit).body));
    expect(catalog.metadata).toMatchObject({
      publisher: "NXB Trẻ",
      publicationYear: 2019,
      isbn: "9786041234567",
    });
    const saved = JSON.parse(String((calls("/draft")[0]![2] as RequestInit).body));
    expect(saved.content.mediaIds).toEqual([media]);
  });
});
