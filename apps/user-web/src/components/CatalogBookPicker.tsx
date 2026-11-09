import { useState, type AriaAttributes, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { session } from "../services/api";
import { Search } from "lucide-react";
import styles from "./CatalogClassificationFields.module.css";
const book = z.object({
  id: z.string().uuid(),
  title: z.string(),
  authors: z.array(z.string()),
  category: z.string(),
  categoryId: z.string().nullable().optional(),
  attributes: z.record(z.string(), z.array(z.string())).optional(),
  language: z.string(),
  series: z.string().nullable().optional(),
});
export type PickedBook = z.infer<typeof book>;
export function CatalogBookPicker({
  onSelect,
  label = "Chọn đầu sách đã có",
  compact = false,
  feedback,
  feedbackMessage,
}: {
  onSelect: (book: PickedBook) => void;
  label?: string;
  compact?: boolean;
  feedback?: Pick<AriaAttributes, "aria-invalid" | "aria-describedby">;
  feedbackMessage?: ReactNode;
}) {
  const [term, setTerm] = useState("");
  const [cursor, setCursor] = useState("");
  const result = useQuery({
    queryKey: ["sell-catalog", term.trim(), cursor],
    enabled: term.trim().length >= 2,
    retry: false,
    queryFn: () =>
      session.publicRequest(
        "/catalog/books?" +
          new URLSearchParams({
            q: term.trim(),
            limit: "5",
            ...(cursor ? { cursor } : {}),
          }),
        z.object({ items: z.array(book), nextCursor: z.string().nullable() }),
      ),
  });
  return (
    <div className={`${styles.picker} ${compact ? styles.compactPicker : ""}`}>
      <label htmlFor="sell-catalog-search">{label}</label>
      <div className={styles.searchField}>
        {compact && <Search size={20} aria-hidden="true" />}
        <input
          id="sell-catalog-search"
          type="search"
          {...feedback}
          placeholder={compact ? "Tên sách, tác giả, ISBN" : "Nhập tên, tác giả hoặc ISBN…"}
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setCursor("");
          }}
        />
      </div>
      {feedbackMessage}
      {result.isFetching && <p role="status">Đang tìm trong danh mục…</p>}
      {result.isError && (
        <p role="alert">
          Chưa tải được danh mục.{" "}
          <button type="button" onClick={() => void result.refetch()}>
            Thử lại
          </button>
        </p>
      )}
      {!result.isFetching &&
        !result.isError &&
        result.data?.items.length === 0 && (
          <p>
            {compact
              ? "Chưa tìm thấy sách phù hợp."
              : "Chưa tìm thấy. Bạn có thể đề nghị đầu sách mới bên dưới."}
          </p>
        )}
      {result.data?.items.map((b) => (
        <button
          className={styles.bookOption}
          type="button"
          key={b.id}
          onClick={() => onSelect(b)}
        >
          <strong>{b.title}</strong>
          <span>
            {b.authors.join(" · ")} · {b.category}
          </span>
        </button>
      ))}
      {result.data?.nextCursor && (
        <button
          type="button"
          onClick={() => setCursor(result.data!.nextCursor!)}
        >
          Xem kết quả tiếp theo
        </button>
      )}
    </div>
  );
}
