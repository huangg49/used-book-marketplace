import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CurrentUser } from "@used-books/session-client";
import { listing, type Listing, type Metadata } from "../review/contracts";
import type { Request } from "../../core/command";
import { dashboardSources, type DashboardSnapshot } from "./sources";
import { PendingShelf } from "./PendingShelf";
import { selectedShelfItem, shelfReference, shelfTitle } from "./shelf-model";

const time = "2026-10-26T10:00:00.000Z";
const metadata: Metadata = {
  title: "Dế Mèn phiêu lưu ký",
  authors: ["Tô Hoài"],
  publisher: null,
  publicationYear: null,
  language: "vi",
  edition: null,
  category: "Văn học",
  isbn: null,
};
function item(): Listing {
  return listing.parse({
    id: crypto.randomUUID(),
    ownerId: crypto.randomUUID(),
    version: 1,
    channel: "Marketplace",
    state: {
      moderation: "PendingReview",
      visibility: "Hidden",
      trade: "Available",
      deletedAt: null,
    },
    currentRevision: {
      id: crypto.randomUUID(),
      number: 1,
      fulfillmentStatus: "NotConfigured",
      submittedAt: time,
      ownershipDeclaredAt: time,
      decision: null,
      content: {
        bookId: crypto.randomUUID(),
        condition: "Good",
        pages: "Đủ trang",
        coverNote: "Bìa hơi xước",
        notes: "",
        accessories: "",
        description: "Mô tả tình trạng do người đăng cung cấp.",
        readable: true,
        hasMissingPages: false,
        missingEssentialContent: false,
        mediaIds: [crypto.randomUUID()],
        mode: "Both",
        salePrice: 125000,
        exchangeValue: 150000,
      },
    },
    latestDecision: null,
    removalReason: null,
    catalogStatus: "Pending",
    createdAt: time,
    updatedAt: time,
  });
}
function snapshot(items: Listing[]): DashboardSnapshot {
  return {
    value: items.length,
    reviewItems: items,
    rows: [],
    serverTime: time,
  };
}
function render(
  value?: DashboardSnapshot,
  {
    error = null as unknown,
    pending = false,
    admin = true,
    client = new QueryClient(),
  } = {},
) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <PendingShelf
          snapshot={value}
          pending={pending}
          fetching={pending}
          error={error}
          admin={admin}
          retry={() => {}}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("pending shelf permissions and asynchronous selection", () => {
  it("does not resolve private pending metadata for Staff or a rejected catalog reference", () => {
    const value = item();
    expect(shelfReference(value, false)).toBeNull();
    expect(shelfReference(value, true)?.path).toBe(
      `/operations/catalog-requests/${value.currentRevision.content.bookId}`,
    );
    value.catalogStatus = "Rejected";
    expect(shelfReference(value, true)).toBeNull();
    value.catalogStatus = "Confirmed";
    expect(shelfReference(value, false)?.path).toBe(
      `/catalog/books/${value.currentRevision.content.bookId}`,
    );
    value.currentRevision.content.bookId = null;
    expect(shelfReference(value, true)).toBeNull();
  });
  it("keeps selection by identity across reordering and falls back when the item leaves the queue", () => {
    const a = item(),
      b = item(),
      refreshed = { ...b, version: 2 };
    expect(selectedShelfItem([a, b], b.id)).toBe(b);
    expect(selectedShelfItem([refreshed, a], b.id)).toBe(refreshed);
    expect(selectedShelfItem([a], b.id)).toBe(a);
    expect(selectedShelfItem([], b.id)).toBeUndefined();
  });
  it("keeps the queue order, counts the loaded page truthfully and limits image/metadata work to six listings", async () => {
    const items = Array.from({ length: 20 }, item);
    const user: CurrentUser = {
      id: crypto.randomUUID(),
      displayName: "Staff",
      email: "staff@example.test",
      roles: ["STAFF"],
      status: "ACTIVE",
    };
    const source = dashboardSources(user).find(
      (value) => value.id === "listings",
    )!;
    const request: Request = async (_path, schema) =>
      schema.parse({
        items,
        nextCursor: crypto.randomUUID(),
        serverTime: time,
      });
    const data = await source.load(request);
    expect(data.value).toBe(20);
    expect(data.more).toBe(true);
    expect(data.reviewItems?.map((value) => value.id)).toEqual(
      items.slice(0, 6).map((value) => value.id),
    );
  });
  it("uses the declared bundle title and never treats its optional reference as a single catalog book", () => {
    const value = item();
    value.currentRevision.content.bundle = {
      title: "Naruto — tập 1 đến 20",
      wholeOnly: true,
      exclusiveOwnershipDeclared: true,
      items: [
        { label: "Tập 1", condition: "Good", notes: "" },
        { label: "Tập 2", condition: "Fair", notes: "Gáy xước" },
      ],
    };
    expect(shelfTitle(value, metadata)).toBe("Naruto — tập 1 đến 20");
    expect(shelfReference(value, true)).toBeNull();
    const html = render(snapshot([value]));
    expect(html).toContain("Chỉ bán nguyên bộ");
    expect(html).toContain("Theo từng cuốn trong hồ sơ bộ");
  });
  it("does not manufacture book titles from a condition description", () => {
    const value = item();
    expect(shelfTitle(value)).toBe(`Bài đăng #${value.id.slice(0, 8)}`);
    expect(shelfTitle(value, metadata)).toBe(metadata.title);
  });
});

