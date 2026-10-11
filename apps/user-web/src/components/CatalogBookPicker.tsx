import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { session } from "../services/api";
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
}: {
  onSelect: (book: PickedBook) => void;
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
    <div className={styles.picker}>
      <label htmlFor="sell-catalog-search">Chọn đầu sách đã có</label>
      <input
        id="sell-catalog-search"
        type="search"
        placeholder="Nhập tên, tác giả hoặc ISBN…"
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          setCursor("");
        }}
      />
      {result.isFetching && <p role="status">Đang tìm trong catalog…</p>}
      {result.isError && (
        <p role="alert">
          Chưa tải được catalog.{" "}
          <button type="button" onClick={() => void result.refetch()}>
            Thử lại
          </button>
        </p>
      )}
      {!result.isFetching &&
        !result.isError &&
        result.data?.items.length === 0 && (
          <p>Chưa tìm thấy. Bạn có thể đề nghị đầu sách mới bên dưới.</p>
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
