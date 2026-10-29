import { ConfirmDialog } from "../ConfirmDialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ScanText, X } from "lucide-react";
import {
  createAutofillRequest,
  type AutofillMatch,
  type AutofillSuggestion,
} from "../../services/listing-autofill";
import type { DraftAttempt } from "../../services/listing-submission";
import styles from "./PhotoAutofill.module.css";

export type AutofillField =
  | "title"
  | "authors"
  | "publisher"
  | "publicationYear"
  | "language"
  | "edition"
  | "isbn";
export type AutofillFields = AutofillSuggestion["fields"];
type Fields = AutofillFields;

const LABELS: Record<AutofillField, string> = {
  title: "Tên sách",
  authors: "Tác giả",
  publisher: "Nhà xuất bản",
  publicationYear: "Năm xuất bản",
  language: "Ngôn ngữ",
  edition: "Lần xuất bản",
  isbn: "ISBN",
};
const ORDER = Object.keys(LABELS) as AutofillField[];
const MAX_PHOTOS = 3;

function shown(fields: Fields, key: AutofillField): string | null {
  const value = fields[key];
  if (Array.isArray(value)) return value.length ? value.join(", ") : null;
  return value === null ? null : String(value);
}

// ADR 0048: reads printed text from 1-3 photos. Every value is a suggestion
// the seller accepts one by one; nothing is applied without a click.
export function PhotoAutofill({
  attempt,
  channel,
  disabled,
  onUseField,
  onPickBook,
  currentValue,
  onUseCover,
}: {
  onUseCover?: (file: File) => void;
  currentValue?: (field: AutofillField) => string;
  attempt: DraftAttempt;
  channel?: "Auction";
  disabled?: boolean;
  onUseField: (field: AutofillField, fields: Fields) => void;
  onPickBook: (match: AutofillMatch) => void;
}) {
  const ask = useMemo(
    () => createAutofillRequest(attempt, channel),
    [attempt, channel],
  );
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<AutofillSuggestion | null>(null);
  const [used, setUsed] = useState<AutofillField[]>([]);
  const [replace, setReplace] = useState<AutofillField[]>([]);
  const [resultPhotos, setResultPhotos] = useState<File[]>([]);
  const stale =
    !!result &&
    (files.length !== resultPhotos.length ||
      files.some((item, index) => item.file !== resultPhotos[index]));
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  useEffect(
    () => () =>
      filesRef.current.forEach((item) => URL.revokeObjectURL(item.url)),
    [],
  );

  function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!picked.length) return;
    if (files.length + picked.length > MAX_PHOTOS) {
      setError(`Chọn tối đa ${MAX_PHOTOS} ảnh để đọc.`);
      return;
    }
    if (
      picked.some(
        (file) =>
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 10_000_000,
      )
    ) {
      setError("Ảnh cần là JPEG, PNG hoặc WebP và không quá 10 MB.");
      return;
    }
    setError(undefined);
    setFiles((previous) => [
      ...previous,
      ...picked.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ]);
  }
  function remove(index: number) {
    setFiles((previous) => {
      URL.revokeObjectURL(previous[index]!.url);
      return previous.filter((_, i) => i !== index);
    });
  }
  async function read() {
    if (reading || !files.length) return;
    setReading(true);
    setError(undefined);
    try {
      const next = await ask(files.map((item) => item.file));
      setResult(next);
      setResultPhotos(files.map((item) => item.file));
      setUsed([]);
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Chưa đọc được ảnh. Bạn vẫn có thể tự nhập thông tin sách.",
      );
    } finally {
      setReading(false);
    }
  }
  function use(field: AutofillField) {
    if (!result || stale || disabled || reading) return;
    onUseField(field, result.fields);
    setUsed((previous) => [...new Set([...previous, field])]);
  }
  function chooseFields(fields: AutofillField[]) {
    if (!result || stale || disabled || reading) return;
    const changed = fields.filter(
      (field) =>
        currentValue?.(field)?.trim() &&
        currentValue(field).trim() !== shown(result.fields, field),
    );
    if (changed.length) setReplace(fields);
    else fields.forEach(use);
  }
  const readable = result
    ? ORDER.filter((key) => shown(result.fields, key))
    : [];

  return (
    <section className={styles.panel} aria-labelledby="photo-autofill-title">
      <div className={styles.head}>
        <ScanText size={20} aria-hidden="true" />
        <h3 id="photo-autofill-title">Điền nhanh từ ảnh</h3>
      </div>
      <p className={styles.help}>
        Chụp bìa trước, gáy hoặc trang bản quyền. Trợ lý chỉ đọc chữ in trên
        sách; bạn kiểm tra và chọn từng thông tin.
      </p>
      <div className={styles.photos}>
        {files.map((item, index) => (
          <figure key={item.url} className={styles.thumb}>
            <img src={item.url} alt={`Ảnh để đọc ${index + 1}`} />
            <button
              type="button"
              className={styles.remove}
              onClick={() => remove(index)}
              disabled={disabled || reading}
              aria-label={`Bỏ ảnh để đọc ${index + 1}`}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </figure>
        ))}
        {files.length < MAX_PHOTOS && (
          <label className={styles.add} aria-disabled={disabled || reading}>
            <Camera size={18} aria-hidden="true" />
            <span>{files.length ? "Thêm ảnh" : "Chọn ảnh"}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={choose}
              disabled={disabled || reading}
              className="sr-only"
            />
          </label>
        )}
      </div>
      {onUseCover && files[0] ? (
        <button
          type="button"
          className={styles.useAll}
          disabled={disabled || reading}
          onClick={() => onUseCover(files[0]!.file)}
        >
          Dùng ảnh đầu làm bìa bản sách
        </button>
      ) : null}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.read}
          onClick={() => void read()}
          disabled={disabled || reading || !files.length}
          aria-busy={reading}
        >
          {reading ? "Đang đọc…" : result ? "Đọc lại" : "Đọc thông tin"}
        </button>
        <span className={styles.note}>
          Tối đa {MAX_PHOTOS} ảnh · không gửi thông tin tài khoản
        </span>
      </div>
      <p className="sr-only" role="status">
        {reading
          ? "Đang tải ảnh và đọc chữ trên sách."
          : result
            ? "Đã đọc xong ảnh."
            : ""}
      </p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {stale ? (
        <p role="status" className={styles.help}>
          Ảnh để đọc đã thay đổi. Đọc lại trước khi dùng gợi ý.
        </p>
      ) : null}
      <ConfirmDialog
        isOpen={replace.length > 0}
        onClose={() => setReplace([])}
        title="Thay thông tin đang nhập?"
        description={`Các thông tin được chọn có thể thay nội dung hiện tại: ${replace.map((field) => LABELS[field]).join(", ")}.`}
        confirmText="Dùng gợi ý đã chọn"
        onConfirm={() => {
          replace.forEach(use);
          setReplace([]);
        }}
      />
      {result && (
        <div className={styles.result}>
          <p className={styles.stamp}>
            Gợi ý từ ảnh — kiểm tra lại trước khi đăng
          </p>
          {result.matches.length > 0 && (
            <div className={styles.matches}>
              <h4>Có trong thư viện</h4>
              <ul>
                {result.matches.map((match) => (
                  <li key={match.book.id}>
                    <div>
                      <strong>{match.book.title}</strong>
                      <span>
                        {[
                          match.book.authors.join(", "),
                          match.book.publisher,
                          match.book.publicationYear,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      <small>
                        {match.matchedBy === "Isbn"
                          ? "Khớp ISBN"
                          : "Khớp tên và tác giả"}
                        {match.pending
                          ? " · yêu cầu của bạn đang chờ duyệt"
                          : ""}
                      </small>
                    </div>
                    <button
                      type="button"
                      onClick={() => onPickBook(match)}
                      disabled={disabled || reading || stale}
                    >
                      Chọn đầu sách này
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {readable.length > 0 ? (
            <dl className={styles.fields}>
              {readable.map((key) => {
                const done = used.includes(key);
                return (
                  <div key={key}>
                    <dt>{LABELS[key]}</dt>
                    <dd>{shown(result.fields, key)}</dd>
                    <button
                      type="button"
                      onClick={() => chooseFields([key])}
                      disabled={disabled || reading || stale || done}
                      aria-label={
                        done ? `Đã dùng ${LABELS[key]}` : `Dùng ${LABELS[key]}`
                      }
                    >
                      {done ? <Check size={16} aria-hidden="true" /> : null}
                      {done ? "Đã dùng" : "Dùng"}
                    </button>
                  </div>
                );
              })}
            </dl>
          ) : null}
          {readable.length > 1 && (
            <button
              type="button"
              className={styles.useAll}
              onClick={() => chooseFields(readable)}
              disabled={
                disabled ||
                reading ||
                stale ||
                readable.every((key) => used.includes(key))
              }
            >
              Dùng tất cả thông tin đọc được
            </button>
          )}
          {result.missing.length > 0 && (
            <ul className={styles.missing}>
              {result.missing.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
