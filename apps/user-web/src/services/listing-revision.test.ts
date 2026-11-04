import { beforeEach, describe, expect, it, vi } from "vitest";
import { session } from "./api";
import {
  createListingRevision,
  createDraftSubmission,
  createDraftSave,
} from "./listing-revision";
import { upload } from "./listing-submission";

vi.mock("./api", () => ({ session: { request: vi.fn() } }));
vi.mock("./listing-submission", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./listing-submission")>()),
  upload: vi.fn(),
}));

const request = vi.mocked(session.request);
const uploadMock = vi.mocked(upload);
const id = "11111111-1111-4111-8111-111111111111";
const media = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const content = {
  bookId: "book-1",
  mode: "Sale" as const,
  condition: "Good" as const,
  pages: "p",
  coverNote: "c",
  notes: "n",
  accessories: "a",
  description: "d".repeat(30),
  readable: true as const,
  hasMissingPages: false,
  missingEssentialContent: false as const,
  salePrice: 60000,
  exchangeValue: null,
  fulfillment: null,
};

const revisionCalls = () =>
  request.mock.calls.filter(([path]) => String(path).endsWith("/revision"));

describe("createListingRevision", () => {
  beforeEach(() => {
    request.mockReset();
    uploadMock.mockReset();
  });

  it("posts one revision body without owner or state fields", async () => {
    request.mockResolvedValueOnce({ entityId: id, version: 5 });
    uploadMock.mockResolvedValueOnce(media(2));
    const run = createListingRevision({
      listingId: id,
      version: 4,
      photos: [
        { kind: "existing", id: media(1) },
        { kind: "new", file: new File(["x"], "a.png", { type: "image/png" }) },
      ],
      content,
    });
    await run();
    const [path, , init] = request.mock.calls[0];
    expect(path).toBe(`/listings/${id}/revision`);
    const body = JSON.parse(String(init?.body));
    expect(body.expectedVersion).toBe(4);
    expect(body.ownershipDeclared).toBe(true);
    expect(body.content.mediaIds).toEqual([media(1), media(2)]);
    expect(body.content.bookId).toBe("book-1");
    expect(body.ownerId).toBeUndefined();
    expect(body.state).toBeUndefined();
    expect(uploadMock.mock.calls[0][1]).toBe(4);
  });

  it("retries with the same key and body, and does not rebase the version", async () => {
    request
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ entityId: id, version: 5 });
    const run = createListingRevision({
      listingId: id,
      version: 4,
      photos: [{ kind: "existing", id: media(1) }],
      content,
    });
    await expect(run()).rejects.toThrow("network");
    await run();
    const calls = revisionCalls();
    expect(calls).toHaveLength(2);
    expect(calls[1][2]?.headers).toEqual(calls[0][2]?.headers);
    expect(calls[1][2]?.body).toBe(calls[0][2]?.body);
    expect(JSON.parse(String(calls[1][2]?.body)).expectedVersion).toBe(4);
  });

  it("rejects an empty photo list before any request", async () => {
    const run = createListingRevision({
      listingId: id,
      version: 4,
      photos: [],
      content,
    });
    await expect(run()).rejects.toThrow(/ảnh/);
    expect(request).not.toHaveBeenCalled();
  });
  it("freezes bundle contents and existing photos across edits and a lost revision response", async () => {
    const bundle = { title: "Bộ hai tập", wholeOnly: true as const, exclusiveOwnershipDeclared: true as const,
      items: [{ label: "Tập 1", condition: "Good" as const, notes: "" }, { label: "Tập 3", condition: "Good" as const, notes: "Không bao gồm tập 2." }] };
    const input = { listingId: id, version: 4, photos: [{ kind: "existing" as const, id: media(1) }], content: { ...content, bundle } };
    const original = structuredClone(bundle);
    request.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({ entityId: id, version: 5 });
    const run = createListingRevision(input);
    input.content.bundle.items[1].notes = "Đã thay đổi ở form";
    input.photos[0].id = media(2);
    await expect(run()).rejects.toThrow("network");
    input.content.bundle.items.pop();
    await run();
    const calls = revisionCalls();
    expect(calls[1][2]).toEqual(calls[0][2]);
    expect(JSON.parse(String(calls[1][2]?.body)).content).toMatchObject({ bundle: original, mediaIds: [media(1)] });
  });

  describe("createDraftSubmission", () => {
    it("saves working draft and then submits for moderation in sequence", async () => {
      request
        .mockResolvedValueOnce({ entityId: id, version: 3 }) // save draft
        .mockResolvedValueOnce({ entityId: id, version: 4 }); // submit
      const run = createDraftSubmission({
        listingId: id,
        version: 2,
        photos: [{ kind: "existing", id: media(1) }],
        content,
        bookId: "book-1",
      });
      const result = await run();
      expect(result).toEqual({ entityId: id, version: 4 });

      expect(request).toHaveBeenCalledTimes(2);
      const [draftPath, , draftInit] = request.mock.calls[0];
      expect(draftPath).toBe(`/listings/${id}/draft`);
      expect(draftInit?.method).toBe("PUT");
      const draftBody = JSON.parse(String(draftInit?.body));
      expect(draftBody.expectedVersion).toBe(2);
      expect(draftBody.content.bookId).toBe("book-1");
      expect(draftBody.content.mediaIds).toEqual([media(1)]);

      const [submitPath, , submitInit] = request.mock.calls[1];
      expect(submitPath).toBe(`/listings/${id}/submit`);
      expect(submitInit?.method).toBe("POST");
      const submitBody = JSON.parse(String(submitInit?.body));
      expect(submitBody.expectedVersion).toBe(3);
      expect(submitBody.ownershipDeclared).toBe(true);
    });

    it("rejects an empty photo list", async () => {
      const run = createDraftSubmission({
        listingId: id,
        version: 2,
        photos: [],
        content,
        bookId: "book-1",
      });
      await expect(run()).rejects.toThrow(/ảnh/);
      expect(request).not.toHaveBeenCalled();
    });
  });

  describe("createDraftSave", () => {
    it("does not cache a receipt for another listing and retries the same save", async () => {
      let first = true;
      request.mockImplementation(async (_path, schema) => {
        const entityId = first ? media(9) : id;
        first = false;
        return schema.parse({ entityId, version: 3 });
      });
      const run = createDraftSave({ listingId: id, version: 2,
        photos: [{ kind: "existing", id: media(1) }], content, bookId: "book-1" });
      await expect(run()).rejects.toThrow(/không thuộc/);
      await run();
      expect(request).toHaveBeenCalledTimes(2);
      const a = request.mock.calls[0]!, b = request.mock.calls[1]!;
      expect(a[0] === b[0] && JSON.stringify(a[2]) === JSON.stringify(b[2])).toBe(true);
    });
    it("saves draft without calling submit", async () => {
      request.mockResolvedValueOnce({ entityId: id, version: 3 });
      const run = createDraftSave({
        listingId: id,
        version: 2,
        photos: [{ kind: "existing", id: media(1) }],
        content,
        bookId: "book-1",
      });
      const result = await run();
      expect(result).toEqual({ entityId: id, version: 3 });

      expect(request).toHaveBeenCalledTimes(1);
      const [draftPath, , draftInit] = request.mock.calls[0];
      expect(draftPath).toBe(`/listings/${id}/draft`);
      expect(draftInit?.method).toBe("PUT");
    });
  });
});
