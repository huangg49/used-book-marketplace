import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ListFeedback } from "./list-feedback";
import { CursorPagination } from "./ui";

const idle = {
  data: undefined as unknown, error: null as unknown, isPending: false,
  isFetching: false, refetch: async () => undefined,
};
describe("list recovery feedback", () => {
  it("announces initial loading without claiming an empty list", () => {
    const html = renderToStaticMarkup(<ListFeedback result={{ ...idle, isPending: true }} loadingText="Đang tải người dùng…" />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Đang tải người dùng…");
    expect(html).not.toContain("lần tải trước");
  });
  it("distinguishes a first-load error from retained data", () => {
    const html = renderToStaticMarkup(<ListFeedback result={{ ...idle, error: new Error("offline") }} loadingText="Đang tải…" />);
    expect(html).toContain("Thử tải lại");
    expect(html).not.toContain("lần tải trước");
  });
  it("keeps even an empty previous page explicit after a failed refresh", () => {
    const html = renderToStaticMarkup(<ListFeedback result={{ ...idle, data: { items: [] }, error: new Error("offline") }} loadingText="Đang tải…" />);
    expect(html).toContain("Đang giữ danh sách lần tải trước");
    expect(html).not.toContain("Đã tải hết");
  });
  it("does not offer a full-list retry for a next-page error", () => {
    const html = renderToStaticMarkup(<ListFeedback result={{ ...idle, data: {}, error: new Error("offline"), isFetchNextPageError: true }} loadingText="Đang tải…" />);
    expect(html).toBe("");
  });
  it("prevents retry during a pending operation", () => {
    const html = renderToStaticMarkup(<ListFeedback result={{ ...idle, error: new Error("offline") }} loadingText="Đang tải…" retryDisabled />);
    expect(html).toMatch(/disabled=""/);
  });
  it("announces background refresh without replacing visible data", () => {
    const html = renderToStaticMarkup(<ListFeedback result={{ ...idle, data: {}, isFetching: true }} loadingText="Đang tải…" />);
    expect(html).toContain("Đang cập nhật danh sách…");
    expect(html).not.toContain("Đang tải…");
  });
});

const pagination = { pageCount: 1, hasNextPage: true, isFetching: false,
  isFetchingNextPage: false, onNextPage: () => undefined, nextLabel: "Xem thêm hồ sơ" };
describe("cursor pagination", () => {
  it("does not imply any pages were loaded before the first response", () => {
    expect(renderToStaticMarkup(<CursorPagination {...pagination} pageCount={0} />)).toBe("");
  });
  it("keeps the loaded page count at the end of the list", () => {
    const html = renderToStaticMarkup(<CursorPagination {...pagination} pageCount={2} hasNextPage={false} />);
    expect(html).toContain("Đã tải 2 trang. Đã tải hết danh sách.");
    expect(html).not.toContain("<button");
  });
  it("only retries the next page and does not claim completion on error", () => {
    const html = renderToStaticMarkup(<CursorPagination {...pagination} error={new Error("offline")} />);
    expect(html).toContain("Danh sách đã tải vẫn được giữ");
    expect(html).toContain("Thử tải thêm");
    expect(html).not.toContain("Thử tải lại");
    expect(html).not.toContain("Đã tải hết");
  });
  it("disables loading more during a refresh, not just a next-page request", () => {
    const html = renderToStaticMarkup(<CursorPagination {...pagination} isFetching />);
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('aria-busy="true"');
  });
});
