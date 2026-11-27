import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  MessageSquarePlus,
  RefreshCw,
  X,
} from "lucide-react";
import { lockPageScroll } from "../../../lib/page-scroll";
import { BookCover } from "../../BookCover";
import { InfoTip } from "../../InfoTip";
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
  return (
    <div className={styles.cover} aria-hidden="true">
      <BookCover title={book.title} coverUrl={book.coverUrl} fallbackLabel="Chưa có ảnh" />
    </div>
  );
}

export function CounterDialog({ detail, onClose, onSubmit, isBusy }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [error, setError] = useState("");
  const titleId = useId();
  const notePanelId = useId();
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const single = detail.viewerRole === "recipient";

  useEffect(() => lockPageScroll(), []);

  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    return () => {
      if (openerRef.current?.isConnected) {
        openerRef.current.focus({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !isBusy) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isBusy, onClose]);

  const candidates = useInfiniteQuery({
    queryKey: ["exchange-replacement-books", detail.viewer.id],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const page = await getMyListings("Approved", pageParam, 20);
      const eligible = page.items.filter((item) => {
        const { content, bookId } = item.currentRevision;
        return (
          item.channel === "Marketplace" &&
          item.catalogStatus === "Confirmed" &&
          item.state.trade === "Available" &&
          item.state.visibility === "Visible" &&
          (content.mode === "Exchange" || content.mode === "Both") &&
          !content.bundle &&
          Boolean(bookId ?? content.bookId) &&
          (content.exchangeValue ?? 0) > 0 &&
          Boolean(content.mediaIds?.length)
        );
      });
      const items = await Promise.all(
        eligible.map(async ({ id, currentRevision, catalogStatus }) => {
          const { content, bookId } = currentRevision;
          const [book, photo] = await Promise.all([
            getMyBookIdentity((bookId ?? content.bookId)!, catalogStatus),
            getMyPhoto(id, content.mediaIds![0]).catch(() => undefined),
          ]);
          return {
            id,
            title: book.title,
            author: book.authors.join(", "),
            coverUrl: photo?.url,
            price: content.exchangeValue!,
          };
        }),
      );
      return { items, nextCursor: page.nextCursor };
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });

  const items =
    candidates.data?.pages
      .flatMap((page) => page.items)
      .filter((item) => !detail.giveBooks.some((book) => book.id === item.id)) ?? [];
  const replacements = items.filter((item) => selected.includes(item.id));
  const currentGiveValue = detail.giveBooks.reduce((sum, book) => sum + (book.price ?? 0), 0);
  const ownValue = replacements.reduce((sum, book) => sum + book.price, 0);
  const receiveValue = detail.receiveBooks.reduce((sum, book) => sum + (book.price ?? 0), 0);
  const difference = receiveValue - ownValue;
  const valueDelta = ownValue - currentGiveValue;
  const canSend =
    selected.length > 0 &&
    selected.length === replacements.length &&
    !candidates.isFetching &&
    (!candidates.isError || candidates.isFetchNextPageError);

  const currentSubtitle =
    detail.giveBooks[0]?.title ?? `Phiếu #${detail.transactionCode}`;

  async function submit() {
    if (!canSend || isBusy) return;
    setError("");
    try {
      await onSubmit({ listingIds: selected, note: note.trim() || undefined });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Chưa gửi được đề nghị. Hãy thử lại.",
      );
    }
  }

  return createPortal(
    <div
      className={styles.overlay}
      data-lenis-prevent="true"
      onClick={(event) => event.target === event.currentTarget && !isBusy && onClose()}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className={styles.header} data-focus-inverse>
          <div className={styles.headerContent}>
            <span className={styles.headerIcon} aria-hidden="true">
              <ArrowLeftRight size={20} />
            </span>
            <div className={styles.headerHeading}>
              <h2 id={titleId} className={styles.title}>
                Đề xuất sách thay thế
              </h2>
              <p className={styles.subtitle}>
                Thay cho: {currentSubtitle}
                {detail.giveBooks.length > 1 ? ` (+${detail.giveBooks.length - 1} cuốn)` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            disabled={isBusy}
            aria-label="Đóng"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className={styles.body}>
          <div className={styles.timelineBar}>
            <ol className={styles.timeline} aria-label="Tiến trình đề xuất sách mới">
              <li className={styles.timelineStep} data-active="true">
                <span className={styles.stepNum}>1</span>
                <span>Chọn sách mới</span>
              </li>
              <li className={styles.timelineArrow} aria-hidden="true">→</li>
              <li className={styles.timelineStep}>
                <span className={styles.stepNum}>2</span>
                <span>Đối tác phản hồi</span>
              </li>
              <li className={styles.timelineArrow} aria-hidden="true">→</li>
              <li className={styles.timelineStep} data-result="true">
                <span className={styles.stepNum}>3</span>
                <span>Chốt &amp; đặt cọc</span>
              </li>
            </ol>
            <InfoTip label="Quy định đề xuất sách thay thế">
              <ul>
                <li>
                  {single
                    ? "Bạn chọn 1 cuốn trong kệ để thay cuốn đang đề nghị gửi."
                    : "Chọn tối đa 5 cuốn. Danh sách mới sẽ thay toàn bộ sách bạn đang gửi."}
                </li>
                <li>
                  <strong>Chưa khóa sách hay trừ tiền</strong> cho đến khi đối tác đồng ý đề xuất mới.
                </li>
              </ul>
            </InfoTip>
          </div>

          <section className={styles.current} aria-label="Sách trên phiếu hiện tại">
            {[
              {
                label: "Hiện đang gửi",
                books: detail.giveBooks,
                Icon: ArrowUpRight,
                receive: false,
              },
              {
                label: "Bạn vẫn nhận",
                books: detail.receiveBooks,
                Icon: ArrowDownLeft,
                receive: true,
              },
            ].map(({ label, books, Icon, receive }) => (
              <div
                className={styles.currentGroup}
                key={label}
                data-receive={receive || undefined}
              >
                <h3>
                  <Icon size={15} aria-hidden="true" />
                  <span>{label}</span>
                  <span className={styles.groupCount}>{books.length} cuốn</span>
                </h3>
                <div className={styles.currentList}>
                  {books.map((book) => (
                    <div key={book.id} className={styles.currentBook}>
                      <Cover book={book} />
                      <div className={styles.currentBookText}>
                        <strong className={styles.bookTitle} title={book.title}>
                          {book.title}
                        </strong>
                        {book.price != null && (
                          <span className={styles.currentPrice}>
                            {formatVnd(book.price)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <div className={styles.workspace}>
            <fieldset className={styles.inventory} disabled={isBusy}>
              <div className={styles.inventoryHead}>
                <legend>
                  {single ? "Chọn một cuốn thay thế" : "Chọn sách thay thế"}
                </legend>
                {!single && (
                  <span className={styles.limitStamp}>
                    Đã chọn {selected.length} / 5
                  </span>
                )}
              </div>

              {candidates.isPending && (
                <div role="status" className={styles.stateBox}>
                  Đang tải sách đủ điều kiện đổi trong kệ của bạn…
                </div>
              )}

              {candidates.isError && !candidates.isFetchNextPageError && (
                <div role="alert" className={styles.stateBox} data-error="true">
                  <p>Chưa tải được danh sách sách trong kệ.</p>
                  <button
                    className={styles.retryBtn}
                    type="button"
                    onClick={() => void candidates.refetch()}
                  >
                    <RefreshCw size={14} aria-hidden="true" />
                    Tải lại sách
                  </button>
                </div>
              )}

              {candidates.isSuccess && !items.length && (
                <div className={styles.stateBox}>
                  {candidates.hasNextPage
                    ? "Trang này chưa có sách thay thế phù hợp."
                    : "Bạn chưa có cuốn sách nào khác đang mở trao đổi trên kệ."}
                </div>
              )}

              {items.length > 0 && (
                <div className={styles.choices} data-lenis-prevent="">
                  {items.map((book) => {
                    const checked = selected.includes(book.id);
                    return (
                      <label
                        key={book.id}
                        className={styles.bookChoice}
                        title={book.title}
                        data-selected={checked || undefined}
                      >
                        <input
                          type={single ? "radio" : "checkbox"}
                          name="replacement-book"
                          value={book.id}
                          aria-label={book.title}
                          checked={checked}
                          disabled={!single && !checked && selected.length >= 5}
                          onChange={(event) => {
                            const isSelected = event.target.checked;
                            setError("");
                            setSelected((previous) =>
                              single
                                ? [book.id]
                                : isSelected
                                  ? [...previous, book.id]
                                  : previous.filter((id) => id !== book.id),
                            );
                          }}
                        />
                        <Cover book={book} />
                        <span className={styles.bookText}>
                          <strong className={styles.bookTitle}>{book.title}</strong>
                          <span className={styles.author}>{book.author}</span>
                        </span>
                        <span className={styles.choicePrice}>
                          {formatVnd(book.price)}
                        </span>
                        <span className={styles.mark} aria-hidden="true">
                          {checked && <Check size={14} />}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {(candidates.hasNextPage || candidates.isFetchNextPageError) && (
                <button
                  className={styles.retryBtn}
                  type="button"
                  disabled={candidates.isFetching}
                  onClick={() => void candidates.fetchNextPage()}
                >
                  {candidates.isFetchingNextPage
                    ? "Đang tải…"
                    : candidates.isFetchNextPageError
                      ? "Thử tải trang tiếp theo"
                      : "Tải thêm sách"}
                </button>
              )}
            </fieldset>

            <section className={styles.preview} aria-label="Xem lại đề nghị mới">
              <div className={styles.previewHead}>
                <h3>
                  <ArrowLeftRight size={15} aria-hidden="true" />
                  Đề nghị mới
                </h3>
                <span className={styles.currentRefStamp}>
                  Hiện tại: {formatVnd(currentGiveValue)}
                </span>
              </div>

              {replacements.length ? (
                <div aria-live="polite" className={styles.previewValues}>
                  <div className={styles.deltaRow}>
                    <span>Thay đổi giá trị gửi</span>
                    <strong
                      className={styles.deltaBadge}
                      data-sign={
                        valueDelta > 0 ? "plus" : valueDelta < 0 ? "minus" : "zero"
                      }
                    >
                      {valueDelta > 0
                        ? `+${formatVnd(valueDelta)}`
                        : valueDelta < 0
                          ? `-${formatVnd(Math.abs(valueDelta))}`
                          : "Giữ nguyên"}
                    </strong>
                  </div>

                  <ul className={styles.selectedList}>
                    {replacements.map((book) => (
                      <li key={book.id}>
                        <span className={styles.selectedTitle} title={book.title}>
                          {book.title}
                        </span>
                        <strong>{formatVnd(book.price)}</strong>
                      </li>
                    ))}
                  </ul>

                  <dl className={styles.previewList}>
                    <div>
                      <dt>Cọc mới của bạn</dt>
                      <dd>{formatVnd(ownValue)}</dd>
                    </div>
                    <div>
                      <dt>Cọc của đối tác</dt>
                      <dd>{formatVnd(receiveValue)}</dd>
                    </div>
                  </dl>

                  <div
                    className={styles.compensationBox}
                    data-direction={
                      difference > 0 ? "out" : difference < 0 ? "in" : "even"
                    }
                  >
                    <span>
                      {difference > 0
                        ? "Tiền bù bạn trả"
                        : difference < 0
                          ? "Tiền bù bạn nhận"
                          : "Tiền bù chênh lệch"}
                    </span>
                    <strong>
                      {difference > 0
                        ? `-${formatVnd(difference)}`
                        : difference < 0
                          ? `+${formatVnd(Math.abs(difference))}`
                          : "0 ₫ (Ngang giá)"}
                    </strong>
                  </div>
                </div>
              ) : (
                <div className={styles.emptyPreviewWrap}>
                  <dl className={styles.previewList} data-baseline="true">
                    <div>
                      <dt>Cọc hiện tại của bạn</dt>
                      <dd>{formatVnd(currentGiveValue)}</dd>
                    </div>
                    <div>
                      <dt>Cọc của đối tác</dt>
                      <dd>{formatVnd(receiveValue)}</dd>
                    </div>
                  </dl>
                  <p className={styles.emptyPreview}>
                    Chọn sách ở bên trái để xem cọc mới và mức tiền bù tương ứng.
                  </p>
                </div>
              )}
            </section>
          </div>

          <div className={styles.note} data-open={noteOpen || undefined}>
            <button
              type="button"
              className={styles.noteToggle}
              aria-expanded={noteOpen}
              aria-controls={notePanelId}
              disabled={isBusy}
              onClick={() => {
                const next = !noteOpen;
                setNoteOpen(next);
                if (next) {
                  requestAnimationFrame(() => {
                    noteInputRef.current?.scrollIntoView({
                      block: "nearest",
                      behavior: "smooth",
                    });
                    noteInputRef.current?.focus({ preventScroll: true });
                  });
                }
              }}
            >
              <span className={styles.noteTitle}>
                <MessageSquarePlus size={15} aria-hidden="true" />
                <span>Thêm lời nhắn cho đối tác</span>
                {note.trim().length > 0 && (
                  <span className={styles.noteFilledStamp}>Đã nhập</span>
                )}
              </span>
              <ChevronDown
                size={16}
                className={styles.noteChevron}
                aria-hidden="true"
              />
            </button>
            {noteOpen && (
              <div id={notePanelId} className={styles.noteBody}>
                <textarea
                  ref={noteInputRef}
                  aria-label="Lời nhắn kèm đề nghị"
                  placeholder="Ví dụ: Mình đề xuất đổi sang cuốn này gần tương đương giá trị nhé…"
                  maxLength={500}
                  value={note}
                  disabled={isBusy}
                  onChange={(event) => setNote(event.target.value)}
                />
                <div className={styles.noteFoot}>
                  <span>Lời nhắn sẽ gửi kèm đề xuất sách mới.</span>
                  <span className={styles.noteCount}>{note.length}/500</span>
                </div>
              </div>
            )}
          </div>

          {selected.length !== replacements.length && (
            <p role="status" className={styles.stateBox}>
              Sách đã chọn vừa thay đổi. Hãy chọn lại.
            </p>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.btnCancel}
            onClick={onClose}
            disabled={isBusy}
          >
            Quay lại
          </button>
          <button
            type="button"
            data-focus-inverse
            className={styles.btnConfirm}
            onClick={() => void submit()}
            disabled={!canSend || isBusy}
          >
            <ArrowLeftRight size={15} aria-hidden="true" />
            {isBusy ? "Đang gửi…" : "Gửi đề xuất"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
