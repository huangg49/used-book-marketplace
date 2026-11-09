import { ConfirmDialog } from "../ConfirmDialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ChevronDown, ImagePlus, ScanText, X } from "lucide-react";
import { languageOptions } from "@used-books/api-contract/catalog-taxonomy";
import {
  createAutofillRequest,
  createIsbnLookup,
  IsbnLookupUnavailable,
  type AutofillSuggestion,
} from "../../services/listing-autofill";
import type { DraftAttempt } from "../../services/listing-submission";
import styles from "./PhotoAutofill.module.css";
import { catalogHints, initialCatalogFields, type CatalogMatch, type IsbnMatches } from "@used-books/session-client";
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
const MAX_LENGTH: Record<Exclude<AutofillField, "language">, number> = {
  title: 300,
  authors: 2010,
  publisher: 200,
  publicationYear: 4,
  edition: 200,
  isbn: 30,
};
const PHOTO_HINT: Record<AutofillField, string> = {
  title: "Chụp rõ bìa trước hoặc trang nhan đề.",
  authors: "Chụp trang nhan đề hoặc gáy có tên tác giả. Ngăn cách nhiều tên bằng dấu chấm phẩy.",
  publisher: "Chụp trang bản quyền hoặc trang in ấn.",
  publicationYear: "Chụp dòng ghi năm xuất bản trên trang bản quyền.",
  language: "Chụp trang có nội dung chữ rõ.",
  edition: "Chụp dòng ghi tập hoặc lần xuất bản.",
  isbn: "Chụp mã vạch hoặc dòng ISBN nếu sách có.",
};
type Edits = Partial<Record<AutofillField, string>>;

function shown(fields: Fields, key: AutofillField): string {
  const value = fields[key];
  return Array.isArray(value) ? value.join("; ") : String(value ?? "");
}

function reviewFields(fields: Fields, edits: Edits): Fields {
  const search = initialCatalogFields(fields);
  const normalized = catalogHints({
    title: edits.title ?? search.title,
    authors: edits.authors ?? search.authors,
    edition: edits.edition ?? search.edition,
    isbn: edits.isbn ?? search.isbn,
  });
  const year = edits.publicationYear;
  return {
    ...normalized,
    publisher: edits.publisher === undefined ? fields.publisher : edits.publisher.trim() || null,
    publicationYear: year === undefined ? fields.publicationYear : year && !yearError(year) ? Number(year) : null,
    language: edits.language === undefined ? fields.language : edits.language || null,
  };
}

function yearError(value: string) {
  const maxYear = new Date().getUTCFullYear();
  return !!value && (!/^\d{4}$/.test(value) || Number(value) < 1400 || Number(value) > maxYear);
}

