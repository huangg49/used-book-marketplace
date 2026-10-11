import { useState } from "react";
import type { ReactNode } from "react";
import {
  categories,
  categoryFor,
  facetsFor,
  compatibleAttributes,
  type Attributes,
} from "@used-books/api-contract/catalog-taxonomy";
import styles from "./CatalogClassificationFields.module.css";

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
}: {
  value: ClassificationValue;
  onChange: (value: ClassificationValue) => void;
  id: string;
  editing?: boolean;
  clearable?: boolean;
  collapseOptional?: boolean;
  secondaryField?: ReactNode;
}) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const category = categoryFor(value.categoryId);
  const root = categories.find(
    (c) => c.id === (category?.parentId || category?.id),
  );
  function changeCategory(categoryId: string) {
    onChange({
      categoryId,
      attributes: compatibleAttributes(categoryId, value.attributes),
      series: ["manga", "light-novel"].includes(categoryId) ? value.series : "",
    });
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
                    ?.querySelector("select")
                    ?.focus();
                  changeCategory("");
                }}
              >
                Xóa
              </button>
            )}
          </div>
          <select
            id={`${id}-category`}
            value={root?.id || ""}
            onChange={(e) => changeCategory(e.target.value)}
          >
            <option value="">
              {editing ? "Chọn danh mục…" : "Tất cả danh mục"}
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        {secondaryField}
      </div>
      {!!root?.children.length && (
        <label className={styles.subcategory}>
          Nhóm sách
          <select
            value={category?.parentId ? category.id : ""}
            onChange={(e) => changeCategory(e.target.value || root.id)}
          >
            <option value="">Tất cả {root.label.toLowerCase()}</option>
            {root.children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
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
      {facetsFor(value.categoryId, value.attributes).map((facet, index) => {
        const selected = value.attributes[facet.id] || [];
        const showAll = expanded.includes(facet.id);
        const visible = showAll
          ? facet.options
          : facet.options.filter((o, i) => i < 5 || selected.includes(o.id));
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
                {visible.map((option) => (
                  <label key={option.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(option.id)}
                      onChange={(e) => {
                        const next = {
                          ...value.attributes,
                          [facet.id]: e.target.checked
                            ? [...selected, option.id]
                            : selected.filter((v) => v !== option.id),
                        };
                        onChange({
                          ...value,
                          attributes: compatibleAttributes(
                            value.categoryId,
                            next,
                          ),
                        });
                      }}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
                {!facet.options.length && (
                  <p>Chọn thông tin phía trên để xem các lựa chọn phù hợp.</p>
                )}
                {facet.options.length > 5 &&
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
                  onChange({
                    ...value,
                    attributes: compatibleAttributes(
                      value.categoryId,
                      attributes,
                    ),
                  });
                }}
              >
                Xóa
              </button>
            )}
          </div>
        );
      })}
      {["manga", "light-novel"].includes(value.categoryId) && (
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
  );
}
