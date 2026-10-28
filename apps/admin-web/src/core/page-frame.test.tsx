import { lazy, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PageFrame, PageLoadError, PageLoading } from "./page-frame";

describe("deferred page feedback", () => {
  it("announces pending page content without presenting a fake empty list", () => {
    const html = renderToStaticMarkup(<PageLoading />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Đang mở trang…");
    expect(html).not.toContain("Không có");
  });
  it("offers explicit reload and another route without reloading during render", () => {
    // No window exists in this test. Rendering must never reload automatically.
    const html = renderToStaticMarkup(
      <MemoryRouter><PageLoadError dashboard={false} /></MemoryRouter>,
    );
    expect(html).toContain("Chưa mở được trang này.");
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("Bạn sẽ cần đăng nhập lại.");
    expect(html).toContain("Tải lại trang</button>");
    expect(html).toContain('href="/dashboard"');
  });
  it("does not send a failed Dashboard back to the same failed route", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter><PageLoadError dashboard /></MemoryRouter>,
    );
    expect(html).not.toContain("Về tổng quan");
    expect(html).toContain("Tải lại trang</button>");
  });
  it("keeps the workspace outside pending content and renders the resolved page", async () => {
    let resolvePage!: (value: { default: () => ReactNode }) => void;
    const module = new Promise<{ default: () => ReactNode }>(resolve => { resolvePage = resolve; });
    const Page = lazy(() => module);
    const view = (
      <MemoryRouter initialEntries={["/users"]}>
        <nav>Bàn quản trị Lật lại</nav>
        <PageFrame><Page /></PageFrame>
      </MemoryRouter>
    );
    const loading = renderToStaticMarkup(view);
    expect(loading).toContain("Bàn quản trị Lật lại");
    expect(loading).toContain("Đang mở trang…");
    expect(loading).not.toContain("Danh sách đã sẵn sàng");
    resolvePage({ default: () => <h1>Danh sách đã sẵn sàng</h1> });
    await module;
    const ready = renderToStaticMarkup(view);
    expect(ready).toContain("Danh sách đã sẵn sàng");
    expect(ready).toContain("Bàn quản trị Lật lại");
    expect(ready).not.toContain("Đang mở trang…");
  });
});
