import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type AssistForm } from "@used-books/session-client";
import { createListingPriceRequest } from "./listing-price-assist";
import {
  createDraftAttempt,
  createListingSubmission,
  type ListingInput,
} from "./listing-submission";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./api", () => ({
  session: {
    request,
    getSnapshot: () => ({ status: "authenticated", user: { id: "qa-member" } }),
  },
}));
const draft = "20000000-0000-4000-8000-000000000001",
  book = "20000000-0000-4000-8000-000000000002",
  media = "20000000-0000-4000-8000-000000000003";
const catalog = {
  title: "Tên đã xác nhận",
  author: "Tác giả A; Tác giả B",
  language: "vi",
  category: "Văn học",
};
const form: AssistForm = {
  bookId: null,
  condition: "Good",
  readable: true,
  hasMissingPages: false,
  missingEssentialContent: false,
  pages: "Đủ trang",
  coverNote: "Bìa nguyên",
  notes: "",
  salePrice: "40000",
  mode: "Sale",
};
const photo = () => new File(["photo"], "qa.png", { type: "image/png" });
beforeEach(() => {
  request.mockReset().mockImplementation(async (path: string) => {
    if (path === "/catalog/requests") return { entityId: book, version: 1 };
    if (path === "/listings") return { entityId: draft, version: 1 };
    if (path.endsWith("/upload-ticket")) return { path: "/bytes", headers: {} };
    if (path.startsWith("/me/"))
      return { id: media, version: 2, status: "Ready" };
    if (path.endsWith("/media")) return { entityId: media, version: 1 };
    if (path.endsWith("/price-suggestions"))
      return { id: "suggestion", listingId: draft };
    return { entityId: draft, version: 2 };
  });
});
describe("web price assistance shares the submission draft", () => {
  it("reuses acknowledged catalog/upload stages and pins the AI intent through a lost ACK", async () => {
    const attempt = createDraftAttempt(),
      file = photo(),
      ask = createListingPriceRequest(attempt);
    let lost = false;
    const respond = request.getMockImplementation()!;
    request.mockImplementation(async (...args) => {
      if (String(args[0]).endsWith("/price-suggestions") && !lost) {
        lost = true;
        throw new ApiError(0, "NETWORK", "lost");
      }
      return respond(...args);
    });
    await expect(ask(form, catalog, [file], () => {})).rejects.toMatchObject({
      status: 0,
    });
    await ask(form, catalog, [file], () => {});
    const calls = request.mock.calls.filter(([path]) =>
      path.endsWith("/price-suggestions"),
    );
    expect(calls).toHaveLength(2);
    expect(calls[0]![2]).toEqual(calls[1]![2]);
    const input: ListingInput = {
      ...catalog,
      condition: "Good",
      pages: "Đủ",
      coverNote: "Bìa",
      notes: "Không",
      accessories: "Không",
      description: "Mô tả bản sách được giữ nguyên khi dùng gợi ý.",
      mode: "Sale",
      salePrice: 40000,
      exchangeValue: null,
      files: [file],
      readable: true,
      hasMissingPages: false,
      missingEssentialContent: false,
      ownershipDeclared: true,
      fulfillment: null,
      priceAssist: { suggestionId: "suggestion", applied: true },
    };
    const submit = createListingSubmission(input, attempt);
    input.priceAssist!.applied = false;
    await submit();
    expect(
      request.mock.calls.filter(([path]) => path === "/listings"),
    ).toHaveLength(1);
    expect(
      request.mock.calls.filter(([path]) => path === "/catalog/requests"),
    ).toHaveLength(1);
    expect(
      request.mock.calls.filter(([path]) => path.endsWith("/media")),
    ).toHaveLength(1);
    expect(
      JSON.parse(
        request.mock.calls.find(([path]) => path.endsWith("/draft"))![2].body,
      ).priceAssist.applied,
    ).toBe(true);
    expect(
      JSON.parse(
        request.mock.calls.find(([path]) => path === "/catalog/requests")![2]
          .body,
      ).metadata.authors,
    ).toEqual(["Tác giả A", "Tác giả B"]);
  });
  it("does not reuse a catalog acknowledgement for edited metadata", async () => {
    const ask = createListingPriceRequest(createDraftAttempt()),
      file = photo();
    await ask(form, catalog, [file], () => {});
    await ask(form, { ...catalog, title: "Tên mới đã sửa" }, [file], () => {});
    const calls = request.mock.calls.filter(
      ([path]) => path === "/catalog/requests",
    );
    expect(calls).toHaveLength(2);
    expect(calls[0]![2].headers).not.toEqual(calls[1]![2].headers);
  });
});
