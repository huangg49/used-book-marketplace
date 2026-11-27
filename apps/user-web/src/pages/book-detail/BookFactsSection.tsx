import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Building2, CalendarDays, Hash, Languages, Layers3, type LucideIcon } from "lucide-react";
import {
  categoryFor,
  categoryPath,
  classificationLabels,
  languageLabel,
} from "@used-books/api-contract/catalog-taxonomy";
import { InfoTip } from "../../components/InfoTip";
import { searchUrl } from "../../lib/routes";
import type { PublicListing } from "../../services/public-listings";
import styles from "../BookDetailPage.module.css";

function Fact({ label, icon: Icon, children }: { label: string; icon?: LucideIcon; children: ReactNode }) {
  return (
    <div>
      <dt>
        {Icon && <><Icon size={14} aria-hidden="true" />{" "}</>}
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Joins inline values with a separator, keeping each one its own element. */
function joined<T extends { id: string }>(items: T[], separator: string, render: (item: T) => ReactNode) {
  return items.map((item, index) => (
    <span key={item.id}>
      {index > 0 && separator}
      {render(item)}
    </span>
  ));
}

export function BookFactsSection({ book: listing }: { book: PublicListing }) {
  const { book, bundle } = listing;
  const categoryKey = book.categoryId || book.category;
  const categoryId = book.categoryId || categoryFor(book.category)?.id || "";
  const attributes = book.attributes;

  // Some facets only mean something together with a related one.
  function facetQuery(facetId: string, optionId: string) {
    return JSON.stringify({
      [facetId]: [optionId],
      ...(facetId === "level" && attributes?.purpose?.includes("exam") ? { purpose: ["exam"] } : {}),
      ...(facetId === "grade" && attributes?.schoolStage ? { schoolStage: attributes.schoolStage } : {}),
    });
  }

  const publication: { label: string; icon: LucideIcon; value: ReactNode }[] = [
    { label: "Nhà xuất bản", icon: Building2, value: book.publisher },
    { label: "Năm xuất bản", icon: CalendarDays, value: book.publicationYear },
    { label: "Ấn bản", icon: Layers3, value: book.edition },
    { label: "ISBN", icon: Hash, value: book.isbn },
  ];

  return (
    <section className={styles.details}>
      <div className={styles.detailsHeading}>
        <div className={styles.headingRow}>
          <h2>{bundle ? "Đầu sách đại diện" : "Thông tin sách"}</h2>
          <InfoTip label={bundle ? "Đầu sách đại diện" : "Thông tin sách"}>
            {bundle
              ? "Phân loại theo đầu sách đại diện. Các cuốn thực tế được ghi trong danh sách bộ sách ở trên."
              : "Thông tin xuất bản và phân loại của đầu sách. Bấm danh mục hoặc thuộc tính để tìm sách tương tự."}
          </InfoTip>
        </div>
      </div>
      <dl>
        <Fact label="Danh mục">
          {categoryFor(categoryKey)
            ? joined(categoryPath(categoryKey), " / ", (category) => (
                <Link to={searchUrl({ data: "live", categoryId: category.id })}>{category.label}</Link>
              ))
            : book.category || "Chưa ghi rõ"}
        </Fact>
        {book.series && (
          <Fact label="Bộ truyện">
            <Link to={searchUrl({ data: "live", categoryId, series: book.series })}>{book.series}</Link>
          </Fact>
        )}
        {classificationLabels(book).map((facet) => (
          <Fact key={facet.id} label={facet.label}>
            {joined(facet.values, " · ", (option) => (
              <Link to={searchUrl({ data: "live", categoryId, facets: facetQuery(facet.id, option.id) })}>
                {option.label}
              </Link>
            ))}
          </Fact>
        ))}
        <Fact label="Ngôn ngữ" icon={Languages}>
          {languageLabel(book.language)}
        </Fact>
        {publication.map(
          (fact) =>
            Boolean(fact.value) && (
              <Fact key={fact.label} label={fact.label} icon={fact.icon}>
                {fact.value}
              </Fact>
            ),
        )}
      </dl>
    </section>
  );
}
