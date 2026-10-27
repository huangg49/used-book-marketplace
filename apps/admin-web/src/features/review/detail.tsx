import { dateText } from "../../core/format";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine } from "lucide-react";
import {
  Link,
  useLocation,
  useOutletContext,
  useParams,
} from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { canReview, canReviewCatalog, session } from "../../core/session";
import { Button, ErrorNotice, Notice } from "../../core/ui";
import { catalog, labels, listing, type Kind } from "./contracts";
import { BookReference, ContentView, History, MetadataView } from "./readers";
import { DecisionForm } from "./decision-form";
import { PriceAssistView } from "./price-assist-view";
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
  const decisionArea = useRef<HTMLDivElement>(null);
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
    recordHeader.current?.scrollIntoView({
      block: "start",
      behavior: "instant",
    });
    heading.current?.focus({ preventScroll: true });
  }, [loadedId]);
  async function reconcile() {
    const fresh = await result.refetch();
    if (fresh.error) throw fresh.error;
    await queryClient.invalidateQueries({ queryKey: ["queue"] });
    await queryClient.invalidateQueries({ queryKey: ["revisions", id] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
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
  return (
    <div className={styles.detail}>
      <Link className="back-link" to={reviewReturnPath(kind, location.state)}>
        ← Về danh sách
      </Link>
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
          <header className="detail-heading" ref={recordHeader}>
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
                  <ListingTitle value={value} />
                </h3>
              )}
            </div>
            <span className="status-label">{labels[status] || status}</span>
          </header>
          <div className="detail-layout">
            <div className={`reading-column ${styles.evidence}`}>
              {"state" in value && (
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
                  <Button
                    className={styles.jumpDecision}
                    aria-label="Đi tới phiếu quyết định"
                    title="Đi tới phiếu quyết định"
                    onClick={() => {
                      decisionArea.current?.scrollIntoView({
                        block: "start",
                        behavior: "instant",
                      });
                      decisionArea.current?.focus({ preventScroll: true });
                    }}
                  >
                    <ArrowDownToLine size={17} aria-hidden="true" />
                  </Button>
                </nav>
              )}
              {"state" in value ? (
                <>
                  <div
                    className={styles.evidencePanel}
                    hidden={view !== "content"}
                  >
                    {value.channel === "Auction" && (
                      <Notice>
                        <strong>Sách đấu giá</strong>
                        <p className="prose">
                          Bài này không lên kệ mua/đổi. Giá là giá trị khai báo
                          (mức bồi thường tối đa), không phải giá bán. Sau khi
                          duyệt, sách còn được kiểm tra tại điểm trước khi mở
                          phiên.
                        </p>
                      </Notice>
                    )}
                    <ContentView
                      value={value.currentRevision}
                      listingId={id}
                      onPhotoReady={onPhotoReady}
                    />
                    <details className={styles.reference}>
                      <summary>Đối chiếu thông tin đầu sách</summary>
                      <BookReference
                        id={value.currentRevision.content.bookId}
                        confirmed={value.catalogStatus === "Confirmed"}
                        admin={canReviewCatalog(user)}
                        onReady={setBookReady}
                      />
                    </details>
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
            <div className={styles.decision} ref={decisionArea} tabIndex={-1}>
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
                <NextReview kind={kind} currentId={id} reviewerId={user.id} />
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
