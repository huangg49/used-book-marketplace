import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Search,
  Filter,
  X,
  ArrowRight,
  ArrowLeft,
  BookOpen,
  Menu,
} from "lucide-react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { getLenis } from "../hooks/useSmoothScroll";
import { HomeBookCard } from "../components/HomeBookCard";
import { CatalogSort } from "../components/CatalogSort";
import { FilterSelect } from "../components/FilterSelect";
import { conditions } from "../lib/listing-labels";
import { formatVnd } from "../lib/routes";
import { lockPageScroll } from "../lib/page-scroll";
import { getSearchShelf } from "../services/catalog-search";
import { isCatalogPreview } from "../services/home-shelves";
import { CatalogClassificationFields } from "../components/CatalogClassificationFields";
import {
  categoryFor,
  searchClassificationErrors as classificationErrors,
  supportsSeries,
  taxonomyVersion,
  compatibleAttributes,
  facetsFor,
  languageOptions,
  type Attributes,
} from "@used-books/api-contract/catalog-taxonomy";
import { catalogQueryKeys, readAttributes } from "../lib/catalog-filters";
import { observeHeaderScroll } from "../lib/header-scroll";
import { AutumnLeavesCanvas } from "../components/autumn/AutumnLeavesCanvas";
import styles from "./BookSearchPage.module.css";

const modes = [
  ["", "Tất cả"],
  ["Sale", "Mua sách"],
  ["Exchange", "Đổi sách"],
  ["Both", "Bán hoặc đổi"],
] as const;
const queryKeys = catalogQueryKeys;
type FilterValues = {
  categoryId: string;
  attributes: Attributes;
  series: string;
  language: string;
  condition: string;
  minSalePrice: string;
  maxSalePrice: string;
  minExchangeValue: string;
  maxExchangeValue: string;
};
function invalidPrice(min: string, max: string) {
  return (
    [min, max].some(
      (v) =>
        v !== "" &&
        (!/^\d+$/.test(v) ||
          !Number.isSafeInteger(Number(v)) ||
          Number(v) < 10000 ||
          Number(v) > 1000000),
    ) ||
    (min !== "" && max !== "" && Number(min) > Number(max))
  );
}
const priceMessage =
  "Nhập số nguyên từ 10.000₫ đến 1.000.000₫; mức đến phải lớn hơn hoặc bằng mức từ.";
