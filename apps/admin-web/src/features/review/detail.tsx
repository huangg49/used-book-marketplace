import { dateText, money } from "../../core/format";
import { invalidateDashboard } from "../../core/dashboard-cache";
import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ClipboardCheck,
  PanelRightClose,
  BookMarked,
  ArrowUpRight,
  ChevronDown,
} from "lucide-react";
import {
  Link,
  useLocation,
  useOutletContext,
  useParams,
} from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { canReview, canReviewCatalog, session } from "../../core/session";
import { Button, ErrorNotice, Notice } from "../../core/ui";
import { motionVisible, watchMotionBoundary } from "../../core/motion-boundary";
import { catalog, labels, listing, type Kind } from "./contracts";
import { BookReference, ContentView, History, MetadataView } from "./readers";
import { DecisionForm } from "./decision-form";
import { PriceAssistView } from "./price-assist-view";
import { AutoReviewHistoryView, AutoReviewView } from "./auto-review-view";
import { DecisionRecord } from "./DecisionRecord";
import { NextReview } from "./NextReview";
import { reviewReturnPath } from "./review-navigation";
import { ListingTitle } from "./ListingTitle";
import { RevisionComparison } from "./RevisionComparison";
import styles from "./ReviewWorkspace.module.css";
import {
  matchesRecordedDecision,
  recordedDecision,
  type RecordedDecision,
} from "./decision-feedback";

function focusReviewPart(element: HTMLElement | null) {
  element?.scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" });
  element?.focus({ preventScroll: true });
}

