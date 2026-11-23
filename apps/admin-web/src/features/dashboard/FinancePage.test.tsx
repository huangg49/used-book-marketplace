import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@used-books/session-client";
import { FinancePage } from "./FinancePage";
import type { FinanceOverview } from "./finance";

const useQuery = vi.hoisted(() => vi.fn());
const outletUser = vi.hoisted(() => ({
  current: {
    id: "admin-1",
    email: "admin@example.test",
    displayName: "Admin",
    status: "ACTIVE",
    roles: ["ADMIN"],
  } as CurrentUser,
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery,
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useOutletContext: () => outletUser.current,
}));

const sampleData: FinanceOverview = {
  from: "2026-11-01",
  to: "2026-11-07",
  timezone: "Asia/Ho_Chi_Minh",
  serverTime: "2026-11-08T01:00:00.000Z",
  simulated: true,
  current: {
    directCommission: 10000,
    auctionCommission: 20000,
    forfeitedDeposits: 40000,
    depositShare: 20000,
    legacyListingFees: 0,
    netRevenue: 50000,
    passThroughShipping: 30000,
    incidentCompensation: 80000,
    profit: -30000,
    gmv: 600000,
    settledOrders: 2,
    takeRateBps: 500,
  },
  previous: {
    from: "2026-10-25",
    to: "2026-10-31",
    totals: {
      directCommission: 5000,
      auctionCommission: 0,
      forfeitedDeposits: 0,
      depositShare: 0,
      legacyListingFees: 0,
      netRevenue: 5000,
      passThroughShipping: 0,
      incidentCompensation: 0,
      profit: 5000,
      gmv: 100000,
      settledOrders: 1,
      takeRateBps: 500,
    },
  },
  daily: [
    {
      date: "2026-11-01",
      directCommission: 10000,
      auctionCommission: 20000,
      forfeitedDeposits: 40000,
      depositShare: 20000,
      netRevenue: 50000,
      incidentCompensation: 80000,
      profit: -30000,
      gmv: 600000,
      settledOrders: 2,
    },
  ],
  exchange: {
    completed: 3,
    initiatorValue: 250000,
    recipientValue: 270000,
  },
  notes: ["Dữ liệu mô phỏng."],
};

describe("FinancePage", () => {
  it("renders negative profit clearly with loss label and separates pass-through shipping", () => {
    outletUser.current = {
      id: "admin-1",
      email: "admin@example.test",
      displayName: "Admin",
      status: "ACTIVE",
      roles: ["ADMIN"],
    };
    useQuery.mockReturnValue({
      data: sampleData,
      isPending: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/statistics/finance"]}>
        <FinancePage />
      </MemoryRouter>,
    );

    expect(html).toContain("Lợi nhuận ròng (Đang lỗ)");
    expect(html).toContain("Phí ship chặng giao từ điểm");
    expect(html).toContain("Thu hộ");
    expect(html).toContain("Khối lượng Trao đổi sách");
    expect(html).toContain("5,00%");
  });

  it("denies STAFF access to finance report and hides admin-only tabs", () => {
    outletUser.current = {
      id: "staff-1",
      email: "staff@example.test",
      displayName: "Staff",
      status: "ACTIVE",
      roles: ["STAFF"],
    };
    useQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/statistics/finance"]}>
        <FinancePage />
      </MemoryRouter>,
    );

    expect(html).toContain("Không có quyền xem báo cáo tài chính");
    expect(html).not.toContain("Bảng cơ cấu Thu");
  });
});