describe("pending shelf data states", () => {
  it("distinguishes initial loading and a failed initial request from an empty queue", () => {
    const loading = render(undefined, { pending: true });
    expect(loading).toContain("Đang xếp hồ sơ lên kệ");
    expect(loading).not.toContain("Kệ đang trống");
    const failed = render(undefined, { error: new Error("offline") });
    expect(failed).toContain('role="alert"');
    expect(failed).toContain("Thử tải lại");
    expect(failed).not.toContain("Kệ đang trống");
  });
  it("keeps the last snapshot when refresh fails and links to the authoritative detail", () => {
    const value = item();
    const html = render(snapshot([value]), { error: new Error("offline") });
    expect(html).toContain("Đang giữ lần tải trước");
    expect(html).toContain(`/review/listings/${value.id}`);
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain("Kệ đang trống");
    expect(html).not.toContain("<form");
    expect(html).not.toContain(">Duyệt bài đăng<");
  });
  it("offers a useful empty state without sample books or fake pending counts", () => {
    const html = render(snapshot([]));
    expect(html).toContain("Kệ đang trống");
    expect(html).toContain("Cập nhật kệ sách");
    expect(html).toContain("/review/listings?status=Approved");
    expect(html).not.toContain('aria-pressed="true"');
    expect(html).not.toContain("<img");
  });
  it("keeps a no-image placeholder and the detail path when media is absent", () => {
    const value = item();
    value.currentRevision.content.mediaIds = [];
    const html = render(snapshot([value]));
    expect(html).toContain("Chưa có ảnh");
    expect(html).toContain(`/review/listings/${value.id}`);
    expect(html).not.toContain("<img");
  });
  it("renders the private read URL as a non-referring, uncropped image and keeps separate labelled prices", () => {
    const value = item(),
      client = new QueryClient();
    client.setQueryData(
      ["review-media", value.id, value.currentRevision.content.mediaIds[0]],
      {
        id: value.currentRevision.content.mediaIds[0],
        url: "https://media.example.test/signed-cover.png",
        width: 600,
        height: 800,
        expiresAt: time,
      },
    );
    client.setQueryData(
      ["book-reference", value.currentRevision.content.bookId, false, true],
      metadata,
    );
    const html = render(snapshot([value]), { client });
    expect(html).toContain('src="https://media.example.test/signed-cover.png"');
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).toContain(`Xem nhanh: ${metadata.title}`);
    expect(html).toContain("Giá bán");
    expect(html).toContain("Giá trị đổi");
    expect(html).toContain("125.000");
    expect(html).toContain("150.000");
  });
});
