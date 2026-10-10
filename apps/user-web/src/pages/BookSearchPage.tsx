import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Search,
  SlidersHorizontal,
  X,
  ArrowRight,
  RotateCcw,
} from "lucide-react";
import { HomeBookCard } from "../components/HomeBookCard";
import { conditions } from "../lib/listing-labels";
import { formatVnd } from "../lib/routes";
import { getSearchShelf } from "../services/catalog-search";
import { isCatalogPreview } from "../services/home-shelves";
import styles from "./BookSearchPage.module.css";

const modes = [
  ["", "Tất cả"],
  ["Sale", "Mua sách"],
  ["Exchange", "Đổi sách"],
  ["Both", "Bán hoặc đổi"],
] as const;
const queryKeys = [
  "q",
  "mode",
  "condition",
  "sort",
  "minSalePrice",
  "maxSalePrice",
  "cursor",
] as const;
type FilterValues = {
  condition: string;
  minSalePrice: string;
  maxSalePrice: string;
};
function invalidPrice(min: string, max: string) {
  return (
    [min, max].some(
      (value) =>
        value !== "" &&
        (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))),
    ) ||
    (min !== "" && max !== "" && Number(min) > Number(max))
  );
}
const priceMessage =
  "Nhập giá là số nguyên không âm; giá đến phải lớn hơn hoặc bằng giá từ.";

function FilterForm({
  initial,
  id,
  onApply,
}: {
  initial: FilterValues;
  id: string;
  onApply: (values: FilterValues) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const invalid = invalidPrice(draft.minSalePrice, draft.maxSalePrice);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!invalid) onApply(draft);
  }
  return (
    <form className={styles.filterForm} onSubmit={submit} noValidate>
      <fieldset>
        <legend>Tình trạng sách</legend>
        <div className={styles.choices}>
          {[["", "Tất cả tình trạng"], ...Object.entries(conditions)].map(
            ([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name={`${id}-condition`}
                  checked={draft.condition === value}
                  onChange={() => setDraft({ ...draft, condition: value! })}
                />
                {label}
              </label>
            ),
          )}
        </div>
      </fieldset>
      <fieldset className={styles.priceFilter}>
        <legend>Khoảng giá bán</legend>
        <p>Áp dụng cho sách có giá bán.</p>
        <div className={styles.priceFields}>
          <label>
            <span>Từ (₫)</span>
            <input
              aria-label="Giá bán từ"
              inputMode="numeric"
              placeholder="0"
              value={draft.minSalePrice}
              onChange={(event) =>
                setDraft({ ...draft, minSalePrice: event.target.value })
              }
              aria-invalid={invalid}
              aria-describedby={invalid ? `${id}-price-error` : undefined}
            />
          </label>
          <span className={styles.priceDash} aria-hidden="true">
            —
          </span>
          <label>
            <span>Đến (₫)</span>
            <input
              aria-label="Giá bán đến"
              inputMode="numeric"
              placeholder="Bất kỳ"
              value={draft.maxSalePrice}
              onChange={(event) =>
                setDraft({ ...draft, maxSalePrice: event.target.value })
              }
              aria-invalid={invalid}
              aria-describedby={invalid ? `${id}-price-error` : undefined}
            />
          </label>
        </div>
        <div className={styles.pricePresets} aria-label="Chọn nhanh giá bán">
          {[50000, 100000, 200000].map((price) => (
            <button
              key={price}
              type="button"
              aria-pressed={
                !draft.minSalePrice && draft.maxSalePrice === String(price)
              }
              onClick={() =>
                setDraft({
                  ...draft,
                  minSalePrice: "",
                  maxSalePrice: String(price),
                })
              }
            >
              Đến {formatVnd(price)}
            </button>
          ))}
        </div>
        {invalid && (
          <p id={`${id}-price-error`} role="alert" className={styles.error}>
            {priceMessage}
          </p>
        )}
      </fieldset>
      <div className={styles.filterActions}>
        <button type="submit" className={styles.apply} disabled={invalid}>
          Áp dụng bộ lọc <ArrowRight size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.reset}
          onClick={() =>
            setDraft({ condition: "", minSalePrice: "", maxSalePrice: "" })
          }
        >
          <RotateCcw size={15} aria-hidden="true" />
          Đặt lại lựa chọn
        </button>
      </div>
    </form>
  );
}

