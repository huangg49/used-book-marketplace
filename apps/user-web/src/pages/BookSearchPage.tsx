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
import { getSearchShelf, previewCategories } from "../services/catalog-search";
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
  "category",
  "sort",
  "minSalePrice",
  "maxSalePrice",
  "cursor",
] as const;
type FilterValues = {
  category: string;
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

const foldCategory = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d");

function CategoryPicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const options = ["", ...previewCategories].filter((category) =>
    foldCategory(category || "Tất cả thể loại").includes(foldCategory(search)),
  );
  useEffect(() => {
    const container = list.current;
    const option = container?.querySelector<HTMLElement>(
      `[id="${id}-category-${active}"]`,
    );
    if (!container || !option) return;
    const optionTop =
      option.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop;
    if (optionTop < container.scrollTop) container.scrollTop = optionTop;
    else if (
      optionTop + option.offsetHeight >
      container.scrollTop + container.clientHeight
    )
      container.scrollTop =
        optionTop + option.offsetHeight - container.clientHeight;
  }, [active, open, search, id]);
  function choose(category: string) {
    onChange(category);
    setOpen(false);
    setSearch("");
  }
  return (
    <div className={styles.categoryPicker}>
      <input
        id={`${id}-category`}
        role="combobox"
        aria-label="Thể loại"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-categories`}
        aria-activedescendant={
          open && options.length ? `${id}-category-${active}` : undefined
        }
        autoComplete="off"
        placeholder="Tất cả thể loại"
        value={open ? search : value}
        onFocus={() => {
          setSearch("");
          setActive(0);
          setOpen(true);
        }}
        onClick={() => {
          if (!open) {
            setSearch("");
            setActive(0);
            setOpen(true);
          }
        }}
        onBlur={() => {
          setOpen(false);
          setSearch("");
        }}
        onChange={(event) => {
          setSearch(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) {
              setSearch("");
              setActive(0);
              setOpen(true);
            } else
              setActive((index) =>
                Math.max(
                  0,
                  Math.min(
                    options.length - 1,
                    index + (event.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            if (options[active] !== undefined) choose(options[active]!);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            setSearch("");
          }
        }}
      />
      <Search size={15} aria-hidden="true" />
      {open && (
        <div
          ref={list}
          id={`${id}-categories`}
          role="listbox"
          aria-label="Thể loại"
          className={styles.categoryOptions}
        >
          {options.map((category, index) => (
            <div
              role="option"
              id={`${id}-category-${index}`}
              key={category}
              aria-selected={category === value}
              data-active={active === index || undefined}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(category)}
            >
              {category || "Tất cả thể loại"}
            </div>
          ))}
          {!options.length && <p role="status">Không có thể loại phù hợp.</p>}
        </div>
      )}
    </div>
  );
}

function FilterForm({
  initial,
  id,
  onApply,
  preview,
}: {
  initial: FilterValues;
  id: string;
  onApply: (values: FilterValues) => void;
  preview: boolean;
}) {
  const [draft, setDraft] = useState(initial);
  const invalid = invalidPrice(draft.minSalePrice, draft.maxSalePrice);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!invalid) onApply(draft);
  }
  return (
    <form
      className={styles.filterForm}
      data-invalid={invalid || undefined}
      onSubmit={submit}
      noValidate
    >
      <div className={styles.filterBody}>
        {preview && (
          <fieldset className={styles.categoryField}>
            <legend>Thể loại</legend>
            <CategoryPicker
              id={id}
              value={draft.category}
              onChange={(category) => setDraft({ ...draft, category })}
            />
          </fieldset>
        )}
        <fieldset className={styles.priceFilter}>
          <legend>Khoảng giá bán (₫)</legend>
          <div className={styles.priceFields}>
            <label>
              <span>Từ</span>
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
              <span>Đến</span>
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
          <p className={styles.presetLabel}>Chọn nhanh giá tối đa</p>
          <div
            className={styles.pricePresets}
            role="group"
            aria-label="Chọn nhanh giá bán"
          >
            {[50000, 100000, 200000].map((price) => (
              <button
                key={price}
                type="button"
                aria-label={`Giá tối đa ${formatVnd(price)}`}
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
                {price / 1000}k
              </button>
            ))}
          </div>
          <select
            className={styles.compactPreset}
            aria-label="Chọn nhanh giá tối đa"
            value={
              !draft.minSalePrice &&
              ["50000", "100000", "200000"].includes(draft.maxSalePrice)
                ? draft.maxSalePrice
                : ""
            }
            onChange={(event) => {
              if (event.target.value)
                setDraft({
                  ...draft,
                  minSalePrice: "",
                  maxSalePrice: event.target.value,
                });
            }}
          >
            <option value="">Chọn giá tối đa…</option>
            {[50000, 100000, 200000].map((price) => (
              <option key={price} value={price}>
                Đến {formatVnd(price)}
              </option>
            ))}
          </select>
          {invalid && (
            <p id={`${id}-price-error`} role="alert" className={styles.error}>
              {priceMessage}
            </p>
          )}
        </fieldset>
        <fieldset>
          <legend>Tình trạng sách</legend>
          <select
            className={styles.conditionSelect}
            aria-label="Tình trạng sách"
            value={draft.condition}
            onChange={(event) =>
              setDraft({ ...draft, condition: event.target.value })
            }
          >
            {[["", "Tất cả tình trạng"], ...Object.entries(conditions)].map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ),
            )}
          </select>
        </fieldset>
      </div>
      <div className={styles.filterFooter}>
        <p>Chọn hoặc xóa, rồi bấm Áp dụng.</p>
        <div className={styles.filterActions}>
          <button type="submit" className={styles.apply} disabled={invalid}>
            Áp dụng <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.reset}
            onClick={() =>
              setDraft({
                category: "",
                condition: "",
                minSalePrice: "",
                maxSalePrice: "",
              })
            }
          >
            Xóa lựa chọn
          </button>
        </div>
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
    if (value && (key !== "category" || preview)) query.set(key, value);
  }
  query.set("limit", "20");
  const initial = {
    category: preview ? params.get("category") || "" : "",
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
    const media = window.matchMedia(
      "(min-width: 901px) and (min-height: 701px)",
    );
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
    ...(initial.category ? [{ key: "category", label: initial.category }] : []),
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
            preview={preview}
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
            preview={preview}
          />
        )}
      </dialog>
    </div>
  );
}
