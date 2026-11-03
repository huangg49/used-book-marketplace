import { useRef, useState } from "react";
import { useListMotion } from "../../core/task-motion";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useLocation, useOutletContext, useSearchParams } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import {
  AlertCircle,
  Check,
  ChevronRight,
  RotateCw,
  Search,
  X,
} from "lucide-react";
import {
  operationsUsersPage as page,
  userStatusLabel as statusLabel,
  type OperationsUser as User,
} from "./contracts";
import { dateText } from "../../core/format";
import { canReviewCatalog, session } from "../../core/session";
import { Button, CursorPagination, Notice } from "../../core/ui";
import { ListFeedback } from "../../core/list-feedback";
import { PaperSelect } from "../../core/PaperSelect";
import {
  directoryRequest,
  directoryRoles,
  directorySearchParams,
  directoryStatuses,
  readDirectoryFilters,
  type DirectoryFilters,
} from "./directory-filters";
import { EmptyArt } from "../../core/EmptyArt";
import "./directory.css";

const roleLabel: Record<User["roles"][number], string> = {
  MEMBER: "Thành viên",
  STAFF: "Nhân viên",
  ADMIN: "Quản trị viên",
  TEST_OPERATOR: "Vận hành thử",
};

const AVATAR_PALETTES = [
  { bg: "#f5e8df", color: "#8a2c0e", border: "rgba(138, 44, 14, 0.22)" }, // Warm Terracotta
  { bg: "#e5ece1", color: "#2d5e38", border: "rgba(45, 94, 56, 0.22)" },  // Sage Green
  { bg: "#e2e8f0", color: "#334155", border: "rgba(51, 65, 85, 0.22)" },  // Archival Slate
  { bg: "#ede5ec", color: "#6b21a8", border: "rgba(107, 33, 168, 0.22)" },// Antique Plum
  { bg: "#f0e9dc", color: "#784b16", border: "rgba(120, 75, 22, 0.22)" }, // Biscuit Ochre
];

function getAvatarProps(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  let initials = "";
  if (parts.length >= 2) {
    initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  } else if (parts.length === 1 && parts[0].length >= 2) {
    initials = parts[0].slice(0, 2).toUpperCase();
  } else if (parts.length === 1 && parts[0].length === 1) {
    initials = parts[0].toUpperCase();
  } else {
    initials = (email[0] || "U").toUpperCase();
  }
  let hash = 0;
  const key = name + email;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const palette = AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
  return { initials, ...palette };
}

export function UserDirectory() {
  const user = useOutletContext<CurrentUser>();
  if (!canReviewCatalog(user))
    return (
      <Notice tone="warning">
        Chỉ quản trị viên đang hoạt động được tra cứu tài khoản.
      </Notice>
    );
  return <UserDirectoryContent />;
}