function invalidFilters(values: FilterValues) {
  return (
    invalidPrice(values.minSalePrice, values.maxSalePrice) ||
    invalidPrice(values.minExchangeValue, values.maxExchangeValue) ||
    (!!values.language && !/^[a-z]{2,3}$/.test(values.language)) ||
    (!!values.series &&
      (!supportsSeries(values.categoryId) ||
        values.series.length > 120 ||
        !values.series.trim())) ||
    (Object.keys(values.attributes).length > 0 && !values.categoryId) ||
    (!!values.categoryId &&
      classificationErrors(values.categoryId, values.attributes).length > 0)
  );
}
function FilterForm({
  initial,
  id,
  onApply,
  mode,
}: {
  initial: FilterValues;
  id: string;
  onApply: (values: FilterValues, shouldScroll?: boolean) => void;
  mode: string;
}) {
  const [draft, setDraft] = useState(initial);
  const invalid = invalidFilters(draft);

  function updateDraft(next: FilterValues, autoApply = false) {
    setDraft(next);
    if (autoApply && !invalidFilters(next)) {
      onApply(next, false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!invalid) onApply(draft, true);
  }
  function clearGroup(
    event: React.MouseEvent<HTMLButtonElement>,
    next: FilterValues,
  ) {
    // The reset action disappears; keep keyboard focus inside its own group.
    event.currentTarget
      .closest("fieldset")
      ?.querySelector<HTMLElement>("input, select")
      ?.focus();
    updateDraft(next, true);
  }
  function range(kind: "SalePrice" | "ExchangeValue", title: string) {
    const minKey = kind === "SalePrice" ? "minSalePrice" : "minExchangeValue";
    const maxKey = kind === "SalePrice" ? "maxSalePrice" : "maxExchangeValue";
    const error = invalidPrice(draft[minKey], draft[maxKey]);
    return (
      <fieldset
        className={styles.priceFilter + " " + styles.filterGroup}
        aria-labelledby={`${id}-${kind}-label`}
      >
        <legend>
          <span id={`${id}-${kind}-label`}>
            {(draft[minKey] || draft[maxKey]) && <small>Đã chọn khoảng</small>}
          </span>
          {(draft[minKey] || draft[maxKey]) && (
            <button
              type="button"
              className={styles.groupClear}
              aria-label={`Xóa lựa chọn ${title.toLowerCase()}`}
              onClick={(event) =>
                clearGroup(event, { ...draft, [minKey]: "", [maxKey]: "" })
              }
            >
              Xóa
            </button>
          )}
        </legend>
        <div className={styles.priceFields}>
          <label>
            <span>Từ</span>
            <input
              aria-label={title + " từ"}
              inputMode="numeric"
              placeholder="10.000"
              value={draft[minKey]}
              onChange={(e) => setDraft({ ...draft, [minKey]: e.target.value })}
              onBlur={() => {
                if (!error && (draft[minKey] !== initial[minKey] || draft[maxKey] !== initial[maxKey])) {
                  updateDraft(draft, true);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!error) updateDraft(draft, true);
                }
              }}
              aria-invalid={error}
              aria-describedby={error ? id + "-" + kind + "-error" : undefined}
            />
          </label>
          <label>
            <span>Đến</span>
            <input
              aria-label={title + " đến"}
              inputMode="numeric"
              placeholder="1.000.000"
              value={draft[maxKey]}
              onChange={(e) => setDraft({ ...draft, [maxKey]: e.target.value })}
              onBlur={() => {
                if (!error && (draft[minKey] !== initial[minKey] || draft[maxKey] !== initial[maxKey])) {
                  updateDraft(draft, true);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!error) updateDraft(draft, true);
                }
              }}
              aria-invalid={error}
              aria-describedby={error ? id + "-" + kind + "-error" : undefined}
            />
          </label>
        </div>
        <div className={styles.pricePresets}>
          {[50000, 100000, 200000].map((price) => (
            <button
              type="button"
              key={price}
              aria-pressed={!draft[minKey] && draft[maxKey] === String(price)}
              aria-label={`${title} tối đa ${formatVnd(price)}`}
              onClick={() =>
                updateDraft({ ...draft, [minKey]: "", [maxKey]: String(price) }, true)
              }
            >
              ≤ {price / 1000}k
            </button>
          ))}
        </div>
        {error && (
          <p
            id={id + "-" + kind + "-error"}
            role="alert"
            className={styles.error}
          >
            {priceMessage}
          </p>
        )}
      </fieldset>
    );
  }
  return (
    <form className={styles.filterForm} onSubmit={submit} noValidate>
      <div className={styles.filterBody}>
        <div className={styles.classification}>
          <CatalogClassificationFields
            id={id}
            clearable
            renderSelect={(props) => <FilterSelect {...props} />}
            value={draft}
            onChange={(value) => updateDraft({ ...draft, ...value }, true)}
          />
        </div>
        <fieldset
          className={styles.filterGroup}
          aria-labelledby={`${id}-condition-label`}
        >
          <legend>
            <span id={`${id}-condition-label`}>
              Tình trạng sách{draft.condition && <small>1 đã chọn</small>}
            </span>
            {draft.condition && (
              <button
                type="button"
                className={styles.groupClear}
                aria-label="Xóa lựa chọn tình trạng sách"
                onClick={(event) =>
                  clearGroup(event, { ...draft, condition: "" })
                }
              >
                Xóa
              </button>
            )}
          </legend>
          <div className={styles.conditionChoices}>
            {[["", "Tất cả tình trạng"], ...Object.entries(conditions)].map(
              ([value, label]) => (
                <label
                  key={value}
                  data-selected={draft.condition === value || undefined}
                >
                  <input
                    type="radio"
                    name={`${id}-condition`}
                    value={value}
                    checked={draft.condition === value}
                    onChange={() => updateDraft({ ...draft, condition: value }, true)}
                  />
                  <span>{label}</span>
                </label>
              ),
            )}
          </div>
        </fieldset>
        {mode !== "Exchange" && (
          <details className={styles.extraBudget}>
            <summary>Khoảng giá bán</summary>
            {range("SalePrice", "Giá bán")}
          </details>
        )}
        {mode === "Exchange"
          ? range("ExchangeValue", "Giá trị đổi")
          : mode !== "Sale" && (
            <details className={styles.extraBudget}>
              <summary>Khoảng giá trị đổi</summary>
              {range("ExchangeValue", "Giá trị đổi")}
              <p className={styles.filterHint}>
                Nếu chọn cả hai khoảng tiền, sách cần đáp ứng cả hai.
              </p>
            </details>
          )}
        <fieldset
          className={`${styles.filterGroup} ${styles.languageFilter}`}
          aria-labelledby={`${id}-language-label`}
        >
          <legend>
            <span id={`${id}-language-label`}>
              Ngôn ngữ của sách{draft.language && <small>1 đã chọn</small>}
            </span>
            {draft.language && (
              <button
                type="button"
                className={styles.groupClear}
                aria-label="Xóa lựa chọn ngôn ngữ của sách"
                onClick={(event) =>
                  clearGroup(event, { ...draft, language: "" })
                }
              >
                Xóa
              </button>
            )}
          </legend>
          <FilterSelect
            id={`${id}-language`}
            label="Ngôn ngữ của sách"
            value={draft.language}
            onChange={(language) => updateDraft({ ...draft, language }, true)}
            options={[
              { value: "", label: "Tất cả ngôn ngữ" },
              ...languageOptions.map((option) => ({
                value: option.id,
                label: option.label,
              })),
            ]}
          />
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
                categoryId: "",
                attributes: {},
                series: "",
                language: "",
                condition: "",
                minSalePrice: "",
                maxSalePrice: "",
                minExchangeValue: "",
                maxExchangeValue: "",
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

const pageVariants: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 36 : direction < 0 ? -36 : 0,
    y: direction === 0 ? 18 : 0,
    opacity: 0,
    filter: "blur(3px)",
  }),
  center: {
    x: 0,
    y: 0,
    opacity: 1,
    filter: "blur(0px)",
    transition: {
      duration: 0.38,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -36 : direction < 0 ? 36 : 0,
    y: direction === 0 ? -18 : 0,
    opacity: 0,
    filter: "blur(3px)",
    transition: {
      duration: 0.22,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  }),
};

