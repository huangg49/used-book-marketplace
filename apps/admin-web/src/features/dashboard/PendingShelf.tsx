import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  useIsFetching,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  ImageOff,
  Layers3,
  RefreshCw,
} from "lucide-react";
import { session } from "../../core/session";
import { BrandMark } from "../../core/brand-mark";
import { usePaperMotion } from "../../core/paper-motion";
import { usePaperDepth } from "../../core/paper-depth";
import depth from "../../core/paper-depth.module.css";
import { Button, ErrorNotice } from "../../core/ui";
import { dateText, money } from "../../core/format";
import {
  book,
  catalog,
  labels,
  mediaRead,
  type Listing,
} from "../review/contracts";
import type { DashboardSnapshot } from "./sources";
import { selectedShelfItem, shelfReference, shelfTitle } from "./shelf-model";
import styles from "./PendingShelf.module.css";

type Props = {
  snapshot?: DashboardSnapshot;
  pending: boolean;
  fetching: boolean;
  error: unknown;
  admin: boolean;
  retry: () => void;
};

export function PendingShelf({
  snapshot,
  pending,
  fetching,
  error,
  admin,
  retry,
}: Props) {
  const titleId = useId();
  return (
    <section className={styles.desk} aria-labelledby={titleId}>
      <header className={styles.heading}>
        <div>
          <h2 id={titleId}>
            Kệ sách chờ duyệt<span aria-hidden="true">.</span>
          </h2>
        </div>
        <Link className={styles.all} to="/review/listings?status=PendingReview">
          Toàn bộ hồ sơ
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </header>
      {error != null && (
        <div className={styles.error}>
          <ErrorNotice error={error} retry={retry} busy={fetching} />
          {snapshot && (
            <p>
              Đang giữ lần tải trước. Mở hồ sơ để kiểm tra trạng thái mới nhất.
            </p>
          )}
        </div>
      )}
      {pending && !snapshot && (
        <div className={styles.loading} role="status">
          <div className={styles.skeletons} aria-hidden="true">
            {[0, 1, 2].map((value) => (
              <span key={value} />
            ))}
          </div>
          <p>Đang xếp hồ sơ lên kệ…</p>
        </div>
      )}
      {snapshot && snapshot.reviewItems?.length === 0 ? (
        <div className={styles.emptyCompact}>
          <span className={styles.emptySeal} aria-hidden="true">
            <BrandMark className={styles.emptySealMark} />
          </span>
          <div className={styles.emptyCopy}>
            <h3>Kệ đang trống.</h3>
            <p>Chưa có bài đăng chờ duyệt trong lần tải này.</p>
          </div>
          <div className={styles.emptyActions}>
            <Link to="/review/listings?status=Approved">Xem bài đăng đã duyệt<ArrowRight size={16} aria-hidden="true" /></Link>
            <Button className={styles.emptyRefresh} busy={fetching} onClick={retry}>Cập nhật kệ sách</Button>
          </div>
        </div>
      ) : snapshot && (
        <ShelfContent
          snapshot={snapshot}
          admin={admin}
          fetching={fetching}
          retry={retry}
        />
      )}
    </section>
  );
}

