import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { Queue } from "./queue";
import { Detail } from "./detail";
import { UserDirectory } from "../users/directory";
const id = crypto.randomUUID();
const user: CurrentUser = { id, displayName: "Operator", email: "operator@example.test", roles: ["TEST_OPERATOR"], status: "ACTIVE" };
describe("read page permission boundaries", () => {
  it.each([
    ["/review/listings", "Không có quyền xem"],
    [`/review/listings/${crypto.randomUUID()}`, "không có quyền xem"],
    ["/users", "Chỉ quản trị viên"],
  ])("rejects TEST_OPERATOR deep link %s before mounting an API query", (path, message) => {
    // Intentionally no QueryClientProvider: an incorrectly mounted data branch fails this test.
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><Routes>
      <Route element={<Outlet context={user} />}>
        <Route path="/review/:kind" element={<Queue />} />
        <Route path="/review/:kind/:id" element={<Detail />} />
        <Route path="/users" element={<UserDirectory />} />
      </Route>
    </Routes></MemoryRouter>);
    expect(html).toContain(message);
  });
});
