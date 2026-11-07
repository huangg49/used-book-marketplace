import { CursorPager } from "../components/Pagination/CursorPager";
import { useCursorNavigation } from "../components/Pagination/useCursorNavigation";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@used-books/session-client";
import { Link, useBeforeUnload, useBlocker, useLocation, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { Plus, LayoutGrid, Rows3, X } from "lucide-react";
import { useSession } from "../hooks/useSession";
import { moderationLabels } from "../lib/owner-listing-labels";
import { myListingsQuery } from "../lib/owner-listing-queries";
import { OwnerListingRow } from "../components/OwnerListingRow";
import styles from "./MyBooksPage.module.css";
import { EmptyOwnerShelf } from "../components/BookJourneyStates";
import { OwnerListingRecovery } from "../components/OwnerListingRecovery";
import { useListingActions } from "../hooks/useListingActions";
import { ConfirmDialog } from "../components/ConfirmDialog";

const filters = [
  { value: "", label: "Tất cả" },
  ...Object.entries(moderationLabels).map(([value, label]) => ({
    value,
    label,
  })),
];

export function MyBooksPage() {
  const auth = useSession();
  const location = useLocation();
  const pendingActions = useListingActions().length > 0;
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    pendingActions && currentLocation.pathname !== nextLocation.pathname);
  useBeforeUnload(event => {
    if (pendingActions) { event.preventDefault(); event.returnValue = ""; }
  });
  const [params, setParams] = useSearchParams();
  const navigation = useCursorNavigation(auth.status === "authenticated" ? auth.user.id : "guest");
  const [dismissedBanner, setDismissedBanner] = useState(false);
  const navState = location.state as {
    revised?: boolean;
    submitted?: boolean;
  } | null;
  const showStatusBanner =
    Boolean(navState?.revised || navState?.submitted) && !dismissedBanner;
  const rawFilter = params.get("moderation") || "";
  const filter = filters.some((f) => f.value === rawFilter) ? rawFilter : "";
  const cursor = params.get("cursor") || undefined;

  const [viewMode, setViewMode] = useState<"list" | "grid">(() => {
    try {
      return (
        (localStorage.getItem("latlai_mybooks_view") as "list" | "grid") ||
        "list"
      );
    } catch {
      return "list";
    }
  });

  const handleViewChange = (mode: "list" | "grid") => {
    setViewMode(mode);
    try {
      localStorage.setItem("latlai_mybooks_view", mode);
    } catch {}
  };

  const query = useQuery(
    myListingsQuery(
      auth.status === "authenticated" ? auth.user.id : undefined,
      filter,
      cursor,
    ),
  );
  const readDenied = query.error instanceof ApiError && [401, 403].includes(query.error.status);

  function selectFilter(value: string) {
    const next = new URLSearchParams();
    if (value) next.set("moderation", value);
    setParams(next);
  }


  return (
    <div className={styles.root}>
      <header className={styles.heading}>
        <div>
          <h1>Kệ sách của tôi</h1>
          <p>
            Theo dõi từng bản sách, từ lúc gửi duyệt đến khi có người đọc tiếp.
          </p>
        </div>
        <Link className={styles.post} to="/sell">
          <Plus size={18} aria-hidden="true" />
          Đăng sách
        </Link>
      </header>
      <OwnerListingRecovery />
      {showStatusBanner && (
        <div className={styles.revisedBanner} role="status">
          <div>
            {navState?.submitted ? (
              <>
                <strong>Đã gửi bài đăng cho ban quản trị duyệt thành công!</strong> Bài đăng đã chuyển sang trạng thái <em>Chờ duyệt</em> và sẽ hiển thị công khai ngay sau khi được kiểm duyệt phê duyệt.
              </>
            ) : (
              <>
                <strong>Đã gửi bản sửa để duyệt lại!</strong> Bản sách tạm chuyển sang trạng thái <em>Chờ duyệt</em> và sẽ hiển thị lại trên kệ sau khi được quản trị viên duyệt.
              </>
            )}
          </div>
          <button
            type="button"
            aria-label="Đóng thông báo"
            onClick={() => setDismissedBanner(true)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}


      <section className={styles.shelf} aria-label="Bài đăng của tôi">
        <div
          className={styles.filters}
          role="group"
          aria-label="Lọc theo trạng thái duyệt"
        >
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => selectFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className={styles.results} id="owner-shelf-results" tabIndex={-1} aria-busy={query.isLoading}>
          {query.isLoading ? (
            <p className={styles.state} role="status">
              Đang tải kệ sách…
            </p>
          ) : query.isError ? (
            <div className={styles.state} role="alert">
              <h2>Chưa tải được kệ sách</h2>
              <p>
                {readDenied
                  ? "Quyền xem kệ sách của bạn đã thay đổi. Kiểm tra phiên đăng nhập hoặc trạng thái tài khoản rồi thử lại."
                  : "Kiểm tra kết nối rồi thử lại. Các bài đăng của bạn vẫn được giữ trên máy chủ."}
              </p>
              <button
                type="button"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                {query.isFetching ? "Đang thử lại…" : "Thử lại"}
              </button>
            </div>
          ) : query.data?.items.length ? (
            <>
              <div className={styles.shelfToolbar}>
                <p className={styles.count}>
                  {query.data.items.length} bài đăng trên trang này
                </p>
                <div
                  className={styles.viewSwitcher}
                  role="group"
                  aria-label="Định dạng hiển thị"
                >
                  <button
                    type="button"
                    className={
                      viewMode === "list"
                        ? styles.viewBtnActive
                        : styles.viewBtn
                    }
                    onClick={() => handleViewChange("list")}
                    aria-pressed={viewMode === "list"}
                    title="Hiển thị dạng danh sách (ngang)"
                  >
                    <Rows3 size={16} aria-hidden="true" />
                    <span>Danh sách</span>
                  </button>
                  <button
                    type="button"
                    className={
                      viewMode === "grid"
                        ? styles.viewBtnActive
                        : styles.viewBtn
                    }
                    onClick={() => handleViewChange("grid")}
                    aria-pressed={viewMode === "grid"}
                    title="Hiển thị dạng lưới (ô)"
                  >
                    <LayoutGrid size={16} aria-hidden="true" />
                    <span>Lưới (Grid)</span>
                  </button>
                </div>
              </div>

              {viewMode === "list" ? (
                <ul className={styles.list}>
                  {query.data.items.map((item) => (
                    <OwnerListingRow
                      key={item.id}
                      item={item}
                      layout="list"
                    />
                  ))}
                </ul>
              ) : (
                <ul className={styles.grid}>
                  {query.data.items.map((item) => (
                    <OwnerListingRow
                      key={item.id}
                      item={item}
                      layout="grid"
                    />
                  ))}
                </ul>
              )}
            </>
          ) : (
            <EmptyOwnerShelf
              cursor={cursor}
              filter={filter}
              onClear={() => selectFilter("")}
            />
          )}

      {!readDenied && <CursorPager navigation={navigation} nextCursor={!query.isError ? query.data?.nextCursor : undefined}
        busy={query.isFetching} failed={query.isError} count={query.data?.items.length} label="Trang kệ sách" itemLabel="bài đăng" anchorId="owner-shelf-results" />}
        </div>
      </section>
      <ConfirmDialog isOpen={blocker.state === "blocked"} title="Rời trang khi chưa xác minh?"
        description="Thao tác bài đăng chưa được xác minh hoặc đối chiếu xong. Thao tác vẫn được giữ khi chuyển trang trong phiên này, nhưng sẽ mất khi tải lại hoặc đóng trang."
        confirmText="Rời trang" cancelText="Ở lại tiếp tục" isDanger
        onClose={() => blocker.reset?.()} onConfirm={() => blocker.proceed?.()} />
    </div>
  );
}
