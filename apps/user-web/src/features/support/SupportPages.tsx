import { usePagedCollection } from "../../components/Pagination/usePagedCollection";
import { CollectionPager } from "../../components/Pagination/CollectionPager";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ApiError,
  pendingSupportIntent,
  pendingSupportCreateDraft,
  sendSupportIntent,
  supportDetailSchema,
  supportDraft,
  supportError,
  supportKinds,
  supportPageSchema,
  supportStates,
  supportTargets,
  supportRelatedState,
  type SupportCase,
  type SupportDraft,
  type SupportPage as SupportPageData,
} from "@used-books/session-client";
import { session } from "../../lib/session";
import { useSession } from "../../hooks/useSession";
import styles from "./support.module.css";
import { SupportTargetPicker } from "./SupportTargetPicker";

const date = (s: string) => new Date(s).toLocaleString("vi-VN");
export function SupportPage() {
  const auth = useSession(),
    [params, setParams] = useSearchParams();
  const owner = auth.status === "authenticated" ? auth.user.id : undefined;
  const state = params.get("state") ?? "",
    kind = params.get("kind") ?? "";
  const result = useInfiniteQuery({
    queryKey: ["support", owner, state, kind],
    staleTime: 0,
    refetchOnMount: "always",
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p: SupportPageData) => p.nextCursor ?? undefined,
    queryFn: ({ pageParam }) =>
      session.request(
        `/me/support-cases?${new URLSearchParams({ limit: "20", ...(state ? { state } : {}), ...(kind ? { kind } : {}), ...(pageParam ? { cursor: pageParam } : {}) })}`,
        supportPageSchema,
      ),
    enabled: !!owner,
    retry: false,
  });
  const collection = usePagedCollection(result, `${owner}:${state}:${kind}`, pages => pages.flatMap(page => page.items));
  const denied =
    result.error instanceof ApiError &&
    [401, 403].includes(result.error.status);
  const resetPagination = collection.reset;
  const refreshRevision = useRef(0);
  useEffect(() => () => { refreshRevision.current += 1; }, [owner, state, kind]);
  useEffect(() => {
    if (denied) resetPagination();
  }, [denied, resetPagination]);
  async function refreshList() {
    const revision = refreshRevision.current;
    const refreshed = await result.refetch({ cancelRefetch: false });
    if (!refreshed.isError && revision === refreshRevision.current) resetPagination();
  }
  return (
    <div className={styles.page}>
      <header>
        <p className={styles.eyebrow}>Lật lại · Đồng hành cùng bạn</p>
        <h1>Hỗ trợ & phản ánh</h1>
        <p>
          Góp ý, báo lỗi hoặc phản ánh về giao dịch. Theo dõi phản hồi của Admin
          ngay tại đây.
        </p>
        <Link className={styles.primary} to="/support/new">
          Gửi yêu cầu mới
        </Link>
      </header>
      <div className={styles.filters}>
        <label>
          Trạng thái
          <select
            aria-label="Trạng thái"
            value={state}
            onChange={(e) =>
              setParams((p) => {
                if (e.target.value) p.set("state", e.target.value);
                else p.delete("state");
                return p;
              })
            }
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(supportStates).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Loại yêu cầu
          <select
            aria-label="Loại yêu cầu"
            value={kind}
            onChange={(e) =>
              setParams((p) => {
                if (e.target.value) p.set("kind", e.target.value);
                else p.delete("kind");
                return p;
              })
            }
          >
            <option value="">Tất cả loại</option>
            {Object.entries(supportKinds).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={result.isFetching}
          onClick={() => void refreshList()}
        >
          Cập nhật
        </button>
      </div>
      {result.isPending ? <p role="status">Đang tải yêu cầu…</p> : null}
      {result.isError && (denied || !result.isFetchNextPageError) ? (
        <p role="alert">
          {denied
            ? "Quyền xem yêu cầu hỗ trợ đã thay đổi. Kiểm tra phiên đăng nhập và dùng Cập nhật để thử lại."
            : `${supportError(result.error)} Dùng Cập nhật để thử lại.`}
        </p>
      ) : null}
      {!denied &&
        collection.items.map((item, index) => (
            <article className={styles.row} key={item.id} id={index === 0 ? "support-list-start" : undefined}>
              <div>
                <p className={styles.meta}>
                  {supportKinds[item.kind]} · {date(item.createdAt)}
                </p>
                <h2>
                  <Link
                    to={`/support/${item.id}${params.size ? `?${params}` : ""}`}
                  >
                    {item.title}
                  </Link>
                </h2>
                <p className={styles.meta}>
                  Mã {item.id.slice(0, 8).toUpperCase()}
                  {item.target ? ` · ${supportTargets[item.target.type]}` : ""}
                </p>
              </div>
              <span className={styles.status} data-state={item.state}>
                {supportStates[item.state]}
              </span>
            </article>
          ))}
      {result.isSuccess && collection.loadedCount === 0 && !result.hasNextPage ? (
        <section>
          <h2>Chưa có yêu cầu trong mục này</h2>
          <p>
            Bạn có thể gửi yêu cầu mới hoặc đổi bộ lọc để xem những hồ sơ khác.
          </p>
        </section>
      ) : null}
      {!denied && <CollectionPager model={collection} anchorId="support-list-start" itemLabel="yêu cầu" />}
    </div>
  );
}
export function NewSupportPage() {
  const auth = useSession(),
    [params] = useSearchParams();
  const owner = auth.status === "authenticated" ? auth.user.id : undefined;
  return (
    <NewSupportForm
      key={`${owner}:${params}`}
      params={params}
      active={auth.status === "authenticated" && auth.user.status === "ACTIVE"}
    />
  );
}
function NewSupportForm({
  params,
  active,
}: {
  params: URLSearchParams;
  active: boolean;
}) {
  const navigate = useNavigate(),
    cache = useQueryClient();
  const scope = "support:create",
    draftScope = `create:${params}`;
  const type = params.get("type"),
    kind = params.get("kind");
  const initial: SupportDraft = {
    kind:
      kind && Object.hasOwn(supportKinds, kind)
        ? (kind as SupportDraft["kind"])
        : "Feedback",
    title: "",
    description: "",
    targetType:
      type && Object.hasOwn(supportTargets, type)
        ? (type as SupportDraft["targetType"])
        : "",
    targetId: params.get("id") ?? "",
  };
  const [draft, setDraft] = useState(() => {
      const latest = supportDraft(session, "create:latest");
      return (
        pendingSupportCreateDraft(session) ??
        supportDraft(session, draftScope) ?? {
          ...initial,
          title: latest?.title ?? "",
          description: latest?.description ?? "",
        }
      );
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const running = useRef(false),
    pending = pendingSupportIntent(session, scope);
  const draftRef = useRef(draft);
  function update(p: Partial<SupportDraft>) {
    const next = { ...draftRef.current, ...p };
    draftRef.current = next;
    supportDraft(session, draftScope, next);
    supportDraft(session, "create:latest", next);
    setDraft(next);
  }
  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (running.current) return;
    if (!pending) {
      if (
        draft.kind === "TransactionIssue" &&
        !["DirectOrder", "Exchange", "PointOrder", "Auction"].includes(draft.targetType)
      ) {
        setError(
          "Phản ánh giao dịch cần chọn đơn mua bán, trao đổi, đơn thắng đấu giá hoặc phiên đấu giá bạn tham gia.",
        );
        return;
      }
      if (draft.kind === "Violation" && !draft.targetType) {
        setError(
          "Báo cáo vi phạm cần gắn với nội dung hoặc thành viên cụ thể.",
        );
        return;
      }
      if (
        draft.title.trim().length < 3 ||
        draft.description.trim().length < 10
      ) {
        setError("Nhập tiêu đề ít nhất 3 ký tự và nội dung ít nhất 10 ký tự.");
        return;
      }
      if (
        draft.targetType &&
        !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(draft.targetId)
      ) {
        setError(
          "Chọn giao dịch trong danh sách hoặc dùng nút Báo cáo nội dung tại trang liên quan.",
        );
        return;
      }
    }
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await sendSupportIntent(
        session,
        scope,
        "/me/support-cases",
        {
          kind: draft.kind,
          title: draft.title,
          description: draft.description,
          target: draft.targetType
            ? { type: draft.targetType, id: draft.targetId }
            : null,
        },
        () => crypto.randomUUID(),
      );
      supportDraft(session, draftScope, null);
      supportDraft(session, "create:latest", null);
      await cache.invalidateQueries({ queryKey: ["support"] });
      navigate(`/support/${r.entityId}`, { replace: true });
    } catch (e) {
      setError(supportError(e));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <div className={styles.page}>
      <Link to="/support">← Yêu cầu của tôi</Link>
      <header>
        <h1>Gửi yêu cầu</h1>
        <p>
          Cho Admin biết vấn đề bạn gặp. Phản hồi và lịch sử xử lý được lưu
          trong hồ sơ riêng của bạn.
        </p>
      </header>
      {!active ? (
        <p role="alert">Tài khoản hiện chỉ được xem và bổ sung hồ sơ đã có.</p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {pending ? (
        <div className={styles.notice} role="status">
          <p>
            Yêu cầu trước chưa xác định được kết quả. Thử lại giữ nguyên nội
            dung và mã gửi.
          </p>
          <button disabled={busy} onClick={() => void submit()}>
            {busy ? "Đang xác minh…" : "Thử lại yêu cầu đã gửi"}
          </button>
        </div>
      ) : null}
      <form className={styles.form} onSubmit={submit}>
        <fieldset disabled={busy || pending || !active}>
          <label>
            Loại yêu cầu
            <select
              aria-label="Loại yêu cầu"
              value={draft.kind}
              onChange={(e) =>
                update({ kind: e.target.value as SupportDraft["kind"] })
              }
            >
              {Object.entries(supportKinds).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tiêu đề
            <input
              required
              minLength={3}
              maxLength={160}
              aria-label="Tiêu đề"
              value={draft.title}
              onChange={(e) => update({ title: e.target.value })}
            />
          </label>
          <label>
            Đối tượng liên quan
            <select
              aria-label="Đối tượng liên quan"
              value={draft.targetType}
              onChange={(e) =>
                update({
                  targetType: e.target.value as SupportDraft["targetType"],
                  targetId: "",
                })
              }
            >
              <option value="">Không có đối tượng cụ thể</option>
              {Object.entries(supportTargets).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {draft.targetType ? (
            <SupportTargetPicker
              key={draft.targetType}
              type={draft.targetType}
              id={draft.targetId}
              active={active}
              onSelect={(targetId) => update({ targetId })}
            />
          ) : null}
          <label>
            Nội dung
            <textarea
              rows={7}
              required
              minLength={10}
              maxLength={5000}
              aria-label="Nội dung"
              value={draft.description}
              onChange={(e) => update({ description: e.target.value })}
            />
            <small>
              Mô tả sự việc, mốc thời gian và thông tin đối chiếu. Không gửi mật
              khẩu, OTP hoặc thông tin thẻ.
            </small>
          </label>
          {draft.kind === "TransactionIssue" ? (
            <p className={styles.notice}>
              Phản ánh hỗ trợ không tự giữ hoặc hoàn tiền. Dùng chức năng khiếu
              nại của giao dịch nếu có; Admin sẽ đối chiếu trạng thái tiền và
              sách trước khi hướng dẫn tiếp.
            </p>
          ) : null}
          <button className={styles.primary} type="submit">
            {busy ? "Đang gửi…" : "Gửi yêu cầu"}
          </button>
        </fieldset>
      </form>
    </div>
  );
}
export function SupportDetailPage() {
  const auth = useSession(),
    { caseId = "" } = useParams(),
    [params] = useSearchParams();
  const owner = auth.status === "authenticated" ? auth.user.id : undefined;
  return (
    <SupportDetail
      key={`${owner}:${caseId}`}
      id={caseId}
      owner={owner}
      back={params.size ? `/support?${params}` : "/support"}
    />
  );
}
function SupportDetail({
  id,
  owner,
  back,
}: {
  id: string;
  owner?: string;
  back: string;
}) {
  const cache = useQueryClient(),
    result = useQuery({
      queryKey: ["support-detail", owner, id],
      staleTime: 0,
      refetchOnMount: "always",
      queryFn: () =>
        session.request(
          `/me/support-cases/${encodeURIComponent(id)}`,
          supportDetailSchema,
        ),
      enabled: !!owner,
      retry: false,
      refetchInterval: 30_000,
    });
  const [value, setValue] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    running = useRef(false),
    scope = `support:${id}`,
    pending = pendingSupportIntent(session, scope);
  const data = result.data,
    denied =
      result.error instanceof ApiError &&
      [401, 403, 404].includes(result.error.status);
  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (running.current || !data) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await sendSupportIntent(
        session,
        scope,
        `/me/support-cases/${id}/messages`,
        { expectedVersion: data!.case.version, text: value, internal: false },
        () => crypto.randomUUID(),
      );
      setValue("");
      await result.refetch();
      await cache.invalidateQueries({ queryKey: ["support"] });
    } catch (e) {
      setError(supportError(e));
      if (e instanceof ApiError && e.status === 409) void result.refetch();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <div className={styles.page}>
      <Link to={back}>← Yêu cầu của tôi</Link>
      {result.isPending ? <p role="status">Đang tải hồ sơ…</p> : null}
      {result.isError ? (
        <div role="alert">
          <p>{supportError(result.error)}</p>
          <button onClick={() => void result.refetch()}>Tải lại hồ sơ</button>
        </div>
      ) : null}
      {data && !denied ? (
        <>
          <header>
            <button
              disabled={result.isFetching}
              onClick={() => void result.refetch()}
            >
              Cập nhật hồ sơ
            </button>
            <p className={styles.eyebrow}>
              {supportKinds[data.case.kind]} · Mã {id.slice(0, 8).toUpperCase()}
            </p>
            <h1>{data.case.title}</h1>
            <span className={styles.status} data-state={data.case.state}>
              {supportStates[data.case.state]}
            </span>
            <p>
              {data.case.state === "AwaitingMember"
                ? "Admin đang chờ bạn bổ sung thông tin."
                : data.case.state === "Closed"
                  ? "Hồ sơ hỗ trợ đã đóng. Lịch sử vẫn được lưu bên dưới."
                  : data.case.state === "Answered"
                    ? "Admin đã gửi phản hồi. Bạn có thể bổ sung nếu còn vấn đề."
                    : data.case.assigneeId
                      ? "Admin đã nhận phụ trách và đang xem xét."
                      : "Đang chờ Admin tiếp nhận."}
            </p>
            <RelatedCase
              target={data.case.target}
              auctionId={data.relatedAuctionId}
            />
            {data.relatedState ? (
              <p>
                {data.case.target?.type === "Auction" ? "Hiện tại" : "Trạng thái giao dịch"}: {supportRelatedState(data.relatedState)}.
                Kết quả hỗ trợ không thay thế quyết định tiền/hàng.
              </p>
            ) : null}
          </header>
          <section className={styles.timeline} aria-label="Lịch sử xử lý">
            {data.messages.map((m) => (
              <article key={m.id} data-role={m.role}>
                <p className={styles.meta}>
                  {m.role === "Member"
                    ? "Bạn"
                    : m.role === "Admin"
                      ? "Admin"
                      : "Cập nhật xử lý"}{" "}
                  · {date(m.createdAt)}
                </p>
                <p className={styles.text}>{m.text}</p>
              </article>
            ))}
          </section>
          {error ? (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          ) : null}
          {pending ? (
            <button disabled={busy} onClick={() => void send()}>
              {busy ? "Đang xác minh…" : "Thử lại yêu cầu đã gửi"}
            </button>
          ) : null}
          {data.canReply ? (
            <form className={styles.form} onSubmit={send}>
              <label>
                Bổ sung thông tin
                <textarea
                  rows={5}
                  minLength={3}
                  maxLength={5000}
                  required
                  disabled={busy || pending}
                  aria-label="Bổ sung thông tin"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </label>
              <button
                className={styles.primary}
                disabled={busy || pending}
                type="submit"
              >
                {busy ? "Đang gửi…" : "Gửi bổ sung"}
              </button>
            </form>
          ) : (
            <p>Hiện chưa thể gửi thêm nội dung trong hồ sơ này.</p>
          )}
        </>
      ) : null}
    </div>
  );
}
function RelatedCase({
  target,
  auctionId,
}: {
  target: SupportCase["target"];
  auctionId: string | null;
}) {
  if (!target) return null;
  const paths: Partial<
    Record<NonNullable<SupportCase["target"]>["type"], string>
  > = {
    DirectOrder: `/orders/${target.id}`,
    Exchange: `/exchange/${target.id}`,
    Auction: `/auctions/${target.id}`,
    Listing: `/books/${target.id}`,
    Member: `/members/${target.id}`,
    ...(auctionId ? { PointOrder: `/auctions/${auctionId}` } : {}),
  };
  return (
    <p className={styles.meta}>
      {supportTargets[target.type]} · {target.id.slice(0, 8).toUpperCase()}{" "}
      {paths[target.type] ? (
        <Link to={paths[target.type]!}>Mở đối tượng liên quan</Link>
      ) : null}
    </p>
  );
}
