import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { catalog, listing, type Kind } from "./contracts";
import {
  loadNextReviewPage,
  pendingReviewPath,
  reviewQueuePath,
  reviewReturnPath,
  selectNextReview,
} from "./review-navigation";
import { NextReview } from "./NextReview";
import type { Request } from "../../core/command";

const time = "2026-10-26T10:00:00Z",
  currentId = crypto.randomUUID(),
  reviewerId = crypto.randomUUID();
const metadata = {
  title: "Đầu sách gửi duyệt QA",
  authors: ["Tác giả QA"],
  publisher: null,
  publicationYear: null,
  language: "vi",
  edition: null,
  category: "Văn học",
  isbn: null,
};
function catalogItem(
  requesterId = crypto.randomUUID(),
  id = crypto.randomUUID(),
) {
  return catalog.parse({
    id,
    version: 2,
    status: "Pending",
    requesterId,
    currentRevision: {
      id: crypto.randomUUID(),
      number: 1,
      submittedAt: time,
      metadata,
    },
    decisions: [],
    createdAt: time,
    updatedAt: time,
  });
}

describe("review return context", () => {
  it.each(["PendingReview", "Approved", "Rejected"])(
    "keeps the listing %s filter when returning from detail",
    (status) => {
      expect(
        reviewReturnPath("listings", {
          reviewReturnTo: reviewQueuePath("listings", status),
        }),
      ).toBe(`/review/listings?status=${status}`);
    },
  );
  it.each(["Pending", "Confirmed", "Rejected"])(
    "keeps the catalog %s filter",
    (status) => {
      expect(
        reviewReturnPath("catalog-requests", {
          reviewReturnTo: reviewQueuePath("catalog-requests", status),
        }),
      ).toBe(`/review/catalog-requests?status=${status}`);
    },
  );
  it("rejects external, cross-kind and malformed return routes rather than navigating untrusted history state", () => {
    for (const state of [
      null,
      "https://evil.test",
      {},
      { reviewReturnTo: 123 },
      { reviewReturnTo: "https://evil.test/review/listings" },
      { reviewReturnTo: "//evil.test" },
      { reviewReturnTo: "/review/catalog-requests?status=Confirmed" },
      { reviewReturnTo: "/review/listings/../users?status=Approved" },
    ])
      expect(reviewReturnPath("listings", state)).toBe("/review/listings");
    expect(
      reviewReturnPath("listings", {
        reviewReturnTo:
          "/review/listings?status=Approved&redirect=https://evil.test",
      }),
    ).toBe("/review/listings?status=Approved");
    expect(
      reviewReturnPath("listings", {
        reviewReturnTo: "/review/listings?status=Unknown",
      }),
    ).toBe("/review/listings");
    expect(pendingReviewPath("catalog-requests")).toBe(
      "/review/catalog-requests?status=Pending",
    );
  });
});
describe("next review selection and contract", () => {
  it("skips the reviewer's own request without reordering other pending submissions", () => {
    const self = catalogItem(reviewerId),
      first = catalogItem(),
      second = catalogItem();
    const items = [self, first, second];
    expect(selectNextReview(items, currentId, reviewerId)).toEqual({
      kind: "next",
      item: first,
    });
    expect(items).toEqual([self, first, second]);
    expect(selectNextReview([self], currentId, reviewerId)).toEqual({
      kind: "empty",
    });
    expect(selectNextReview([], currentId, reviewerId)).toEqual({
      kind: "empty",
    });
  });
  it("does not loop into the same listing when it was resubmitted and skips own listing submissions", () => {
    const owned = listing.parse({
      id: crypto.randomUUID(),
      ownerId: reviewerId,
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
        submittedAt: time,
        ownershipDeclaredAt: time,
        decision: null,
        fulfillmentStatus: "NotConfigured",
        content: {
          bookId: null,
          condition: "Good",
          mode: "Sale",
          salePrice: 20000,
          exchangeValue: null,
          pages: "",
          coverNote: "",
          notes: "",
          accessories: "",
          description: "QA",
          readable: true,
          hasMissingPages: false,
          missingEssentialContent: false,
          mediaIds: [],
        },
      },
      latestDecision: null,
      removalReason: null,
      catalogStatus: null,
      createdAt: time,
      updatedAt: time,
    });
    expect(selectNextReview([owned], currentId, reviewerId).kind).toBe("empty");
    expect(
      selectNextReview([{ ...owned, id: currentId }], currentId, reviewerId)
        .kind,
    ).toBe("returned");
  });
  it.each(["listings", "catalog-requests"] as Kind[])(
    "uses the existing pending %s endpoint and propagates transport or schema errors",
    async (kind) => {
      let path = "";
      const request: Request = async (route, schema) => {
        path = route;
        return schema.parse({ items: [], nextCursor: null, serverTime: time });
      };
      expect(await loadNextReviewPage(kind, request)).toEqual({
        items: [],
        nextCursor: null,
        serverTime: time,
      });
      expect(path).toBe(
        kind === "listings"
          ? "/operations/listings?moderation=PendingReview&limit=20"
          : "/operations/catalog-requests?status=Pending&limit=20",
      );
      await expect(
        loadNextReviewPage(kind, async () => {
          throw Error("offline");
        }),
      ).rejects.toThrow("offline");
      const invalid: Request = async (_route, schema) =>
        schema.parse({ items: [], nextCursor: null, serverTime: "bad" });
      await expect(loadNextReviewPage(kind, invalid)).rejects.toThrow();
    },
  );
});
describe("next review states", () => {
  function render(
    items?: ReturnType<typeof catalogItem>[],
    cursor: string | null = null,
    failed = false,
  ) {
    const client = new QueryClient();
    const queryKey = ["review-next", "catalog-requests", currentId, reviewerId];
    if (items)
      client.setQueryData(queryKey, {
        items,
        nextCursor: cursor,
        serverTime: time,
      });
    if (failed)
      client
        .getQueryCache()
        .find({ queryKey })
        ?.setState({ status: "error", error: Error("offline") });
    return renderToStaticMarkup(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <NextReview
            kind="catalog-requests"
            currentId={currentId}
            reviewerId={reviewerId}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    );
  }
  it("distinguishes loading from an empty queue", () => {
    expect(render()).toContain("Đang lấy hồ sơ chờ tiếp theo");
    expect(render()).not.toContain("Chưa có hồ sơ khác");
    expect(render([])).toContain("Chưa có hồ sơ khác");
  });
  it("links to a fresh detail with pending queue context and never exposes a decision control", () => {
    const next = catalogItem();
    const html = render([next]);
    expect(html).toContain(`/review/catalog-requests/${next.id}`);
    expect(html).toContain("Đầu sách gửi duyệt QA");
    expect(html).toContain("Mở hồ sơ tiếp theo");
    expect(html).not.toContain("Xác nhận quyết định");
  });
  it("does not declare the whole queue empty when only a limited page was read", () => {
    const html = render([catalogItem(reviewerId)], "opaque-cursor");
    expect(html).toContain("trang đang tải");
    expect(html).toContain("Xem toàn bộ hàng chờ");
    expect(html).not.toContain("Mở hồ sơ tiếp theo");
  });
  it("shows a resubmission warning instead of navigating back into a stale copy of the same entity", () => {
    const html = render([catalogItem(crypto.randomUUID(), currentId)]);
    expect(html).toContain("vừa xuất hiện lại trong hàng chờ");
    expect(html).not.toContain("Mở hồ sơ tiếp theo");
  });
  it("keeps the last loaded candidate with a stale warning when refresh fails", () => {
    const next = catalogItem();
    const html = render([next], null, true);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Đang giữ hàng chờ lần tải trước");
    expect(html).toContain(`/review/catalog-requests/${next.id}`);
  });
});
