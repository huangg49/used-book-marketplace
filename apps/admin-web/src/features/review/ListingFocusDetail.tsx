import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  BookMarked,
  Camera,
  ChevronDown,
  ClipboardList,
  Layers,
  Tag,
  Truck,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import {
  categoryPath,
  facetDefinitions,
  languageLabel,
} from "@used-books/api-contract/catalog-taxonomy";
import { canReviewCatalog, session } from "../../core/session";
import { dateText, money } from "../../core/format";
import { invalidateDashboard } from "../../core/dashboard-cache";
import { Button, ErrorNotice, Notice } from "../../core/ui";
import { ConfirmDialog } from "../../core/ConfirmDialog";
import {
  book,
  catalog,
  labels,
  listing,
  type Metadata,
  type PriceAssistReview,
} from "./contracts";
import { ReviewGallery } from "./ReviewGallery";
import { History } from "./readers";
import { DecisionForm } from "./decision-form";
import { DecisionRecord } from "./DecisionRecord";
import { NextReview } from "./NextReview";
import { ListingTitle } from "./ListingTitle";
import { RevisionComparison } from "./RevisionComparison";
import {
  matchesRecordedDecision,
  recordedDecision,
  type RecordedDecision,
} from "./decision-feedback";
import styles from "./ListingReview.module.css";

const answer = (value: boolean | null) =>
  value === null ? "Chưa khai báo" : value ? "Có" : "Không";

const evidenceLabels: Record<PriceAssistReview["evidenceLevel"], string> = {
  Strong: "Căn cứ khá đủ",
  Limited: "Căn cứ còn hạn chế",
  Insufficient: "Chưa đủ căn cứ",
};

const sourceKindLabels: Record<PriceAssistReview["sources"][number]["kind"], string> = {
  CoverPrice: "Giá bìa",
  EditorialReference: "Giá biên tập",
  InternalAsking: "Giá rao khác",
  CompletedSale: "Giá đã bán",
  OnlineRetail: "Nhà sách trực tuyến",
};

function languageDisplay(code: string) {
  const label = languageLabel(code);
  if (label !== code) return label;
  try {
    const name = new Intl.DisplayNames(["vi"], { type: "language" }).of(code);
    return name && name !== code ? `${name} (${code})` : code;
  } catch {
    return code;
  }
}

