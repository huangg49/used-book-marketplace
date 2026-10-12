import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { categories } from "@used-books/api-contract/catalog-taxonomy";
import { searchUrl } from "../lib/routes";
import home from "../pages/HomePage.module.css";
import styles from "./CategoryDiscovery.module.css";

export function CategoryDiscovery({ preview }: { preview: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const shown = expanded ? categories : categories.slice(0, 8);
  return (
    <section className={home.categories} aria-labelledby={`${id}-title`}>
      <div className={home.categoryHead}>
        <h2 id={`${id}-title`}>Khám phá danh mục</h2>
        <p>Chọn loại sách, rồi tìm bản phù hợp với bạn.</p>
      </div>
      <nav
        className={styles.links}
        aria-label="Khám phá danh mục sách"
        id={`${id}-links`}
      >
        {shown.map((category) => (
          <Link
            key={category.id}
            to={searchUrl({
              categoryId: category.id,
              data: preview ? "preview" : "live",
            })}
          >
            {category.label}
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        ))}
      </nav>
      <button
        className={styles.more}
        type="button"
        aria-expanded={expanded}
        aria-controls={`${id}-links`}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? "Thu gọn" : "Tất cả danh mục"}
      </button>
    </section>
  );
}