export function BookSearchPage() {
  const [params, setParams] = useSearchParams();
  const searchTerm = params.get("q") || "";
  const [settledSearch, setSettledSearch] = useState(searchTerm);
  const [composing, setComposing] = useState(false);
  const searchPending = searchTerm !== settledSearch || composing;

  useEffect(() => {
    if (searchTerm === settledSearch) return;
    const timer = window.setTimeout(() => setSettledSearch(searchTerm), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm, settledSearch]);
  const preview = isCatalogPreview(`?${params}`);
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = sidebar.current;
    if (!node) return;
    const check = () => {
      node.dataset.sticky = String(
        node.offsetHeight + 108 <= window.innerHeight,
      );
    };
    const observer = new ResizeObserver(check);
    observer.observe(node);
    window.addEventListener("resize", check);
    check();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", check);
    };
  }, []);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("latlai_catalog_filter_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("latlai_catalog_filter_collapsed", String(next));
      } catch { }
      return next;
    });
  };

  const dialog = useRef<HTMLDialogElement>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [floating, setFloating] = useState(() => typeof window !== "undefined" && window.scrollY > 48);
  useLayoutEffect(
    () =>
      observeHeaderScroll((next) => {
        setFloating(next);
      }),
    [],
  );
  const query = new URLSearchParams();
  for (const key of queryKeys) {
    const value = params.get(key);
    if (value) query.set(key, value);
  }
  query.set("limit", "20");
  const initial = {
    categoryId:
      params.get("categoryId") ||
      categoryFor(params.get("category") || "")?.id ||
      "",
    attributes: (() => {
      try {
        return readAttributes(params.get("facets"));
      } catch {
        return { invalid: [] } as Attributes;
      }
    })(),
    series: params.get("series") || "",
    language: params.get("language") || "",
    minExchangeValue: params.get("minExchangeValue") || "",
    maxExchangeValue: params.get("maxExchangeValue") || "",
    condition: params.get("condition") || "",
    minSalePrice: params.get("minSalePrice") || "",
    maxSalePrice: params.get("maxSalePrice") || "",
  };
  if (initial.categoryId) query.set("categoryId", initial.categoryId);
  const priceInvalid = invalidFilters(initial);
  const result = useQuery({
    queryKey: ["catalog-search", taxonomyVersion, preview, query.toString()],
    queryFn: () => getSearchShelf(query, preview),
    enabled: !priceInvalid && !searchPending,
    retry: false,
    staleTime: 30_000,
    gcTime: 300_000,
  });
  const filterKey = JSON.stringify(initial);

  const [pageHistory, setPageHistory] = useState<string[]>([]);
  const [transitionDirection, setTransitionDirection] = useState<number>(1);

  useEffect(() => {
    if (!params.get("cursor") && pageHistory.length > 0) {
      setPageHistory([]);
    }
  }, [params.get("cursor")]);

  const pageNumber = pageHistory.length + 1;

  function scrollToCatalogHeading() {
    const lenis = getLenis();
    if (lenis) {
      lenis.scrollTo("#catalog-results", {
        offset: -20,
        duration: 1.0,
      });
    } else {
      const heading = document.getElementById("catalog-results");
      heading?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    const heading = document.getElementById("catalog-results");
    heading?.focus({ preventScroll: true });
  }

  function handleNextPage() {
    if (!result.data?.nextCursor) return;
    const currentCursor = params.get("cursor") || "";
    setPageHistory((prev) => [...prev, currentCursor]);
    setTransitionDirection(1);
    const next = new URLSearchParams(params);
    next.set("cursor", result.data.nextCursor);
    setParams(next);
    requestAnimationFrame(() => scrollToCatalogHeading());
  }

  function handlePrevPage() {
    if (pageHistory.length === 0) {
      handleFirstPage();
      return;
    }
    const prevCursor = pageHistory[pageHistory.length - 1] ?? "";
    setPageHistory((prev) => prev.slice(0, -1));
    setTransitionDirection(-1);
    const next = new URLSearchParams(params);
    if (prevCursor) {
      next.set("cursor", prevCursor);
    } else {
      next.delete("cursor");
    }
    setParams(next);
    requestAnimationFrame(() => scrollToCatalogHeading());
  }

  function handleFirstPage() {
    setPageHistory([]);
    setTransitionDirection(-1);
    const next = new URLSearchParams(params);
    next.delete("cursor");
    setParams(next);
    requestAnimationFrame(() => scrollToCatalogHeading());
  }

  function update(key: string, value: string, replace = false) {
    setPageHistory([]);
    setTransitionDirection(0);
    const next = new URLSearchParams(params);
    next.delete("cursor");
    if (key === "categoryId") {
      next.delete("facets");
      next.delete("series");
      next.delete("category");
    }
    if (key === "mode") {
      for (const price of [
        "minSalePrice",
        "maxSalePrice",
        "minExchangeValue",
        "maxExchangeValue",
        "sort",
      ])
        next.delete(price);
    }
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace });
  }
  function clear() {
    setPageHistory([]);
    setTransitionDirection(0);
    const next = new URLSearchParams();
    if (params.get("q")) next.set("q", params.get("q")!);
    if (params.get("mode")) next.set("mode", params.get("mode")!);
    if (params.has("data")) next.set("data", params.get("data")!);
    setParams(next);
  }
  function closeFilters() {
    dialog.current?.close();
    setFilterOpen(false);
  }
  function apply(values: FilterValues, shouldScroll = false) {
    setPageHistory([]);
    setTransitionDirection(0);
    const next = new URLSearchParams(params);
    next.delete("cursor");
    next.delete("category");
    next.delete("facets");
    if (Object.keys(values.attributes).length)
      next.set("facets", JSON.stringify(values.attributes));
    const { attributes: _attributes, ...fields } = values;
    Object.entries(fields).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    setParams(next);
    closeFilters();
    if (shouldScroll) {
      requestAnimationFrame(() => scrollToCatalogHeading());
    }
  }
  useEffect(() => {
    const lenis = getLenis();
    if (!filterOpen) {
      lenis?.start();
      return;
    }
    lenis?.stop();
    const unlockScroll = lockPageScroll();
    const media = window.matchMedia("(min-width: 901px)");
    const closeOnDesktop = () => {
      if (media.matches) {
        dialog.current?.close();
        setFilterOpen(false);
      }
    };
    media.addEventListener("change", closeOnDesktop);
    return () => {
      unlockScroll();
      lenis?.start();
      media.removeEventListener("change", closeOnDesktop);
    };
  }, [filterOpen]);
  const chips = [
    ...(initial.categoryId
      ? [
        {
          key: "categoryId",
          label: categoryFor(initial.categoryId)?.label || initial.categoryId,
        },
      ]
      : []),
    ...(initial.language
      ? [
        {
          key: "language",
          label:
            languageOptions.find((o) => o.id === initial.language)?.label ||
            initial.language,
        },
      ]
      : []),
    ...(initial.series ? [{ key: "series", label: initial.series }] : []),
    ...facetsFor(initial.categoryId, initial.attributes, "search").flatMap(
      (f) =>
        (initial.attributes[f.id] || []).map((value) => ({
          key: "facets",
          facet: f.id,
          value,
          label: f.options.find((o) => o.id === value)?.label || value,
        })),
    ),
    ...(["minExchangeValue", "maxExchangeValue"] as const).flatMap((key) =>
      initial[key]
        ? [
          {
            key,
            label:
              (key.startsWith("min") ? "Đổi từ " : "Đổi đến ") +
              formatVnd(Number(initial[key])),
          },
        ]
        : [],
    ),
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
  function removeChip(chip: (typeof chips)[number]) {
    if (chip.key === "facets" && "facet" in chip && "value" in chip) {
      const attributes = { ...initial.attributes };
      const key = String(chip.facet);
      attributes[key] = (attributes[key] || []).filter((v) => v !== chip.value);
      if (!attributes[key]?.length) delete attributes[key];
      const compatible = compatibleAttributes(initial.categoryId, attributes, "search");
      update("facets", Object.keys(compatible).length ? JSON.stringify(compatible) : "");
    } else update(chip.key, "");
  }
  return (
    <motion.div
      className={styles.page}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <div className={styles.leavesWrapper} aria-hidden="true">
        <AutumnLeavesCanvas />
      </div>
      {chips.length > 0 && (
        <>
          <div
            className={styles.stickyFilterBar}
            data-floating={floating}
            role="region"
            aria-label="Bộ lọc đang áp dụng"
          >
            <div className={styles.stickyFilterInner}>
              <div className={styles.stickyFilterLead}>
                <Filter size={14} fill="currentColor" aria-hidden="true" />
                <span>Đang lọc:</span>
              </div>
              <div className={styles.stickyChipsScroll}>
                <AnimatePresence>
                  {chips.map((chip) => (
                    <motion.button
                      type="button"
                      key={
                        chip.key === "facets" && "facet" in chip && "value" in chip
                          ? `${chip.facet}-${chip.value}`
                          : chip.key
                      }
                      layout
                      initial={{ opacity: 0, scale: 0.8, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.75, transition: { duration: 0.16 } }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className={styles.stickyChip}
                      aria-label={`Bỏ lọc ${chip.label}`}
                      onClick={() => removeChip(chip)}
                    >
                      <span>{chip.label}</span>
                      <X size={13} aria-hidden="true" />
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
              <button
                type="button"
                className={styles.stickyClearAll}
                onClick={clear}
              >
                Xóa tất cả
              </button>
            </div>
          </div>
          <div className={styles.stickyFilterSpacer} aria-hidden="true" />
        </>
      )}
      <div
        className={styles.catalog}
        data-sidebar-collapsed={isSidebarCollapsed}
      >
        <motion.div
          className={styles.sidebarWrapper}
          aria-hidden={isSidebarCollapsed}
          initial={false}
          animate={{
            width: isSidebarCollapsed ? 0 : 264,
            opacity: isSidebarCollapsed ? 0 : 1,
            marginRight: isSidebarCollapsed ? 0 : 28,
          }}
          transition={{
            duration: 0.36,
            ease: [0.25, 1, 0.5, 1],
            opacity: {
              duration: isSidebarCollapsed ? 0.24 : 0.32,
              delay: isSidebarCollapsed ? 0.08 : 0,
            },
          }}
          style={{
            pointerEvents: isSidebarCollapsed ? "none" : "auto",
          }}
        >
          <motion.aside
            ref={sidebar}
            className={styles.sidebar}
            aria-label="Bộ lọc sách"
            initial={false}
            animate={{
              x: isSidebarCollapsed ? -80 : 0,
              opacity: isSidebarCollapsed ? 0 : 1,
              scale: isSidebarCollapsed ? 0.95 : 1,
            }}
            transition={{
              duration: 0.36,
              ease: [0.25, 1, 0.5, 1],
              opacity: {
                duration: isSidebarCollapsed ? 0.24 : 0.32,
                delay: isSidebarCollapsed ? 0.08 : 0,
              },
            }}
          >
            <div className={styles.sidebarHeader}>
              <h2>
                <Filter size={18} fill="currentColor" aria-hidden="true" />
                Bộ lọc sách
              </h2>
              <motion.button
                type="button"
                className={styles.collapseSidebarBtn}
                onClick={toggleSidebar}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                aria-label="Thu gọn bộ lọc sách"
                title="Thu gọn bộ lọc"
              >
                <Menu size={18} aria-hidden="true" />
              </motion.button>
            </div>
            <FilterForm
              key={filterKey}
              initial={initial}
              id="desktop"
              onApply={apply}
              mode={params.get("mode") || ""}
            />
          </motion.aside>
        </motion.div>
        <section className={styles.results} aria-labelledby="catalog-results">
          <div className={styles.searchBar}>
            <AnimatePresence initial={false}>
              {isSidebarCollapsed && (
                <motion.button
                  type="button"
                  key="expand-filter-btn"
                  className={styles.expandSidebarBtn}
                  onClick={toggleSidebar}
                  initial={{ opacity: 0, scale: 0.75, width: 0, marginRight: 0 }}
                  animate={{ opacity: 1, scale: 1, width: 52, marginRight: 12 }}
                  exit={{ opacity: 0, scale: 0.75, width: 0, marginRight: 0 }}
                  transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  aria-label={`Mở bộ lọc sách${chips.length > 0 ? ` (${chips.length} đang chọn)` : ""}`}
                  title="Mở bộ lọc sách"
                >
                  <Filter size={18} fill="currentColor" aria-hidden="true" />
                  {chips.length > 0 && (
                    <span className={styles.expandFilterBadge}>{chips.length}</span>
                  )}
                </motion.button>
              )}
            </AnimatePresence>
            <form
              role="search"
              className={styles.search}
              onSubmit={(event) => {
                event.preventDefault();
                if (composing) return;
                const value = searchTerm.trim();
                setSettledSearch(value);
                update("q", value);
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
                value={searchTerm}
                onChange={(event) => update("q", event.target.value, true)}
                onCompositionStart={() => setComposing(true)}
                onCompositionEnd={() => setComposing(false)}
              />
              <button type="submit">
                Tìm sách <ArrowRight size={17} aria-hidden="true" />
              </button>
            </form>
          </div>
          <div
            className={styles.modeRow}
            role="group"
            aria-label="Hình thức giao dịch"
          >
            {modes.map(([value, label]) => {
              const isActive = (params.get("mode") || "") === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => update("mode", value)}
                >
                  <span>{label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="activeModeIndicator"
                      className={styles.modeActiveIndicator}
                      transition={{ type: "spring", stiffness: 450, damping: 32 }}
                    />
                  )}
                </button>
              );
            })}
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
                  ? "Kiểm tra lại bộ lọc đã chọn."
                  : result.isFetching || searchPending
                    ? "Đang tìm sách…"
                    : result.data
                      ? `${result.data.items.length} ${preview ? "sách xem trước" : "tin đăng"} trên trang này`
                      : "Ảnh, tình trạng và giá của từng bản sách."}
              </p>
              {preview && (
                <p className={styles.filterHint}>
                  Thuộc tính và giá trong bộ sách xem trước là dữ liệu mẫu.
                </p>
              )}
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
                <Filter size={17} fill="currentColor" aria-hidden="true" />
                Bộ lọc{chips.length > 0 && <span>{chips.length}</span>}
              </button>
              <CatalogSort
                value={params.get("sort") || "newest"}
                preview={preview}
                onChange={(value) => update("sort", value)}
              />
            </div>
          </div>

          {priceInvalid ? (
            <div className={styles.state} role="alert">
              <h3>Bộ lọc chưa hợp lệ</h3>
              <p>
                Kiểm tra danh mục, thuộc tính và khoảng tiền đã chọn.{" "}
                {priceMessage}
              </p>
              <button type="button" onClick={clear}>
                Xóa bộ lọc
              </button>
            </div>
          ) : (
            <div aria-busy={result.isFetching || searchPending}>
              {(result.isPending || searchPending) && (
                <>
                  <div className={styles.loading} role="status">
                    <span />
                    Đang tìm kiếm và tải kệ sách…
                  </div>
                  <div className={styles.skeletonGrid} aria-hidden="true">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className={styles.skeletonCard}>
                        <div className={styles.skeletonCover} />
                        <div className={styles.skeletonTextLine} style={{ width: "85%" }} />
                        <div className={styles.skeletonTextLine} style={{ width: "60%" }} />
                        <div className={styles.skeletonPrice} />
                      </div>
                    ))}
                  </div>
                </>
              )}
              {!searchPending && result.isError && (
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
              {!searchPending && !result.isError && result.data?.items.length === 0 && (
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
              <AnimatePresence mode="wait" custom={transitionDirection} initial={false}>
                {!searchPending && result.data && result.data.items.length > 0 && (
                  <motion.div
                    key={`${params.get("cursor") || "first"}-${params.get("q") || ""}-${params.get("mode") || ""}-${params.get("sort") || ""}-${initial.categoryId}-${params.get("condition") || ""}`}
                    custom={transitionDirection}
                    variants={pageVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className={styles.gridContainer}
                  >
                    <div className={styles.grid}>
                      {result.data.items.map((book, index) => (
                        <HomeBookCard key={book.id} book={book} index={index} />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {!searchPending && (params.has("cursor") || result.data?.nextCursor) && (
                <nav className={styles.pagination} aria-label="Phân trang sách">
                  {params.has("cursor") && (
                    <>
                      <motion.button
                        type="button"
                        disabled={result.isFetching}
                        onClick={handleFirstPage}
                        whileHover={{ scale: 1.04, y: -2 }}
                        whileTap={{ scale: 0.96 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      >
                        Về trang đầu
                      </motion.button>
                      <motion.button
                        type="button"
                        disabled={result.isFetching}
                        onClick={handlePrevPage}
                        whileHover={{ scale: 1.04, y: -2 }}
                        whileTap={{ scale: 0.96 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      >
                        <ArrowLeft size={16} aria-hidden="true" />
                        Trang trước
                      </motion.button>
                    </>
                  )}
                  <div className={styles.pageIndicatorBadge}>
                    <BookOpen size={15} aria-hidden="true" />
                    <span>Trang {pageNumber}</span>
                  </div>
                  {result.data?.nextCursor && (
                    <motion.button
                      type="button"
                      className={styles.paginationNextBtn}
                      disabled={result.isFetching}
                      onClick={handleNextPage}
                      whileHover={{ scale: 1.04, y: -2 }}
                      whileTap={{ scale: 0.96 }}
                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    >
                      Trang tiếp theo{" "}
                      <ArrowRight size={16} aria-hidden="true" />
                    </motion.button>
                  )}
                </nav>
              )}
            </div>
          )}
        </section>
      </div>
      <dialog
        ref={dialog}
        data-lenis-prevent
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
        <FilterForm
          key={filterKey}
          initial={initial}
          id="mobile"
          onApply={apply}
          mode={params.get("mode") || ""}
        />
      </dialog>
    </motion.div>
  );
}