function ShelfContent({
  snapshot,
  admin,
  fetching,
  retry,
}: {
  snapshot: DashboardSnapshot;
  admin: boolean;
  fetching: boolean;
  retry: () => void;
}) {
  const items = snapshot.reviewItems ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(
    items[0]?.id ?? null,
  );
  const selected = selectedShelfItem(items, selectedId);
  const panelId = useId();
  const panel = useRef<HTMLElement>(null);
  const paper = useRef<HTMLSpanElement>(null);
  usePaperDepth(panel, paper);
  const [turn, setTurn] = useState(0);
  usePaperMotion(panel, turn || null, "turn");
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const returnFocusId = useRef<string | null>(null);
  const headingId = useId();
  const [mobilePreview, setMobilePreview] = useState(false);
  useLayoutEffect(() => {
    if (mobilePreview) panel.current?.focus();
    else if (returnFocusId.current) {
      buttonRefs.current.get(returnFocusId.current)?.focus();
      returnFocusId.current = null;
    }
  }, [mobilePreview, turn]);
  const [selectionNotice, setSelectionNotice] = useState("");
  const [photoFailures, setPhotoFailures] = useState<Record<string, boolean>>(
    {},
  );
  const queryClient = useQueryClient();
  const photoState = useCallback((key: string, failed: boolean) => {
    setPhotoFailures((previous) =>
      previous[key] === failed ? previous : { ...previous, [key]: failed },
    );
  }, []);
  const photoKey = [
    "review-media",
    selected?.id,
    selected?.currentRevision.content.mediaIds[0],
  ];
  const photoFetching = useIsFetching({ queryKey: photoKey, exact: true }) > 0;
  const refs = items.map((item) => shelfReference(item, admin));
  const lookups = [
    ...new Map(
      refs.flatMap((ref) => (ref ? [[ref.path, ref] as const] : [])),
    ).values(),
  ];
  const metadataResults = useQueries({
    queries: lookups.map((ref) => ({
      queryKey: ["book-reference", ref.id, ref.confirmed, admin],
      queryFn: async () =>
        ref.confirmed
          ? session.request(ref.path, book)
          : (await session.request(ref.path, catalog)).currentRevision.metadata,
      staleTime: 60_000,
    })),
  });
  const metadata = refs.map((ref) =>
    ref
      ? metadataResults[lookups.findIndex((lookup) => lookup.path === ref.path)]
      : undefined,
  );
  // Reconcile a removed identity before committing children. An item that later
  // returns to the queue must not unexpectedly take selection back.
  if (selectedId && !items.some((item) => item.id === selectedId)) {
    setSelectedId(items[0]?.id ?? null);
    setSelectionNotice(
      items.length
        ? "Hồ sơ vừa xem đã rời hàng chờ. Đang hiển thị hồ sơ đầu tiên còn lại."
        : "Hồ sơ vừa xem đã rời hàng chờ. Kệ sách hiện đang trống.",
    );
  } else if (!selectedId && items[0]) {
    setSelectedId(items[0].id);
  }
  const selectedIndex = items.findIndex((item) => item.id === selected?.id);
  const reference = metadata[selectedIndex];
  const title = selected ? shelfTitle(selected, reference?.data) : "";
  const content = selected?.currentRevision.content;
  function choose(id: string, button: HTMLButtonElement) {
    setSelectedId(id);
    setSelectionNotice("");
    // Compact screens show one pane at a time. Focus enters the preview only
    // after an explicit selection, never on background refresh.
    const compact =
      getComputedStyle(button).getPropertyValue("--shelf-compact").trim() ===
      "1";
    if (id !== selected?.id || compact) setTurn((previous) => previous + 1);
    setMobilePreview(compact);
  }
  return (
    <>
      {selectionNotice && (
        <p role="status" className={styles.selectionNotice}>
          {selectionNotice}
        </p>
      )}
      <div className={styles.layout} data-preview={mobilePreview}>
        <div className={styles.stage}>
          <div className={styles.stageHeading}>
            <span>Đang chờ trên bàn</span>
            <span className={styles.count}>
              {snapshot.value}
              {snapshot.more ? "+" : ""}
              <span> hồ sơ đã tải</span>
            </span>
          </div>
          {!!items.length && (
            <ul className={styles.books} aria-label="Chọn hồ sơ để xem nhanh">
              {items.map((item, index) => {
                const itemTitle = shelfTitle(item, metadata[index]?.data);
                const active = item.id === selected?.id;
                return (
                  <li
                    key={item.id}
                    style={
                      {
                        "--book-lean": `${[-3, 2, -2, 2, -2, 3][index]}deg`,
                      } as CSSProperties
                    }
                  >
                    <button
                      type="button"
                      className={styles.bookButton}
                      aria-pressed={active}
                      aria-controls={panelId}
                      aria-label={`Xem nhanh: ${itemTitle}`}
                      onClick={(event) => choose(item.id, event.currentTarget)}
                      ref={(node) => {
                        if (node) buttonRefs.current.set(item.id, node);
                        else buttonRefs.current.delete(item.id);
                      }}
                    >
                      <span className={styles.bookObject}>
                        <ShelfCover
                          item={item}
                          title={itemTitle}
                          onFailure={photoState}
                        />
                        {item.currentRevision.content.bundle && (
                          <span className={styles.bundle}>
                            <Layers3 size={12} aria-hidden="true" />
                            {
                              item.currentRevision.content.bundle.items.length
                            }{" "}
                            cuốn
                          </span>
                        )}
                      </span>
                      <span className={styles.bookLabel}>
                        <span className={styles.ordinal}>
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span title={itemTitle}>{itemTitle}</span>
                      </span>
                      <span className={styles.selectionMark}>
                        {active ? "Đang xem" : "Xem hồ sơ"}
                        <ArrowRight size={12} aria-hidden="true" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {!items.length && (
            <div className={styles.emptyStage}>
              <BookOpen size={44} strokeWidth={1} aria-hidden="true" />
              <h3>Kệ đang trống.</h3>
              <p>Chưa có bài đăng chờ duyệt trong lần tải này.</p>
              <Button busy={fetching} onClick={retry}>
                <RefreshCw size={15} aria-hidden="true" />
                Cập nhật kệ sách
              </Button>
            </div>
          )}
          <footer className={styles.stageFooter}>
            <span>
              {items.length
                ? `${items.length} hồ sơ đầu tiên · Cũ nhất trước`
                : "Hồ sơ mới sẽ xuất hiện tại đây."}
            </span>
            {snapshot.serverTime && (
              <time dateTime={snapshot.serverTime}>
                Cập nhật {dateText(snapshot.serverTime)}
              </time>
            )}
          </footer>
        </div>
        <article
          id={panelId}
          ref={panel}
          className={styles.sheet}
          tabIndex={-1}
          aria-labelledby={headingId}
        >
          <span ref={paper} className={`${depth.layer} ${styles.sheetPaper}`} aria-hidden="true" />
          <Button
            className={styles.back}
            onClick={() => {
              returnFocusId.current = selected?.id ?? null;
              setMobilePreview(false);
            }}
          >
            ← Trở lại kệ sách
          </Button>
          <header className={styles.sheetHeader}>
            <span>PHIẾU XEM NHANH</span>
            <span>
              {selected
                ? `Bản gửi ${selected.currentRevision.number}`
                : "Lật Lại"}
            </span>
          </header>
          {selected && content ? (
            <>
              <p className={styles.status}>
                {labels[selected.state.moderation]}
                {content.bundle
                  ? " · Bộ sách"
                  : selected.channel === "Auction"
                    ? " · Sách đấu giá"
                    : ` · ${labels[content.mode ?? ""] || "Bài đăng sách"}`}
              </p>
              <h3 id={headingId} className={styles.title}>
                {title}
              </h3>
              {reference?.data?.authors.length ? (
                <p className={styles.authors}>
                  {reference.data.authors.join(" · ")}
                </p>
              ) : null}
              {reference?.isPending && refs[selectedIndex] && (
                <p className={styles.referenceNote} role="status">
                  Đang đối chiếu thông tin đầu sách…
                </p>
              )}
              {reference?.isError && (
                <ErrorNotice
                  error={reference.error}
                  retry={() => void reference.refetch()}
                  busy={reference.isFetching}
                />
              )}
              <div className={styles.sheetAction}>
                <Link
                  to={`/review/listings/${selected.id}`}
                  className={styles.review}
                >
                  Mở hồ sơ kiểm duyệt
                  <ArrowRight size={17} aria-hidden="true" />
                </Link>
                <p>Đối chiếu đầy đủ ảnh và thông tin trước khi quyết định.</p>
              </div>
              <dl className={styles.facts}>
                <div>
                  <dt>Tình trạng khai báo</dt>
                  <dd>
                    {content.bundle
                      ? "Theo từng cuốn trong hồ sơ bộ"
                      : labels[content.condition ?? ""] || "Chưa cung cấp"}
                  </dd>
                </div>
                {content.salePrice !== null && (
                  <div>
                    <dt>Giá bán</dt>
                    <dd>{money(content.salePrice)}</dd>
                  </div>
                )}
                {content.exchangeValue !== null && (
                  <div>
                    <dt>Giá trị đổi</dt>
                    <dd>{money(content.exchangeValue)}</dd>
                  </div>
                )}
                {content.bundle && (
                  <div>
                    <dt>Quy cách</dt>
                    <dd>
                      {content.bundle.items.length} cuốn · Chỉ bán nguyên bộ
                    </dd>
                  </div>
                )}
                <div>
                  <dt>Ảnh đính kèm</dt>
                  <dd>{content.mediaIds.length} ảnh do người đăng cung cấp</dd>
                </div>
                <div>
                  <dt>Đầu sách</dt>
                  <dd>
                    {content.bundle
                      ? "Đối chiếu từng cuốn trong hồ sơ bộ"
                      : labels[selected.catalogStatus ?? ""] ||
                        "Chưa có tham chiếu"}
                  </dd>
                </div>
                <div>
                  <dt>Gửi duyệt</dt>
                  <dd>{dateText(selected.currentRevision.submittedAt)}</dd>
                </div>
              </dl>
              {photoFailures[`${selected.id}/${content.mediaIds[0]}`] && (
                <div className={styles.photoError}>
                  <p>Ảnh xem nhanh chưa tải được.</p>
                  <Button
                    busy={photoFetching}
                    onClick={() =>
                      void queryClient.invalidateQueries({
                        queryKey: photoKey,
                        exact: true,
                      })
                    }
                  >
                    Tải lại ảnh xem nhanh
                  </Button>
                </div>
              )}
              <details key={selected.id} className={styles.previewNotes}>
                <summary>Mô tả và mã hồ sơ</summary>
                {content.description && (
                  <p className={styles.description}>{content.description}</p>
                )}
                <span className={styles.recordId}>Mã hồ sơ · {selected.id}</span>
              </details>
            </>
          ) : (
            <div className={styles.emptySheet}>
              <span aria-hidden="true">
                <BrandMark wordmark className={styles.emptyBrand} />
              </span>
              <h3 id={headingId}>Sẵn sàng cho hồ sơ tiếp theo.</h3>
              <p>
                Khi có sách gửi duyệt, bạn có thể chọn trên kệ để xem nhanh tại
                đây.
              </p>
              <Link to="/review/listings?status=Approved">
                Xem bài đăng đã duyệt
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          )}
        </article>
      </div>
      <p className={styles.scope}>
        Ảnh đầu tiên lấy từ hồ sơ, không thay cho việc kiểm tra toàn bộ ảnh. Số
        hồ sơ tính trong trang đang tải; dấu “+” nghĩa là còn trang tiếp theo.
      </p>
    </>
  );
}

function ShelfCover({
  item,
  title,
  onFailure,
}: {
  item: Listing;
  title: string;
  onFailure: (key: string, failed: boolean) => void;
}) {
  const id = item.currentRevision.content.mediaIds[0];
  const [failed, setFailed] = useState("");
  const [loaded, setLoaded] = useState("");
  const result = useQuery({
    queryKey: ["review-media", item.id, id],
    enabled: !!id,
    queryFn: () =>
      session.request(
        `/operations/listings/${item.id}/media/${id}/read`,
        mediaRead,
      ),
    staleTime: 60_000,
    refetchInterval: 90_000,
  });
  const url = result.data?.url;
  const imageKey = `${url}:${result.dataUpdatedAt}`;
  const broken = result.isError || (!!url && failed === imageKey);
  const available = !!url && !broken;
  useEffect(() => {
    onFailure(`${item.id}/${id}`, broken);
  }, [item.id, id, broken, onFailure]);
  return (
    <span className={styles.cover}>
      <span className={styles.coverFallback}>
        {broken ? (
          <ImageOff size={22} strokeWidth={1.25} aria-hidden="true" />
        ) : (
          <BookOpen size={25} strokeWidth={1.25} aria-hidden="true" />
        )}
        <span>
          {!id ? "Chưa có ảnh" : broken ? "Ảnh chưa tải được" : "Đang tải ảnh"}
        </span>
      </span>
      {available && (
        <img
          key={imageKey}
          src={url}
          alt={`Ảnh đầu tiên của ${title}`}
          referrerPolicy="no-referrer"
          decoding="async"
          data-loaded={loaded === imageKey}
          onLoad={() => setLoaded(imageKey)}
          onError={() => setFailed(imageKey)}
        />
      )}
    </span>
  );
}
