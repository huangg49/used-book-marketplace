import { dateText } from "../../core/format";
import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useOutletContext, useParams } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { canReviewCatalog, session } from "../../core/session";
import { Button, ErrorNotice, Notice } from "../../core/ui";
import { catalog, labels, listing, type Kind } from "./contracts";
import { BookReference, ContentView, History, MetadataView } from "./readers";
import { DecisionForm } from "./decision-form";

export function Detail() {
  const { kind, id } = useParams();
  const user = useOutletContext<CurrentUser>();
  if (
    !id ||
    !/^[a-f0-9-]{36}$/.test(id) ||
    (kind !== "listings" && kind !== "catalog-requests") ||
    (kind === "catalog-requests" && !canReviewCatalog(user))
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
  const [photos, setPhotos] = useState<Record<string, boolean>>({});
  const [reset, setReset] = useState(0);
  const [bookReady, setBookReady] = useState(false);
  const [pendingCommand, setPendingCommand] = useState(false);
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
  async function reconcile() {
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
  const decisionAllowed =
    pending &&
    !self &&
    (!isListing ||
      (value.state.trade === "Available" &&
        value.state.visibility !== "Removed" &&
        !value.state.deletedAt));
  return (
    <>
      <Link className="back-link" to={`/review/${kind}`}>
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
          <header className="detail-heading">
            <div>
              <p className="eyebrow">
                {kind === "listings" ? "Hồ sơ bài đăng" : "Hồ sơ đầu sách"} /{" "}
                {id.slice(0, 8)}
              </p>
              <h1>
                {"state" in value
                  ? "Đọc kỹ một bản sách."
                  : value.currentRevision.metadata.title}
              </h1>
              <p>
                Bản gửi {value.currentRevision.number} ·{" "}
                {dateText(value.currentRevision.submittedAt)}
              </p>
            </div>
            <span className="status-label">{labels[status] || status}</span>
          </header>
          <div className="detail-layout">
            <div className="reading-column">
              {"state" in value ? (
                <>
                  <BookReference
                    id={value.currentRevision.content.bookId}
                    confirmed={value.catalogStatus === "Confirmed"}
                    admin={canReviewCatalog(user)}
                    onReady={setBookReady}
                  />
                  <ContentView
                    value={value.currentRevision}
                    listingId={id}
                    onPhotoReady={onPhotoReady}
                  />
                  {value.latestDecision && (
                    <Notice
                      tone={
                        value.latestDecision.decision === "Approve"
                          ? "success"
                          : "warning"
                      }
                    >
                      <strong>
                        {labels[value.latestDecision.decision]} ·{" "}
                        {dateText(value.latestDecision.decidedAt)}
                      </strong>
                      {value.latestDecision.reason && (
                        <p className="prose">{value.latestDecision.reason}</p>
                      )}
                    </Notice>
                  )}
                  <History
                    listingId={id}
                    currentId={value.currentRevision.id}
                  />
                  {value.removalReason && (
                    <Notice tone="warning">
                      <strong>Lý do gỡ bài</strong>
                      <p className="prose">{value.removalReason}</p>
                    </Notice>
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
            <div>
              {self && (
                <Notice tone="warning">
                  Bạn là người gửi hồ sơ này. Cần một người kiểm duyệt khác
                  quyết định.
                </Notice>
              )}
              {!pending && (
                <Notice>
                  Hồ sơ đã có kết quả.{" "}
                  {status === "Approved" &&
                    "Bài đăng chỉ hiện trên kệ khi còn khả dụng và tài khoản người đăng đủ điều kiện."}
                </Notice>
              )}
              {(decisionAllowed ||
                (isListing &&
                  !pending &&
                  !self &&
                  value.state.visibility !== "Removed" &&
                  value.state.trade === "Available" &&
                  !value.state.deletedAt)) && (
                <DecisionForm
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
    </>
  );
}