function CatalogMetaGrid({
  id,
  confirmed,
  admin,
  onReady,
}: {
  id: string | null;
  confirmed: boolean;
  admin: boolean;
  onReady: (ready: boolean) => void;
}) {
  const result = useQuery({
    queryKey: ["book-reference", id, confirmed, admin],
    enabled: !!id && (confirmed || admin),
    queryFn: async (): Promise<Metadata> =>
      confirmed
        ? session.request(`/catalog/books/${id}`, book)
        : (await session.request(`/operations/catalog-requests/${id}`, catalog))
            .currentRevision.metadata,
  });
  const ready = confirmed && !!result.data && !result.isError;
  useEffect(() => {
    onReady(ready);
    return () => onReady(false);
  }, [ready, onReady]);

  if (!id) {
    return <p className={styles.photoNote}>Bài đăng chưa liên kết với đầu sách.</p>;
  }
  if (!confirmed && !admin) {
    return (
      <p className={styles.photoNote}>
        Đầu sách chưa được xác nhận. Cần Admin kiểm tra yêu cầu đầu sách trước khi duyệt bài.
      </p>
    );
  }
  if (result.isLoading) {
    return (
      <p className={styles.photoNote} role="status">
        Đang tải thông tin đầu sách…
      </p>
    );
  }
  if (result.error) {
    return (
      <ErrorNotice
        error={result.error}
        retry={() => void result.refetch()}
        busy={result.isFetching}
      />
    );
  }
  if (!result.data) return null;

  const value = result.data;
  const rows: { label: string; value: string | number | null }[] = [
    { label: "Nhà xuất bản", value: value.publisher },
    { label: "Năm xuất bản", value: value.publicationYear },
    { label: "Ấn bản", value: value.edition },
    {
      label: "Danh mục",
      value: value.categoryId
        ? categoryPath(value.categoryId)
            .map((c) => c.label)
            .join(" / ") || value.category
        : value.category,
    },
    { label: "Ngôn ngữ", value: languageDisplay(value.language) },
    { label: "ISBN", value: value.isbn },
  ];
  if (value.series) rows.push({ label: "Bộ truyện", value: value.series });
  for (const [key, values] of Object.entries(value.attributes ?? {})) {
    const def = facetDefinitions.find((f) => f.id === key);
    rows.push({
      label: def?.label || key,
      value:
        values
          ?.map((v) => def?.options.find((o) => o.id === v)?.label || v)
          .join(" · ") || null,
    });
  }

  return (
    <dl className={styles.metaGrid}>
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd className={row.value === null || row.value === "" ? styles.metaMissing : undefined}>
            {row.value === null || row.value === "" ? "Chưa cung cấp" : row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ListingFocusDetail({
  id,
  user,
}: {
  id: string;
  user: CurrentUser;
}) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [photos, setPhotos] = useState<Record<string, boolean>>({});
  const [reset, setReset] = useState(0);
  const [bookReady, setBookReady] = useState(false);
  const [pendingCommand, setPendingCommand] = useState(false);
  const [reloadConfirmOpen, setReloadConfirmOpen] = useState(false);
  const [recorded, setRecorded] = useState<RecordedDecision | null>(null);
  const [view, setView] = useState<"content" | "compare" | "history">("content");
  const [comparisonOpened, setComparisonOpened] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  const onPhotoReady = useCallback(
    (mediaId: string, ready: boolean) =>
      setPhotos((previous) =>
        previous[mediaId] === ready ? previous : { ...previous, [mediaId]: ready },
      ),
    [],
  );

  const result = useQuery({
    queryKey: ["review", "listings", id],
    queryFn: () => session.request(`/operations/listings/${id}`, listing),
    // Never refetch under an open review (ADR 0010).
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
    gcTime: 0,
  });

  const value = result.data;
  const loadedId = value?.id;

  useLayoutEffect(() => {
    if (!loadedId) return;
    window.scrollTo({ top: 0, behavior: "instant" });
    const active = document.activeElement;
    const linkPath =
      active instanceof HTMLAnchorElement && !active.matches(".skip-link")
        ? new URL(active.href).pathname
        : undefined;
    if (
      active === document.body ||
      linkPath === location.pathname ||
      linkPath === "/review/listings"
    ) {
      heading.current?.focus({ preventScroll: true });
    }
  }, [loadedId, location.pathname]);

  async function reconcile() {
    await invalidateDashboard(queryClient);
    const fresh = await result.refetch();
    if (fresh.error) throw fresh.error;
    await queryClient.invalidateQueries({ queryKey: ["queue"] });
    await queryClient.invalidateQueries({ queryKey: ["revisions", id] });
  }

  if (result.isLoading) {
    return <p role="status">Đang mở hồ sơ bài đăng…</p>;
  }
  if (result.error) {
    return (
      <ErrorNotice
        error={result.error}
        retry={() => void result.refetch()}
        busy={result.isFetching}
      />
    );
  }
  if (!value) return null;

  const status =
    value.state.visibility === "Removed" ? "Removed" : value.state.moderation;
  const self = value.ownerId === user.id;
  const pending = status === "PendingReview";
  const c = value.currentRevision.content;
  const bundle = c.bundle;
  const auction = value.channel === "Auction";
  const decisionRecord =
    value.latestDecision?.revisionId === value.currentRevision.id
      ? value.latestDecision
      : null;
  const decisionAllowed =
    pending &&
    !self &&
    value.state.trade === "Available" &&
    value.state.visibility !== "Removed" &&
    !value.state.deletedAt;
  const removalAllowed =
    !pending &&
    !self &&
    value.state.visibility !== "Removed" &&
    value.state.trade === "Available" &&
    !value.state.deletedAt;

  const flags = [
    { label: "Còn đọc được", value: c.readable, concern: c.readable === false },
    { label: "Thiếu trang", value: c.hasMissingPages, concern: c.hasMissingPages === true },
    {
      label: "Thiếu nội dung trọng yếu",
      value: c.missingEssentialContent,
      concern: c.missingEssentialContent === true,
    },
  ];

  const catalogLabel =
    value.catalogStatus === "Confirmed"
      ? "Đã xác nhận"
      : value.catalogStatus === "Rejected"
        ? "Đã từ chối"
        : "Chờ xác nhận";

  return (
    <div className={styles.focusGrid}>
      <div className={styles.evidenceCol} role="region" aria-label="Nội dung và bằng chứng">
        <header className={styles.heroCard}>
          <div className={styles.heroTop}>
            <div className={styles.heroMetaRow}>
              <span className={styles.heroMetaText}>
                #{id.slice(0, 8).toUpperCase()} · Bản gửi {value.currentRevision.number} ·{" "}
                {dateText(value.currentRevision.submittedAt)}
              </span>
              <span className={styles.statusBadge} data-state={status}>
                {labels[status] || status}
              </span>
            </div>
            <h1 className={styles.heroTitle} ref={heading} tabIndex={-1}>
              <ListingTitle
                value={value}
                showAuthor
                canReadPendingCatalog={canReviewCatalog(user)}
              />
            </h1>
          </div>

          <dl className={styles.heroFacts} aria-label="Tóm tắt bản sách">
            <div className={styles.heroPrice}>
              <dt>
                {auction
                  ? "Giá trị khai báo"
                  : c.mode === "Exchange"
                    ? "Giá trị đổi"
                    : bundle
                      ? "Giá cả bộ"
                      : "Giá bán"}
              </dt>
              <dd>
                {money(c.mode === "Exchange" ? c.exchangeValue : c.salePrice)}
              </dd>
            </div>
            {c.mode === "Both" && (
              <div className={styles.heroPrice}>
                <dt>Giá trị đổi</dt>
                <dd>{money(c.exchangeValue)}</dd>
              </div>
            )}
            <div>
              <dt>Hình thức</dt>
              <dd>
                {auction
                  ? "Đấu giá qua điểm"
                  : bundle
                    ? `Bán nguyên bộ (${bundle.items.length} cuốn)`
                    : labels[c.mode || ""] || "Chưa khai báo"}
              </dd>
            </div>
            <div>
              <dt>Tình trạng khai báo</dt>
              <dd>{labels[c.condition || ""] || "Chưa khai báo"}</dd>
            </div>
            <div>
              <dt>Đầu sách</dt>
              <dd>{catalogLabel}</dd>
            </div>
          </dl>
        </header>

        <nav className={styles.viewTabs} aria-label="Nội dung hồ sơ">
          <button
            type="button"
            aria-pressed={view === "content"}
            onClick={() => setView("content")}
          >
            Nội dung & ảnh ({c.mediaIds.length})
          </button>
          <button
            type="button"
            aria-pressed={view === "compare"}
            onClick={() => {
              setView("compare");
              setComparisonOpened(true);
            }}
          >
            Đối chiếu bản gửi
          </button>
          <button
            type="button"
            aria-pressed={view === "history"}
            onClick={() => setView("history")}
          >
            Lịch sử
          </button>
        </nav>

        {pending && value.catalogStatus !== "Confirmed" && (
          <div className={styles.catalogAlert} role="note">
            <div className={styles.catalogAlertLead}>
              <BookMarked size={20} aria-hidden="true" />
              <div>
                <strong>
                  {value.catalogStatus === "Rejected"
                    ? "Đầu sách đã bị từ chối"
                    : "Đầu sách đang chờ xác nhận"}
                </strong>
                <p>
                  Cần xác nhận đầu sách trong danh mục dùng chung trước khi duyệt bài đăng này.
                </p>
              </div>
            </div>
            {canReviewCatalog(user) && c.bookId ? (
              <Link
                className={styles.catalogAlertLink}
                to={`/review/catalog-requests/${c.bookId}`}
              >
                Mở yêu cầu đầu sách
                <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            ) : (
              <span className={styles.cardHeadMeta}>Chờ Admin xử lý đầu sách</span>
            )}
          </div>
        )}

        <div hidden={view !== "content"} className={styles.evidenceCol}>
          <section className={styles.photoCard} aria-label="Ảnh người đăng gửi">
            <div className={styles.cardHead}>
              <h2>
                <Camera size={18} aria-hidden="true" />
                Ảnh người đăng gửi
              </h2>
              <span className={styles.cardHeadMeta}>{c.mediaIds.length} ảnh</span>
            </div>
            <ReviewGallery
              key={value.currentRevision.id}
              listingId={id}
              ids={c.mediaIds}
              revisionNumber={value.currentRevision.number}
              onReady={onPhotoReady}
              primary
            />
            <p className={styles.photoNote}>
              Ảnh dùng để đối chiếu tình trạng vật lý; không xác nhận sách chính hãng hay quyền sở hữu.
            </p>
          </section>

          <div className={styles.sheetCard}>
            <section className={styles.sheetSection} aria-label="Tình trạng bản sách">
              <div className={styles.sheetHeading}>
                <h2>
                  <ClipboardList size={18} aria-hidden="true" />
                  Tình trạng & mô tả người đăng
                </h2>
                <span>Đối chiếu với ảnh chụp ở trên</span>
              </div>

              <dl className={styles.flagStrip}>
                {flags.map((flag) => (
                  <div
                    key={flag.label}
                    className={styles.flagItem}
                    data-concern={flag.concern || undefined}
                  >
                    <dt>{flag.label}</dt>
                    <dd>{answer(flag.value)}</dd>
                  </div>
                ))}
              </dl>

              <dl className={styles.noteGrid}>
                <div>
                  <dt>Ruột sách</dt>
                  <dd>{c.pages || "Chưa mô tả"}</dd>
                </div>
                <div>
                  <dt>Bìa và gáy</dt>
                  <dd>{c.coverNote || "Chưa mô tả"}</dd>
                </div>
                <div>
                  <dt>Ghi chú / đánh dấu</dt>
                  <dd>{c.notes || "Chưa mô tả"}</dd>
                </div>
                <div>
                  <dt>Phụ kiện</dt>
                  <dd>{c.accessories || "Chưa mô tả"}</dd>
                </div>
              </dl>

              <div className={styles.descriptionBox}>
                <span>Mô tả chung</span>
                <p>{c.description || "Không có mô tả thêm."}</p>
              </div>
            </section>

            {bundle && (
              <section className={styles.sheetSection} aria-label="Danh sách bộ sách">
                <div className={styles.sheetHeading}>
                  <h2>
                    <Layers size={18} aria-hidden="true" />
                    {bundle.title} · Bộ {bundle.items.length} cuốn
                  </h2>
                  <span>Bán, giao và trả nguyên bộ</span>
                </div>
                <ol className={styles.bundleList}>
                  {bundle.items.map((item, index) => (
                    <li key={index}>
                      <strong>{item.label}</strong> · {labels[item.condition]}
                      {item.notes && <p>{item.notes}</p>}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {auction && (
              <section className={styles.sheetSection}>
                <Notice>
                  <strong>Sách đấu giá</strong>
                  <p className="prose">
                    Bài này không lên kệ mua/đổi. Giá là giá trị khai báo (mức bồi thường tối đa).
                    Sau khi duyệt, sách còn được kiểm tra tại điểm trước khi mở phiên.
                  </p>
                </Notice>
              </section>
            )}

            <section className={styles.sheetSection} aria-label="Thông tin đầu sách đối chiếu">
              <div className={styles.sheetHeading}>
                <h2>
                  <BookMarked size={18} aria-hidden="true" />
                  Thông tin đầu sách đối chiếu
                </h2>
                <span>{catalogLabel}</span>
              </div>
              <CatalogMetaGrid
                id={c.bookId}
                confirmed={value.catalogStatus === "Confirmed"}
                admin={canReviewCatalog(user)}
                onReady={setBookReady}
              />
            </section>

            <section className={styles.sheetSection} aria-label="Giao nhận và căn cứ giá">
              <div className={styles.sheetHeading}>
                <h2>
                  <Truck size={18} aria-hidden="true" />
                  Giao nhận & tham chiếu giá
                </h2>
              </div>

              {value.currentRevision.fulfillmentStatus === "NeedsUpdate" ? (
                <Notice tone="warning">
                  Nơi gửi đã thay đổi hoặc bị xóa. Chưa thể duyệt bài; cần người đăng cập nhật qua bản sửa.
                </Notice>
              ) : (
                <div className={styles.opsRow}>
                  <Truck size={17} aria-hidden="true" />
                  <span>
                    {value.currentRevision.fulfillmentStatus === "Current"
                      ? "Giao trực tiếp · TP.HCM (vùng mô phỏng). Địa chỉ riêng được ẩn với người duyệt."
                      : "Chưa khai báo nơi gửi. Có thể duyệt nội dung; giao dịch chưa mở."}
                  </span>
                </div>
              )}

              {value.priceAssist && (
                <details className={styles.assistDisclosure}>
                  <summary>
                    <span>
                      <Tag size={14} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 6 }} />
                      {value.priceAssist.applied
                        ? `Dùng gợi ý giá: ${money(value.priceAssist.chosenSalePrice)} (khoảng ${money(value.priceAssist.range.low)} – ${money(value.priceAssist.range.high)})`
                        : `Tự đặt ${money(value.priceAssist.chosenSalePrice)} · Gợi ý ${money(value.priceAssist.range.low)} – ${money(value.priceAssist.range.high)}`}
                      {" · "}
                      {evidenceLabels[value.priceAssist.evidenceLevel]}
                    </span>
                    <ChevronDown size={15} aria-hidden="true" />
                  </summary>
                  {value.priceAssist.sources.length > 0 && (
                    <ul className={styles.assistSources}>
                      {value.priceAssist.sources.map((s) => (
                        <li key={s.ref}>
                          {s.label} · {sourceKindLabels[s.kind]} · {money(s.amount)} ·{" "}
                          {dateText(s.observedAt)}
                          {s.excluded ? " · không tính vào khoảng giá" : ""}
                          {s.url && (
                            <>
                              {" · "}
                              <a href={s.url} target="_blank" rel="noopener noreferrer">
                                Mở trang
                              </a>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              )}

              {value.removalReason && (
                <Notice tone="warning">
                  <strong>Lý do gỡ bài</strong>
                  <p className="prose">{value.removalReason}</p>
                </Notice>
              )}

              <p className={styles.recordFoot}>
                <span>
                  Khai báo quyền đăng: {dateText(value.currentRevision.ownershipDeclaredAt)}
                </span>
                <span>Mã hồ sơ: {id}</span>
              </p>
            </section>
          </div>
        </div>

        {view === "compare" && comparisonOpened && (
          <div className={styles.sheetCard}>
            <RevisionComparison
              key={value.currentRevision.id}
              listingId={id}
              current={value.currentRevision}
            />
          </div>
        )}

        {view === "history" && (
          <div className={styles.sheetCard}>
            <History listingId={id} currentId={value.currentRevision.id} />
          </div>
        )}
      </div>

      <aside className={styles.decisionCol} role="region" aria-label="Phiếu quyết định">
        {decisionRecord && (
          <DecisionRecord
            {...decisionRecord}
            animate={matchesRecordedDecision(value, recorded)}
          />
        )}

        {self && (
          <Notice tone="warning">
            Bạn là người gửi hồ sơ này. Cần một người kiểm duyệt khác quyết định.
          </Notice>
        )}

        {!pending &&
          (status === "Approved" ? (
            <p className={styles.photoNote}>
              Bài đăng chỉ hiện trên kệ khi còn khả dụng và tài khoản người đăng đủ điều kiện.
            </p>
          ) : !decisionRecord ? (
            <Notice>Hồ sơ đã có kết quả.</Notice>
          ) : null)}

        {!pending && !self && (
          <NextReview
            kind="listings"
            currentId={id}
            reviewerId={user.id}
            canReadPendingCatalog={canReviewCatalog(user)}
          />
        )}

        {(decisionAllowed || removalAllowed) && (
          <DecisionForm
            bundle={!!bundle}
            key={`${value.version}/${value.currentRevision.id}/${reset}`}
            kind="listings"
            removal={!pending}
            id={id}
            version={value.version}
            revisionId={value.currentRevision.id}
            canApprove={
              value.catalogStatus === "Confirmed" &&
              bookReady &&
              value.currentRevision.fulfillmentStatus !== "NeedsUpdate"
            }
            approvalBlock={
              value.catalogStatus !== "Confirmed"
                ? value.catalogStatus === "Rejected"
                  ? "Đầu sách đã bị từ chối. Cần Admin xử lý thông tin đầu sách trước khi duyệt bài này."
                  : "Đầu sách chưa được xác nhận. Cần Admin xác nhận đầu sách trước khi duyệt bài này."
                : value.currentRevision.fulfillmentStatus === "NeedsUpdate"
                  ? "Địa chỉ gửi sách cần được người đăng cập nhật."
                  : !bookReady
                    ? "Chờ tải thành công thông tin đầu sách để đối chiếu."
                    : undefined
            }
            approvalAction={
              value.catalogStatus !== "Confirmed" &&
              canReviewCatalog(user) &&
              c.bookId
                ? {
                    to: `/review/catalog-requests/${c.bookId}`,
                    label: "Xem yêu cầu đầu sách",
                  }
                : undefined
            }
            photosReady={
              c.mediaIds.length > 0 && c.mediaIds.every((mediaId) => photos[mediaId])
            }
            disabled={result.isError || result.isFetching}
            reconcile={reconcile}
            onPending={setPendingCommand}
            subject={
              <ListingTitle
                value={value}
                canReadPendingCatalog={canReviewCatalog(user)}
              />
            }
            revisionNumber={value.currentRevision.number}
            onRecorded={(intent) =>
              setRecorded(recordedDecision(intent, "listings", id))
            }
          />
        )}

        <details className={styles.reloadBox}>
          <summary>
            <span>Có thông tin vừa thay đổi?</span>
            <ChevronDown size={15} aria-hidden="true" />
          </summary>
          <div>
            <p>
              Tải lại để bắt đầu lượt kiểm tra mới. Các ô kiểm tra và lý do chưa gửi sẽ bị xóa.
            </p>
            <Button
              disabled={pendingCommand}
              busy={result.isFetching}
              onClick={() => setReloadConfirmOpen(true)}
            >
              Tải lại hồ sơ
            </Button>
          </div>
        </details>
      </aside>
      <ConfirmDialog
        open={reloadConfirmOpen}
        onClose={() => !result.isFetching && setReloadConfirmOpen(false)}
        title="Tải lại hồ sơ bài đăng?"
        description="Các ô kiểm tra và lý do chưa gửi sẽ bị xóa để bắt đầu lượt kiểm tra mới. Nếu bạn vừa gửi quyết định, hãy thử lại yêu cầu đó trước."
        confirmLabel="Tải lại hồ sơ"
        danger
        busy={result.isFetching}
        onConfirm={async () => {
          const fresh = await result.refetch();
          if (!fresh.error) setReset((previous) => previous + 1);
          setReloadConfirmOpen(false);
        }}
      />
    </div>
  );
}
