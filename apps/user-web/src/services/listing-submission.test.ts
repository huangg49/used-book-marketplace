import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createListingSubmission,
  type ListingInput,
} from "./listing-submission";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./api", () => ({ session: { request } }));
const catalog = "10000000-0000-4000-8000-000000000001";
const draft = "10000000-0000-4000-8000-000000000002";
const media = "10000000-0000-4000-8000-000000000003";
const input = (): ListingInput => ({
  title: "Sách thử",
  author: "Tác giả thử",
  category: "Văn học",
  condition: "Worn",
  pages: "Đủ trang",
  coverNote: "Gáy sờn",
  notes: "Không có",
  accessories: "Không có",
  description: "Mô tả bản sách kiểm thử dài hơn ba mươi ký tự.",
  mode: "Both",
  salePrice: 35000,
  exchangeValue: 45000,
  files: [new File(["photo"], "cover.png", { type: "image/png" })],
  readable: true,
  hasMissingPages: true,
  missingEssentialContent: false,
  ownershipDeclared: true,
  fulfillment: {
    originAddressId: "10000000-0000-4000-8000-000000000004",
    originAddressVersion: 1,
    method: "DirectDelivery",
  },
});
function respond(path: string) {
  if (path === "/catalog/requests") return { entityId: catalog, version: 1 };
  if (path === "/listings") return { entityId: draft, version: 1 };
  if (path.endsWith("/upload-ticket"))
    return { path: "/upload-bytes", headers: {} };
  if (path === "/upload-bytes") return undefined;
  if (path.startsWith("/me/"))
    return { id: media, version: 2, status: "Ready" };
  if (path.endsWith("/media")) return { entityId: media, version: 1 };
  return { entityId: draft, version: 2 };
}
beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async (path: string) => respond(path));
});
describe("resumable listing submission", () => {
  it.each([
    "/catalog/requests", "/listings", `/listings/${draft}/media`, "/upload-bytes",
    `/listings/${draft}/media/${media}/finalize`, `/listings/${draft}/draft`, `/listings/${draft}/submit`,
  ])("pins every bundle component across edits and a lost response at %s", async (lostPath) => {
    const value: ListingInput = {
      ...input(), mode: "Sale", exchangeValue: null,
      bundle: { title: "Bộ tập 1 và 3", wholeOnly: true, exclusiveOwnershipDeclared: true,
        items: [{ label: "Tập 1", condition: "Good", notes: "" },
          { label: "Tập 3", condition: "Worn", notes: "Bìa sờn; thiếu tập 2." }] },
    };
    const original = structuredClone(value.bundle);
    let lost = false;
    request.mockImplementation(async (path: string) => {
      if (path === lostPath && !lost) { lost = true; throw new Error("Lost response"); }
      return respond(path);
    });
    const run = createListingSubmission(value);
    value.bundle!.title = "Đã chỉnh tên";
    value.bundle!.items[1].notes = "Đã chỉnh ghi chú";
    await expect(run()).rejects.toThrow("Lost response");
    value.bundle!.items.pop();
    await expect(run()).resolves.toBe(draft);
    const saved = request.mock.calls.filter(([path]) => path.endsWith("/draft"));
    const replayed = request.mock.calls.filter(([path]) => path === lostPath);
    expect(replayed).toHaveLength(2);
    expect(replayed[0][2]).toEqual(replayed[1][2]);
    expect(JSON.parse(saved.at(-1)![2].body).content.bundle).toEqual(original);
  });
  it.each([
    "/catalog/requests",
    "/listings",
    `/listings/${draft}/media`,
    "/upload-bytes",
    `/listings/${draft}/media/${media}/finalize`,
    `/listings/${draft}/draft`,
    `/listings/${draft}/submit`,
  ])(
    "replays a lost response at %s with the same key/body and without repeating earlier writes",
    async (lostPath) => {
      let lost = false;
      request.mockImplementation(async (path: string) => {
        if (path === lostPath && !lost) {
          lost = true;
          throw new Error("Lost response");
        }
        return respond(path);
      });
      const run = createListingSubmission(input());
      await expect(run()).rejects.toThrow("Lost response");
      await expect(run()).resolves.toBe(draft);
      const writes = request.mock.calls.filter(
        ([, , options]) => options?.method,
      );
      const retried = writes.filter(([path]) => path === lostPath);
      expect(retried).toHaveLength(2);
      expect(retried[0][2]).toEqual(retried[1][2]);
      for (const path of new Set(writes.map(([path]) => path)))
        expect(writes.filter(([candidate]) => candidate === path)).toHaveLength(
          path === lostPath ? 2 : 1,
        );
    },
  );
  it("sends real condition answers, both prices and ownership from a frozen attempt", async () => {
    const value = input();
    const run = createListingSubmission(value);
    value.title = "Changed";
    value.readable = false;
    value.files.length = 0;
    await run();
    const catalogCall = request.mock.calls.find(
      ([path]) => path === "/catalog/requests",
    )!;
    expect(JSON.parse(catalogCall[2].body).metadata.title).toBe("Sách thử");
    const saved = JSON.parse(
      request.mock.calls.find(([path]) => path.endsWith("/draft"))![2].body,
    );
    expect(saved.content).toMatchObject({
      condition: "Worn",
      readable: true,
      hasMissingPages: true,
      missingEssentialContent: false,
      salePrice: 35000,
      exchangeValue: 45000,
      fulfillment: {
        originAddressId: "10000000-0000-4000-8000-000000000004",
        originAddressVersion: 1,
        method: "DirectDelivery",
      },
    });
    expect(
      JSON.parse(
        request.mock.calls.find(([path]) => path.endsWith("/submit"))![2].body,
      ),
    ).toEqual({ expectedVersion: 2, ownershipDeclared: true });
  });
  it("does not send mutations without an image", async () => {
    const run = createListingSubmission({ ...input(), files: [] });
    await expect(run()).rejects.toThrow("Cần ít nhất");
    expect(request).not.toHaveBeenCalled();
  });
  it("reuses a confirmed book without proposing or changing its catalog", async () => {
    await createListingSubmission({ ...input(), bookId: catalog })();
    expect(
      request.mock.calls.some(([path]) => path === "/catalog/requests"),
    ).toBe(false);
    expect(
      JSON.parse(
        request.mock.calls.find(([path]) => path.endsWith("/draft"))![2].body,
      ),
    ).toMatchObject({ content: { bookId: catalog } });
  });
  it("freezes contextual metadata across a lost catalog response", async () => {
    const value = {
      ...input(),
      category: "Tiếng Nhật",
      categoryId: "languages.ja",
      language: "vi",
      attributes: { purpose: ["exam"], level: ["n3"] },
    };
    let lost = false;
    request.mockImplementation(async (path: string) => {
      if (path === "/catalog/requests" && !lost) {
        lost = true;
        throw new Error("Lost response");
      }
      return respond(path);
    });
    const run = createListingSubmission(value);
    await expect(run()).rejects.toThrow("Lost response");
    value.attributes.level[0] = "n2";
    await run();
    const calls = request.mock.calls.filter(
      ([path]) => path === "/catalog/requests",
    );
    expect(calls[0][2]).toEqual(calls[1][2]);
    expect(JSON.parse(calls[1][2].body).metadata).toMatchObject({
      categoryId: "languages.ja",
      language: "vi",
      attributes: { level: ["n3"] },
    });
  });
});
