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
});
