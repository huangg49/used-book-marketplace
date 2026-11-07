import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@used-books/session-client";
import { StatisticsPage } from "./StatisticsPage";

const useQuery = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery,
  useQueryClient: () => ({ removeQueries: vi.fn() }),
}));
vi.mock("react-router-dom", () => ({
  useOutletContext: () => ({ id: "staff", status: "ACTIVE", roles: ["STAFF"] }),
}));

const data = {
  from: "2026-01-01",
  to: "2026-01-01",
  total: 40000,
  orderSettlements: 1,
  daily: [{ date: "2026-01-01", amount: 40000, orderSettlements: 1 }],
  page: 1,
  pageSize: 10,
  totalTransactions: 1,
  transactions: [{
    id: "entry",
    type: "OrderSettlement",
    label: "Hoa hồng",
    amount: 40000,
    postedAt: "2026-01-01T01:00:00.000Z",
    referenceId: "private-report-reference",
  }],
};
const render = (status: number) => {
  useQuery.mockReturnValue({
    data,
    isError: true,
    error: new ApiError(status, "TEST", "Fixture"),
    isFetching: false,
  });
  return renderToStaticMarkup(<StatisticsPage />);
};

describe("cached revenue after a refresh failure", () => {
  it.each([401, 403])("withholds the report after HTTP %s", (status) => {
    const html = render(status);
    expect(html).toContain("Không có quyền xem thống kê");
    expect(html).not.toContain("private-report-reference");
    expect(html).not.toContain("Biểu đồ xu hướng doanh thu");
  });

  it("keeps readable data with a stale label after a service outage", () => {
    const html = render(503);
    expect(html).toContain("private-report-reference");
    expect(html).toContain("Dữ liệu lần trước");
    expect(html).not.toContain("Đã cập nhật");
  });
});
