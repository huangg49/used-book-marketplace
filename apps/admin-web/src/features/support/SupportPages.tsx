import { useRef, useState, type FormEvent } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Link,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ApiError,
  pendingSupportIntent,
  sendSupportIntent,
  supportDetailSchema,
  supportError,
  supportKinds,
  supportPageSchema,
  supportStates,
  supportTargets,
  supportRelatedState,
  reviewStatusLabels,
  pendingReviewIntent,
  sendReviewIntent,
  type CurrentUser,
  type SupportDetail,
  type SupportCase,
  type SupportPage,
} from "@used-books/session-client";
import { session, canResolve } from "../../core/session";
import { Button, Notice } from "../../core/ui";
import { dateText } from "../../core/format";
import styles from "./support.module.css";

export function SupportQueuePage() {
  const user = useOutletContext<CurrentUser>();
  if (!canResolve(user))
    return (
      <Notice tone="warning">
        Cần quyền Admin đang hoạt động để xử lý phản ánh.
      </Notice>
    );
  return <SupportQueue key={user.id} owner={user.id} />;
}
function SupportQueue({ owner }: { owner: string }) {
  const [params, setParams] = useSearchParams();
  const state = params.get("state") ?? "",
    kind = params.get("kind") ?? "",
    mine = params.get("mine") === "true";
  const query = new URLSearchParams({
    limit: "20",
    ...(state ? { state } : {}),
    ...(kind ? { kind } : {}),
    ...(mine ? { assignedToMe: "true" } : {}),
  });
  const result = useInfiniteQuery({
    queryKey: ["operations-support", owner, state, kind, mine],
    staleTime: 0,
    refetchOnMount: "always",
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p: SupportPage) => p.nextCursor ?? undefined,
    queryFn: ({ pageParam }) =>
      session.request(
        `/operations/support-cases?${query}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        supportPageSchema,
      ),
    retry: false,
    refetchInterval: 30_000,
  });
  const denied =
    result.error instanceof ApiError &&
    [401, 403].includes(result.error.status);
  const filter = (key: string, value: string) =>
    setParams((p) => {
      if (value) p.set(key, value);
      else p.delete(key);
      return p;
    });
  return (
    <div className={styles.page}>
      <header className="page-heading">
        <h1>Trung tâm xử lý</h1>
        <p className="intro">
          Tiếp nhận phản ánh, yêu cầu bổ sung và trả lời thành viên. Danh sách
          loại trừ hồ sơ có liên quan đến chính bạn.
        </p>
      </header>
      <div className={styles.filters}>
        <label>
          Trạng thái
          <select
            aria-label="Trạng thái"
            value={state}
            onChange={(e) => filter("state", e.target.value)}
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(supportStates).map(([v, l]) => (
              <option key={v} value={v}>
                {v === "AwaitingMember" ? "Chờ thành viên bổ sung" : l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Loại yêu cầu
          <select
            aria-label="Loại yêu cầu"
            value={kind}
            onChange={(e) => filter("kind", e.target.value)}
          >
            <option value="">Tất cả loại</option>
            {Object.entries(supportKinds).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={mine}
            onChange={(e) => filter("mine", e.target.checked ? "true" : "")}
          />
          Tôi phụ trách
        </label>
        <Button busy={result.isFetching} onClick={() => void result.refetch()}>
          Cập nhật danh sách
        </Button>
      </div>
      {result.isPending ? <p role="status">Đang tải hồ sơ…</p> : null}
      {result.isError ? (
        <Notice tone="error">
          {supportError(result.error)} Dùng Cập nhật danh sách để thử lại.
        </Notice>
      ) : null}
      {!denied &&
        result.data?.pages
          .flatMap((p) => p.items)
          .map((item) => (
            <article className={styles.row} key={item.id}>
              <div>
                <p className="muted">
                  {supportKinds[item.kind]} · {dateText(item.createdAt)}
                </p>
                <h2>
                  <Link
                    to={`/support/${item.id}${params.size ? `?${params}` : ""}`}
                  >
                    {item.title}
                  </Link>
                </h2>
                <p>
                  {item.reporterName} · Mã {item.id.slice(0, 8).toUpperCase()}
                </p>
                <p className="muted">
                  {item.assigneeId
                    ? item.assigneeId === owner
                      ? "Bạn đang phụ trách"
                      : "Admin khác đang phụ trách"
                    : "Chưa có người phụ trách"}
                </p>
              </div>
              <span className={styles.status}>
                {item.state === "AwaitingMember"
                  ? "Chờ thành viên bổ sung"
                  : supportStates[item.state]}
              </span>
            </article>
          ))}
      {result.isSuccess && !result.data.pages[0].items.length ? (
        <section className="empty">
          <h2>Chưa có hồ sơ trong phạm vi này</h2>
          <p>
            Đổi bộ lọc hoặc cập nhật danh sách. Hàng đợi này không xác nhận mọi
            tranh chấp giao dịch đã được giải quyết.
          </p>
        </section>
      ) : null}
      {!denied && result.hasNextPage ? (
        <Button
          busy={result.isFetchingNextPage}
          onClick={() => void result.fetchNextPage()}
        >
          Xem thêm hồ sơ
        </Button>
      ) : null}
    </div>
  );
}
export function SupportDetailPage() {
  const user = useOutletContext<CurrentUser>(),
    { caseId = "" } = useParams(),
    [params] = useSearchParams();
  if (!canResolve(user))
    return <Notice tone="warning">Cần quyền Admin đang hoạt động.</Notice>;
  return (
    <SupportRecord
      key={`${user.id}:${caseId}`}
      owner={user.id}
      id={caseId}
      back={params.size ? `/support?${params}` : "/support"}
    />
  );
}
function SupportRecord({
  owner,
  id,
  back,
}: {
  owner: string;
  id: string;
  back: string;
}) {
  const cache = useQueryClient(),
    query = useQuery({
      queryKey: ["operations-support-detail", owner, id],
      staleTime: 0,
      refetchOnMount: "always",
      queryFn: () =>
        session.request(`/operations/support-cases/${id}`, supportDetailSchema),
      retry: false,
      refetchInterval: 30_000,
    });
  const [value, setValue] = useState(""),
    [internal, setInternal] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [moderationLocked, setModerationLocked] = useState(false);
  const running = useRef(false),
    scope = `support:${id}`,
    pending = pendingSupportIntent(session, scope),
    data = query.data;
  const denied =
    query.error instanceof ApiError &&
    [401, 403, 404].includes(query.error.status);
  const reviewPending =
    moderationLocked ||
    (data?.review
      ? pendingReviewIntent(session, `support-review:${data.review.id}`)
      : false);
  async function send(
    action?: "Assign" | "RequestEvidence" | "Answer" | "Close" | "Reopen",
    event?: FormEvent,
  ) {
    event?.preventDefault();
    if (running.current || !data) return;
    const content =
      action === "Assign" ? "Admin đã tiếp nhận hồ sơ và đang xem xét." : value;
    if (!pending && content.trim().length < 3) {
      setError("Nhập nội dung phản hồi hoặc lý do trước khi gửi.");
      return;
    }
    running.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await sendSupportIntent(
        session,
        scope,
        `/operations/support-cases/${id}/${action ? "actions" : "messages"}`,
        action
          ? { expectedVersion: data!.case.version, action, text: content }
          : { expectedVersion: data!.case.version, text: value, internal },
        () => crypto.randomUUID(),
      );
      setValue("");
      setNotice("Đã lưu theo xác nhận của máy chủ.");
      await query.refetch();
      await cache.invalidateQueries({ queryKey: ["operations-support"] });
    } catch (e) {
      setError(supportError(e));
      if (e instanceof ApiError && e.status === 409) void query.refetch();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <div className={styles.page}>
      <Link to={back}>← Trung tâm xử lý</Link>
      {query.isPending ? <p role="status">Đang mở hồ sơ…</p> : null}
      {query.isError ? (
        <Notice tone="error">
          {supportError(query.error)}{" "}
          <Button onClick={() => void query.refetch()}>Tải lại hồ sơ</Button>
        </Notice>
      ) : null}
      {data && !denied ? (
        <>
          <header className="page-heading">
            <Button
              busy={query.isFetching}
              onClick={() => void query.refetch()}
            >
              Cập nhật hồ sơ
            </Button>
            <p className="muted">
              {supportKinds[data.case.kind]} · Mã {id.slice(0, 8).toUpperCase()}
            </p>
            <h1>{data.case.title}</h1>
            <p>
              {data.case.reporterName} ·{" "}
              {data.case.state === "AwaitingMember"
                ? "Chờ thành viên bổ sung"
                : supportStates[data.case.state]}{" "}
              · Phiên bản {data.case.version}
            </p>
            <p>
              {data.case.assigneeId
                ? data.canManage
                  ? "Bạn đang phụ trách."
                  : "Admin khác đang phụ trách; bạn đang xem hồ sơ."
                : "Chưa có người phụ trách."}
            </p>
            <Related data={data} />
          </header>
          {data.case.kind === "TransactionIssue" ? (
            <Notice tone="warning">
              Đây là hồ sơ hỗ trợ. Phản hồi tại đây không giữ/hoàn tiền hoặc
              thay phán quyết của giao dịch.{" "}
              {data.relatedState === "ResolutionPending"
                ? "Giao dịch đang có tranh chấp; giữ nguyên tiền và sách theo luồng hiện hành."
                : ""}
            </Notice>
          ) : null}
          {notice ? <Notice tone="success">{notice}</Notice> : null}
          {error ? <Notice tone="error">{error}</Notice> : null}
          {pending ? (
            <Notice tone="warning">
              Kết quả thao tác trước chưa rõ. Giữ nguyên nội dung và mã yêu cầu.{" "}
              <Button busy={busy} onClick={() => void send()}>
                Thử lại yêu cầu đã gửi
              </Button>
            </Notice>
          ) : null}
          <div className={styles.columns}>
            <section className={styles.timeline} aria-label="Lịch sử hồ sơ">
              <h2>Lịch sử trao đổi</h2>
              {data.messages.map((m) => (
                <article key={m.id} data-internal={m.internal}>
                  <p className="muted">
                    {m.authorName} · {dateText(m.createdAt)}
                    {m.internal ? " · Chỉ nội bộ" : ""}
                  </p>
                  <p className={styles.text}>{m.text}</p>
                </article>
              ))}
            </section>
            <aside className={styles.actions}>
              <h2>Xử lý hồ sơ</h2>
              {!data.case.assigneeId ? (
                <Button
                  variant="primary"
                  disabled={pending || reviewPending}
                  busy={busy}
                  onClick={() => void send("Assign")}
                >
                  Nhận phụ trách
                </Button>
              ) : null}
              {data.canManage ? (
                <form
                  onSubmit={(e) => void send(undefined, e)}
                  className={styles.form}
                >
                  <label>
                    Nội dung phản hồi / lý do
                    <textarea
                      rows={7}
                      required
                      minLength={3}
                      maxLength={5000}
                      disabled={busy || pending || reviewPending}
                      aria-label="Nội dung phản hồi / lý do"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                    />
                  </label>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={internal}
                      disabled={busy || pending || reviewPending}
                      onChange={(e) => setInternal(e.target.checked)}
                    />
                    Ghi chú chỉ nội bộ
                  </label>
                  <div className={styles.buttons}>
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={!data.canReply || pending || reviewPending}
                      busy={busy}
                    >
                      {internal ? "Lưu ghi chú nội bộ" : "Gửi phản hồi"}
                    </Button>
                    {data.case.state !== "Closed" ? (
                      <>
                        <Button
                          disabled={internal || pending || reviewPending}
                          busy={busy}
                          onClick={() => void send("RequestEvidence")}
                        >
                          Yêu cầu bổ sung
                        </Button>
                        <Button
                          disabled={internal || pending || reviewPending}
                          busy={busy}
                          onClick={() => void send("Answer")}
                        >
                          Gửi kết quả xử lý
                        </Button>
                        <Button
                          disabled={
                            internal ||
                            pending ||
                            reviewPending ||
                            data.case.state !== "Answered" ||
                            data.relatedState === "ResolutionPending"
                          }
                          busy={busy}
                          onClick={() => void send("Close")}
                        >
                          Đóng hồ sơ hỗ trợ
                        </Button>
                      </>
                    ) : (
                      <Button
                        disabled={internal || pending || reviewPending}
                        busy={busy}
                        onClick={() => void send("Reopen")}
                      >
                        Mở lại hồ sơ hỗ trợ
                      </Button>
                    )}
                  </div>
                  <p className="muted">
                    Các thay đổi trạng thái gửi nội dung công khai cho thành
                    viên. Chỉ đóng sau khi đã gửi kết quả; không đóng hồ sơ khi
                    giao dịch vẫn đang chờ giải quyết tranh chấp.
                  </p>
                </form>
              ) : null}
            </aside>
          </div>
          {data.review ? (
            <ModerateReview
              key={data.review.id}
              data={data}
              blocked={pending || busy || !data.canManage}
              refresh={() => query.refetch()}
              onPending={setModerationLocked}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
function Related({ data }: { data: SupportDetail }) {
  const target = data.case.target;
  if (!target) return null;
  const paths: Partial<
    Record<NonNullable<SupportCase["target"]>["type"], string>
  > = {
    Exchange: "/operations/exchange-disputes",
    PointOrder: "/operations/resolutions",
    Auction: "/operations/auctions",
    Listing: `/review/listings/${target.id}`,
    Member: `/users/${target.id}`,
  };
  return (
    <p className="muted">
      {supportTargets[target.type]} · {target.id}
      {data.relatedState
        ? ` · Trạng thái: ${supportRelatedState(data.relatedState)}`
        : ""}
      {paths[target.type] ? (
        <>
          {" "}
          · <Link to={paths[target.type]!}>Mở bàn nghiệp vụ liên quan</Link>
        </>
      ) : null}
    </p>
  );
}
function ModerateReview({
  data,
  blocked,
  refresh,
  onPending,
}: {
  data: SupportDetail;
  blocked: boolean;
  refresh: () => Promise<unknown>;
  onPending: (value: boolean) => void;
}) {
  const r = data.review!,
    scope = `support-review:${r.id}`;
  const [decision, setDecision] = useState("Hide"),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    running = useRef(false);
  const pending = pendingReviewIntent(session, scope);
  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (running.current) return;
    running.current = true;
    setBusy(true);
    onPending(true);
    setError("");
    setNotice("");
    try {
      await sendReviewIntent(
        session,
        scope,
        `/operations/transaction-reviews/${r.id}/decision`,
        { expectedVersion: r.version, decision, reason },
        () => crypto.randomUUID(),
      );
      setNotice(
        "Đã cập nhật kiểm duyệt. Gửi kết quả xử lý hồ sơ để trả lời người báo cáo.",
      );
      await refresh();
    } catch (e) {
      setError(supportError(e));
    } finally {
      running.current = false;
      setBusy(false);
      onPending(pendingReviewIntent(session, scope));
    }
  }
  return (
    <section className={styles.review}>
      <h2>Đánh giá được báo cáo</h2>
      <p>
        {r.authorName} · Điểm đối tác {r.partnerRating}/5
        {r.bookRating !== null ? ` · Sách ${r.bookRating}/5` : ""} ·{" "}
        {reviewStatusLabels[r.status]}
      </p>
      <p className={styles.text}>
        {r.comment || "Không có nhận xét bằng chữ."}
      </p>
      {r.reply ? (
        <p className={styles.text}>
          Phản hồi ({r.reply.status}): {r.reply.text}
        </p>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {pending ? (
        <Button busy={busy} onClick={() => void send()}>
          Thử lại quyết định kiểm duyệt
        </Button>
      ) : null}
      <form className={styles.form} onSubmit={send}>
        <label>
          Thao tác kiểm duyệt
          <select
            disabled={blocked || busy || pending}
            aria-label="Thao tác kiểm duyệt"
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
          >
            <option value="Hide">Ẩn nội dung vi phạm</option>
            <option value="Restore">Khôi phục đánh giá</option>
            <option value="HoldEvidence">Giữ làm bằng chứng</option>
            <option value="ReleaseEvidence">Gỡ giữ bằng chứng</option>
            {r.reply ? (
              <>
                <option value="ApproveReply">Duyệt phản hồi</option>
                <option value="HideReply">Ẩn phản hồi</option>
              </>
            ) : null}
          </select>
        </label>
        <label>
          Căn cứ kiểm duyệt
          <textarea
            required
            minLength={3}
            maxLength={1000}
            disabled={blocked || busy || pending}
            aria-label="Căn cứ kiểm duyệt"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <p className="muted">
          Lý do này được gửi cho các bên liên quan đến đánh giá. Ghi chú điều
          tra riêng chỉ lưu ở phần nội bộ của hồ sơ.
        </p>
        <Button type="submit" busy={busy} disabled={blocked || pending}>
          Lưu quyết định kiểm duyệt
        </Button>
        <p className="muted">
          Điểm thấp tự nó không là vi phạm. Không sửa số sao của tác giả.
        </p>
      </form>
    </section>
  );
}
