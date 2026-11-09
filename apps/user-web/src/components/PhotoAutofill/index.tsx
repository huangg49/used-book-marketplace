import { ConfirmDialog } from "../ConfirmDialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ScanText, X } from "lucide-react";
import {
  createAutofillRequest,
  createIsbnLookup,
  IsbnLookupUnavailable,
  type AutofillSuggestion,
} from "../../services/listing-autofill";
import type { DraftAttempt } from "../../services/listing-submission";
import styles from "./PhotoAutofill.module.css";
import { catalogHints, initialCatalogFields, type CatalogMatch, type CatalogSearchFields, type IsbnMatches } from "@used-books/session-client";
import { CatalogRecovery } from './CatalogRecovery';

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
  if (Array.isArray(value)) return value.length ? value.join("; ") : null;
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
  onPickBook: (match: CatalogMatch) => void;
}) {
  const ask = useMemo(
    () => createAutofillRequest(attempt, channel),
    [attempt, channel],
  );
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const lookupIsbn = useMemo(() => createIsbnLookup(attempt, channel), [attempt, channel]);
  const [barcode, setBarcode] = useState<IsbnMatches | null>(null);
  const [barcodeIsbn, setBarcodeIsbn] = useState('');
  const [barcodePhotos, setBarcodePhotos] = useState<File[]>([]);
  const [readPhase, setReadPhase] = useState('');
  const forcedAiPhotos = useRef<File[] | null>(null);
  const barcodeStale = files.length !== barcodePhotos.length || files.some((p, i) => p.file !== barcodePhotos[i]);
  const [reading, setReading] = useState(false);
  const readLock = useRef(false);
  const [error, setError] = useState<string>();
  const [canSkipIsbn, setCanSkipIsbn] = useState(false);
  const [readNotice, setReadNotice] = useState<string>();
  const [edits, setEdits] = useState<CatalogSearchFields | null>(null);
  const [result, setResult] = useState<AutofillSuggestion | null>(null);
  const [used, setUsed] = useState<AutofillField[]>([]);
  const [replace, setReplace] = useState<AutofillField[]>([]);
  const [resultPhotos, setResultPhotos] = useState<File[]>([]);
  const stale =
    !!result &&
    (files.length !== resultPhotos.length ||
      files.some((item, index) => item.file !== resultPhotos[index]));
  const filesRef = useRef(files);
  useEffect(
    () => () =>
      filesRef.current.forEach((item) => URL.revokeObjectURL(item.url)),
    [],
  );

  function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!picked.length || disabled || readLock.current) return;
    const current = filesRef.current;
    if (current.length + picked.length > MAX_PHOTOS) {
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
    setCanSkipIsbn(false);
    setReadNotice(undefined);
    // Allocate once in the event handler; React may replay state updaters.
    const next = [
      ...current,
      ...picked.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ];
    filesRef.current = next;
    setFiles(next);
  }
  function remove(url: string) {
    if (disabled || readLock.current || !filesRef.current.some(item => item.url === url)) return;
    setError(undefined);
    setCanSkipIsbn(false);
    setReadNotice(undefined);
    URL.revokeObjectURL(url);
    const next = filesRef.current.filter(item => item.url !== url);
    filesRef.current = next;
    setFiles(next);
  }
  async function read(forceAi = false) {
    if (disabled || readLock.current || !files.length) return;
    readLock.current = true;
    setReading(true);
    setError(undefined);
    setCanSkipIsbn(false);
    setReadNotice(undefined);
    try {
      if (forceAi) forcedAiPhotos.current = files.map(item => item.file);
      const sameForcedPhotos = forcedAiPhotos.current?.length === files.length && files.every((item, i) => item.file === forcedAiPhotos.current?.[i]);
      if (!forceAi && !sameForcedPhotos) {
        setReadPhase("Đang tải và xử lý ảnh…");
        const found = await lookupIsbn(files.map(item => item.file), () => setReadPhase("Đang tìm mã vạch ISBN trên ảnh…"));
        if (found.status === 'Ambiguous' || (found.status === 'Found' && found.catalog?.items.length)) {
          setBarcode(found);
          setBarcodeIsbn(found.isbns.length === 1 ? found.isbns[0]! : "");
          setBarcodePhotos(files.map(item => item.file));
          setResult(null);
          setEdits(null);
          return;
        }
      }
      setBarcode(null);
      setReadPhase("Đang chuẩn bị ảnh…");
      const next = await ask(files.map((item) => item.file), () => setReadPhase("Đang đọc thông tin bằng AI…"));
      if (next.cached) setReadNotice("Đã dùng lại kết quả của bộ ảnh này. Thêm hoặc thay ảnh để đọc dữ liệu mới.");
      if (result && next.cached && !stale) return;
      setResult(next);
      setResultPhotos(files.map((item) => item.file));
      setEdits(null);
      setUsed([]);
    } catch (e) {
      setCanSkipIsbn(e instanceof IsbnLookupUnavailable);
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Chưa đọc được ảnh. Bạn vẫn có thể tự nhập thông tin sách.",
      );
    } finally {
      readLock.current = false;
      setReading(false);
    }
  }
  const corrected = edits ? catalogHints(edits) : null;
  const reviewed = result && corrected
    ? { ...result.fields, title: corrected.title, authors: corrected.authors, isbn: corrected.isbn, edition: corrected.edition }
    : result?.fields;

  function review(next: CatalogSearchFields) {
    const before = edits ?? initialCatalogFields(result?.fields);
    const changed = (Object.keys(next) as (keyof CatalogSearchFields)[]).filter((field) => next[field] !== before[field]);
    setEdits(next);
    setUsed((previous) => previous.filter((field) => !changed.some((key) => key === field)));
  }

  function use(field: AutofillField) {
    if (!reviewed || stale || disabled || reading) return;
    onUseField(field, reviewed);
    setUsed((previous) => [...new Set([...previous, field])]);
  }
  function chooseFields(fields: AutofillField[]) {
    if (!reviewed || stale || disabled || reading) return;
    const changed = fields.filter(
      (field) =>
        currentValue?.(field)?.trim() &&
        currentValue(field).trim() !== shown(reviewed, field),
    );
    if (changed.length) setReplace(fields);
    else fields.forEach(use);
  }
  const readable = reviewed ? ORDER.filter((key) => shown(reviewed, key)) : [];
  const unapplied = readable.filter((field) => !used.includes(field));
  const revisedFields = result && reviewed && edits
    ? unapplied.filter((field) => shown(reviewed, field) !== shown(result.fields, field))
    : [];

  return (
    <section className={styles.panel} aria-labelledby="photo-autofill-title">
      <div className={styles.head}>
        <ScanText size={20} aria-hidden="true" />
        <h3 id="photo-autofill-title">Điền nhanh từ ảnh</h3>
      </div>
      <p className={styles.help}>
        Chụp rõ bìa trước, gáy hoặc trang bản quyền. Nếu tựa in rải trên bìa, thêm ảnh cận đủ các phần của tựa. Bạn kiểm tra thông tin trước khi dùng.
      </p>
      {reading ? <p role="status">{readPhase}</p> : null}
      {barcode ? <div className={styles.recovery}>
        <h4>Đối chiếu từ mã vạch ISBN</h4>
        <p className={styles.help}>Thông tin đầu sách được lấy từ danh mục. Lượt đối chiếu này không gọi AI. Kiểm tra cuốn sách trước khi xác nhận chọn.</p>
        {barcodeStale ? <p role="status">Ảnh đã đổi. Đọc lại trước khi chọn kết quả ISBN.</p> : null}
        {barcode.status === 'Ambiguous' ? <><p>Có nhiều ISBN trên các ảnh. Chọn mã thuộc cuốn sách đang đăng.</p>{barcode.isbns.map(isbn => <button className={styles.useAll} type="button" key={isbn} disabled={disabled || reading || barcodeStale} onClick={() => setBarcodeIsbn(isbn)}>Đối chiếu ISBN {isbn}</button>)}</> : null}
        {barcodeIsbn ? <CatalogRecovery key={barcodeIsbn} compact attempt={attempt} channel={channel} suggestion={null} initialHints={{ title: null, authors: [], isbn: barcodeIsbn, publisher: null, publicationYear: null, language: null, edition: null }} disabled={!!disabled || reading || barcodeStale} onPickBook={onPickBook} /> : null}
        <button type="button" className={styles.useAll} disabled={disabled || reading || barcodeStale} onClick={() => void read(true)}>Đọc chữ bằng AI</button>
      </div> : null}
      <div className={styles.photos}>
        {files.map((item, index) => (
          <figure key={item.url} className={styles.thumb}>
            <img src={item.url} alt={`Ảnh để đọc ${index + 1}`} />
            <button
              type="button"
              className={styles.remove}
              onClick={() => remove(item.url)}
              disabled={disabled || reading}
              aria-label={`Bỏ ảnh để đọc ${index + 1}`}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </figure>
        ))}
        {files.length < MAX_PHOTOS && (
          <label data-focus-surface className={styles.add} aria-disabled={disabled || reading}>
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
        <div className={styles.actions}>
          <p className={styles.error} role="alert">{error}</p>
          {canSkipIsbn && (
            <button type="button" className={styles.useAll} disabled={disabled || reading} onClick={() => void read(true)}>
              Đọc chữ bằng AI
            </button>
          )}
        </div>
      )}
      {readNotice && <p className={styles.help} role="status">{readNotice}</p>}
      {stale ? (
        <p role="status" className={styles.help}>
          Ảnh để đọc đã thay đổi. Đọc lại trước khi dùng gợi ý.
        </p>
      ) : null}
      {result || error ? (
        <CatalogRecovery
          key={result?.id ?? attempt.id}
          attempt={attempt}
          channel={channel}
          suggestion={result}
          disabled={!!disabled || reading || stale}
          onPickBook={onPickBook}
          onFieldsChange={result ? review : undefined}
          onUseReviewed={revisedFields.length ? () => chooseFields(revisedFields) : undefined}
        />
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
      {result && reviewed && (
        <div className={styles.result}>
          <p className={styles.stamp}>
            {edits ? "Thông tin sau khi rà soát" : "Gợi ý từ ảnh — kiểm tra lại trước khi đăng"}
          </p>
          {readable.length > 0 ? (
            <dl className={styles.fields}>
              {readable.map((key) => {
                const done = used.includes(key);
                return (
                  <div key={key}>
                    <dt>{LABELS[key]}</dt>
                    <dd>{shown(reviewed, key)}</dd>
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
              onClick={() => chooseFields(unapplied)}
              disabled={
                disabled ||
                reading ||
                stale ||
                !unapplied.length
              }
            >
              {edits ? "Dùng tất cả thông tin đã rà soát" : "Dùng tất cả thông tin đọc được"}
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
