import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { navigationGroups, workspaceRole } from "./navigation";
import { SidebarNavigation } from "./WorkspaceShell";

const base: CurrentUser = { id: crypto.randomUUID(), email: "operator@example.test", displayName: "Người vận hành", status: "ACTIVE", roles: [] };
const paths = (user: CurrentUser | undefined) => navigationGroups(user).flatMap(group => group.items.map(item => item.to));

describe("workspace navigation permissions", () => {
  it("shows Staff's desks without Admin decisions, directory or catalog review", () => {
    expect(paths({ ...base, roles: ["STAFF"] })).toEqual([
      "/dashboard",
      "/statistics/operations",
      "/statistics",
      "/review/listings",
      "/ai-review-checks",
      "/transaction-reviews",
      "/operations/exchange-disputes",
      "/operations/intakes",
      "/operations/collections",
      "/operations/incidents",
    ]);
  });
  it("gives Admin the auction intake desk while reserving collection and simulation for their own roles", () => {
    expect(paths({ ...base, roles: ["ADMIN"] })).toEqual([
      "/dashboard",
      "/statistics/finance",
      "/statistics/cashflow",
      "/statistics/operations",
      "/statistics",
      "/review/catalog-requests",
      "/review/listings",
      "/ai-review-checks",
      "/transaction-reviews",
      "/operations/exchange-disputes",
      "/operations/auction-disputes",
      "/support",
      "/operations/intakes",
      "/operations/resolutions",
      "/operations/incidents",
      "/operations/escalations",
      "/operations/points",
      "/operations/auctions",
      "/users",
      "/withdrawals",
    ]);
  });
  it("limits TEST_OPERATOR to the dashboard and carrier simulator", () => {
    expect(paths({ ...base, roles: ["TEST_OPERATOR"] })).toEqual(["/dashboard", "/simulator/deliveries", "/simulator/events/pickups", "/simulator/events/deliveries", "/simulator/events/topups"]);
  });
  it.each(["RESTRICTED", "LOCKED"] as const)("shows no protected links for %s even with every role", status => {
    expect(paths({ ...base, status, roles: ["ADMIN", "STAFF", "TEST_OPERATOR"] })).toEqual([]);
  });
  it("shows no protected links before profile verification or for a Member", () => {
    expect(paths(undefined)).toEqual([]);
    expect(paths({ ...base, roles: ["MEMBER"] })).toEqual([]);
  });
  it("combines actual roles without duplicate links or a guessed account role", () => {
    const user = { ...base, roles: ["ADMIN", "STAFF", "TEST_OPERATOR"] } satisfies CurrentUser;
    const links = paths(user);
    expect(links).toHaveLength(25);
    expect(new Set(links).size).toBe(links.length);
    expect(workspaceRole(user)).toBe("Quản trị viên · Nhân viên · Vận hành thử");
    expect(workspaceRole(undefined)).toBe("Chờ xác minh quyền");
  });
});

describe("sidebar route semantics", () => {
  it("opens the current operations group for a deep link and keeps the overview visible", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/operations/resolutions/order-1"]}>
      <SidebarNavigation user={{ ...base, roles: ["ADMIN"] }} />
    </MemoryRouter>);
    expect(html).toMatch(/aria-expanded="true" aria-controls="nav-items-operations"/);
    expect(html).toMatch(/aria-expanded="false" aria-controls="nav-items-review"/);
    expect(html).toMatch(/id="nav-items-review" hidden=""/);
    expect(html).not.toMatch(/id="nav-items-operations" hidden/);
    expect(html).not.toMatch(/id="nav-items-workspace" hidden/);
    expect(html).toMatch(/id="nav-items-management" hidden=""/);
  });
  it("opens statistics on overview and exposes Staff’s single complaint destination directly", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/dashboard"]}>
      <SidebarNavigation user={{ ...base, roles: ["STAFF", "TEST_OPERATOR"] }} />
    </MemoryRouter>);
    expect(html).toMatch(/aria-expanded="true" aria-controls="nav-items-statistics"/);
    expect(html).toMatch(/aria-expanded="false" aria-controls="nav-items-simulation"/);
    expect(html).toContain('href="/simulator/deliveries"');
    expect(html).not.toMatch(/id="nav-items-cases" hidden/);
    expect(html).not.toContain('aria-controls="nav-items-cases"');
    expect(html).toContain('href="/operations/exchange-disputes"');
    expect(html).not.toContain('href="/users"');
  });
  it("keeps a parent review link active on a detail route and exposes the connected dashboard without a mock label", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/review/listings/book-1"]}>
      <SidebarNavigation user={{ ...base, roles: ["ADMIN"] }} />
    </MemoryRouter>);
    const listing = html.match(/<a\b[^>]*href="\/review\/listings"[^>]*>/)?.[0];
    expect(listing).toContain('aria-current="page"');
    expect(listing).toContain('aria-label="Bài đăng sách"');
    expect(html).toContain('aria-label="Tổng quan"');
    expect(html).not.toContain("mock-nav-label");
    expect(html).not.toContain("Sắp triển khai");
    expect(html).toContain('href="/operations/intakes"');
    expect(html).not.toContain('href="/operations/collections"');
  });
});
