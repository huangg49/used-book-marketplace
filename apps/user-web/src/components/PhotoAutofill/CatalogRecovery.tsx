import { useEffect, useEffectEvent, useRef, useState, useId } from "react";
import { ChevronDown } from "lucide-react";
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
  initialHints,
  reviewed,
  disabled,
  onPickBook,
}: {
  attempt: DraftAttempt;
  channel?: "Auction";
  reviewed?: AutofillSuggestion["fields"] | null;
  initialHints?: AutofillSuggestion["fields"];
  disabled: boolean;
  onPickBook: (match: CatalogMatch) => void;
}) {
  const [manualFields, setManualFields] = useState(() => initialCatalogFields(initialHints));
  const fields = reviewed ? initialCatalogFields(reviewed) : manualFields;
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
      (reviewed || initialHints) &&
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
    setManualFields((previous) => ({ ...previous, [key]: value }));
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
      if (active.current && sequence.current === run && current.current === at)
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
  const currentAnswer = !stale && !error;
  const chooseLocked = disabled || busy || !currentAnswer;
  const hasSearch = !!(fields.title.trim() || fields.isbn.trim());
  let status = "";
  if (busy) {
    status = "Đang đối chiếu danh mục…";
  } else if (stale) {
    status = hasSearch
      ? "Thông tin tìm đã đổi. Bấm tìm lại để cập nhật kết quả."
      : "Nhập tên hoặc ISBN để tìm.";
  } else if (searched && !error) {
    status = answer.items.length
      ? `Tìm thấy ${answer.items.length} đầu sách để đối chiếu.`
      : "Chưa tìm thấy đầu sách phù hợp. Bạn vẫn có thể dùng thông tin từ ảnh hoặc tự nhập.";
  }
  const searchAction = (
    <button
      type="button"
      className={styles.useAll}
      disabled={disabled || busy || !hasSearch}
      onClick={() => void search()}
      aria-busy={busy}
    >
      {busy ? "Đang tìm đầu sách…" : "Tìm lại trong danh mục"}
    </button>
  );
  return (
    <div className={styles.recovery} aria-label="Đối chiếu đầu sách">
      <h4>Đối chiếu với danh mục</h4>
      <p className={styles.help}>
        {reviewed
          ? "Dùng tên, tác giả, ISBN và ấn bản ở phần trên để tìm đầu sách."
          : "Kiểm tra tên, tác giả, tập và ấn bản trước khi chọn đầu sách."}
      </p>
      {reviewed ? searchAction : (
        <details className={styles.more}>
          <summary>
            <span>{initialHints ? "Sửa thông tin tìm" : "Nhập thông tin để tìm"}</span>
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <div
            className={styles.searchFields}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (hasSearch) void search();
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
            Ngăn cách nhiều tác giả bằng dấu chấm phẩy. Để trống nếu sách không có ISBN.
          </p>
          {searchAction}
        </details>
      )}
      <p role="status" className={styles.readStatus}>{status}</p>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      {currentAnswer && answer.truncated ? (
        <p className={styles.help}>
          Chỉ hiển thị các gợi ý trong phạm vi đã tìm. Thêm tác giả, tập hoặc
          ISBN để tìm cụ thể hơn.
        </p>
      ) : null}
      {currentAnswer && answer.items.length > 0 && <ul className={styles.candidates}>
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
      </ul>}
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
