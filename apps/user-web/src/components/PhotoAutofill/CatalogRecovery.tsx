import { useEffect, useEffectEvent, useRef, useState, useId } from "react";
import {
  catalogBookFacts,
  catalogHints,
  findCatalogMatches,
  initialCatalogFields,
  matchReason,
  matchWarning,
  type CatalogMatch,
  type CatalogSearchFields,
  type AutofillSuggestion,
} from "@used-books/session-client";
import { ConfirmDialog } from "../ConfirmDialog";
import { session } from "../../services/api";
import {
  ensureDraft,
  type DraftAttempt,
} from "../../services/listing-submission";
import styles from "./PhotoAutofill.module.css";

export function CatalogRecovery({
  attempt,
  channel,
  suggestion,
  initialHints,
  compact = false,
  disabled,
  onPickBook,
}: {
  attempt: DraftAttempt;
  channel?: "Auction";
  suggestion: AutofillSuggestion | null;
  initialHints?: AutofillSuggestion["fields"];
  compact?: boolean;
  disabled: boolean;
  onPickBook: (match: CatalogMatch) => void;
}) {
  const [fields, setFields] = useState(() =>
    initialCatalogFields(initialHints ?? suggestion?.fields),
  );
  const [answer, setAnswer] = useState({
    items: [] as CatalogMatch[],
    truncated: false,
    signature: JSON.stringify(fields),
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<CatalogMatch | null>(null);
  const [searched, setSearched] = useState(false);
  const signature = JSON.stringify(fields),
    current = useRef(signature),
    active = useRef(true),
    sequence = useRef(0),
    busyRef = useRef(false);
  const id = useId();
  current.current = signature;
  // Parent keys this panel by suggestion ID. Re-read current catalog once per suggestion;
  // cached AI matches cannot bypass current ISBN/volume filters.
  const searchInitial = useEffectEvent(() => {
    if (
      (suggestion || initialHints) &&
      (fields.title.trim() || fields.isbn.trim())
    )
      void search();
  });
  useEffect(() => {
    active.current = true;
    busyRef.current = false;
    searchInitial();
    return () => {
      active.current = false;
    };
  }, []);
  const stale = signature !== answer.signature;
  function edit(key: keyof CatalogSearchFields, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
    setSelected(null);
  }
  async function search() {
    if (disabled || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    const at = signature,
      run = ++sequence.current;
    try {
      const draft = await ensureDraft(attempt, channel);
      const result = await findCatalogMatches(
        session,
        draft.entityId,
        catalogHints(fields),
      );
      if (
        active.current &&
        sequence.current === run &&
        current.current === at
      ) {
        setAnswer({ ...result, signature: at });
        setSearched(true);
      }
    } catch {
      if (active.current && sequence.current === run)
        setError(
          "Chưa tìm được danh mục. Kiểm tra tên/ISBN rồi thử lại; nội dung đã nhập vẫn được giữ.",
        );
    } finally {
      if (active.current && sequence.current === run) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }
  const SearchShell = compact ? "details" : "div";
  const chooseLocked = disabled || busy || stale || !!error;
  return (
    <div className={styles.recovery} aria-label="Đối chiếu đầu sách">
      <h4>Chọn đúng đầu sách</h4>
      <p className={styles.help}>
        {compact
          ? "Đối chiếu tác giả, tập và ấn bản trước khi chọn."
          : "Sửa chữ bị đọc sai rồi tìm trong danh mục. Tìm lại không gọi AI và không thay thông tin bài đăng."}
      </p>
      <SearchShell className={styles.searchControls}>
        {compact ? <summary>Sửa thông tin tìm</summary> : null}
        <div
          className={styles.searchFields}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (fields.title.trim() || fields.isbn.trim()) void search();
            }
          }}
        >
          {(
            [
              ["title", "Tên sách để tìm", 300],
              ["authors", "Tác giả để tìm", 2010],
              ["isbn", "ISBN để tìm", 30],
              ["edition", "Tập hoặc ấn bản để tìm", 200],
            ] as const
          ).map(([key, label, maxLength]) => (
            <label key={key} htmlFor={`${id}-${key}`}>
              <span>{label}</span>
              <input
                id={`${id}-${key}`}
                value={fields[key]}
                maxLength={maxLength}
                disabled={disabled || busy}
                onChange={(event) => edit(key, event.target.value)}
              />
            </label>
          ))}
        </div>
        <p className={styles.help}>
          Nhiều tác giả: ngăn cách bằng dấu chấm phẩy (;). Không có ISBN thì để
          trống.
        </p>
        <button
          className={styles.useAll}
          type="button"
          disabled={
            disabled || busy || (!fields.title.trim() && !fields.isbn.trim())
          }
          onClick={() => void search()}
          aria-busy={busy}
        >
          {busy ? "Đang tìm đầu sách…" : "Tìm lại trong danh mục"}
        </button>
      </SearchShell>
      <p role="status" className={styles.help}>
        {busy
          ? "Đang đối chiếu danh mục…"
          : stale
            ? "Thông tin tìm đã đổi. Tìm lại trước khi chọn kết quả."
            : searched && !answer.items.length
              ? "Chưa tìm thấy đầu sách phù hợp trong phạm vi đã tìm. Thử sửa tên, bổ sung tác giả hoặc ISBN; bạn vẫn có thể nhập tay."
              : ""}
      </p>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      {answer.truncated ? (
        <p className={styles.help}>
          Chỉ hiển thị các gợi ý trong phạm vi đã tìm. Thêm tác giả, tập hoặc
          ISBN để tìm cụ thể hơn.
        </p>
      ) : null}
      <ul className={styles.candidates}>
        {answer.items.map((match) => (
          <li key={match.book.id}>
            <strong>{match.book.title}</strong>
            <p>{catalogBookFacts(match.book)}</p>
            <p>
              {matchReason[match.matchedBy]}
              {match.pending ? " · Yêu cầu của bạn đang chờ duyệt" : ""}
            </p>
            {match.warnings.map((w) => (
              <p className={styles.help} key={w}>
                {matchWarning[w]}
              </p>
            ))}
            <button
              type="button"
              className={styles.useAll}
              disabled={chooseLocked}
              onClick={() => setSelected(match)}
            >
              Chọn đầu sách: {match.book.title}
            </button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title="Đúng tập và ấn bản của bạn?"
        description={
          selected
            ? `${selected.book.title}. ${catalogBookFacts(selected.book)}. Chọn đầu sách này sẽ dùng thông tin danh mục cho bài đăng; thông tin đang nhập có thể được thay thế.`
            : ""
        }
        confirmText="Xác nhận chọn đầu sách"
        onConfirm={() => {
          if (selected && !chooseLocked) onPickBook(selected);
          setSelected(null);
        }}
      />
    </div>
  );
}
