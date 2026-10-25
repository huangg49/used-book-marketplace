import { beforeEach, describe, expect, it, vi } from "vitest";
import { session } from "./api";
import { createListingRevision } from "./listing-revision";
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
});
