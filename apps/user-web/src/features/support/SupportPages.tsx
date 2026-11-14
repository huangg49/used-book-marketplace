import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  ChevronRight,
  Clock,
  Inbox,
  LockKeyhole,
  Plus,
  RefreshCw,
  Send,
} from "lucide-react";
import { usePagedCollection } from "../../components/Pagination/usePagedCollection";
import { FilterSelect } from "../../components/FilterSelect";
import { CollectionPager } from "../../components/Pagination/CollectionPager";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
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
        `/me/support-cases?${new URLSearchParams({
          limit: "20",
          ...(state ? { state } : {}),
          ...(kind ? { kind } : {}),
          ...(pageParam ? { cursor: pageParam } : {}),
        })}`,
        supportPageSchema,
      ),
    enabled: !!owner,
    retry: false,
  });
  const collection = usePagedCollection(
    result,
    `${owner}:${state}:${kind}`,
    (pages) => pages.flatMap((page) => page.items),
  );
  const denied =
    result.error instanceof ApiError &&
    [401, 403].includes(result.error.status);
  const resetPagination = collection.reset;
  const refreshRevision = useRef(0);
  useEffect(
    () => () => {
      refreshRevision.current += 1;
    },
    [owner, state, kind],
  );
  useEffect(() => {
    if (denied) resetPagination();
  }, [denied, resetPagination]);

  async function refreshList() {
    const revision = refreshRevision.current;
    const refreshed = await result.refetch({ cancelRefetch: false });
    if (!refreshed.isError && revision === refreshRevision.current)
      resetPagination();
  }

  return (
    <div className={styles.page}>
      <header className={styles.listHeader}>
        <div className={styles.listHeaderContent}>
          <h1>Hỗ trợ & phản ánh</h1>
          <p className={styles.lead}>
            Góp ý, báo lỗi hoặc phản ánh về giao dịch. Theo dõi phản hồi của
            Admin ngay tại đây.
          </p>
        </div>
        <div className={styles.listHeaderAction}>
          <Link className={styles.primary} to="/support/new">
            <Plus size={17} aria-hidden="true" /> Gửi yêu cầu mới
          </Link>
        </div>
      </header>

      <div className={styles.filtersCard}>
        <div className={styles.filters}>
          <div className={styles.selectField}>
            <label htmlFor="support-filter-state">Trạng thái</label>
            <FilterSelect
              id="support-filter-state"
              label="Trạng thái"
              value={state}
              options={[
                { value: "", label: "Tất cả trạng thái" },
                ...Object.entries(supportStates).map(([value, label]) => ({
                  value,
                  label,
                })),
              ]}
              onChange={(value) =>
                setParams((p) => {
                  if (value) p.set("state", value);
                  else p.delete("state");
                  return p;
                })
              }
              searchable={false}
              nativeOnNarrow={false}
            />
          </div>
          <div className={styles.selectField}>
            <label htmlFor="support-filter-kind">Loại yêu cầu</label>
            <FilterSelect
              id="support-filter-kind"
              label="Loại yêu cầu"
              value={kind}
              options={[
                { value: "", label: "Tất cả loại" },
                ...Object.entries(supportKinds).map(([value, label]) => ({
                  value,
                  label,
                })),
              ]}
              onChange={(value) =>
                setParams((p) => {
                  if (value) p.set("kind", value);
                  else p.delete("kind");
                  return p;
                })
              }
              searchable={false}
              nativeOnNarrow={false}
            />
          </div>
          <button
            type="button"
            className={styles.refreshButton}
            disabled={result.isFetching}
            onClick={() => void refreshList()}
          >
            <RefreshCw
              size={15}
              aria-hidden="true"
              className={result.isFetching ? styles.spin : undefined}
            />
            Cập nhật
          </button>
        </div>
      </div>

      {result.isPending ? (
        <div className={styles.loadingBlock} role="status">
          <p>Đang tải yêu cầu…</p>
        </div>
      ) : null}

      {result.isError && (denied || !result.isFetchNextPageError) ? (
        <div className={styles.errorAlert} role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <p>
            {denied
              ? "Quyền xem yêu cầu hỗ trợ đã thay đổi. Kiểm tra phiên đăng nhập và dùng Cập nhật để thử lại."
              : `${supportError(result.error)} Dùng Cập nhật để thử lại.`}
          </p>
        </div>
      ) : null}

      {!denied && collection.items.length > 0 && (
        <div className={styles.caseList}>
          {collection.items.map((item, index) => (
            <article
              className={styles.row}
              key={item.id}
              id={index === 0 ? "support-list-start" : undefined}
            >
              <div className={styles.rowMain}>
                <p className={styles.meta}>
                  <span className={styles.kindBadge}>
                    {supportKinds[item.kind]}
                  </span>
                  <span className={styles.dotSeparator}>·</span>
                  <time dateTime={item.createdAt}>{date(item.createdAt)}</time>
                </p>
                <h2>
                  <Link
                    to={`/support/${item.id}${params.size ? `?${params}` : ""}`}
                    className={styles.caseTitleLink}
                  >
                    {item.title}
                  </Link>
                </h2>
                <p className={styles.meta}>
                  <span className={styles.caseCode}>
                    #{item.id.slice(0, 8).toUpperCase()}
                  </span>
                  {item.target ? (
                    <>
                      <span className={styles.dotSeparator}>·</span>
                      <span className={styles.targetBadge}>
                        {supportTargets[item.target.type]}
                      </span>
                    </>
                  ) : null}
                </p>
              </div>
              <div className={styles.rowAside}>
                <span className={styles.status} data-state={item.state}>
                  {supportStates[item.state]}
                </span>
                <Link
                  to={`/support/${item.id}${params.size ? `?${params}` : ""}`}
                  className={styles.rowChevronLink}
                  aria-label={`Xem chi tiết yêu cầu ${item.title}`}
                >
                  <ChevronRight size={18} aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      {result.isSuccess &&
      collection.loadedCount === 0 &&
      !result.hasNextPage ? (
        <section className={styles.emptyCard}>
          <div className={styles.emptyIconCircle}>
            <Inbox size={32} aria-hidden="true" />
          </div>
          <h2>Chưa có yêu cầu trong mục này</h2>
          <p>
            Bạn có thể gửi yêu cầu mới hoặc đổi bộ lọc để xem những hồ sơ khác.
          </p>
        </section>
      ) : null}

      {!denied && (
        <CollectionPager
          model={collection}
          anchorId="support-list-start"
          itemLabel="yêu cầu"
        />
      )}
    </div>
  );
}

export function NewSupportPage() {
  const auth = useSession(),
    [params] = useSearchParams();
  const owner = auth.status === "authenticated" ? auth.user.id : undefined;
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
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
  const contextual = Boolean(initial.targetType && initial.targetId);
  const [draft, setDraft] = useState(() => {
    const latest = supportDraft(session, "create:latest");
    const saved = supportDraft(session, draftScope);
    return (
      pendingSupportCreateDraft(session) ?? {
        ...initial,
        ...saved,
        ...(contextual
          ? {
              kind: initial.kind,
              targetType: initial.targetType,
              targetId: initial.targetId,
            }
          : {}),
        title: saved?.title ?? latest?.title ?? "",
        description: saved?.description ?? latest?.description ?? "",
      }
    );
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [changingTarget, setChangingTarget] = useState(false);
  const running = useRef(false);
  const pending = pendingSupportIntent(session, scope);
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
    if (running.current || changingTarget) return;
    if (!pending) {
      if (
        draft.kind === "TransactionIssue" &&
        !["DirectOrder", "Exchange", "PointOrder", "Auction"].includes(
          draft.targetType,
        )
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

  const requestKind = draft.kind;
  const targetEntries = Object.entries(supportTargets).filter(
    ([type]) =>
      requestKind !== "TransactionIssue" ||
      ["DirectOrder", "Exchange", "PointOrder", "Auction"].includes(type),
  );

  const controls = !contextual && (
    <div className={styles.contextFields}>
      <div className={styles.selectField}>
        <label htmlFor="support-request-kind">Loại yêu cầu</label>
        <FilterSelect
          id="support-request-kind"
          label="Loại yêu cầu"
          value={requestKind}
          options={Object.entries(supportKinds).map(([value, label]) => ({
            value,
            label,
          }))}
          onChange={(value) => {
            const nextKind = value as SupportDraft["kind"];
            const resetTarget =
              nextKind === "TransactionIssue" &&
              !["DirectOrder", "Exchange", "PointOrder", "Auction"].includes(
                draft.targetType,
              );
            if (resetTarget) setChangingTarget(false);
            update({
              kind: nextKind,
              ...(resetTarget ? { targetType: "", targetId: "" } : {}),
            });
          }}
          searchable={false}
          nativeOnNarrow={false}
          disabled={busy || pending || !active}
        />
      </div>
      <div className={styles.selectField}>
        <label htmlFor="support-request-target">Đối tượng liên quan</label>
        <FilterSelect
          id="support-request-target"
          label="Đối tượng liên quan"
          value={draft.targetType}
          options={[
            {
              value: "",
              label:
                requestKind === "TransactionIssue"
                  ? "Chọn loại giao dịch"
                  : "Không có đối tượng cụ thể",
            },
            ...targetEntries.map(([value, label]) => ({ value, label })),
          ]}
          onChange={(value) => {
            setChangingTarget(false);
            update({
              targetType: value as SupportDraft["targetType"],
              targetId: "",
            });
          }}
          searchable={false}
          nativeOnNarrow={false}
          disabled={busy || pending || !active}
        />
      </div>
    </div>
  );

  return (
    <div className={`${styles.page} ${styles.compose}`}>
      <header className={styles.composeHeader}>
        <div>
          <h1>Gửi yêu cầu hỗ trợ</h1>
          {contextual ? (
            <p className={styles.contextBadge}>{supportKinds[requestKind]}</p>
          ) : (
            <p className={styles.composeSubtitle}>
              Chọn giao dịch hoặc nội dung liên quan, rồi cho nhóm hỗ trợ biết
              chuyện gì đã xảy ra.
            </p>
          )}
        </div>
        <Link className={styles.backLink} to="/support">
          <ArrowLeft size={16} aria-hidden="true" /> Yêu cầu của tôi
        </Link>
      </header>

      <div className={styles.composeMainCard}>
        {!active ? (
          <div className={styles.errorAlert} role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <p>Tài khoản hiện chỉ được xem và bổ sung hồ sơ đã có.</p>
          </div>
        ) : null}

        {error ? (
          <div className={styles.errorAlert} role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <p className={styles.errorText}>{error}</p>
          </div>
        ) : null}

        {pending ? (
          <div className={styles.notice} role="status">
            <Clock size={18} aria-hidden="true" />
            <div>
              <p>
                Yêu cầu trước chưa xác định được kết quả. Thử lại giữ nguyên
                nội dung và mã gửi.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void submit()}
              >
                {busy ? "Đang xác minh…" : "Thử lại yêu cầu đã gửi"}
              </button>
            </div>
          </div>
        ) : null}

        <form className={styles.form} onSubmit={submit}>
          <fieldset disabled={busy || pending || !active}>
            <section
              className={styles.composeCardSection}
              aria-label="Phân loại yêu cầu"
            >
              <h2 className={styles.sectionTitle}>Thông tin yêu cầu</h2>
              {controls}
              {draft.targetType && (
                <SupportTargetPicker
                  key={draft.targetType}
                  type={draft.targetType}
                  id={draft.targetId}
                  active={active}
                  onChanging={setChangingTarget}
                  onSelect={(targetId) => update({ targetId })}
                />
              )}
            </section>

            <section
              className={styles.composeCardSection}
              data-writing={Boolean(draft.targetId && !changingTarget) || undefined}
              aria-labelledby="support-details-title"
            >
              <h2 id="support-details-title" className={styles.sectionTitle}>
                Chuyện gì đã xảy ra?
              </h2>
              <div className={styles.fieldGroup}>
                <label>
                  <span className={styles.labelTitle}>Tiêu đề</span>
                  <input
                    aria-label="Tiêu đề"
                    placeholder="Ví dụ: Chưa nhận được sách đã hẹn"
                    required
                    minLength={3}
                    maxLength={160}
                    value={draft.title}
                    onChange={(e) => update({ title: e.target.value })}
                  />
                </label>
                <div className={styles.fieldMeta}>
                  <span>Tối thiểu 3 ký tự</span>
                  <span>{draft.title.length}/160</span>
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <label>
                  <span className={styles.labelTitle}>Nội dung</span>
                  <textarea
                    aria-label="Nội dung"
                    rows={5}
                    placeholder="Mô tả điều đã xảy ra và bạn cần hỗ trợ gì."
                    required
                    minLength={10}
                    maxLength={5000}
                    value={draft.description}
                    onChange={(e) => update({ description: e.target.value })}
                    aria-describedby="support-description-hint"
                  />
                </label>
                <div className={styles.fieldMeta}>
                  <small id="support-description-hint">
                    {requestKind === "TransactionIssue"
                      ? "Ghi mốc thời gian hoặc mã vận đơn nếu có. Giữ ảnh tình trạng sách để bổ sung khi được yêu cầu."
                      : "Nếu có, thêm thời điểm xảy ra sự việc hoặc thông tin giúp đối chiếu."}
                  </small>
                  <span>{draft.description.length}/5000</span>
                </div>
              </div>
            </section>

            <div className={styles.composeFooter}>
              <p className={styles.securityHint}>
                <LockKeyhole size={15} aria-hidden="true" />
                <span>Theo dõi phản hồi trong <Link to="/support">hồ sơ yêu cầu</Link>.</span>
              </p>
              <button
                className={styles.primary}
                type="submit"
                disabled={changingTarget || busy}
              >
                <Send size={16} aria-hidden="true" />{" "}
                {busy ? "Đang gửi…" : "Gửi yêu cầu"}
              </button>
            </div>

            {requestKind === "TransactionIssue" && (
              <p className={styles.composeHelp}>
                Để khiếu nại hoặc yêu cầu hoàn tiền, dùng chức năng khiếu nại
                trên giao dịch khi có.
              </p>
            )}
          </fieldset>
        </form>
      </div>
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
      {(!data || denied) && (
        <Link className={styles.backLink} to={back}>
          <ArrowLeft size={16} aria-hidden="true" /> Yêu cầu của tôi
        </Link>
      )}

      {result.isPending ? (
        <div className={styles.loadingBlock} role="status">
          <p>Đang tải hồ sơ…</p>
        </div>
      ) : null}

      {result.isError ? (
        <div className={styles.errorAlert} role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <p>{supportError(result.error)}</p>
            <button
              type="button"
              className={styles.refreshButton}
              onClick={() => void result.refetch()}
            >
              Tải lại hồ sơ
            </button>
          </div>
        </div>
      ) : null}

      {data && !denied ? (
        <>
          <header className={styles.composeHeader}>
            <div>
              <h1>{data.case.title}</h1>
              <p className={styles.composeSubtitle}>
                {supportKinds[data.case.kind]} · Mã{" "}
                <span className={styles.caseCode}>
                  #{id.slice(0, 8).toUpperCase()}
                </span>
              </p>
            </div>
            <Link className={styles.backLink} to={back}>
              <ArrowLeft size={16} aria-hidden="true" /> Yêu cầu của tôi
            </Link>
          </header>
          <section
            className={styles.detailHeaderCard}
            aria-label="Thông tin yêu cầu"
          >
            <div className={styles.detailHeaderTop}>
              <button
                type="button"
                className={styles.refreshButton}
                disabled={result.isFetching}
                onClick={() => void result.refetch()}
              >
                <RefreshCw
                  size={14}
                  aria-hidden="true"
                  className={result.isFetching ? styles.spin : undefined}
                />
                Cập nhật hồ sơ
              </button>
            </div>
            <div className={styles.detailMetaRow}>
              <span className={styles.status} data-state={data.case.state}>
                {supportStates[data.case.state]}
              </span>
              <p className={styles.detailStatusExplanation}>
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
            </div>
            <RelatedCase
              target={data.case.target}
              auctionId={data.relatedAuctionId}
            />
            {data.relatedState ? (
              <p className={styles.relatedStateNotice}>
                {data.case.target?.type === "Auction"
                  ? "Hiện tại"
                  : "Trạng thái giao dịch"}
                : <strong>{supportRelatedState(data.relatedState)}</strong>. Kết
                quả hỗ trợ không thay thế quyết định tiền/hàng.
              </p>
            ) : null}
          </section>

          <section className={styles.timeline} aria-label="Lịch sử xử lý">
            {data.messages.map((m) => (
              <article
                key={m.id}
                className={styles.messageBubble}
                data-role={m.role}
              >
                <div className={styles.messageHeader}>
                  <span className={styles.roleTag} data-role={m.role}>
                    {m.role === "Member"
                      ? "Bạn"
                      : m.role === "Admin"
                        ? "Admin hỗ trợ"
                        : "Cập nhật xử lý"}
                  </span>
                  <span className={styles.dotSeparator}>·</span>
                  <time dateTime={m.createdAt}>{date(m.createdAt)}</time>
                </div>
                <p className={styles.text}>{m.text}</p>
              </article>
            ))}
          </section>

          {error ? (
            <div className={styles.errorAlert} role="alert">
              <AlertCircle size={18} aria-hidden="true" />
              <p className={styles.errorText}>{error}</p>
            </div>
          ) : null}

          {pending ? (
            <div className={styles.notice} role="status">
              <Clock size={18} aria-hidden="true" />
              <div>
                <p>Yêu cầu trước chưa được xác nhận.</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void send()}
                >
                  {busy ? "Đang xác minh…" : "Thử lại yêu cầu đã gửi"}
                </button>
              </div>
            </div>
          ) : null}

          {data.canReply ? (
            <div className={styles.replyCard}>
              <form className={styles.form} onSubmit={send}>
                <label>
                  <span className={styles.labelTitle}>Bổ sung thông tin</span>
                  <textarea
                    rows={4}
                    minLength={3}
                    maxLength={5000}
                    required
                    disabled={busy || pending}
                    aria-label="Bổ sung thông tin"
                    placeholder="Nhập thông tin hoặc câu hỏi bổ sung cho chuyên viên hỗ trợ..."
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                </label>
                <div className={styles.replyFooter}>
                  <span className={styles.fieldMeta}>{value.length}/5000</span>
                  <button
                    className={styles.primary}
                    disabled={busy || pending || !value.trim()}
                    type="submit"
                  >
                    <Send size={15} aria-hidden="true" />{" "}
                    {busy ? "Đang gửi…" : "Gửi bổ sung"}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className={styles.closedNotice}>
              <p>Hiện chưa thể gửi thêm nội dung trong hồ sơ này.</p>
            </div>
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
    <div className={styles.relatedTargetBanner}>
      <span className={styles.relatedLabel}>
        {supportTargets[target.type]}: #{target.id.slice(0, 8).toUpperCase()}
      </span>
      {paths[target.type] ? (
        <Link to={paths[target.type]!} className={styles.relatedTargetLink}>
          Mở đối tượng liên quan <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
