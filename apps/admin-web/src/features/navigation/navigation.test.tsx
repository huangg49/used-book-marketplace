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
      "/dashboard", "/review/listings", "/transaction-reviews", "/operations/intakes", "/operations/collections", "/operations/incidents",
    ]);
  });
  it("does not give an Admin without Staff the custody desks or carrier simulator", () => {
    expect(paths({ ...base, roles: ["ADMIN"] })).toEqual([
      "/dashboard", "/review/listings", "/transaction-reviews", "/review/catalog-requests", "/operations/incidents",
      "/operations/resolutions", "/operations/auctions", "/operations/escalations", "/operations/points", "/users",
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
    expect(links).toHaveLength(16);
    expect(new Set(links).size).toBe(links.length);
    expect(workspaceRole(user)).toBe("Quản trị viên · Nhân viên · Vận hành thử");
    expect(workspaceRole(undefined)).toBe("Chờ xác minh quyền");
  });
});

describe("sidebar route semantics", () => {
  it("keeps the current operations group open in compact mode without hiding the dashboard or directory", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/operations/resolutions/order-1"]}>
      <SidebarNavigation user={{ ...base, roles: ["ADMIN"] }} compact />
    </MemoryRouter>);
    expect(html).toMatch(/aria-expanded="true" aria-controls="nav-items-operations"/);
    expect(html).toMatch(/aria-expanded="false" aria-controls="nav-items-review"/);
    expect(html).toMatch(/id="nav-items-review" hidden=""/);
    expect(html).not.toMatch(/id="nav-items-operations" hidden/);
    expect(html).not.toMatch(/id="nav-items-workspace" hidden/);
    expect(html).not.toMatch(/id="nav-items-management" hidden/);
  });
  it("opens review as a compact starting group while preserving simulator access for its own role", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/dashboard"]}>
      <SidebarNavigation user={{ ...base, roles: ["STAFF", "TEST_OPERATOR"] }} compact />
    </MemoryRouter>);
    expect(html).toMatch(/aria-expanded="true" aria-controls="nav-items-review"/);
    expect(html).toMatch(/aria-expanded="false" aria-controls="nav-items-simulation"/);
    expect(html).toContain('href="/simulator/deliveries"');
    expect(html).not.toContain('href="/users"');
  });
  it("keeps a parent review link active on a detail route and exposes the connected dashboard without a mock label", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/review/listings/book-1"]}>
      <SidebarNavigation user={{ ...base, roles: ["ADMIN"] }} />
    </MemoryRouter>);
    const listing = html.match(/<a\b[^>]*href="\/review\/listings"[^>]*>/)?.[0];
    expect(listing).toContain('aria-current="page"');
    expect(listing).toContain('aria-label="Bài đăng sách"');
    expect(html).toContain('aria-label="Dashboard"');
    expect(html).not.toContain("mock-nav-label");
    expect(html).toContain('aria-disabled="true" title="Report · Sắp triển khai"');
    expect(html).not.toContain('href="/operations/intakes"');
  });
});
