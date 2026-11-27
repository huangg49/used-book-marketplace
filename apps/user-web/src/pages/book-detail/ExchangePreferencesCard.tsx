import { Link } from "react-router-dom";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { searchUrl } from "../../lib/routes";
import type { PublicListing } from "../../services/public-listings";
import styles from "../BookDetailPage.module.css";

type Props = {
  preferences: PublicListing["exchangePreferences"];
  isOwner: boolean;
};

const liveSearch = (q: string) => searchUrl({ data: "live", q });

export function ExchangePreferencesCard({ preferences, isOwner }: Props) {
  const { targetCategory, targetAuthor, targetDescription } = preferences ?? {};
  if (!targetCategory && !targetAuthor && !targetDescription) return null;

  return (
    <div className={styles.exchangePreferences}>
      <h3>
        <BookOpen size={18} aria-hidden="true" />
        Tiêu chí đổi sách của người đăng
      </h3>
      {targetCategory && (
        <p>
          <strong>Thể loại:</strong>{" "}
          <Link to={liveSearch(targetCategory)}>{targetCategory}</Link>
        </p>
      )}
      {targetAuthor && (
        <p>
          <strong>Tác giả:</strong>{" "}
          <Link to={liveSearch(targetAuthor)}>{targetAuthor}</Link>
        </p>
      )}
      {targetDescription && (
        <p>
          <strong>Ghi chú:</strong> {targetDescription}
        </p>
      )}
      {isOwner && (
        <Link className={styles.exchangeSearch} to={liveSearch(targetAuthor || targetCategory || "")}>
          Tìm sách theo mong muốn <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
