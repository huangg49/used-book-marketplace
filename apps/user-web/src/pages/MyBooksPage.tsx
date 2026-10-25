import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { Plus, LayoutGrid, Rows3 } from "lucide-react";
import { useSession } from "../hooks/useSession";
import { moderationLabels } from "../lib/owner-listing-labels";
import { myListingsQuery } from "../lib/owner-listing-queries";
import { OwnerListingRow } from "../components/OwnerListingRow";
import styles from "./MyBooksPage.module.css";
import { EmptyOwnerShelf } from "../components/BookJourneyStates";

const filters = [
  { value: "", label: "Tất cả" },
  ...Object.entries(moderationLabels).map(([value, label]) => ({
    value,
    label,
  })),
];

export function MyBooksPage() {
  const auth = useSession();
  const [params, setParams] = useSearchParams();
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

  function selectFilter(value: string) {
    const next = new URLSearchParams();
    if (value) next.set("moderation", value);
    setParams(next);
  }

  function page(nextCursor?: string) {
    const next = new URLSearchParams(params);
    if (nextCursor) next.set("cursor", nextCursor);
    else next.delete("cursor");
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

        <div className={styles.results} aria-busy={query.isLoading}>
          {query.isLoading ? (
            <p className={styles.state} role="status">
              Đang tải kệ sách…
            </p>
          ) : query.isError ? (
            <div className={styles.state} role="alert">
              <h2>Chưa tải được kệ sách</h2>
              <p>
                Kiểm tra kết nối rồi thử lại. Các bài đăng của bạn vẫn được giữ
                trên máy chủ.
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

          {(cursor || query.data?.nextCursor) && (
            <nav className={styles.pagination} aria-label="Trang kệ sách">
              {cursor && (
                <button type="button" onClick={() => page()}>
                  Về trang đầu
                </button>
              )}
              {query.data?.nextCursor && (
                <button
                  type="button"
                  onClick={() => page(query.data!.nextCursor!)}
                >
                  Trang tiếp theo
                </button>
              )}
            </nav>
          )}
        </div>
      </section>
    </div>
  );
}
