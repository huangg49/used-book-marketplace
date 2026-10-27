import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MemoryRouter,
  Outlet,
  Route,
  Routes,
  useOutletContext,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CurrentUser } from "@used-books/session-client";
import { Queue } from "./queue";
import { catalog, type Catalog } from "./contracts";

const admin: CurrentUser = {
  id: crypto.randomUUID(),
  displayName: "QA Admin",
  email: "qa@example.test",
  roles: ["ADMIN"],
  status: "ACTIVE",
};
const time = "2026-10-27T10:00:00Z";
const item: Catalog = catalog.parse({
  id: crypto.randomUUID(),
  version: 3,
  status: "Confirmed",
  requesterId: crypto.randomUUID(),
  createdAt: time,
  updatedAt: time,
  currentRevision: {
    id: crypto.randomUUID(),
    number: 2,
    submittedAt: time,
    metadata: {
      title: "Tên đầu sách đã xác nhận",
      authors: ["Tác giả QA"],
      publisher: null,
      publicationYear: null,
      language: "vi",
      category: "Văn học",
      edition: null,
      isbn: null,
    },
  },
  decisions: [],
});
function Child() {
  const user = useOutletContext<CurrentUser>();
  return <p>Đúng ngữ cảnh {user.displayName}</p>;
}
function render(path: string, user = admin) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(["queue", "catalog-requests", "Confirmed", user.id], {
    pages: [{ items: [item], nextCursor: null, serverTime: time }],
    pageParams: [""],
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Outlet context={user} />}>
            <Route path="/review/:kind" element={<Queue />}>
              <Route path=":id" element={<Child />} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe("two-region review workspace", () => {
  it("keeps a reviewed filter in every dossier link and never invents a total queue count", () => {
    const html = render("/review/catalog-requests?status=Confirmed");
    expect(html).toContain("Tên đầu sách đã xác nhận");
    expect(html).toContain(
      `/review/catalog-requests/${item.id}?status=Confirmed`,
    );
    expect(html).toContain("1 hồ sơ đã tải");
    expect(html).toContain("Mở hồ sơ đầu tiên");
  });
  it("renders the child with the authenticated context and identifies the selected row", () => {
    const html = render(`/review/catalog-requests/${item.id}?status=Confirmed`);
    expect(html).toContain("Đúng ngữ cảnh QA Admin");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Hồ sơ 1 / 1 đã tải");
    expect(html).not.toContain("Mở hồ sơ đầu tiên");
  });
  it("does not mount a nested catalog dossier for a Staff deep link", () => {
    const html = render(`/review/catalog-requests/${item.id}`, {
      ...admin,
      roles: ["STAFF"],
    });
    expect(html).toContain("Không có quyền xem");
    expect(html).not.toContain("Đúng ngữ cảnh");
    expect(html).not.toContain("Hàng hồ sơ");
  });
});
