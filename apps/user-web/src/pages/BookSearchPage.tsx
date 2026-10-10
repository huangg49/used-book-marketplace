import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Search, SlidersHorizontal, X, ArrowRight } from "lucide-react";
import { BookCard } from "../components/BookCard";
import { conditions } from "../lib/listing-labels";
import { getPublicListings } from "../services/public-listings";
import styles from "./BookSearchPage.module.css";

const keys = [
  "q",
  "mode",
  "condition",
  "sort",
  "minSalePrice",
  "maxSalePrice",
  "cursor",
] as const;
export function BookSearchPage() {
  const [params, setParams] = useSearchParams();
  const query = new URLSearchParams();
  for (const key of keys) {
    const value = params.get(key);
    if (value) query.set(key, value);
  }
  query.set("limit", "12");
  const min = params.get("minSalePrice") || "";
  const max = params.get("maxSalePrice") || "";
  const priceInvalid =
    [min, max].some(
      (value) =>
        value && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))),
    ) ||
    (!!min && !!max && Number(min) > Number(max));
  const result = useQuery({
    queryKey: ["public-listings", query.toString()],
    queryFn: () => getPublicListings(query),
    enabled: !priceInvalid,
    retry: false,
    staleTime: 0,
  });
  function update(key: string, value: string, replace = false) {
    const next = new URLSearchParams(params);
    next.delete("cursor");
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace });
  }
  function clear() {
    const next = new URLSearchParams();
    if (params.get("q")) next.set("q", params.get("q")!);
    setParams(next);
  }
  const filtered = [
    "mode",
    "condition",
    "minSalePrice",
    "maxSalePrice",
    "sort",
  ].some((key) => params.has(key));
  return (
    <div className={styles.page}>
      <section className={styles.searchHead}>
        <div className={styles.headingRow}>
          <h1>
            TÌM CUỐN SÁCH
            <br />
            <span>BẠN MUỐN ĐỌC TIẾP.</span>
          </h1>
          <p>
            Xem ảnh, tình trạng và giá của từng bản sách.
            <br />
            Chọn một cuốn để biết thêm chi tiết.
          </p>
        </div>
        <form
          role="search"
          className={styles.search}
          onSubmit={(event) => {
            event.preventDefault();
            update("q", (params.get("q") || "").trim());
          }}
        >
          <Search size={22} aria-hidden="true" />
          <label htmlFor="catalog-search" className="sr-only">
            Tìm sách
          </label>
          <input
            id="catalog-search"
            type="search"
            placeholder="Tên sách, tác giả hoặc ISBN…"
            value={params.get("q") || ""}
            onChange={(event) => update("q", event.target.value, true)}
          />
          <button type="submit">
            Tìm sách <ArrowRight size={18} aria-hidden="true" />
          </button>
        </form>
      </section>
      <div className={styles.catalog}>
        <details className={styles.filters} open>
          <summary>
            <SlidersHorizontal size={18} aria-hidden="true" />
            Bộ lọc sách
          </summary>
          <div className={styles.filterBody}>
            <fieldset>
              <legend>Bạn muốn</legend>
              <div className={styles.choices}>
                {[
                  ["", "Tất cả hình thức"],
                  ["Sale", "Mua sách"],
                  ["Exchange", "Trao đổi"],
                  ["Both", "Bán hoặc đổi"],
                ].map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="listing-mode"
                      checked={(params.get("mode") || "") === value}
                      onChange={() => update("mode", value!)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Tình trạng</legend>
              <div className={styles.choices}>
                <label>
                  <input
                    type="radio"
                    name="listing-condition"
                    checked={!params.get("condition")}
                    onChange={() => update("condition", "")}
                  />
                  Tất cả tình trạng
                </label>
                {Object.entries(conditions).map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="listing-condition"
                      checked={params.get("condition") === value}
                      onChange={() => update("condition", value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className={styles.priceFilter}>
              <legend>Giá bán (₫)</legend>
              <div>
                <label>
                  <span>Từ</span>
                  <input
                    aria-label="Giá bán từ"
                    type="number"
                    min="0"
                    step="1000"
                    inputMode="numeric"
                    placeholder="0"
                    value={min}
                    onChange={(event) =>
                      update("minSalePrice", event.target.value, true)
                    }
                    aria-invalid={priceInvalid}
                    aria-describedby={priceInvalid ? "price-error" : undefined}
                  />
                </label>
                <label>
                  <span>Đến</span>
                  <input
                    aria-label="Giá bán đến"
                    type="number"
                    min="0"
                    step="1000"
                    inputMode="numeric"
                    placeholder="Không giới hạn"
                    value={max}
                    onChange={(event) =>
                      update("maxSalePrice", event.target.value, true)
                    }
                    aria-invalid={priceInvalid}
                    aria-describedby={priceInvalid ? "price-error" : undefined}
                  />
                </label>
              </div>
            </fieldset>
          </div>
          {priceInvalid && (
            <p id="price-error" role="alert" className={styles.error}>
              Nhập giá là số nguyên không âm; giá đến phải lớn hơn hoặc bằng giá
              từ.
            </p>
          )}
        </details>
        <div className={styles.toolbar}>
          <div aria-live="polite">
            <h2 tabIndex={-1} id="catalog-results">
              {params.get("q")
                ? "Kết quả cho “" + params.get("q") + "”"
                : "Trên kệ lúc này"}
            </h2>
            {!priceInvalid && result.data && (
              <p>{result.data.items.length} cuốn trên trang này</p>
            )}
            {!priceInvalid && result.isFetching && (
              <p role="status">Đang tìm sách…</p>
            )}
          </div>
          <div className={styles.sortGroup}>
            {filtered && (
              <button type="button" className={styles.clear} onClick={clear}>
                <X size={16} aria-hidden="true" />
                Xóa bộ lọc
              </button>
            )}
            <label className={styles.sort}>
              Sắp xếp
              <select
                value={params.get("sort") || "newest"}
                onChange={(event) => update("sort", event.target.value)}
              >
                <option value="newest">Mới đăng</option>
                <option value="salePriceAsc">Giá bán tăng dần</option>
                <option value="salePriceDesc">Giá bán giảm dần</option>
              </select>
            </label>
          </div>
        </div>
        {!priceInvalid && (
          <div aria-busy={result.isFetching}>
            {result.isError && (
              <div className={styles.state} role="alert">
                <h3>Chưa tải được kệ sách</h3>
                <p>
                  Kiểm tra kết nối rồi thử lại.
                  {result.data
                    ? " Danh sách bên dưới có thể chưa được cập nhật."
                    : ""}
                </p>
                <button
                  type="button"
                  disabled={result.isFetching}
                  onClick={() => void result.refetch()}
                >
                  Thử lại
                </button>
              </div>
            )}
            {!result.isError && result.data?.items.length === 0 && (
              <div className={styles.state}>
                <h3>Chưa có cuốn sách nào phù hợp.</h3>
                <p>Thử tên sách khác hoặc bỏ bớt bộ lọc.</p>
                {filtered && (
                  <button type="button" onClick={clear}>
                    Xóa bộ lọc
                  </button>
                )}
              </div>
            )}
            <div className={styles.grid}>
              {result.data?.items.map((book, index) => (
                <BookCard key={book.id} book={book} index={index} />
              ))}
            </div>
            {(params.has("cursor") || result.data?.nextCursor) && (
              <nav className={styles.pagination} aria-label="Phân trang sách">
                {params.has("cursor") && (
                  <button
                    type="button"
                    disabled={result.isFetching}
                    onClick={() => update("cursor", "")}
                  >
                    Về trang đầu
                  </button>
                )}
                {result.data?.nextCursor && (
                  <button
                    type="button"
                    disabled={result.isFetching}
                    onClick={() => {
                      const next = new URLSearchParams(params);
                      next.set("cursor", result.data!.nextCursor!);
                      setParams(next);
                      document.getElementById("catalog-results")?.focus();
                    }}
                  >
                    Trang tiếp theo <ArrowRight size={18} aria-hidden="true" />
                  </button>
                )}
              </nav>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