export function Detail() {
  const { kind, id } = useParams();
  const user = useOutletContext<CurrentUser>();
  if (
    !id ||
    !/^[a-f0-9-]{36}$/.test(id) ||
    (kind !== "listings" && kind !== "catalog-requests") ||
    (kind === "catalog-requests" && !canReviewCatalog(user)) ||
    (kind === "listings" && !canReview(user))
  )
    return <p>Hồ sơ không hợp lệ hoặc bạn không có quyền xem.</p>;
  return (
    <DetailContent key={`${kind}/${id}`} kind={kind} id={id} user={user} />
  );
}
function DetailContent({
  kind,
  id,
  user,
}: {
  kind: Kind;
  id: string;
  user: CurrentUser;
}) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [photos, setPhotos] = useState<Record<string, boolean>>({});
  const [reset, setReset] = useState(0);
  const [bookReady, setBookReady] = useState(false);
  const [pendingCommand, setPendingCommand] = useState(false);
  const [recorded, setRecorded] = useState<RecordedDecision | null>(null);
  const [view, setView] = useState<"content" | "compare" | "history">(
    "content",
  );
  const [comparisonOpened, setComparisonOpened] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const recordHeader = useRef<HTMLElement>(null);
  const readingArea = useRef<HTMLDivElement>(null);
  const decisionArea = useRef<HTMLDivElement>(null);
  const photoArea = useRef<HTMLElement>(null);
  const decisionTrigger = useRef<HTMLButtonElement>(null);
  const focusAfterChange = useRef<"decision" | "photo" | "trigger" | null>(null);
  const decisionId = useId();
  const [decisionPhase, setDecisionPhase] = useState<"closed" | "open" | "closing">("closed");
  const decisionOpen = decisionPhase === "open";
  const decisionVisible = decisionPhase !== "closed";
  const decisionAnimation = useRef<Animation | null>(null);
  const interruptedFrame = useRef<Keyframe | null>(null);
  const [checkedCount, setCheckedCount] = useState(0);

  useLayoutEffect(() => {
    const target = focusAfterChange.current;
    focusAfterChange.current = null;
    if (target === "decision") focusReviewPart(decisionArea.current);
    if (target === "photo") focusReviewPart(photoArea.current);
    if (target === "trigger") focusReviewPart(decisionTrigger.current);
  }, [decisionPhase, view]);

  useLayoutEffect(() => {
    const panel = decisionArea.current;
    if (kind !== "listings" || decisionPhase === "closed" || !panel) return;
    const closing = decisionPhase === "closing";
    const complete = () => {
      if (!closing) return;
      if (panel.ownerDocument.activeElement === decisionTrigger.current)
        focusAfterChange.current = "trigger";
      setDecisionPhase("closed");
    };
    const previousFrame = interruptedFrame.current;
    interruptedFrame.current = null;
    if (!motionVisible(panel) || typeof panel.animate !== "function") {
      complete();
      return;
    }

    const split = getComputedStyle(panel).overflowY === "auto";
    const rest = { transform: "none", opacity: 1 };
    const offset = {
      transform: split ? "translateX(18px)" : "translateY(12px)",
      opacity: 0,
    };
    let animation: Animation;
    try {
      animation = panel.animate(
        closing ? [previousFrame ?? rest, offset] : [previousFrame ?? offset, rest],
        {
          duration: closing ? 170 : 220,
          easing: closing ? "cubic-bezier(.4,0,1,1)" : "cubic-bezier(.16,1,.3,1)",
          fill: "both",
        },
      );
    } catch {
      complete();
      return;
    }

    decisionAnimation.current = animation;
    let active = true;
    let unwatch = () => {};
    const settle = () => {
      if (!active) return;
      active = false;
      unwatch();
      decisionAnimation.current = null;
      if (!closing) animation.cancel();
      complete();
    };
    unwatch = watchMotionBoundary(panel, settle);
    void animation.finished.then(settle, settle);
    return () => {
      active = false;
      unwatch();
      decisionAnimation.current = null;
      animation.cancel();
    };
  }, [decisionPhase, kind]);

  function rememberDecisionFrame() {
    const panel = decisionArea.current;
    if (!panel || !decisionAnimation.current) return;
    const { transform, opacity } = getComputedStyle(panel);
    interruptedFrame.current = { transform, opacity };
  }
  function closeDecision() {
    if (!decisionOpen || pendingCommand) return;
    rememberDecisionFrame();
    decisionTrigger.current?.focus({ preventScroll: true });
    setDecisionPhase("closing");
  }
  const onPhotoReady = useCallback(
    (mediaId: string, ready: boolean) =>
      setPhotos((previous) =>
        previous[mediaId] === ready
          ? previous
          : { ...previous, [mediaId]: ready },
      ),
    [],
  );
  const result = useQuery({
    queryKey: ["review", kind, id],
    queryFn: async () =>
      kind === "listings"
        ? session.request(`/operations/listings/${id}`, listing)
        : session.request(`/operations/catalog-requests/${id}`, catalog),
    // Never refetch under an open review (ADR 0010), but drop the copy on leave so
    // reopening shows the latest revision, not the one decided earlier this session.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
    gcTime: 0,
  });
  const value = result.data;
  const loadedId = value?.id;
  useLayoutEffect(() => {
    if (!loadedId) return;
    // Reset the actual reader, never the document or the independent queue.
    readingArea.current?.scrollTo({ top: 0, behavior: "instant" });
    recordHeader.current
      ?.closest<HTMLElement>("[data-review-dossier]")
      ?.scrollTo({ top: 0, behavior: "instant" });
    decisionArea.current?.scrollTo({ top: 0, behavior: "instant" });
    const active = document.activeElement;
    // Only follow the navigation link that opened this dossier. A delayed
    // response must not steal focus from skip links, filters or a closed menu.
    const linkPath = active instanceof HTMLAnchorElement && !active.matches(".skip-link")
      ? new URL(active.href).pathname : undefined;
    if (active === document.body || linkPath === location.pathname || linkPath === `/review/${kind}`)
      heading.current?.focus({ preventScroll: true });
  }, [loadedId, kind, location.pathname]);
  async function reconcile() {
    await invalidateDashboard(queryClient);
    const fresh = await result.refetch();
    if (fresh.error) throw fresh.error;
    await queryClient.invalidateQueries({ queryKey: ["queue"] });
    await queryClient.invalidateQueries({ queryKey: ["revisions", id] });
  }
  const isListing = value && "state" in value;
  const status = value
    ? "state" in value
      ? value.state.visibility === "Removed"
        ? "Removed"
        : value.state.moderation
      : value.status
    : "";
  const self =
    value &&
    ("ownerId" in value ? value.ownerId : value.requesterId) === user.id;
  const pending = status === "Pending" || status === "PendingReview";
  const decisionRecord =
    value &&
    ("state" in value
      ? value.latestDecision?.revisionId === value.currentRevision.id
        ? value.latestDecision
        : null
      : value.decisions.find(
          (decision) => decision.revisionId === value.currentRevision.id,
        ));
  const decisionAllowed =
    pending &&
    !self &&
    (!isListing ||
      (value.state.trade === "Available" &&
        value.state.visibility !== "Removed" &&
        !value.state.deletedAt));
  const reviewAction = decisionOpen
    ? "Tới phiếu duyệt"
    : !pending
      ? "Kết quả kiểm duyệt"
      : decisionAllowed
        ? "Kiểm duyệt"
        : "Xem phiếu duyệt";
  const draftProgress = isListing && !decisionOpen && decisionAllowed && checkedCount > 0
    ? `${checkedCount}/${value.currentRevision.content.bundle ? 7 : 6}`
    : null;
  return (
    <div
      className={`${styles.detail} ${kind === "listings" ? styles.listingDetail : ""}`}
      data-listing-dossier={isListing ? "" : undefined}
      data-listing-decision-open={isListing && decisionVisible ? "" : undefined}
    >
      {kind !== "listings" && (
        <Link
          className="back-link"
          to={reviewReturnPath(kind, location.state)}
          state={{ reviewOverview: true }}
        >
          ← Về danh sách
        </Link>
      )}
      {result.isLoading && <p role="status">Đang mở hồ sơ…</p>}
      {result.error && (
        <ErrorNotice
          error={result.error}
          retry={() => void result.refetch()}
          busy={result.isFetching}
        />
      )}
      {value && (
        <>
          <div className="detail-layout">
            <div
              className={`reading-column ${styles.evidence}`}
              ref={readingArea}
              role="region"
              aria-label="Nội dung và bằng chứng"
              tabIndex={0}
            >
              <header className={`detail-heading ${isListing ? styles.listingHeading : ""}`} ref={recordHeader}>
                <div>
                  <h2 className={styles.recordTitle} ref={heading} tabIndex={-1}>
                    {"state" in value
                      ? "Hồ sơ bài đăng"
                      : value.currentRevision.metadata.title}
                  </h2>
                  <p>
                    #{id.slice(0, 8)} · Bản gửi {value.currentRevision.number} ·{" "}
                    {dateText(value.currentRevision.submittedAt)}
                  </p>
                  {"state" in value && (
                    <h3 className={styles.bookName}>
                      <ListingTitle value={value} showAuthor canReadPendingCatalog={canReviewCatalog(user)} />
                    </h3>
                  )}
                </div>
                <span className="status-label" data-state={status}>
                  {labels[status] || status}
                </span>
              </header>
              {"state" in value && (
                <>
                  <dl
                    className={styles.reviewSummary}
                    aria-label="Tóm tắt bản sách"
                  >
                    <div>
                      <dt>Tình trạng khai báo</dt>
                      <dd>
                        {labels[value.currentRevision.content.condition || ""] ||
                          "Chưa khai báo"}
                      </dd>
                    </div>
                    <div>
                      <dt>Hình thức</dt>
                      <dd>
                        {value.channel === "Auction"
                          ? "Đấu giá"
                          : labels[value.currentRevision.content.mode || ""] ||
                            "Chưa khai báo"}
                      </dd>
                    </div>
                    <div className={styles.summaryPrice}>
                      <dt>
                        {value.channel === "Auction"
                          ? "Giá trị khai báo"
                          : value.currentRevision.content.mode === "Exchange"
                            ? "Giá trị đổi"
                            : "Giá bán"}
                      </dt>
                      <dd>
                        {money(
                          value.currentRevision.content.mode === "Exchange"
                            ? value.currentRevision.content.exchangeValue
                            : value.currentRevision.content.salePrice,
                        )}
                      </dd>
                    </div>
                    {value.currentRevision.content.mode === "Both" && (
                      <div className={styles.summaryPrice}>
                        <dt>Giá trị đổi</dt>
                        <dd>
                          {money(value.currentRevision.content.exchangeValue)}
                        </dd>
                      </div>
                    )}
                  </dl>
                </>
              )}
              {"state" in value && (
                <div className={styles.reviewToolbar}>
                  <nav className={styles.evidenceNav} aria-label="Nội dung hồ sơ">
                    <Button
                      aria-pressed={view === "content"}
                      onClick={() => setView("content")}
                    >
                      Nội dung & ảnh
                    </Button>
                    <Button
                      aria-pressed={view === "compare"}
                      onClick={() => {
                        setView("compare");
                        setComparisonOpened(true);
                      }}
                    >
                      Đối chiếu bản gửi
                    </Button>
                    <Button
                      aria-pressed={view === "history"}
                      onClick={() => setView("history")}
                    >
                      Lịch sử
                    </Button>
                  </nav>
                  <Button
                    ref={decisionTrigger}
                    className={styles.openDecision}
                    aria-controls={decisionId}
                    aria-expanded={decisionOpen}
                    aria-label={reviewAction === "Kiểm duyệt" ? "Kiểm duyệt bài đăng" : undefined}
                    aria-describedby={draftProgress ? `${decisionId}-progress` : undefined}
                    onClick={() => {
                      if (decisionOpen) {
                        focusReviewPart(decisionArea.current);
                      } else {
                        rememberDecisionFrame();
                        focusAfterChange.current = "decision";
                        setDecisionPhase("open");
                      }
                    }}
                  >
                    <ClipboardCheck size={17} aria-hidden="true" />
                    {reviewAction}
                    {draftProgress && (
                      <span id={`${decisionId}-progress`} className={styles.draftCount}>
                        {draftProgress}
                      </span>
                    )}
                  </Button>
                </div>
              )}
              {"state" in value ? (
                <>
                  <div
                    className={styles.evidencePanel}
                    hidden={view !== "content"}
                  >
                    <ContentView
                      value={value.currentRevision}
                      listingId={id}
                      onPhotoReady={onPhotoReady}
                      primary
                      photoRef={photoArea}
                      auction={value.channel === "Auction"}
                      afterPhotos={pending && value.catalogStatus !== "Confirmed" && (
                        <div className={styles.catalogGate} role="note">
                          <BookMarked
                            className={styles.gateIcon}
                            size={23}
                            aria-hidden="true"
                          />
                          <div>
                            <strong>
                              {value.catalogStatus === "Rejected"
                                ? "Đầu sách đã bị từ chối"
                                : "Đầu sách đang chờ xác nhận"}
                            </strong>
                            <p>
                              Bài đã gửi thành công. Cần xác nhận đầu sách trước khi
                              duyệt bài này.
                            </p>
                          </div>
                          {canReviewCatalog(user) &&
                          value.currentRevision.content.bookId ? (
                            <Link
                              to={`/review/catalog-requests/${value.currentRevision.content.bookId}`}
                            >
                              Mở yêu cầu đầu sách{" "}
                              <ArrowUpRight size={17} aria-hidden="true" />
                            </Link>
                          ) : (
                            <span>Chờ Admin xử lý đầu sách</span>
                          )}
                        </div>
                      )}
                    />
                    <details className={styles.reference} open>
                      <summary>
                        <BookMarked size={19} aria-hidden="true" />
                        <span>Đối chiếu thông tin đầu sách</span>
                        <ChevronDown
                          className={styles.referenceToggle}
                          size={18}
                          aria-hidden="true"
                        />
                      </summary>
                      <BookReference
                        id={value.currentRevision.content.bookId}
                        confirmed={value.catalogStatus === "Confirmed"}
                        admin={canReviewCatalog(user)}
                        onReady={setBookReady}
                      />
                    </details>
                    {value.autoReview && (
                      <AutoReviewView
                        value={value.autoReview}
                        listingId={id}
                        version={value.version}
                        revisionId={value.currentRevision.id}
                        canAct={!self}
                        canRevoke={
                          !!value.latestDecision?.automated &&
                          value.latestDecision.revisionId ===
                            value.currentRevision.id &&
                          value.state.moderation === "Approved" &&
                          value.state.trade === "Available" &&
                          value.state.visibility !== "Removed" &&
                          !value.state.deletedAt
                        }
                        reconcile={reconcile}
                      />
                    )}
                    {value.priceAssist && (
                      <PriceAssistView value={value.priceAssist} />
                    )}
                    {value.removalReason && (
                      <Notice tone="warning">
                        <strong>Lý do gỡ bài</strong>
                        <p className="prose">{value.removalReason}</p>
                      </Notice>
                    )}
                  </div>
                  <div
                    className={styles.evidencePanel}
                    hidden={view !== "compare"}
                  >
                    {comparisonOpened && (
                      <RevisionComparison
                        key={value.currentRevision.id}
                        listingId={id}
                        current={value.currentRevision}
                      />
                    )}
                  </div>
                  {view === "history" && (
                    <div className={styles.evidencePanel}>
                      <History
                        listingId={id}
                        currentId={value.currentRevision.id}
                      />
                      <AutoReviewHistoryView listingId={id} />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <section className="section">
                    <h3>Thông tin xuất bản</h3>
                    <MetadataView value={value.currentRevision.metadata} />
                  </section>
                  <section className="section">
                    <h3>Lịch sử quyết định</h3>
                    {value.decisions.length === 0 && (
                      <p className="muted">Chưa có quyết định nào.</p>
                    )}
                    {value.decisions.map((decision) => (
                      <article className="history-entry" key={decision.id}>
                        <strong>{labels[decision.decision]}</strong>
                        <p className="muted">
                          {dateText(decision.decidedAt)} · Bản gửi{" "}
                          {decision.revisionId.slice(0, 8)}
                        </p>
                        {decision.reason && (
                          <p className="prose">{decision.reason}</p>
                        )}
                      </article>
                    ))}
                  </section>
                </>
              )}
              <p className="record-id">Mã hồ sơ: {id}</p>
            </div>
            <div
              className={styles.decision}
              ref={decisionArea}
              tabIndex={0}
              role="region"
              aria-label="Phiếu quyết định"
              id={decisionId}
              hidden={Boolean(isListing && !decisionVisible)}
              inert={isListing && decisionPhase === "closing"}
              onKeyDown={isListing ? (event) => {
                if (
                  event.key !== "Escape" || event.defaultPrevented || pendingCommand ||
                  (event.target instanceof Element && event.target.closest("dialog[open]"))
                ) return;
                event.preventDefault();
                closeDecision();
              } : undefined}
            >
              {isListing && (
                <div className={styles.decisionTools}>
                  <Button
                    className={styles.backToPhoto}
                    onClick={() => {
                      if (view === "content") {
                        focusReviewPart(photoArea.current);
                      } else {
                        focusAfterChange.current = "photo";
                        setView("content");
                      }
                    }}
                  >
                    <ArrowLeft size={16} aria-hidden="true" />
                    Về ảnh
                  </Button>
                  <Button
                    disabled={pendingCommand}
                    onClick={closeDecision}
                  >
                    <PanelRightClose size={16} aria-hidden="true" />
                    Gập phiếu
                  </Button>
                </div>
              )}
              {decisionRecord && (
                <DecisionRecord
                  {...decisionRecord}
                  animate={matchesRecordedDecision(value, recorded)}
                />
              )}
              {self && (
                <Notice tone="warning">
                  Bạn là người gửi hồ sơ này. Cần một người kiểm duyệt khác
                  quyết định.
                </Notice>
              )}
              {!pending &&
                (status === "Approved" ? (
                  <p className="muted">
                    Bài đăng chỉ hiện trên kệ khi còn khả dụng và tài khoản
                    người đăng đủ điều kiện.
                  </p>
                ) : !decisionRecord ? (
                  <Notice>Hồ sơ đã có kết quả.</Notice>
                ) : null)}
              {!pending && !self && (
                <NextReview kind={kind} currentId={id} reviewerId={user.id} canReadPendingCatalog={canReviewCatalog(user)} />
              )}
              {(decisionAllowed ||
                (isListing &&
                  !pending &&
                  !self &&
                  value.state.visibility !== "Removed" &&
                  value.state.trade === "Available" &&
                  !value.state.deletedAt)) && (
                <DecisionForm
                  bundle={
                    "state" in value && !!value.currentRevision.content.bundle
                  }
                  key={`${value.version}/${value.currentRevision.id}/${reset}`}
                  kind={kind}
                  removal={!pending}
                  id={id}
                  version={value.version}
                  revisionId={value.currentRevision.id}
                  canApprove={
                    !isListing ||
                    (value.catalogStatus === "Confirmed" &&
                      bookReady &&
                      value.currentRevision.fulfillmentStatus !== "NeedsUpdate")
                  }
                  approvalBlock={
                    isListing
                      ? value.catalogStatus !== "Confirmed"
                        ? value.catalogStatus === "Rejected"
                          ? "Đầu sách đã bị từ chối. Cần Admin xử lý thông tin đầu sách trước khi duyệt bài này."
                          : "Đầu sách chưa được xác nhận. Cần Admin xác nhận đầu sách trước khi duyệt bài này."
                        : value.currentRevision.fulfillmentStatus ===
                            "NeedsUpdate"
                          ? "Địa chỉ gửi sách cần được người đăng cập nhật."
                          : !bookReady
                            ? "Chờ tải thành công thông tin đầu sách để đối chiếu."
                            : undefined
                      : undefined
                  }
                  approvalAction={
                    isListing &&
                    value.catalogStatus !== "Confirmed" &&
                    canReviewCatalog(user) &&
                    value.currentRevision.content.bookId
                      ? {
                          to: `/review/catalog-requests/${value.currentRevision.content.bookId}`,
                          label: "Xem yêu cầu đầu sách",
                        }
                      : undefined
                  }
                  photosReady={
                    !isListing ||
                    (value.currentRevision.content.mediaIds.length > 0 &&
                      value.currentRevision.content.mediaIds.every(
                        (mediaId) => photos[mediaId],
                      ))
                  }
                  disabled={result.isError || result.isFetching}
                  reconcile={reconcile}
                  onPending={setPendingCommand}
                  onChecklistProgress={isListing ? setCheckedCount : undefined}
                  subject={isListing ? (
                    <ListingTitle value={value} canReadPendingCatalog={canReviewCatalog(user)} />
                  ) : undefined}
                  revisionNumber={value.currentRevision.number}
                  onRecorded={(intent) =>
                    setRecorded(recordedDecision(intent, kind, id))
                  }
                />
              )}
              <details className="reload-help">
                <summary>Có thông tin vừa thay đổi?</summary>
                <p>
                  Tải lại để bắt đầu lượt kiểm tra mới. Các ô kiểm tra và lý do
                  chưa gửi sẽ bị xóa. Nếu vừa gửi quyết định, hãy dùng nút tải
                  kết quả trong khung quyết định.
                </p>
                <Button
                  disabled={pendingCommand}
                  busy={result.isFetching}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        "Tải lại hồ sơ và bỏ các ô kiểm tra, lý do chưa gửi? Nếu vừa gửi quyết định, hãy thử lại yêu cầu đó trước.",
                      )
                    )
                      return;
                    const fresh = await result.refetch();
                    if (!fresh.error) setReset((previous) => previous + 1);
                  }}
                >
                  Tải lại hồ sơ
                </Button>
              </details>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