function UserDirectoryContent() {
  const location = useLocation();
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
  const rows = useRef<HTMLTableSectionElement>(null);

  useListMotion(
    rows,
    items
      .map((item) => `${item.id}/${item.status}/${item.roles.join()}`)
      .join("|"),
  );

  const activeCount = items.filter((i) => i.status === "ACTIVE").length;
  const attentionCount = items.filter(
    (i) => i.status === "LOCKED" || i.status === "RESTRICTED",
  ).length;
  const staffCount = items.filter(
    (i) => i.roles.includes("ADMIN"),
  ).length;

  return (
    <>
      {/* 1. Header trang: Tiêu đề + mô tả bên trái, nút Cập nhật danh sách căn phải */}
      <header className="page-heading user-directory-header">
        <div className="directory-header-row">
          <div className="directory-header-title-group">
            <h1>Người dùng</h1>
            <p className="intro">
              Tra cứu trạng thái, xem lịch sử và quản lý khóa tài khoản.
            </p>
          </div>
          <Button
            busy={result.isFetching}
            onClick={() => void result.refetch()}
            className={`btn-subtle-refresh ${result.isFetching ? "spinning" : ""}`}
          ><RotateCw size={14} aria-hidden="true" />Cập nhật danh sách</Button>
        </div>
      </header>

      {/* 2. Thanh lọc: Chip tabs thống kê + Form bộ lọc 1 hàng */}
      <div className="directory-controls-block">
        {items.length > 0 && (
          <div className="directory-tab-strip" role="tablist" aria-label="Lọc nhanh người dùng">
            <button
              type="button"
              role="tab"
              aria-selected={!filters.status && !filters.role}
              className={`tab-chip ${!filters.status && !filters.role ? "active" : ""}`}
              onClick={() => applyFilters({ ...filters, status: "", role: "" })}
            >
              <span>Tất cả</span>
              <span className="tab-chip-count">{items.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filters.status === "ACTIVE"}
              className={`tab-chip ${filters.status === "ACTIVE" ? "active" : ""}`}
              onClick={() =>
                applyFilters({
                  ...filters,
                  status: filters.status === "ACTIVE" ? "" : "ACTIVE",
                })
              }
            >
              <span>Đang hoạt động</span>
              <span className="tab-chip-count">{activeCount}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filters.status === "LOCKED"}
              className={`tab-chip ${filters.status === "LOCKED" ? "active" : ""}`}
              onClick={() =>
                applyFilters({
                  ...filters,
                  status: filters.status === "LOCKED" ? "" : "LOCKED",
                })
              }
            >
              <span>Cần chú ý</span>
              <span className="tab-chip-count">{attentionCount}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filters.role === "ADMIN"}
              className={`tab-chip ${filters.role === "ADMIN" ? "active" : ""}`}
              onClick={() =>
                applyFilters({
                  ...filters,
                  role: filters.role === "ADMIN" ? "" : "ADMIN",
                })
              }
            >
              <span>Quản trị viên</span>
              <span className="tab-chip-count">{staffCount}</span>
            </button>
          </div>
        )}

        <DirectoryFilterForm filters={filters} apply={applyFilters} />
      </div>

      {/* 3. Dòng trạng thái kết quả: Sát ngay trên bảng, cách ~8px */}
      {result.data && (
        <p className="directory-results-meta muted" role="status">
          Đang hiển thị {items.length} người dùng. Cập nhật {dateText(result.data.pages[0].serverTime)}.
        </p>
      )}

      <ListFeedback
        result={result}
        loadingText="Đang tải danh sách người dùng…"
      />

      {result.isSuccess && !items.length && (
        <div className="empty">
          <EmptyArt variant="people" />
          <h2>Không có tài khoản phù hợp</h2>
          <p>Thử đổi từ khóa hoặc bỏ bớt bộ lọc.</p>
        </div>
      )}

      {/* 4. Bảng 4 cột: Người dùng | Vai trò | Trạng thái | Ngày tạo */}
      {items.length > 0 && (
        <div className="directory-table-wrap">
          <table className="directory-table">
            <caption>Danh sách người dùng phù hợp với bộ lọc hiện tại.</caption>
            <thead>
              <tr>
                <th scope="col" style={{ width: "36%" }}>Người dùng</th>
                <th scope="col" style={{ width: "22%" }}>Vai trò</th>
                <th scope="col" style={{ width: "20%" }}>Trạng thái</th>
                <th scope="col" style={{ width: "22%" }}>Ngày tạo</th>
              </tr>
            </thead>
            <tbody ref={rows}>
              {items.map((item) => {
                const avatar = getAvatarProps(item.displayName, item.email);
                const createdDate = new Date(item.createdAt);
                const isNormalStatus = item.status === "ACTIVE";

                return (
                  <tr
                    key={item.id}
                    data-motion-key={item.id}
                    data-motion-revision={`${item.status}/${item.roles.join()}`}
                  >
                    <th scope="row">
                      <div className="user-identity-cell">
                        <div
                          className="user-avatar-badge"
                          style={{
                            backgroundColor: avatar.bg,
                            color: avatar.color,
                            borderColor: avatar.border,
                          }}
                          aria-hidden="true"
                        >
                          {avatar.initials}
                        </div>
                        <div className="user-text-meta">
                          <Link
                            to={`/users/${item.id}`}
                            state={{ returnTo: location.pathname + location.search }}
                            className="user-name-link"
                          >
                            {item.displayName}
                          </Link>
                          <div className="user-email-wrap">
                            <small className="user-email-text">{item.email}</small>
                            {item.emailVerifiedAt ? (
                              <span
                                className="email-verified-icon"
                                title="Đã xác minh"
                                aria-label="Đã xác minh email"
                              >
                                <Check size={11} strokeWidth={2.8} aria-hidden="true" />
                              </span>
                            ) : (
                              <span
                                className="email-unverified-icon"
                                title="Chưa xác minh email"
                                aria-label="Chưa xác minh email"
                              >
                                <AlertCircle size={11} strokeWidth={2.2} aria-hidden="true" />
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </th>
                    <td>
                      <div className="role-badge-list">
                        {item.roles.map((r) => {
                          const roleClass =
                            r === "ADMIN"
                              ? "role-badge-admin"
                              : r === "STAFF"
                                ? "role-badge-staff"
                                : r === "TEST_OPERATOR"
                                  ? "role-badge-operator"
                                  : "role-badge-member";
                          return (
                            <span
                              key={r}
                              className={`role-badge-unified ${roleClass}`}
                            >
                              {roleLabel[r]}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td>
                      {isNormalStatus ? (
                        <span className="status-subtle-normal">
                          <span className="status-live-dot" aria-hidden="true" />
                          <span>{statusLabel[item.status]}</span>
                        </span>
                      ) : (
                        <span
                          className={`user-status-warning-badge ${
                            item.status === "PENDING_VERIFICATION" ? "status-pending" : ""
                          }`}
                        >
                          {statusLabel[item.status]}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="time-inline-cell">
                        <span className="time-text">
                          {directoryDate.format(createdDate)} · {directoryClock.format(createdDate)}
                        </span>
                        <span className="row-hover-arrow" aria-hidden="true">
                          <ChevronRight size={16} />
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});

const directoryClock = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Ho_Chi_Minh",
});

function DirectoryFilterForm({
  filters,
  apply,
}: {
  filters: DirectoryFilters;
  apply: (filters: DirectoryFilters) => void;
}) {
  const [draft, setDraft] = useState({ applied: filters.q, value: filters.q });
  if (draft.applied !== filters.q) {
    setDraft({ applied: filters.q, value: filters.q });
  }
  const search = draft.applied === filters.q ? draft.value : filters.q;
  const setSearch = (value: string) => setDraft({ applied: filters.q, value });
  const active = !!(filters.q || filters.status || filters.role || search);

  return (
    <form
      className="directory-filters directory-single-row-filter"
      onSubmit={(event) => {
        event.preventDefault();
        apply({ ...filters, q: search });
      }}
    >
      <div className="filter-search-col">
        <label className="field directory-search filter-search-label">
          <span>Tìm theo tên hoặc email</span>
          <div className="directory-search-input-wrap">
            <Search className="directory-search-icon" aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              maxLength={100}
              placeholder="Ví dụ: minh hoặc minh@example.com"
              className="directory-search-input"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="directory-search-clear"
                aria-label="Xóa từ khóa"
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        </label>
      </div>

      <div className="filter-select-col">
        <PaperSelect
          label="Trạng thái"
          value={filters.status}
          choices={directoryStatuses}
          onChange={(status) => apply({ ...filters, status })}
        />
      </div>

      <div className="filter-select-col">
        <PaperSelect
          label="Vai trò"
          value={filters.role}
          choices={directoryRoles}
          onChange={(role) => apply({ ...filters, role })}
        />
      </div>

      <div className="filter-actions-col">
        <Button type="submit" className="btn-filter-primary">
          Tìm kiếm
        </Button>
        {active && (
          <Button
            type="button"
            onClick={() => {
              setSearch("");
              apply({ q: "", status: "", role: "" });
            }}
            className="btn-clean-reset"
          >
            Xóa bộ lọc
          </Button>
        )}
      </div>
    </form>
  );
}
