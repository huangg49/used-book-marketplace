import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Pagination } from "./Pagination";

describe("Pagination Component", () => {
  it("renders correctly with full numbered pagination", () => {
    const html = renderToStaticMarkup(
      <Pagination
        page={2}
        totalPages={5}
        totalItems={50}
        pageSize={10}
        itemLabel="giao dịch"
        onPageChange={() => undefined}
      />
    );

    expect(html).toContain('aria-label="Điều hướng phân trang"');
    expect(html).toContain("Hiển thị");
    expect(html).toContain("11–20");
    expect(html).toContain("50");
    expect(html).toContain("giao dịch");
    expect(html).toContain('aria-label="Trang 1"');
    expect(html).toContain('aria-label="Trang 2"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('title="Trang tiếp theo"');
  });

  it("disables previous button on first page", () => {
    const html = renderToStaticMarkup(
      <Pagination
        page={1}
        totalPages={3}
        onPageChange={() => undefined}
      />
    );

    expect(html).toContain('title="Trang trước"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Đến trang trước"/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="Đến trang tiếp theo"/);
  });

  it("disables next button on last page", () => {
    const html = renderToStaticMarkup(
      <Pagination
        page={3}
        totalPages={3}
        onPageChange={() => undefined}
      />
    );

    expect(html).toContain('title="Trang tiếp theo"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Đến trang tiếp theo"/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="Đến trang trước"/);
  });

  it("renders ellipsis when total pages is large", () => {
    const html = renderToStaticMarkup(
      <Pagination
        page={5}
        totalPages={10}
        onPageChange={() => undefined}
      />
    );

    expect(html).toContain("…");
    expect(html).toContain('aria-label="Trang 1"');
    expect(html).toContain('aria-label="Trang 10"');
  });

  it("renders simple variant without page numbers", () => {
    const html = renderToStaticMarkup(
      <Pagination
        page={2}
        hasPrev={true}
        hasNext={true}
        variant="simple"
        onPageChange={() => undefined}
      />
    );

    expect(html).toContain("Trang 2");
    expect(html).not.toContain('aria-label="Trang 1"');
  });

  it("clamps a stale page after a list shrinks", () => {
    const html = renderToStaticMarkup(<Pagination page={5} totalPages={2} totalItems={20} onPageChange={() => undefined} />);
    expect(html).toContain("11–20 trong 20 mục");
    expect(html).toMatch(/aria-current="page" aria-label="Trang 2"/);
    expect(html).not.toContain("41–20");
  });

  it.each([0, 1])("hides a known %i-page result when requested", (totalPages) => {
    expect(renderToStaticMarkup(<Pagination page={3} totalPages={totalPages} hideOnSinglePage onPageChange={() => undefined} />)).toBe("");
  });

  it("does not invent a total for cursor results", () => {
    const html = renderToStaticMarkup(<Pagination page={3} itemCount={5} hasNext variant="simple" onPageChange={() => undefined} />);
    expect(html).toContain("Hiển thị 21–25 mục");
    expect(html).not.toContain("trong");
    expect(html).not.toContain('aria-label="Trang 1"');
  });

  it("compact uses one page indicator even with known totals", () => {
    const html = renderToStaticMarkup(<Pagination page={5} totalPages={40} totalItems={400} variant="compact" onPageChange={() => undefined} />);
    expect(html).toContain("Trang 5 / 40");
    expect(html).not.toContain("Hiển thị");
    expect(html).not.toContain('aria-label="Trang 1"');
  });

  it("normalizes non-finite and empty values without an enabled direction", () => {
    const html = renderToStaticMarkup(<Pagination page={NaN} pageSize={0} totalItems={0} hasNext hasPrev onPageChange={() => undefined} />);
    expect(html).toContain("Chưa có mục");
    expect(html).not.toContain("NaN");
    expect((html.match(/disabled=""/g) ?? []).length).toBe(2);
  });

  it("loading disables every navigation control", () => {
    const html = renderToStaticMarkup(<Pagination page={2} totalPages={3} isLoading onPageChange={() => undefined} />);
    expect(html).toContain('aria-busy="true"');
    expect((html.match(/disabled=""/g) ?? []).length).toBe(5);
  });
});
