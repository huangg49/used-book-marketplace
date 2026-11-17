import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight, Check } from "lucide-react";
import { BookCover } from "../../BookCover";
import { ConfirmDialog } from "../../ConfirmDialog";
import { getMyBookIdentity, getMyListings, getMyPhoto } from "../../../services/my-listings";
import type { ExchangeDetail } from "../../../lib/mock/exchangeDetail";
import { formatVnd } from "../../../lib/routes";
import styles from "./CounterDialog.module.css";

export interface CounterOfferData {
  listingIds?: string[];
  negotiatedDiffAmount?: number;
  diffPayerId?: string | null;
  deliveryAddressId?: string;
  note?: string;
}

interface Props {
  detail: ExchangeDetail;
  onClose: () => void;
  onSubmit: (data: CounterOfferData) => Promise<void>;
  isBusy: boolean;
}

interface Book {
  title: string;
  author: string;
  coverUrl?: string;
}

function Cover({ book }: { book: Book }) {
  return <div className={styles.cover} aria-hidden="true">
    <BookCover title={book.title} coverUrl={book.coverUrl} />
  </div>;
}

export function CounterDialog({ detail, onClose, onSubmit, isBusy }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const single = detail.viewerRole === "recipient";
  const candidates = useInfiniteQuery({
    queryKey: ["exchange-replacement-books", detail.viewer.id],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const page = await getMyListings("Approved", pageParam, 20);
      const eligible = page.items.filter(item => {
        const { content, bookId } = item.currentRevision;
        return item.channel === "Marketplace" && item.catalogStatus === "Confirmed" &&
          item.state.trade === "Available" && item.state.visibility === "Visible" &&
          (content.mode === "Exchange" || content.mode === "Both") && !content.bundle &&
          Boolean(bookId ?? content.bookId) && (content.exchangeValue ?? 0) > 0 &&
          Boolean(content.mediaIds?.length);
      });
      const items = await Promise.all(eligible.map(async ({ id, currentRevision, catalogStatus }) => {
        const { content, bookId } = currentRevision;
        const [book, photo] = await Promise.all([
          getMyBookIdentity((bookId ?? content.bookId)!, catalogStatus),
          getMyPhoto(id, content.mediaIds![0]).catch(() => undefined),
        ]);
        return { id, title: book.title, author: book.authors.join(", "), coverUrl: photo?.url, price: content.exchangeValue! };
      }));
      return { items, nextCursor: page.nextCursor };
    },
    getNextPageParam: page => page.nextCursor ?? undefined,
    retry: false,
  });

  const items = candidates.data?.pages.flatMap(page => page.items)
    .filter(item => !detail.giveBooks.some(book => book.id === item.id)) ?? [];
  const replacements = items.filter(item => selected.includes(item.id));
  const ownValue = replacements.reduce((sum, book) => sum + book.price, 0);
  const receiveValue = detail.receiveBooks.reduce((sum, book) => sum + (book.price ?? 0), 0);
  const difference = receiveValue - ownValue;
  const canSend = selected.length > 0 && selected.length === replacements.length && !candidates.isFetching &&
    (!candidates.isError || candidates.isFetchNextPageError);

  async function submit() {
    if (!canSend || isBusy) return;
    setError("");
    try {
      await onSubmit({ listingIds: selected, note: note.trim() || undefined });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Chưa gửi được đề nghị. Hãy thử lại.");
    }
  }

  return (
    <ConfirmDialog isOpen stickyFooter onClose={onClose} title="Đề xuất sách thay thế"
      confirmText="Gửi đề xuất sách mới" cancelText="Quay lại" maxWidth="880px"
      isBusy={isBusy} confirmDisabled={!canSend} onConfirm={() => void submit()}>
      <div className={styles.selectionBody}>
        <section className={styles.current} aria-label="Sách trên phiếu hiện tại">
          {[
            { label: "Bạn đang gửi", books: detail.giveBooks, Icon: ArrowUpRight },
            { label: "Bạn vẫn nhận", books: detail.receiveBooks, Icon: ArrowDownRight },
          ].map(({ label, books, Icon }) => (
            <div className={styles.currentGroup} key={label}>
              <h3><Icon size={16} aria-hidden="true" />{label}</h3>
              {books.map(book => <div key={book.id} className={styles.currentBook}>
                <Cover book={book} />
                <div className={styles.currentBookText}>
                  <strong className={styles.bookTitle} title={book.title}>{book.title}</strong>
                  {book.price != null && <span className={styles.price}>{formatVnd(book.price)}</span>}
                </div>
              </div>)}
            </div>
          ))}
        </section>
        <div className={styles.workspace}>
          <fieldset className={styles.inventory} disabled={isBusy}>
            <legend>{single ? "Chọn một cuốn thay thế" : "Chọn sách thay thế"}</legend>
            {!single && <p className={styles.hint}>Chọn tối đa 5 cuốn. Danh sách này sẽ thay toàn bộ sách bạn đang gửi.</p>}
            {candidates.isPending && <p role="status" className={styles.hint}>Đang tải sách trong kệ…</p>}
            {candidates.isError && !candidates.isFetchNextPageError && (
              <div role="alert" className={styles.hint}>
                <p>Chưa tải được sách trong kệ.</p>
                <button className={styles.textButton} type="button" onClick={() => void candidates.refetch()}>Tải lại sách</button>
              </div>
            )}
            {candidates.isSuccess && !items.length && (
              <p className={styles.hint}>{candidates.hasNextPage ? "Trang này chưa có sách thay thế." : "Bạn chưa có cuốn khác đủ điều kiện đổi."}</p>
            )}
            <div className={styles.choices} data-lenis-prevent="">
              {items.map(book => {
                const checked = selected.includes(book.id);
                return <label key={book.id} className={styles.bookChoice} title={book.title} data-selected={checked || undefined}>
                  <input type={single ? "radio" : "checkbox"} name="replacement-book" value={book.id}
                    aria-label={book.title} checked={checked}
                    disabled={!single && !checked && selected.length >= 5}
                    onChange={event => {
                      const isSelected = event.target.checked;
                      setError("");
                      setSelected(previous => single ? [book.id] : isSelected
                        ? [...previous, book.id] : previous.filter(id => id !== book.id));
                    }} />
                  <Cover book={book} />
                  <span className={styles.bookText}>
                    <strong className={styles.bookTitle}>{book.title}</strong>
                    <span className={styles.author}>{book.author}</span>
                  </span>
                  <span className={styles.price}>{formatVnd(book.price)}</span>
                  <span className={styles.mark} aria-hidden="true">{checked && <Check size={14} />}</span>
                </label>;
              })}
            </div>
            {(candidates.hasNextPage || candidates.isFetchNextPageError) && (
              <button className={styles.textButton} type="button" disabled={candidates.isFetching}
                onClick={() => void candidates.fetchNextPage()}>
                {candidates.isFetchingNextPage ? "Đang tải…" : candidates.isFetchNextPageError ? "Thử tải trang tiếp theo" : "Tải thêm sách"}
              </button>
            )}
          </fieldset>

          <section className={styles.preview} aria-label="Xem lại đề nghị mới">
            <h3><ArrowLeftRight size={17} aria-hidden="true" /> Đề nghị mới</h3>
            {replacements.length ? <div aria-live="polite" className={styles.previewValues}>
              <ul>{replacements.map(book => <li key={book.id}>
                <strong className={styles.bookTitle} title={book.title}>{book.title}</strong>
              </li>)}</ul>
              <dl>
                <div><dt>Giá trị sách bạn gửi</dt><dd>{formatVnd(ownValue)}</dd></div>
                <div><dt>Cọc của bạn</dt><dd>{formatVnd(receiveValue)}</dd></div>
                <div><dt>Cọc của đối tác</dt><dd>{formatVnd(ownValue)}</dd></div>
                <div className={styles.compensation}>
                  <dt>{difference > 0 ? "Bạn bù" : difference < 0 ? "Đối tác bù" : "Tiền bù"}</dt>
                  <dd>{formatVnd(Math.abs(difference))}</dd>
                </div>
              </dl>
            </div> : <p className={styles.hint}>Chọn sách để xem cọc và tiền bù mới.</p>}
            <p className={styles.previewNote}>Đối tác cần đồng ý trước khi đặt cọc.</p>
          </section>
        </div>
        <details className={styles.note}>
          <summary>Thêm lời nhắn</summary>
          <textarea aria-label="Lời nhắn kèm đề nghị" maxLength={500} value={note} disabled={isBusy}
            onChange={event => setNote(event.target.value)} />
        </details>
        {selected.length !== replacements.length && <p role="status" className={styles.hint}>Sách đã chọn vừa thay đổi. Hãy chọn lại.</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    </ConfirmDialog>
  );
}
