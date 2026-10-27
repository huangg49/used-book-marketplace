import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useOutletContext, useSearchParams } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import {
  operationsUsersPage as page,
  userStatusLabel as statusLabel,
  type OperationsUser as User,
} from "./contracts";
import { dateText } from "../../core/format";
import { canReviewCatalog, session } from "../../core/session";
import { Button, CursorPagination, Notice } from "../../core/ui";
import { ListFeedback } from "../../core/list-feedback";
import {
  directoryRequest,
  directoryRoles,
  directorySearchParams,
  directoryStatuses,
  readDirectoryFilters,
  type DirectoryFilters,
} from "./directory-filters";
const roleLabel: Record<User["roles"][number], string> = {
  MEMBER: "Thành viên",
  STAFF: "Nhân viên",
  ADMIN: "Quản trị viên",
  TEST_OPERATOR: "Vận hành thử",
};

export function UserDirectory() {
  const user = useOutletContext<CurrentUser>();
  if (!canReviewCatalog(user))
    return <Notice tone="warning">Chỉ quản trị viên đang hoạt động được tra cứu tài khoản.</Notice>;
  return <UserDirectoryContent />;
}
function UserDirectoryContent() {
  const [params, setParams] = useSearchParams();
  const filters = readDirectoryFilters(params);
  const { q: query, status, role } = filters;
  function applyFilters(next: DirectoryFilters) {
    const parameters = directorySearchParams(next);
    if (parameters.toString() !== params.toString()) setParams(parameters);
  }
  const result = useInfiniteQuery({
    queryKey: ["operations-users", query, status, role],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      session.request(directoryRequest(filters, pageParam), page),
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = result.data?.pages.flatMap((value) => value.items) ?? [];
  return (
    <>
      <header className="page-heading">
        <h1>Người dùng</h1>
        <p className="intro">
          Tra cứu tài khoản, trạng thái và quyền hiện tại. Chỉ đọc.
        </p>
      </header>
      <DirectoryFilterForm filters={filters} apply={applyFilters} />
      <div className="queue-toolbar">
        <p className="muted" role="status">
          {result.data && `Đang hiển thị ${items.length} người dùng. Cập nhật ${dateText(result.data.pages[0].serverTime)}.`}
        </p>
        <Button busy={result.isFetching} onClick={() => void result.refetch()}>
          Cập nhật danh sách
        </Button>
      </div>
      <ListFeedback result={result} loadingText="Đang tải danh sách người dùng…" />
      {result.isSuccess && !items.length && (
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
                  <td>{item.emailVerifiedAt ? <DirectoryTime value={item.emailVerifiedAt} /> : "Chưa xác minh"}</td>
                  <td><DirectoryTime value={item.createdAt} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.data && (
        <p className="directory-scope muted">
          Danh sách chỉ dùng để tra cứu, không hiển thị mật khẩu, phiên đăng nhập,
          địa chỉ hoặc số dư.
        </p>
      )}
      <CursorPagination
        pageCount={result.data?.pages.length ?? 0}
        hasNextPage={result.hasNextPage}
        isFetchingNextPage={result.isFetchingNextPage}
        isFetching={result.isFetching}
        error={result.isFetchNextPageError ? result.error : undefined}
        onNextPage={() => void result.fetchNextPage({ cancelRefetch: false })}
        nextLabel="Xem thêm người dùng"
      />
    </>
  );
}

const directoryDate = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh",
});
const directoryClock = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Ho_Chi_Minh",
});
function DirectoryTime({ value }: { value: string }) {
  const date = new Date(value);
  return (
    <time className="directory-time" dateTime={value} title={dateText(value)}>
      <span>{directoryDate.format(date)}</span>{" "}
      <small>{directoryClock.format(date)}</small>
    </time>
  );
}

function DirectoryFilterForm({
  filters,
  apply,
}: {
  filters: DirectoryFilters;
  apply: (filters: DirectoryFilters) => void;
}) {
  // Sync only a changed applied query (including Back). Keep the same DOM input
  // and focus after submit; selects/refetches preserve a search still in draft.
  const [draft, setDraft] = useState({ applied: filters.q, value: filters.q });
  if (draft.applied !== filters.q) {
    setDraft({ applied: filters.q, value: filters.q });
  }
  const search = draft.applied === filters.q ? draft.value : filters.q;
  const setSearch = (value: string) => setDraft({ applied: filters.q, value });
  const active = !!(filters.q || filters.status || filters.role || search);
  return (
    <form
      className="directory-filters"
      onSubmit={(event) => {
        event.preventDefault();
        apply({ ...filters, q: search });
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
        <select
          value={filters.status}
          onChange={(event) => apply({ ...filters, status: event.target.value })}
        >
          {directoryStatuses.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <label className="field">
        Vai trò
        <select
          value={filters.role}
          onChange={(event) => apply({ ...filters, role: event.target.value })}
        >
          {directoryRoles.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <div className="directory-filter-actions">
        <Button type="submit">Tìm kiếm</Button>
        <Button
          disabled={!active}
          onClick={() => {
            setSearch("");
            apply({ q: "", status: "", role: "" });
          }}
        >
          Xóa bộ lọc
        </Button>
      </div>
    </form>
  );
}
