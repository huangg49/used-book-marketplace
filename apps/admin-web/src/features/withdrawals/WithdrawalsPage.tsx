import { useCallback, useEffect, useRef, useState } from "react";
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
  ArrowDownToLine,
  ArrowLeft,
  ArrowDownWideNarrow,
  ChevronRight,
  RefreshCw,
  X,
} from "lucide-react";
import {
  ApiError,
  withdrawalLabels,
  withdrawalReasons,
  withdrawalPageSchema,
  withdrawalSchema,
  withdrawalReceiptSchema,
  type Withdrawal,
  type CurrentUser,
} from "@used-books/session-client";
import { canResolve, canSimulate, session } from "../../core/session";
import {
  Button,
  ErrorNotice,
  Notice,
  StatusPill,
  CursorPagination,
} from "../../core/ui";
import { dateText } from "../../core/format";
import { ActionPanel } from "../operations/action-panel";
import styles from "./WithdrawalsPage.module.css";

const vnd = (n: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
    n,
  );
const tone = (state: Withdrawal["state"]) =>
  state === "Completed" || state === "Refunded"
    ? "success"
    : state === "Rejected" || state === "FailedVerified"
      ? "error"
      : state === "Processing"
        ? "warning"
        : "neutral";
export function WithdrawalsPage({
  simulator = false,
}: {
  simulator?: boolean;
}) {
  const user = useOutletContext<CurrentUser>();
  if (!(simulator ? canSimulate(user) : canResolve(user)))
    return (
      <Notice tone="warning">
        Bạn chưa có quyền xử lý rút tiền tại mục này.
      </Notice>
    );
  return <Queue key={user.id} user={user} simulator={simulator} />;
}
function Queue({ user, simulator }: { user: CurrentUser; simulator: boolean }) {
  const [params, setParams] = useSearchParams();
  const state = params.get("state") ?? (simulator ? "Processing" : "Requested");
  const [selected, setSelected] = useState<Withdrawal>();
  const [feedback, setFeedback] = useState("");
  const client = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ["withdrawals", user.id, simulator, state],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      session.request(
        `${simulator ? "/operations/simulator" : "/admin"}/withdrawals?limit=20${state ? `&state=${state}` : ""}${pageParam ? `&cursor=${pageParam}` : ""}`,
        withdrawalPageSchema,
      ),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];
  const denied =
    query.error instanceof ApiError && [401, 403].includes(query.error.status);
  return (
    <section className={`${styles.page} ${styles.queuePage}`}>
      <header className={`page-heading ${styles.queueHeading}`}>
        <div>
          <h1>{simulator ? "Kết quả chi mô phỏng" : "Yêu cầu rút tiền"}</h1>
          <p className="intro">
            {simulator
              ? "Ghi nhận kết quả cho đúng mã chi. Kết quả chưa rõ tiếp tục giữ tiền để đối soát."
              : "Đối chiếu thông tin, duyệt từng yêu cầu và theo dõi kết quả chi."}
          </p>
        </div>
        <Button
          className={styles.refresh}
          busy={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {!query.isFetching && <RefreshCw size={16} aria-hidden="true" />}
          Cập nhật danh sách
        </Button>
      </header>
      {feedback && <Notice tone="success">{feedback}</Notice>}
      <div className={styles.queuePanel}>
        <div className={styles.toolbar}>
          <div className={styles.filter}>
            <label htmlFor="withdrawal-filter">Trạng thái</label>
            <select
              id="withdrawal-filter"
              value={state}
              onChange={(e) => {
                const next = new URLSearchParams(params);
                next.set("state", e.target.value);
                setParams(next);
              }}
            >
              <option value="">Tất cả trạng thái</option>
              {Object.entries(withdrawalLabels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.queueContext}>
            {query.data && !denied && (
              <span className={styles.loadedCount}>
                Đã tải <strong>{rows.length}</strong> yêu cầu
              </span>
            )}
            <p>
              <ArrowDownWideNarrow size={15} aria-hidden="true" />
              Ưu tiên yêu cầu gửi trước
            </p>
          </div>
        </div>
        {query.isPending && (
          <p role="status" className="empty">
            Đang tải yêu cầu rút tiền…
          </p>
        )}
        {query.isError && (
          <ErrorNotice error={query.error} retry={() => void query.refetch()} />
        )}
        {!query.isPending && !query.isError && !rows.length && (
          <div className={styles.empty}>
            <ArrowDownToLine size={32} aria-hidden="true" />
            <h2>Chưa có yêu cầu trong mục này</h2>
            <p>Chọn trạng thái khác để xem các đơn đã được xử lý.</p>
          </div>
        )}
        {!denied && rows.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table} role="table">
              <caption className={styles.srOnly}>
                Danh sách yêu cầu rút tiền
              </caption>
              <thead>
                <tr>
                  <th scope="col">Bạn đọc / Yêu cầu</th>
                  <th scope="col" className={styles.moneyHeading}>
                    Số tiền
                  </th>
                  <th scope="col">Lý do</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className={styles.owner}>
                      <div className={styles.ownerIdentity}>
                        <span className={styles.avatar} aria-hidden="true">
                          {row.ownerName
                            .trim()
                            .slice(0, 1)
                            .toLocaleUpperCase("vi-VN")}
                        </span>
                        <div className={styles.ownerInfo}>
                          <strong>{row.ownerName}</strong>
                          <div className={styles.rowMeta}>
                            <span className={styles.code}>
                              #{row.id.slice(0, 8).toUpperCase()}
                            </span>
                            <time dateTime={row.createdAt}>
                              {dateText(row.createdAt)}
                            </time>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className={styles.money}>
                      <span className={styles.mobileLabel} aria-hidden="true">
                        Số tiền
                      </span>
                      <strong>{vnd(row.amount)}</strong>
                      <small>Phí 0đ</small>
                    </td>
                    <td className={styles.rowReason}>
                      <span className={styles.mobileLabel} aria-hidden="true">
                        Lý do
                      </span>
                      {withdrawalReasons[row.reason]}
                    </td>
                    <td className={styles.rowStatus}>
                      <span className={styles.mobileLabel} aria-hidden="true">
                        Trạng thái
                      </span>
                      <StatusPill
                        tone={
                          row.state === "Requested"
                            ? "warning"
                            : tone(row.state)
                        }
                      >
                        {withdrawalLabels[row.state]}
                      </StatusPill>
                    </td>
                    <td className={styles.rowAction}>
                      {simulator ? (
                        row.state === "Processing" &&
                        row.ownerId !== user.id ? (
                          <Button onClick={() => setSelected(row)}>
                            Nhập kết quả
                          </Button>
                        ) : (
                          <span className="muted">
                            {row.ownerId === user.id
                              ? "Cần người xử lý độc lập"
                              : "Không cần thao tác"}
                          </span>
                        )
                      ) : (
                        <Link
                          className={styles.openLink}
                          to={`/withdrawals/${row.id}?${params}`}
                        >
                          Xem đơn <ChevronRight size={16} aria-hidden="true" />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!denied && (
          <div className={styles.queueFooter}>
            <CursorPagination
              pageCount={query.data?.pages.length ?? 0}
              hasNextPage={query.hasNextPage}
              isFetchingNextPage={query.isFetchingNextPage}
              isFetching={query.isFetching}
              error={query.isFetchNextPageError ? query.error : undefined}
              onNextPage={() => void query.fetchNextPage()}
              nextLabel="Xem thêm yêu cầu"
            />
          </div>
        )}
      </div>
      {selected && (
        <ActionDialog
          row={selected}
          action="event"
          userId={user.id}
          onClose={() => setSelected(undefined)}
          reconcile={async () => {
            await client.invalidateQueries({
              queryKey: ["withdrawals", user.id],
            });
          }}
          onFinish={(text) => {
            setFeedback(text);
            setSelected(undefined);
          }}
        />
      )}
    </section>
  );
}
export function WithdrawalDetailPage() {
  const user = useOutletContext<CurrentUser>();
  const { id } = useParams();
  if (!canResolve(user))
    return <Notice tone="warning">Cần quyền Admin đang hoạt động.</Notice>;
  return <Detail key={`${user.id}:${id}`} user={user} id={id!} />;
}
function Detail({ user, id }: { user: CurrentUser; id: string }) {
  const [params] = useSearchParams();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["withdrawal", user.id, id],
    queryFn: () =>
      session.request(`/admin/withdrawals/${id}`, withdrawalSchema),
    refetchInterval: (q) =>
      document.visibilityState === "visible" &&
      ["Requested", "Approved", "Processing", "FailedVerified"].includes(
        q.state.data?.state ?? "",
      )
        ? 10000
        : false,
  });
  const [action, setAction] = useState<Action>();
  const [feedback, setFeedback] = useState("");
  const row = query.data;
  const reconcile = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["withdrawal", user.id, id] }),
      client.invalidateQueries({ queryKey: ["withdrawals", user.id] }),
    ]);
  };
  return (
    <section className={`${styles.page} ${styles.detailPage}`}>
      <Link className={styles.back} to={`/withdrawals?${params}`}>
        <ArrowLeft size={16} aria-hidden="true" /> Yêu cầu rút tiền
      </Link>
      <header className={styles.detailHeading}>
        <h1>Chi tiết yêu cầu rút tiền</h1>
      </header>
      {query.isPending && <p role="status">Đang tải yêu cầu…</p>}
      {query.isError && (
        <ErrorNotice error={query.error} retry={() => void query.refetch()} />
      )}
      {feedback && <Notice tone="info">{feedback}</Notice>}
      {row && !query.isError && (
        <>
          <section className={styles.summary} aria-label="Số tiền và xử lý">
            <div className={styles.amount}>
              <div className={styles.amountStatus}>
                <span>Số tiền rút</span>
                <StatusPill tone={tone(row.state)}>
                  {withdrawalLabels[row.state]}
                </StatusPill>
              </div>
              <strong>{vnd(row.amount)}</strong>
              <small>Phí 0đ</small>
            </div>
            <div className={styles.decision}>
              {row.ownerId === user.id ? (
                <Notice tone="warning">
                  Đây là yêu cầu của bạn. Cần Admin khác xử lý.
                </Notice>
              ) : (
                <>
                  <p className={styles.decisionHint}>
                    {row.state === "Requested"
                      ? row.processingMode === "Manual"
                        ? "Tiền đang được giữ. Duyệt để hoàn tất rút tiền."
                        : "Tiền đang được giữ. Duyệt trước khi gửi lệnh chi."
                      : row.state === "Approved"
                        ? "Đã được duyệt. Gửi lệnh chi để bắt đầu xử lý mô phỏng."
                        : row.state === "Processing"
                          ? "Đang chờ kết quả mô phỏng hoặc đối soát. Không gửi thêm lệnh chi."
                          : row.state === "FailedVerified"
                            ? "Đã xác minh chi thất bại. Hoàn đúng khoản tiền đang giữ."
                            : "Yêu cầu đã kết thúc. Nhật ký được giữ để tra cứu."}
                  </p>
                  <div className={styles.actions}>
                    {row.state === "Requested" && (
                      <Button
                        variant="primary"
                        onClick={() => setAction("approve")}
                      >
                        Duyệt yêu cầu
                      </Button>
                    )}
                    {["Requested", "Approved"].includes(row.state) && (
                      <Button onClick={() => setAction("reject")}>
                        Từ chối
                      </Button>
                    )}
                    {row.state === "Approved" && (
                      <Button
                        variant="primary"
                        onClick={() => setAction("process")}
                      >
                        Gửi lệnh chi mô phỏng
                      </Button>
                    )}
                    {row.state === "FailedVerified" && (
                      <Button
                        variant="primary"
                        onClick={() => setAction("refund")}
                      >
                        Hoàn khoản giữ
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>
          <div className={styles.columns}>
            <section
              className={styles.sheet}
              aria-labelledby="withdrawal-recipient-heading"
            >
              <h2 id="withdrawal-recipient-heading">Thông tin nhận tiền</h2>
              <dl className={styles.recipient}>
                <div>
                  <dt>Ngân hàng</dt>
                  <dd>{row.recipient.bankName}</dd>
                </div>
                <div className={styles.account}>
                  <dt>Số tài khoản</dt>
                  <dd>{row.recipient.accountNumber}</dd>
                </div>
                <div>
                  <dt>Chủ tài khoản</dt>
                  <dd>{row.recipient.accountHolder}</dd>
                </div>
              </dl>
              <div className={styles.request}>
                <h2>Thông tin yêu cầu</h2>
                <dl className={styles.requestFacts}>
                  <div>
                    <dt>Bạn đọc</dt>
                    <dd>{row.ownerName}</dd>
                  </div>
                  <div>
                    <dt>Ngày gửi</dt>
                    <dd>
                      <time dateTime={row.createdAt}>
                        {dateText(row.createdAt)}
                      </time>
                    </dd>
                  </div>
                  <div>
                    <dt>Lý do rút</dt>
                    <dd>
                      {withdrawalReasons[row.reason]}
                      {row.reasonDetail && <p>{row.reasonDetail}</p>}
                    </dd>
                  </div>
                </dl>
              </div>
            </section>
            <div className={styles.historyColumn}>
              <section
                className={styles.sheet}
                aria-labelledby="withdrawal-history-heading"
              >
                <h2 id="withdrawal-history-heading">Nhật ký xử lý</h2>
                <ol className={styles.timeline}>
                  {row.history.map((h, i) => (
                    <li key={i}>
                      <div className={styles.eventHead}>
                        <StatusPill tone={tone(h.state)}>
                          {withdrawalLabels[h.state]}
                        </StatusPill>
                        <time dateTime={h.at}>{dateText(h.at)}</time>
                      </div>
                      <p>{h.note}</p>
                    </li>
                  ))}
                </ol>
              </section>
              <details className={styles.references}>
                <summary>Mã tham chiếu</summary>
                <dl>
                  <div>
                    <dt>Mã yêu cầu</dt>
                    <dd>{row.id}</dd>
                  </div>
                  {row.payoutRef && (
                    <div>
                      <dt>Mã chi cố định</dt>
                      <dd>{row.payoutRef}</dd>
                    </div>
                  )}
                </dl>
              </details>
            </div>
          </div>
          {action && (
            <ActionDialog
              row={row}
              action={action}
              userId={user.id}
              reconcile={reconcile}
              onClose={() => setAction(undefined)}
              onFinish={(text) => {
                setAction(undefined);
                setFeedback(text);
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
type Action = "approve" | "reject" | "process" | "refund" | "event";
const titles: Record<Action, string> = {
  approve: "Duyệt yêu cầu rút tiền",
  reject: "Từ chối yêu cầu rút tiền",
  process: "Gửi lệnh chi mô phỏng",
  refund: "Hoàn khoản tiền đang giữ",
  event: "Ghi nhận kết quả chi mô phỏng",
};
function ActionDialog({
  row,
  action,
  onClose,
  onFinish,
  reconcile,
}: {
  row: Withdrawal;
  action: Action;
  userId: string;
  onClose: () => void;
  onFinish: (text: string) => void;
  reconcile: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [locked, setLocked] = useState(false);
  const [reason, setReason] = useState("");
  const [outcome, setOutcome] = useState("");
  const [error, setError] = useState("");
  const onPending = useCallback((value: boolean) => setLocked(value), []);
  useEffect(() => {
    const node = ref.current!;
    const trigger = document.activeElement;
    node.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      node.close();
      document.body.style.overflow = overflow;
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`${styles.dialog} ${action === "approve" ? styles.confirmDialog : ""}`}
      aria-labelledby="withdrawal-action-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!locked) onClose();
      }}
    >
      <header className={styles.dialogHead}>
        <h2 id="withdrawal-action-title">{titles[action]}</h2>
        <Button aria-label="Đóng popup" disabled={locked} onClick={onClose}>
          <X size={20} />
        </Button>
      </header>
      <div className={styles.dialogAmount}>
        <strong>{vnd(row.amount)}</strong>
        <span>
          {row.ownerName} · #{row.id.slice(0, 8).toUpperCase()}
        </span>
      </div>
      <ActionPanel
        label={titles[action]}
        title={
          action === "approve" ? "Thông tin nhận tiền" : "Xác nhận thông tin"
        }
        confirm={false}
        dirty={!!reason || !!outcome}
        confirmTitle={titles[action]}
        confirmBody={null}
        submitLabel={action === "approve" ? "Xác nhận" : titles[action]}
        schema={withdrawalReceiptSchema}
        onPending={onPending}
        reconcile={reconcile}
        onFinish={(result) => onFinish(result.text)}
        interpret={(receipt) => ({
          tone: "success",
          text: `Đã ghi nhận: ${withdrawalLabels[receipt.state]}.`,
          close: true,
        })}
        fields={(disabled) => (
          <fieldset className={styles.form} disabled={disabled}>
            {action === "approve" ? (
              <p>
                {row.recipient.bankName} ·{" "}
                <strong>{row.recipient.accountNumber}</strong>
                <br />
                {row.recipient.accountHolder}
              </p>
            ) : action === "reject" ? (
              <>
                <label htmlFor="withdrawal-decision-reason">
                  Lý do từ chối <span aria-hidden="true">*</span>
                </label>
                <textarea
                  id="withdrawal-decision-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                  maxLength={500}
                  placeholder="Nhập lý do để người dùng và người xử lý sau có thể tra cứu."
                />
              </>
            ) : action === "event" ? (
              <>
                <p>
                  Mã chi: <span className={styles.code}>{row.payoutRef}</span>
                </p>
                <label htmlFor="withdrawal-outcome">Kết quả xác minh</label>
                <select
                  id="withdrawal-outcome"
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                >
                  <option value="">Chọn kết quả mô phỏng</option>
                  <option value="Succeeded">Đã chi thành công</option>
                  <option value="FailedVerified">
                    Đã xác minh chi thất bại
                  </option>
                  <option value="Unknown">Chưa rõ · Tiếp tục đối soát</option>
                </select>
              </>
            ) : (
              <p>
                {action === "process"
                  ? "Tạo một mã chi cố định. Tiền vẫn được giữ cho đến khi có kết quả xác minh."
                  : "Khoản giữ sẽ được trả về số dư khả dụng đúng một lần."}
              </p>
            )}
            {action !== "event" && (
              <small>
                Thao tác tiền yêu cầu phiên đăng nhập trong 15 phút gần đây.
              </small>
            )}
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
          </fieldset>
        )}
        validate={() => {
          if (action === "reject" && reason.trim().length < 3) {
            setError("Nhập lý do ít nhất 3 ký tự.");
            return false;
          }
          if (action === "event" && !outcome) {
            setError("Chọn kết quả xác minh.");
            return false;
          }
          setError("");
          return true;
        }}
        build={() =>
          action === "event"
            ? {
                path: "/operations/simulator/withdrawal-events",
                key: crypto.randomUUID(),
                body: {
                  eventId: crypto.randomUUID(),
                  withdrawalId: row.id,
                  expectedVersion: row.version,
                  payoutRef: row.payoutRef,
                  recipientId: row.ownerId,
                  amount: row.amount,
                  currency: "VND",
                  outcome,
                },
              }
            : {
                path: `/admin/withdrawals/${row.id}/${action === "approve" || action === "reject" ? "decision" : action}`,
                key: crypto.randomUUID(),
                body: {
                  expectedVersion: row.version,
                  ...(["approve", "reject"].includes(action)
                    ? {
                        decision: action === "approve" ? "Approve" : "Reject",
                        reason:
                          action === "approve"
                            ? "Đã xác nhận yêu cầu rút tiền."
                            : reason,
                      }
                    : {}),
                },
              }
        }
      />
    </dialog>
  );
}