function languageName(code: string) {
  try {
    return new Intl.DisplayNames(["vi"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
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
  const [edits, setEdits] = useState<Edits>({});
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
          setEdits({});
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
      setEdits({});
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
  const reviewed = result ? reviewFields(result.fields, edits) : null;
  const resultLocked = !!disabled || reading || stale;

  function edit(field: AutofillField, value: string) {
    setEdits((previous) => ({ ...previous, [field]: value }));
    setUsed((previous) => previous.filter((key) => key !== field));
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
  const readFields = result ? ORDER.filter((key) => shown(result.fields, key)) : [];
  const missingFields = ORDER.filter((key) => !readFields.includes(key));
  const unapplied = reviewed
    ? ORDER.filter((key) => shown(reviewed, key) && !used.includes(key))
    : [];
  const hasEdits = !!result && !!reviewed &&
    ORDER.some((key) => shown(reviewed, key) !== shown(result.fields, key));
  const showPhotoGuide = (!result && !barcode) || stale || (!!barcode && barcodeStale);
  const readComplete = !showPhotoGuide && !reading && !error;
  const showReadCheck = readComplete && !!result && !readNotice;

  function renderField(field: AutofillField, missing = false) {
    if (!result || !reviewed) return null;
    const value = edits[field] ?? shown(result.fields, field);
    const done = used.includes(field);
    const id = `photo-suggestion-${field}`;
    const invalidYear = field === "publicationYear" && yearError(value);
    const hint = invalidYear
      ? `Nhập năm có 4 chữ số, từ 1400 đến ${new Date().getUTCFullYear()}.`
      : field === "authors" && !missing ? "Ngăn cách nhiều tác giả bằng dấu chấm phẩy."
      : missing ? PHOTO_HINT[field] : undefined;
    return (
      <div className={styles.fieldRow} key={field}>
        <label htmlFor={id}>{LABELS[field]}<span className="sr-only"> từ ảnh</span></label>
        {field === "language" ? (
          <select id={id} value={value} disabled={resultLocked}
            aria-describedby={hint ? `${id}-hint` : undefined}
            onChange={(event) => edit(field, event.target.value)}>
            <option value="">Chưa xác định</option>
            {value && !languageOptions.some((option) => option.id === value) && (
              <option value={value}>{languageName(value)}</option>
            )}
            {languageOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            value={value}
            maxLength={MAX_LENGTH[field]}
            inputMode={field === "publicationYear" ? "numeric" : undefined}
            disabled={resultLocked}
            aria-invalid={invalidYear || undefined}
            aria-describedby={hint ? `${id}-hint` : undefined}
            onChange={(event) => edit(field, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
          />
        )}
        <button
          className={styles.fieldUse}
          type="button"
          onClick={() => chooseFields([field])}
          disabled={resultLocked || done || !shown(reviewed, field)}
          aria-label={done ? `Đã dùng ${LABELS[field]}` : `Dùng ${LABELS[field]}`}
        >
          {done ? <Check size={15} aria-hidden="true" /> : "Dùng"}
        </button>
        {hint && <p id={`${id}-hint`} className={invalidYear ? styles.error : styles.help}>{hint}</p>}
      </div>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="photo-autofill-title">
      <div className={styles.head}>
        <ScanText size={20} aria-hidden="true" />
        <h3 id="photo-autofill-title">Điền nhanh từ ảnh</h3>
      </div>
      <div className={styles.readDesk} data-read-complete={readComplete}>
        <div className={styles.photoTray}>
          <p className={styles.trayLabel}>Ảnh để đọc <span>{files.length}/{MAX_PHOTOS}</span></p>
          <div className={styles.photos} data-empty={!files.length}>
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
                <Camera size={19} aria-hidden="true" />
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
            <button type="button" className={styles.textAction} disabled={disabled || reading}
              onClick={() => onUseCover(files[0]!.file)}>
              <ImagePlus size={16} aria-hidden="true" />
              Dùng ảnh đầu làm bìa bản sách
            </button>
          ) : (
            <p className={styles.help}>JPEG, PNG hoặc WebP · Tối đa 10 MB mỗi ảnh</p>
          )}
        </div>
        <div className={styles.readControls}>
          {showPhotoGuide && (
            <p className={styles.guide}>
              Chụp cận đủ chữ và số trên bìa. Thêm trang nhan đề hoặc trang bản quyền để đọc các mục còn thiếu.
            </p>
          )}
          <p role="status" className={styles.readStatus} data-read-done={showReadCheck}>
            {showReadCheck && <Check size={16} aria-hidden="true" />}
            {reading ? readPhase
              : stale || (barcode && barcodeStale) ? "Ảnh đã đổi. Đọc lại trước khi dùng kết quả."
              : readNotice || (result && !error ? "Đã đọc xong ảnh." : "")}
          </p>
          <div className={styles.actions}>
            <button type="button" className={readComplete ? styles.useAll : styles.read} onClick={() => void read()}
              disabled={disabled || reading || !files.length} aria-busy={reading}>
              {reading ? "Đang đọc…" : result || barcode ? "Đọc lại" : "Đọc thông tin"}
            </button>
            {files.length > 0 && (canSkipIsbn || barcode || !result || stale) && (
              <button type="button" className={styles.useAll} disabled={disabled || reading}
                onClick={() => void read(true)}>
                Đọc chữ bằng AI
              </button>
            )}
          </div>
          {!result && !barcode && (
            <p className={styles.help}>
              Đọc thông tin tra mã vạch trước. Sách không có mã có thể đọc bằng AI ngay.
              Ảnh đọc không kèm thông tin tài khoản.
            </p>
          )}
          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>
      </div>
      {result && reviewed && (
        <section className={styles.result} aria-labelledby="photo-result-title">
          <div className={styles.resultHead}>
            <h4 id="photo-result-title">Thông tin đọc từ ảnh</h4>
            <p>{readFields.length}/{ORDER.length} mục đọc được</p>
          </div>
          <p className={styles.help}>Sửa ngay tại đây nếu cần. Chọn Dùng để đưa thông tin vào bài đăng.</p>
          {readFields.length > 0 && <div className={styles.fields}>{readFields.map((field) => renderField(field))}</div>}
          {missingFields.length > 0 && (
            <details className={styles.more}>
              <summary>
                <span>Bổ sung {missingFields.length} mục chưa đọc được</span>
                <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <div className={styles.fields}>{missingFields.map((field) => renderField(field, true))}</div>
            </details>
          )}
          {result.missing.length > 0 && (
            <ul className={styles.missing}>
              {result.missing.map((hint) => <li key={hint}>{hint}</li>)}
            </ul>
          )}
          {(readFields.length > 1 || hasEdits) && (
            <button type="button" className={styles.read}
              disabled={resultLocked || !unapplied.length || yearError(edits.publicationYear ?? "")}
              onClick={() => chooseFields(unapplied)}>
              {hasEdits ? "Dùng tất cả thông tin đã rà soát" : "Dùng tất cả thông tin đọc được"}
            </button>
          )}
          <p className={styles.readStatus} role="status">
            {used.length > 0 && !stale ? "Đã điền thông tin được chọn vào phần Tự nhập thông tin bên dưới." : ""}
          </p>
        </section>
      )}
      {barcode ? (
        <div className={styles.recovery}>
          <h4>Đối chiếu từ mã vạch ISBN</h4>
          <p className={styles.help}>Đối chiếu cuốn sách với thông tin danh mục trước khi chọn.</p>
          {barcode.status === "Ambiguous" && (
            <>
              <p className={styles.help}>Có nhiều ISBN trên ảnh. Chọn mã thuộc cuốn sách đang đăng.</p>
              <div className={styles.actions}>
                {barcode.isbns.map((isbn) => (
                  <button className={styles.useAll} type="button" key={isbn}
                    disabled={disabled || reading || barcodeStale}
                    aria-pressed={barcodeIsbn === isbn} onClick={() => setBarcodeIsbn(isbn)}>
                    Đối chiếu ISBN {isbn}
                  </button>
                ))}
              </div>
            </>
          )}
          {barcodeIsbn && (
            <CatalogRecovery key={barcodeIsbn} attempt={attempt} channel={channel}
              initialHints={{ title: null, authors: [], isbn: barcodeIsbn, publisher: null, publicationYear: null, language: null, edition: null }}
              disabled={!!disabled || reading || barcodeStale} onPickBook={onPickBook} />
          )}
        </div>
      ) : (result || error) && (
        <CatalogRecovery key={result?.id ?? attempt.id} attempt={attempt} channel={channel}
          reviewed={reviewed} disabled={resultLocked} onPickBook={onPickBook} />
      )}
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
    </section>
  );
}
