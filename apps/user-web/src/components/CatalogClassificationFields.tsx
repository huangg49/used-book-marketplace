import { useState } from "react";
import type { ReactNode } from "react";
import {
  categories,
  categoryFor,
  facetsFor,
  compatibleAttributes,
  supportsSeries,
  foldCatalogText,
  type Attributes,
} from "@used-books/api-contract/catalog-taxonomy";
import styles from "./CatalogClassificationFields.module.css";
import type { FilterSelectProps } from "./FilterSelect";

export interface ClassificationValue {
  categoryId: string;
  attributes: Attributes;
  series: string;
}
export function CatalogClassificationFields({
  value,
  onChange,
  id,
  editing = false,
  clearable = false,
  collapseOptional = false,
  secondaryField,
  renderSelect,
}: {
  value: ClassificationValue;
  onChange: (value: ClassificationValue) => void;
  id: string;
  editing?: boolean;
  clearable?: boolean;
  collapseOptional?: boolean;
  secondaryField?: ReactNode;
  renderSelect?: (props: FilterSelectProps) => ReactNode;
}) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const context = editing ? "metadata" : "search";
  const category = categoryFor(value.categoryId);
  const root = categories.find(
    (c) => c.id === (category?.parentId || category?.id),
  );
  function changeAttributes(next: Attributes) {
    const attributes = compatibleAttributes(value.categoryId, next, context);
    const removed = Object.entries(next).reduce(
      (n, [key, values]) =>
        n + values.filter((v) => !attributes[key]?.includes(v)).length,
      0,
    );
    setNotice(
      removed ? `Đã bỏ ${removed} lựa chọn phụ thuộc không còn phù hợp.` : "",
    );
    onChange({ ...value, attributes });
  }
  function changeCategory(categoryId: string) {
    const attributes = compatibleAttributes(
      categoryId,
      value.attributes,
      context,
    );
    const removed = Object.entries(value.attributes).reduce(
      (n, [key, values]) =>
        n + values.filter((v) => !attributes[key]?.includes(v)).length,
      0,
    );
    setNotice(
      removed ? `Đã bỏ ${removed} lựa chọn không phù hợp danh mục mới.` : "",
    );
    setQueries({});
    onChange({
      categoryId,
      attributes,
      series: supportsSeries(categoryId) ? value.series : "",
    });
  }
  function select(props: FilterSelectProps) {
    return renderSelect ? (
      renderSelect(props)
    ) : (
      <select
        id={props.id}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <div className={styles.fields}>
      <div
        className={styles.primaryFields}
        data-paired={!!secondaryField || undefined}
      >
        <div className={styles.categoryField}>
          <div className={clearable ? styles.categoryHeading : undefined}>
            <label className={styles.label} htmlFor={`${id}-category`}>
              Danh mục sách
            </label>
            {clearable && value.categoryId && (
              <button
                type="button"
                className={styles.clear}
                aria-label="Xóa lựa chọn danh mục sách"
                onClick={(event) => {
                  event.currentTarget
                    .closest(`.${styles.fields}`)
                    ?.querySelector<HTMLElement>(
                      'select, input[role="combobox"]',
                    )
                    ?.focus();
                  changeCategory("");
                }}
              >
                Xóa
              </button>
            )}
          </div>
          {select({
            id: `${id}-category`,
            label: "Danh mục sách",
            value: root?.id || "",
            onChange: changeCategory,
            options: [
              {
                value: "",
                label: editing ? "Chọn danh mục…" : "Tất cả danh mục",
              },
              ...categories.map((category) => ({
                value: category.id,
                label: category.label,
              })),
            ],
          })}
        </div>
        {secondaryField}
      </div>
      <div className={category ? styles.categoryDetails : undefined}>
      {!!root?.children.length && (
        <div className={styles.subcategory}>
          <label htmlFor={`${id}-subcategory`}>Nhóm sách</label>
          {select({
            id: `${id}-subcategory`,
            label: "Nhóm sách",
            value: category?.parentId ? category.id : "",
            onChange: (value) => changeCategory(value || root.id),
            options: [
              { value: "", label: `Tất cả ${root.label.toLowerCase()}` },
              ...root.children.map((category) => ({
                value: category.id,
                label: category.label,
              })),
            ],
          })}
        </div>
      )}
      {category && (
        <p className={styles.context} role="status">
          {editing
            ? "Bổ sung thông tin bạn biết; có thể để trống."
            : "Lọc riêng cho"}{" "}
          <strong>{editing ? "" : category.label}</strong>
          {!editing && ". Chọn nhiều mục để mở rộng kết quả trong cùng nhóm."}
        </p>
      )}
      {notice && (
        <p className={styles.context} role="status">
          {notice}
        </p>
      )}
      {facetsFor(value.categoryId, value.attributes, context).map(
        (facet, index) => {
          const selected = value.attributes[facet.id] || [];
          const showAll = expanded.includes(facet.id);
          const term = foldCatalogText(queries[facet.id] || "").trim();
          const matching = facet.options.filter(
            (o) =>
              !term ||
              foldCatalogText(o.label).includes(term) ||
              selected.includes(o.id),
          );
          const visible =
            showAll || term
              ? matching
              : matching.filter((o, i) => i < 5 || selected.includes(o.id));
          return (
            <div className={styles.facetGroup} key={`${root?.id}-${facet.id}`}>
              <details
                className={styles.facet}
                data-clearable={(clearable && selected.length > 0) || undefined}
                open={
                  (!collapseOptional && (editing || index < 2)) ||
                  selected.length > 0 ||
                  undefined
                }
              >
                <summary>
                  {facet.label}
                  {selected.length > 0 && (
                    <>
                      {" "}
                      <span>
                        {selected.length}
                        {clearable && " đã chọn"}
                      </span>
                    </>
                  )}
                </summary>
                <div className={styles.choices}>
                  {facet.options.length > 10 && (
                    <>
                      <label
                        className={styles.optionSearch}
                        htmlFor={`${id}-${facet.id}-search`}
                      >
                        Tìm trong {facet.label.toLowerCase()}
                      </label>
                      <input
                        id={`${id}-${facet.id}-search`}
                        type="search"
                        value={queries[facet.id] || ""}
                        placeholder="Tìm lựa chọn…"
                        onChange={(e) =>
                          setQueries({ ...queries, [facet.id]: e.target.value })
                        }
                      />
                    </>
                  )}
                  {visible.map((option) => (
                    <label key={option.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(option.id)}
                        disabled={
                          !selected.includes(option.id) && selected.length >= 16
                        }
                        onChange={(e) => {
                          const next = {
                            ...value.attributes,
                            [facet.id]: e.target.checked
                              ? [...selected, option.id]
                              : selected.filter((v) => v !== option.id),
                          };
                          changeAttributes(next);
                        }}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                  {!facet.options.length && (
                    <p>Chọn thông tin phía trên để xem các lựa chọn phù hợp.</p>
                  )}
                  {!!facet.options.length && !matching.length && (
                    <p role="status">Không có lựa chọn phù hợp.</p>
                  )}
                  {selected.length >= 16 && (
                    <p role="status">
                      Đã chọn tối đa 16 mục. Bỏ một mục để chọn thêm.
                    </p>
                  )}
                  {!term &&
                    facet.options.length > 5 &&
                    (showAll || visible.length < facet.options.length) && (
                      <button
                        type="button"
                        className={styles.more}
                        onClick={() =>
                          setExpanded(
                            showAll
                              ? expanded.filter((x) => x !== facet.id)
                              : [...expanded, facet.id],
                          )
                        }
                      >
                        {showAll
                          ? "Thu gọn"
                          : `Xem thêm (${facet.options.length - visible.length})`}
                      </button>
                    )}
                </div>
              </details>
              {clearable && selected.length > 0 && (
                <button
                  type="button"
                  className={styles.facetClear}
                  aria-label={`Xóa lựa chọn ${facet.label.toLowerCase()}`}
                  onClick={(event) => {
                    event.currentTarget.parentElement
                      ?.querySelector("summary")
                      ?.focus();
                    const attributes = { ...value.attributes };
                    delete attributes[facet.id];
                    changeAttributes(attributes);
                  }}
                >
                  Xóa
                </button>
              )}
            </div>
          );
        },
      )}
      {supportsSeries(value.categoryId) && (
        <div className={styles.subcategory}>
          <div className={clearable ? styles.categoryHeading : undefined}>
            <label htmlFor={`${id}-series`}>Bộ truyện</label>
            {clearable && value.series && (
              <button
                type="button"
                className={styles.clear}
                aria-label="Xóa lựa chọn bộ truyện"
                onClick={(event) => {
                  event.preventDefault();
                  event.currentTarget
                    .closest(`.${styles.subcategory}`)
                    ?.querySelector("input")
                    ?.focus();
                  onChange({ ...value, series: "" });
                }}
              >
                Xóa
              </button>
            )}
          </div>
          <input
            id={`${id}-series`}
            value={value.series}
            maxLength={120}
            placeholder={editing ? "Ví dụ: Naruto" : "Nhập đúng tên bộ truyện…"}
            onChange={(e) => onChange({ ...value, series: e.target.value })}
          />
          {!editing && <small>Tìm theo tên bộ truyện đầy đủ.</small>}
        </div>
      )}
      </div>
    </div>
  );
}
