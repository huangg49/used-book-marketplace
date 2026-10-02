import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { z } from "zod";
import type { components } from "@used-books/api-contract";
import { dateText } from "../../core/format";
import { session } from "../../core/session";
import { Button, CursorPagination, ErrorNotice, Notice } from "../../core/ui";

type User = components["schemas"]["OperationsUser"];
const user = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  status: z.enum([
    "PENDING_VERIFICATION",
    "ACTIVE",
    "RESTRICTED",
    "LOCKED",
    "DISABLED",
  ]),
  emailVerifiedAt: z.iso.datetime({ offset: true }).nullable(),
  roles: z.array(z.enum(["MEMBER", "STAFF", "ADMIN", "TEST_OPERATOR"])),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
}) satisfies z.ZodType<User>;
const page = z.object({
  items: z.array(user),
  nextCursor: z.string().nullable(),
  serverTime: z.iso.datetime({ offset: true }),
});

const statuses = [
  ["", "Tất cả trạng thái"],
  ["ACTIVE", "Đang hoạt động"],
  ["PENDING_VERIFICATION", "Chờ xác minh"],
  ["RESTRICTED", "Hạn chế"],
  ["LOCKED", "Đã khóa"],
  ["DISABLED", "Đã vô hiệu"],
] as const;
const roles = [
  ["", "Tất cả vai trò"],
  ["MEMBER", "Thành viên"],
  ["STAFF", "Nhân viên"],
  ["ADMIN", "Quản trị viên"],
  ["TEST_OPERATOR", "Vận hành thử"],
] as const;
const statusLabel: Record<User["status"], string> = {
  ACTIVE: "Đang hoạt động",
  PENDING_VERIFICATION: "Chờ xác minh",
  RESTRICTED: "Hạn chế",
  LOCKED: "Đã khóa",
  DISABLED: "Đã vô hiệu",
};
const roleLabel: Record<User["roles"][number], string> = {
  MEMBER: "Thành viên",
  STAFF: "Nhân viên",
  ADMIN: "Quản trị viên",
  TEST_OPERATOR: "Vận hành thử",
};

export function UserDirectory() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("");
  const result = useInfiniteQuery({
    queryKey: ["operations-users", query, status, role],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const parameters = new URLSearchParams({ limit: "20" });
      if (pageParam) parameters.set("cursor", pageParam);
      if (query) parameters.set("q", query);
      if (status) parameters.set("status", status);
      if (role) parameters.set("role", role);
      return session.request(`/operations/users?${parameters}`, page);
    },
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = result.data?.pages.flatMap((value) => value.items) ?? [];
  const applySearch = () => setQuery(search.trim());
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">Quản trị tài khoản · Chỉ đọc</p>
        <h1>Người dùng</h1>
        <p className="intro">
          Tra cứu tài khoản và quyền hiện tại để hỗ trợ vận hành. Danh sách này
          không hiển thị mật khẩu, phiên đăng nhập, địa chỉ hoặc số dư.
        </p>
      </header>
      <form
        className="directory-filters"
        onSubmit={(event) => {
          event.preventDefault();
          applySearch();
        }}
      >
        <label className="field directory-search">
          Tìm theo tên hoặc email
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={100}
            placeholder="Ví dụ: minh hoặc minh@example.com"
          />
        </label>
        <label className="field">
          Trạng thái
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {statuses.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Vai trò
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            {roles.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" busy={result.isFetching && !result.isFetchingNextPage}>
          Tìm kiếm
        </Button>
      </form>
      {result.error && (
        <ErrorNotice
          error={result.error}
          retry={() => void result.refetch()}
          busy={result.isFetching}
        />
      )}
      {result.isLoading && <p role="status">Đang tải danh sách người dùng…</p>}
      {result.data && !items.length && (
        <div className="empty">
          <p className="folio">—</p>
          <h2>Không có tài khoản phù hợp</h2>
          <p>Thử đổi từ khóa hoặc bỏ bớt bộ lọc.</p>
        </div>
      )}
      {items.length > 0 && (
        <div className="directory-table-wrap">
          <table className="directory-table">
            <caption>Danh sách người dùng phù hợp với bộ lọc hiện tại.</caption>
            <thead>
              <tr>
                <th scope="col">Người dùng</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Vai trò</th>
                <th scope="col">Xác minh email</th>
                <th scope="col">Tạo lúc</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <th scope="row">
                    <span>{item.displayName}</span>
                    <small>{item.email}</small>
                  </th>
                  <td>
                    <span className={`user-status status-${item.status.toLowerCase()}`}>
                      {statusLabel[item.status]}
                    </span>
                  </td>
                  <td>{item.roles.map((value) => roleLabel[value]).join(" · ") || "—"}</td>
                  <td>{item.emailVerifiedAt ? dateText(item.emailVerifiedAt) : "Chưa xác minh"}</td>
                  <td>{dateText(item.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.data && (
        <Notice tone="info">
          Trạng thái và vai trò hiển thị là dữ liệu hiện tại. Thao tác khóa, mở
          khóa hoặc đổi quyền chưa được cung cấp vì cần quy trình kiểm soát riêng.
        </Notice>
      )}
      <CursorPagination
        pageCount={result.data?.pages.length ?? 0}
        hasNextPage={result.hasNextPage}
        isFetchingNextPage={result.isFetchingNextPage}
        onNextPage={() => void result.fetchNextPage()}
        nextLabel="Xem thêm người dùng"
      />
    </>
  );
}
