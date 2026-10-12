import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { categories } from "@used-books/api-contract/catalog-taxonomy";
import { CatalogClassificationFields } from "./CatalogClassificationFields";
import type { FilterSelectProps } from "./FilterSelect";

describe("classification select consumers", () => {
  const category = categories.find((category) => category.children.length > 0)!;
  const child = category.children[0];
  const value = { categoryId: child.id, attributes: {}, series: "" };

  it("keeps the posting consumer native with associated labels and its selected child", () => {
    const html = renderToStaticMarkup(
      <CatalogClassificationFields
        id="sell"
        editing
        value={value}
        onChange={() => undefined}
      />,
    );
    expect(html.match(/<select /g)).toHaveLength(2);
    expect(html).toContain('for="sell-category"');
    expect(html).toContain('for="sell-subcategory"');
    expect(html).toContain(`value="${child.id}" selected=""`);
    expect(html).toContain("Chọn danh mục…");
    expect(html).not.toContain('role="combobox"');
  });

  it("lets Search replace only the two selects while retaining dependent category cleanup", () => {
    const onChange = vi.fn();
    const renderSelect = vi.fn((props: FilterSelectProps) => (
      <span>{props.label}</span>
    ));
    renderToStaticMarkup(
      <CatalogClassificationFields
        id="search"
        value={value}
        onChange={onChange}
        renderSelect={renderSelect}
      />,
    );
    const controls = renderSelect.mock.calls.map((call) => call[0]);
    expect(controls).toHaveLength(2);
    expect(controls[0].value).toBe(category.id);
    expect(controls[1].value).toBe(child.id);
    controls[1].onChange("");
    expect(onChange).toHaveBeenLastCalledWith({
      categoryId: category.id,
      attributes: {},
      series: "",
    });
    controls[0].onChange("");
    expect(onChange).toHaveBeenLastCalledWith({
      categoryId: "",
      attributes: {},
      series: "",
    });
  });
  it("offers descendant exams in Search while the posting parent stays a valid broad context", () => {
    const base = {
      categoryId: "languages",
      attributes: { purpose: ["exam"] },
      series: "",
    };
    const search = renderToStaticMarkup(
      <CatalogClassificationFields
        id="search"
        value={{ ...base, attributes: { ...base.attributes, level: ["n3"] } }}
        onChange={() => undefined}
      />,
    );
    const edit = renderToStaticMarkup(
      <CatalogClassificationFields
        id="edit"
        editing
        value={base}
        onChange={() => undefined}
      />,
    );
    expect(search).toContain("JLPT N3");
    expect(search).toContain("TOEIC");
    expect(edit).not.toContain("JLPT N3");
    expect(edit).not.toContain("TOEIC");
  });
  it("keeps option searches labelled and prevents choosing more than sixteen values", () => {
    const base = {
      categoryId: "business",
      attributes: {
        businessTopic: [
          "leadership",
          "strategy",
          "digital-marketing",
          "branding",
          "sales",
          "investing",
          "personal-finance",
          "banking",
          "startup",
          "innovation",
          "microeconomics",
          "macroeconomics",
          "accounting",
          "tax",
          "audit",
          "recruitment",
        ],
      },
      series: "",
    };
    const html = renderToStaticMarkup(
      <CatalogClassificationFields
        id="search"
        value={base}
        onChange={() => undefined}
      />,
    );
    expect(html).toContain('for="search-businessTopic-search"');
    expect(html).toContain('id="search-businessTopic-search"');
    expect(html).toContain("Đã chọn tối đa 16 mục");
  });
});