export function BookSearchPage() {
  const [params, setParams] = useSearchParams();
  const preview = isCatalogPreview(`?${params}`);
  const dialog = useRef<HTMLDialogElement>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const query = new URLSearchParams();
  for (const key of queryKeys) {
    const value = params.get(key);
    if (value) query.set(key, value);
  }
  query.set("limit", "20");
  const initial = {
    condition: params.get("condition") || "",
    minSalePrice: params.get("minSalePrice") || "",
    maxSalePrice: params.get("maxSalePrice") || "",
  };
  const priceInvalid = invalidPrice(initial.minSalePrice, initial.maxSalePrice);
  const result = useQuery({
    queryKey: ["catalog-search", preview, query.toString()],
    queryFn: () => getSearchShelf(query, preview),
    enabled: !priceInvalid,
    retry: false,
    staleTime: 0,
  });
  const filterKey = JSON.stringify(initial);
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
    if (params.has("data")) next.set("data", params.get("data")!);
    setParams(next);
  }
  function closeFilters() {
    dialog.current?.close();
    setFilterOpen(false);
  }
  function apply(values: FilterValues) {
    const next = new URLSearchParams(params);
    next.delete("cursor");
    Object.entries(values).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    setParams(next);
    closeFilters();
  }
  useEffect(() => {
    if (!filterOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const media = window.matchMedia("(min-width: 901px)");
    const closeOnDesktop = () => {
      if (media.matches) {
        dialog.current?.close();
        setFilterOpen(false);
      }
    };
    media.addEventListener("change", closeOnDesktop);
    return () => {
      document.body.style.overflow = previous;
      media.removeEventListener("change", closeOnDesktop);
    };
  }, [filterOpen]);
  const chips = [
    ...(params.get("condition")
      ? [
          {
            key: "condition",
            label:
              conditions[params.get("condition") as keyof typeof conditions] ||
              params.get("condition")!,
          },
        ]
      : []),
    ...(params.get("minSalePrice")
      ? [
          {
            key: "minSalePrice",
            label: `Từ ${priceInvalid ? initial.minSalePrice : formatVnd(Number(initial.minSalePrice))}`,
          },
        ]
      : []),
    ...(params.get("maxSalePrice")
      ? [
          {
            key: "maxSalePrice",
            label: `Đến ${priceInvalid ? initial.maxSalePrice : formatVnd(Number(initial.maxSalePrice))}`,
          },
        ]
      : []),
  ];
  const filtered = chips.length > 0 || params.has("mode") || params.has("sort");
  return (
    <div className={styles.page}>
      <section className={styles.searchHead} aria-labelledby="search-title">
        <div className={styles.headInner}>
          <div className={styles.headingRow}>
            <h1 id="search-title">
              TÌM SÁCH<span>.</span>
            </h1>
            <p>Một cuốn đã đọc. Một câu chuyện để đọc tiếp.</p>
          </div>
          <form
            role="search"
            className={styles.search}
            onSubmit={(event) => {
              event.preventDefault();
              update("q", (params.get("q") || "").trim());
            }}
          >
            <Search size={21} aria-hidden="true" />
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
              Tìm sách <ArrowRight size={17} aria-hidden="true" />
            </button>
          </form>
        </div>
      </section>
      <div className={styles.catalog}>
        <aside className={styles.sidebar} aria-label="Bộ lọc sách">
          <h2>
            <SlidersHorizontal size={18} aria-hidden="true" />
            Bộ lọc sách
          </h2>
          <FilterForm
            key={filterKey}
            initial={initial}
            id="desktop"
            onApply={apply}
          />
        </aside>
        <section className={styles.results} aria-labelledby="catalog-results">
          <div
            className={styles.modeRow}
            role="group"
            aria-label="Hình thức giao dịch"
          >
            {modes.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={(params.get("mode") || "") === value}
                onClick={() => update("mode", value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={styles.toolbar}>
            <div aria-live="polite">
              <h2 tabIndex={-1} id="catalog-results">
                {params.get("q")
                  ? `Kết quả cho “${params.get("q")}”`
                  : "Trên kệ lúc này"}
              </h2>
              <p>
                {priceInvalid
                  ? "Kiểm tra lại khoảng giá đã chọn."
                  : result.isFetching
                    ? "Đang tìm sách…"
                    : result.data
                      ? `${result.data.items.length} ${preview ? "sách xem trước" : "cuốn"} trên trang này`
                      : "Ảnh, tình trạng và giá của từng bản sách."}
              </p>
            </div>
            <div className={styles.sortGroup}>
              <button
                type="button"
                className={styles.filterToggle}
                onClick={() => {
                  dialog.current?.showModal();
                  setFilterOpen(true);
                }}
              >
                <SlidersHorizontal size={17} aria-hidden="true" />
                Bộ lọc{chips.length > 0 && <span>{chips.length}</span>}
              </button>
              <label className={styles.sort}>
                <span>Sắp xếp</span>
                <select
                  aria-label="Sắp xếp"
                  value={params.get("sort") || "newest"}
                  onChange={(event) => update("sort", event.target.value)}
                >
                  <option value="newest">
                    {preview ? "Thứ tự mặc định" : "Mới đăng"}
                  </option>
                  <option value="salePriceAsc">Giá bán tăng dần</option>
                  <option value="salePriceDesc">Giá bán giảm dần</option>
                </select>
              </label>
            </div>
          </div>
          {filtered && (
            <div
              className={styles.activeFilters}
              aria-label="Bộ lọc đang áp dụng"
            >
              {chips.map((chip) => (
                <button
                  type="button"
                  key={chip.key}
                  aria-label={`Bỏ lọc ${chip.label}`}
                  onClick={() => update(chip.key, "")}
                >
                  {chip.label}
                  <X size={14} aria-hidden="true" />
                </button>
              ))}
              <button type="button" className={styles.clear} onClick={clear}>
                <RotateCcw size={14} aria-hidden="true" />
                Xóa bộ lọc
              </button>
            </div>
          )}
          {priceInvalid ? (
            <div className={styles.state} role="alert">
              <h3>Khoảng giá chưa hợp lệ</h3>
              <p>{priceMessage}</p>
              <button type="button" onClick={clear}>
                Xóa bộ lọc
              </button>
            </div>
          ) : (
            <div aria-busy={result.isFetching}>
              {result.isPending && (
                <div className={styles.loading} role="status">
                  <span />
                  Đang tải kệ sách…
                </div>
              )}
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
                <div className={styles.empty}>
                  <img
                    src="/illustrations/penguins/buy.png"
                    alt=""
                    aria-hidden="true"
                    width="96"
                    height="96"
                  />
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
                  <HomeBookCard key={book.id} book={book} index={index} />
                ))}
              </div>
              {(params.has("cursor") || result.data?.nextCursor) && (
                <nav className={styles.pagination} aria-label="Phân trang sách">
                  {params.has("cursor") && (
                    <button
                      type="button"
                      disabled={result.isFetching}
                      onClick={() => {
                        update("cursor", "");
                        document.getElementById("catalog-results")?.focus();
                      }}
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
                      Trang tiếp theo{" "}
                      <ArrowRight size={17} aria-hidden="true" />
                    </button>
                  )}
                </nav>
              )}
            </div>
          )}
        </section>
      </div>
      <dialog
        ref={dialog}
        className={styles.filterDialog}
        aria-labelledby="filter-dialog-title"
        onClose={() => setFilterOpen(false)}
      >
        <div className={styles.dialogHead}>
          <h2 id="filter-dialog-title">Bộ lọc sách</h2>
          <button type="button" aria-label="Đóng bộ lọc" onClick={closeFilters}>
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        {filterOpen && (
          <FilterForm
            key={filterKey}
            initial={initial}
            id="mobile"
            onApply={apply}
          />
        )}
      </dialog>
    </div>
  );
}
