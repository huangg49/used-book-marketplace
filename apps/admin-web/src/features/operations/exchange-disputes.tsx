import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock3,
  Coins,
  FileText,
  Package,
  RefreshCw,
  Search,
  ShieldAlert,
  Truck,
  Wallet,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Link,
  useLocation,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  exchangeEvidenceAccessSchema,
  demoExchangeDeadlineLabel,
  exchangeEvidenceListSchema,
  profileAvatarReadSchema,
  PUBLIC_MEDIA_GC_MS,
  signedMediaStaleTime,
  exchangeReturnPhase,
  type CurrentUser,
  type DemoExchangeDeadline,
  type ExchangeReturnAction,
} from "@used-books/session-client";
import { dateText, money } from "../../core/format";
import { canReview, session } from "../../core/session";
import { Button, ErrorNotice, Notice } from "../../core/ui";
import { EmptyArt } from "../../core/EmptyArt";
import { ListFeedback } from "../../core/list-feedback";
import { useListMotion } from "../../core/task-motion";
import { ActionPanel, type Outcome } from "./action-panel";
import {
  exchangeDisputeResolution,
  exchangeDisputeResolutionsList,
  type ExchangeDisputeItem,
} from "./contracts";
import { ExchangeEvidenceReview } from "./exchange-evidence-review";
import { Forbidden } from "./queue-frame";
import { mediaRead } from "../review/contracts";
import styles from "./exchange-disputes.module.css";

export function ExchangeDisputesPage() {
  const user = useOutletContext<CurrentUser>();
  return canReview(user) ? (
    <ExchangeDisputesContent user={user} />
  ) : (
    <Forbidden />
  );
}

const queuePath = "/operations/exchange-disputes";
const pageSize = 10;
const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("vi")
    .replaceAll("đ", "d")
    .trim();

function disputeStatus(item: ExchangeDisputeItem) {
  return item.returnResolution
    ? exchangeReturnPhase[item.returnResolution.phase]
    : item.status === "ResolutionPending"
      ? "Chờ xử lý · Giữ tiền và sách"
      : "Đã xử lý";
}

const exchangeCode = (item: ExchangeDisputeItem) =>
  "#" + item.id.slice(0, 8).toUpperCase();
const totalDeposit = (item: ExchangeDisputeItem) =>
  item.initiatorDeposit + item.recipientDeposit + item.diffAmount;

function shipmentIssue(item: ExchangeDisputeItem) {
  if (Boolean(item.initiatorShippedAt) === Boolean(item.recipientShippedAt))
    return undefined;
  return "Một chiều chưa gửi";
}

function ExchangeDisputesContent({ user }: { user: CurrentUser }) {
  const result = useQuery({
    queryKey: ["operations", "exchange-disputes", user.id],
    queryFn: () =>
      session.request(
        "/operations/exchanges/resolutions",
        exchangeDisputeResolutionsList,
      ),
    refetchInterval: 30_000,
  });
  const rows = result.data;
  const [params, setParams] = useSearchParams();
  const query = params.get("q")?.trim() ?? "";
  const searchTerms = normalizeSearch(query.replace(/^#/, ""))
    .split(/\s+/)
    .filter(Boolean);
  const filtered = (rows ?? []).filter((item) => {
    if (!searchTerms.length) return true;
    const initiator = disputeParty(item, "initiator");
    const recipient = disputeParty(item, "recipient");
    const searchable = normalizeSearch(
      [
        item.id,
        initiator.name,
        recipient.name,
        ...initiator.books,
        ...recipient.books,
      ].join(" "),
    );
    return searchTerms.every((term) => searchable.includes(term));
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rawPage = params.get("page") ?? "";
  const requestedPage = /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
  const page = Math.min(pageCount, Math.max(1, requestedPage));
  const start = (page - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);
  const list = useRef<HTMLOListElement>(null);
  const listTitle = useRef<HTMLHeadingElement>(null);
  useListMotion(
    list,
    visible.map((item) => item.id + ":" + item.revision).join("|"),
  );

  function changePage(next: number) {
    listTitle.current?.focus();
    setParams({
      ...(query ? { q: query } : {}),
      ...(next > 1 ? { page: String(next) } : {}),
    });
  }

  const returnCount =
    rows?.filter((row) => Boolean(row.returnResolution)).length ?? 0;
  const funded =
    rows?.filter((row) => row.initiatorFundedAt && row.recipientFundedAt) ?? [];
  const escrowTotal = funded.reduce((sum, row) => sum + totalDeposit(row), 0);
  const queueSearch = new URLSearchParams();
  if (query) queueSearch.set("q", query);
  if (page > 1) queueSearch.set("page", String(page));

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div className="page-heading">
          <h1>Khiếu nại trao đổi sách</h1>
          <p className="intro">
            Đối chiếu giao nhận, bằng chứng và các khoản đang giữ của từng hồ
            sơ.
          </p>
        </div>
        <Button busy={result.isFetching} onClick={() => void result.refetch()}>
          {!result.isFetching && <RefreshCw size={16} aria-hidden="true" />}
          Cập nhật danh sách
        </Button>
      </header>

      {rows && rows.length > 0 && (
        <section className={styles.metricsBar} aria-label="Tổng quan khiếu nại">
          <div className={styles.metricCard}>
            <div className={styles.metricIconWrap}>
              <FileText size={18} aria-hidden="true" />
            </div>
            <div className={styles.metricData}>
              <span className={styles.metricLabel}>Đang thụ lý</span>
              <strong className={styles.metricValue}>
                {rows.length} hồ sơ
              </strong>
            </div>
          </div>
          <div className={styles.metricCard}>
            <div className={styles.metricIconWrap} data-tone="info">
              <Package size={18} aria-hidden="true" />
            </div>
            <div className={styles.metricData}>
              <span className={styles.metricLabel}>Quy trình trả sách</span>
              <strong className={styles.metricValue}>{returnCount} ca</strong>
            </div>
          </div>
          <div className={styles.metricCard}>
            <div className={styles.metricIconWrap} data-tone="escrow">
              <Coins size={18} aria-hidden="true" />
            </div>
            <div className={styles.metricData}>
              <span className={styles.metricLabel}>Khoản giữ đã xác nhận</span>
              <strong className={styles.metricValue}>
                {funded.length ? money(escrowTotal) : "Chưa đối chiếu"}
              </strong>
            </div>
          </div>
        </section>
      )}

      <section className={styles.queue} aria-labelledby="exchange-queue-title">
        <header className={styles.queueHeader}>
          <div>
            <h2 id="exchange-queue-title" tabIndex={-1} ref={listTitle}>
              Hồ sơ chờ xử lý
            </h2>
            <p>Giữ tiền và sách trong lúc đối chiếu.</p>
          </div>
          {rows && (
            <p className={styles.queueCount}>
              {filtered.length === rows.length
                ? `${rows.length} hồ sơ`
                : `${filtered.length} / ${rows.length} hồ sơ`}{" "}
              · Mới nhất trước
            </p>
          )}
        </header>
        {Boolean(rows?.length) && (
          <form
            className={styles.queueSearch}
            role="search"
            aria-label="Tìm hồ sơ khiếu nại"
            onSubmit={(event) => {
              event.preventDefault();
              const value = String(
                new FormData(event.currentTarget).get("query") ?? "",
              ).trim();
              setParams(value ? { q: value } : {});
            }}
          >
            <label>
              Tìm hồ sơ
              <input
                key={query}
                type="search"
                name="query"
                defaultValue={query}
                placeholder="Mã hồ sơ, tên người hoặc tựa sách"
              />
            </label>
            <Button type="submit">
              <Search size={16} aria-hidden="true" /> Tìm
            </Button>
            {query && (
              <Button onClick={() => setParams({})}>Xóa tìm kiếm</Button>
            )}
          </form>
        )}
        <ListFeedback result={result} loadingText="Đang tải hồ sơ…" />
        {result.isSuccess && !rows?.length && (
          <div className="empty">
            <EmptyArt variant="inbox" />
            <h3>Chưa có khiếu nại nào.</h3>
            <p>Chưa có giao dịch chờ xử lý trong danh sách bạn được xem.</p>
          </div>
        )}
        {result.isSuccess && Boolean(rows?.length) && !filtered.length && (
          <div className="empty">
            <h3>Không tìm thấy hồ sơ phù hợp.</h3>
          </div>
        )}
        <ol className={styles.queueList} ref={list} start={start + 1}>
          {visible.map((item) => {
            const isHighValue = totalDeposit(item) > 300000;
            const initiator = disputeParty(item, "initiator");
            const recipient = disputeParty(item, "recipient");
            return (
              <li
                className={styles.queueRow}
                key={item.id}
                data-motion-key={item.id}
                data-motion-revision={item.revision}
              >
                <div className={styles.queueIdentity}>
                  <div className={styles.pairAvatars}>
                    <ParticipantAvatar person={initiator} viewerId={user.id} />
                    <ParticipantAvatar person={recipient} viewerId={user.id} />
                  </div>
                  <div>
                    <h3 className={styles.caseTitle}>
                      {initiator.name} ↔ {recipient.name}
                    </h3>
                    <span className={styles.muted}>
                      Trao đổi {exchangeCode(item)}
                    </span>
                  </div>
                </div>
                <div className={styles.queueSummary}>
                  <div className={styles.queueBooks}>
                    <QueueBooks books={initiator.books} />
                    <QueueBooks books={recipient.books} />
                  </div>
                  <p>
                    {shipmentIssue(item) ||
                      item.disputeReason ||
                      "Chưa có nội dung báo sự cố."}
                  </p>
                </div>
                <div className={styles.queueStage}>
                  <span
                    className={styles.stage}
                    data-phase={item.returnResolution?.phase || "pending"}
                  >
                    {disputeStatus(item)}
                  </span>
                  {item.disputedAt && (
                    <time className={styles.muted} dateTime={item.disputedAt}>
                      {dateText(item.disputedAt)}
                    </time>
                  )}
                  {isHighValue && (
                    <span className={styles.adminRequiredBadge}>
                      <ShieldAlert size={13} aria-hidden="true" /> Thẩm quyền
                      Admin
                    </span>
                  )}
                </div>
                <div className={styles.queueActions}>
                  {item.initiatorFundedAt && item.recipientFundedAt ? (
                    <span>
                      Đang giữ <strong>{money(totalDeposit(item))}</strong>
                    </span>
                  ) : (
                    <span>Cần đối chiếu khoản giữ</span>
                  )}
                  <Link
                    className={styles.caseLink}
                    to={{
                      pathname: queuePath + "/" + item.id,
                      search: queueSearch.size
                        ? "?" + queueSearch.toString()
                        : "",
                    }}
                  >
                    Mở hồ sơ <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
        {pageCount > 1 && (
          <nav className={styles.pagination} aria-label="Phân trang khiếu nại">
            <p aria-live="polite">
              Hồ sơ {start + 1}–{start + visible.length} / {filtered.length} ·
              Trang {page}/{pageCount}
            </p>
            <div>
              <Button
                disabled={page === 1}
                onClick={() => changePage(page - 1)}
              >
                Trang trước
              </Button>
              <Button
                disabled={page === pageCount}
                onClick={() => changePage(page + 1)}
              >
                Trang sau
              </Button>
            </div>
          </nav>
        )}
      </section>
    </div>
  );
}

const actionText: Partial<
  Record<ExchangeReturnAction, { label: string; effect: string }>
> = {
  VerifyOutboundDelivery: {
    label: "Xác minh đã giao sách",
    effect:
      "Đối chiếu đúng kiện sách, người nhận và thời điểm bàn giao. Sau khi lưu, hồ sơ có thể chuyển sang bước yêu cầu bổ sung bằng chứng.",
  },
  RequestEvidence: {
    label: "Yêu cầu bổ sung bằng chứng",
    effect: "Hai bên có 48 giờ để bổ sung thông tin. Tiền vẫn được giữ.",
  },
  OrderReturn: {
    label: "Ra quyết định yêu cầu trả sách",
    effect:
      "Hai bên có 48 giờ để kháng nghị. Sau khi quyết định có hiệu lực, bên giữ sách có 72 giờ bàn giao sách hoàn.",
  },
  Uphold: {
    label: "Giữ quyết định sau kháng nghị",
    effect: "Quyết định có hiệu lực sau khi Admin xác nhận.",
  },
  SetAside: {
    label: "Hủy quyết định để xem xét lại",
    effect: "Hồ sơ quay về bước xem xét. Các khoản tiền vẫn được giữ.",
  },
  RejectReturnDispatch: {
    label: "Xác minh chưa bàn giao sách hoàn",
    effect:
      "Dùng khi đã kiểm tra và xác minh mã vận đơn chưa có bàn giao. Hồ sơ quay về bước trả sách với hạn cũ.",
  },
  VerifyReturnDelivery: {
    label: "Xác minh đã giao sách hoàn",
    effect:
      "Chỉ xác nhận khi chứng cứ cho thấy đúng cuốn đã giao về chủ. Chủ sách có 48 giờ kiểm tra.",
  },
  OrderCompensation: {
    label: "Ra quyết định bồi thường",
    effect:
      "Chỉ dùng khi đã xác minh bên nhận giữ sách quá hạn và không thể thu hồi. Hai bên có 48 giờ kháng nghị.",
  },
  Settle: {
    label: "Thực hiện quyết định",
    effect:
      "Hệ thống sẽ ghi từng khoản vào ví theo kết quả cuối và cập nhật trạng thái hai bài đăng.",
  },
};

function OperationsReturnActions({
  item,
  user,
  reload,
  onFinish,
  onPending,
}: {
  item: ExchangeDisputeItem;
  user: CurrentUser;
  reload: () => Promise<unknown>;
  onFinish: (outcome: Omit<Outcome, "close">) => void;
  onPending: (value: boolean) => void;
}) {
  const [selected, setSelected] = useState<ExchangeReturnAction>();
  const [note, setNote] = useState("");
  const [evidenceId, setEvidenceId] = useState("");
  const [pending, setPending] = useState(false);
  const [demo, setDemo] = useState<{
    deadline: DemoExchangeDeadline;
    revision: number;
  }>();
  const reportPending = useCallback(
    (value: boolean) => {
      setPending(value);
      onPending(value);
    },
    [onPending],
  );
  const key = ["operations", "exchange-evidence-access", user.id, item.id];
  const access = useQuery({
    queryKey: key,
    queryFn: () =>
      session.request(
        "/operations/exchanges/" + item.id + "/evidence-access",
        exchangeEvidenceAccessSchema,
      ),
  });
  const assigned =
    access.isSuccess &&
    access.data.assigneeId === user.id &&
    item.status === "ResolutionPending";
  const r = item.returnResolution;
  const admin = user.roles.includes("ADMIN");
  const verifying = item.canVerifyOutboundDelivery && admin;
  const privileged = admin || totalDeposit(item) <= 300000;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const due = (deadline?: string | null) =>
    !!deadline && Date.parse(deadline) <= now;
  const ready = r && due(r.appealDueAt) && !r.appeals.length;
  const actions: ExchangeReturnAction[] = [];
  if (verifying) actions.push("VerifyOutboundDelivery");
  if (item.canStartReturnResolution && (!r || r.phase === "NeedsReview"))
    actions.push("RequestEvidence");
  if (r?.phase === "Evidence" && due(r.evidenceDueAt) && privileged)
    actions.push("OrderReturn");
  if (
    r &&
    (r.phase === "ReturnOrdered" || r.phase === "CompensationOrdered") &&
    due(r.appealDueAt) &&
    r.appeals.length &&
    !r.effectiveAt &&
    admin
  ) {
    actions.push("Uphold", "SetAside");
  }
  if (
    r?.phase === "ReturnOrdered" &&
    due(r.returnDueAt) &&
    (ready || r.effectiveAt) &&
    admin
  )
    actions.push("OrderCompensation");
  if (r && ["ReturnInProgress", "ReturnIssue"].includes(r.phase) && admin) {
    actions.push("VerifyReturnDelivery");
    if (!r.returnedAt) actions.push("RejectReturnDispatch");
  }
  if (
    privileged &&
    r &&
    ((r.phase === "CheckingReturn" && due(r.checkDueAt)) ||
      (r.phase === "CompensationOrdered" && (ready || r.effectiveAt)))
  )
    actions.push("Settle");
  const useEvidence =
    selected === "VerifyOutboundDelivery" ||
    selected === "OrderCompensation" ||
    selected === "VerifyReturnDelivery" ||
    selected === "RejectReturnDispatch";
  const evidence = useQuery({
    queryKey: ["operations", "exchange-evidence", user.id, item.id],
    queryFn: () =>
      session.request(
        "/operations/exchanges/" + item.id + "/evidence",
        exchangeEvidenceListSchema,
      ),
    enabled: assigned && useEvidence,
  });
  const active = selected && actionText[selected];
  return (
    <section aria-label="Bước tiếp theo của hồ sơ" className={styles.nextStep}>
      <h2>Bước tiếp theo</h2>
      {!assigned && !pending && (
        <p>Nhận phụ trách ở mục bằng chứng để thực hiện bước tiếp theo.</p>
      )}
      {(assigned || pending) && (
        <>
          {!privileged && (
            <Notice tone="info">
              Tổng khoản giữ vượt 300.000đ. Admin cần nhận phụ trách để ra quyết
              định.
            </Notice>
          )}
          {r?.appeals.map((appeal) => (
            <p key={appeal.by}>
              <strong>
                {appeal.by === r.ownerId
                  ? "Chủ sách kháng nghị"
                  : "Bên đang giữ sách kháng nghị"}
              </strong>
              <br />
              {appeal.note}
            </p>
          ))}
          {!actions.length && !pending && (
            <p>
              {r?.phase === "Evidence"
                ? "Đang chờ hết hạn bổ sung bằng chứng."
                : r?.phase === "CheckingReturn"
                  ? "Đang chờ chủ sách kiểm tra sách đã trả."
                  : r?.appeals.length && !r.effectiveAt
                    ? "Đang chờ Admin khác xem xét kháng nghị."
                    : "Theo dõi hạn và các cập nhật của hai bên trong hồ sơ."}
            </p>
          )}
          {item.demoDeadline && !selected && !demo && !pending && (
            <Button
              onClick={() =>
                setDemo({
                  deadline: item.demoDeadline!,
                  revision: item.revision,
                })
              }
            >
              Tua {demoExchangeDeadlineLabel[item.demoDeadline]} · Demo
            </Button>
          )}
          {demo && (
            <div className={styles.demoAction}>
              <ActionPanel
                label="Tua hạn demo"
                title={"Tua " + demoExchangeDeadlineLabel[demo.deadline]}
                submitLabel="Tua ngay"
                confirmTitle="Xác nhận tua hạn demo?"
                confirmBody={
                  <p>Đóng thời hạn này để thử thao tác tiếp theo trên hồ sơ.</p>
                }
                build={() => ({
                  path: "/operations/exchanges/" + item.id + "/demo-advance",
                  body: {
                    expectedVersion: demo.revision,
                    deadline: demo.deadline,
                  },
                })}
                schema={exchangeDisputeResolution}
                interpret={(updated) => {
                  if (
                    updated.id !== item.id ||
                    updated.revision <= demo.revision
                  )
                    throw new Error(
                      "Chưa xác minh được kết quả của đúng hồ sơ.",
                    );
                  return {
                    tone: "success",
                    text: "Đã tua hạn demo. Xem thao tác tiếp theo trên hồ sơ.",
                    close: true,
                  };
                }}
                reconcile={reload}
                onPending={reportPending}
                onFinish={(outcome) => {
                  setDemo(undefined);
                  onFinish(outcome);
                }}
              />
              {!pending && (
                <Button onClick={() => setDemo(undefined)}>
                  Đóng thao tác demo
                </Button>
              )}
            </div>
          )}
          {verifying && !selected && !demo && (
            <div className={styles.verifyCallout}>
              <p>
                Chiều gửi ban đầu đang chờ đối chiếu. Mở tệp bàn giao trong mục
                bằng chứng trước khi xác minh.
              </p>
              <Button onClick={() => setSelected("VerifyOutboundDelivery")}>
                Xác minh đã giao sách
              </Button>
            </div>
          )}
          {!demo &&
            ((!verifying && actions.length > 0) ||
              (pending && selected !== "VerifyOutboundDelivery")) && (
              <label>
                Thao tác với hồ sơ
                <select
                  value={selected ?? ""}
                  disabled={pending}
                  onChange={(e) => {
                    const value = actions.find(
                      (action) => action === e.target.value,
                    );
                    setSelected(value);
                    setNote("");
                    setEvidenceId("");
                  }}
                >
                  <option value="">Chọn thao tác</option>
                  {(pending && selected ? [selected] : actions).map(
                    (action) => (
                      <option key={action} value={action}>
                        {actionText[action]?.label}
                      </option>
                    ),
                  )}
                </select>
              </label>
            )}
          {active && (pending || actions.includes(selected!)) && (
            <ActionPanel
              key={selected}
              label={active.label}
              title={active.label}
              intro={active.effect}
              fields={(locked) =>
                assigned &&
                selected !== "Settle" && (
                  <>
                    <label>
                      {selected === "VerifyOutboundDelivery"
                        ? "Căn cứ xác minh bàn giao"
                        : "Căn cứ hoặc yêu cầu gửi hai bên"}
                      <textarea
                        value={note}
                        disabled={locked}
                        minLength={5}
                        maxLength={500}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </label>
                    {useEvidence && (
                      <label>
                        Tệp bằng chứng đã đối chiếu
                        <select
                          value={evidenceId}
                          disabled={locked || evidence.isError}
                          onChange={(e) => setEvidenceId(e.target.value)}
                        >
                          <option value="">Chọn tệp trong hồ sơ</option>
                          {evidence.data?.items
                            .filter((item) => item.status === "Ready")
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.fileName}
                              </option>
                            ))}
                        </select>
                        {evidence.isError && (
                          <span role="alert">
                            Chưa tải được tệp. Hãy tải lại hồ sơ.
                          </span>
                        )}
                        {evidence.isSuccess &&
                          !evidence.data.items.some(
                            (entry) => entry.status === "Ready",
                          ) && <span>Chưa có tệp tải xong trong hồ sơ.</span>}
                      </label>
                    )}
                  </>
                )
              }
              dirty={note.length > 0 || evidenceId !== ""}
              validate={() =>
                (selected === "Settle" || note.trim().length >= 5) &&
                (!useEvidence || Boolean(evidenceId))
              }
              submitLabel={active.label}
              confirmTitle={active.label + "?"}
              confirmBody={
                <p>
                  {active.effect} {note}
                </p>
              }
              build={() => ({
                path: "/operations/exchanges/" + item.id + "/return-resolution",
                body: {
                  expectedVersion: item.revision,
                  action: selected,
                  ...(note ? { note: note.trim() } : {}),
                  ...(evidenceId ? { evidenceId } : {}),
                },
              })}
              schema={exchangeDisputeResolution}
              interpret={(updated) => {
                if (
                  updated.id !== item.id ||
                  (selected === "VerifyOutboundDelivery"
                    ? !updated.outboundDeliveryVerification ||
                      !updated.canStartReturnResolution
                    : !updated.returnResolution)
                ) {
                  throw new Error("Chưa xác minh được kết quả của đúng hồ sơ.");
                }
                return {
                  tone: "success",
                  text:
                    selected === "VerifyOutboundDelivery"
                      ? "Đã xác minh giao sách. Có thể yêu cầu hai bên bổ sung bằng chứng."
                      : "Đã ghi nhận thao tác. Hồ sơ đã được cập nhật.",
                  close: true,
                };
              }}
              reconcile={reload}
              onPending={reportPending}
              onFinish={(outcome) => {
                setSelected(undefined);
                setNote("");
                setEvidenceId("");
                onFinish(outcome);
              }}
            />
          )}
        </>
      )}
    </section>
  );
}

export function ExchangeDisputeDetailPage() {
  const user = useOutletContext<CurrentUser>();
  return canReview(user) ? (
    <ExchangeDisputeDetailContent user={user} />
  ) : (
    <Forbidden />
  );
}

function ExchangeDisputeDetailContent({ user }: { user: CurrentUser }) {
  const { id } = useParams<{ id: string }>();
  const { search } = useLocation();
  const [outcome, setOutcome] = useState<Omit<Outcome, "close">>();
  const [pending, setPending] = useState(false);
  const result = useQuery({
    queryKey: ["operations", "exchange-dispute", user.id, id],
    queryFn: () =>
      session.request(
        "/operations/exchanges/" + id + "/dispute",
        exchangeDisputeResolution,
      ),
    refetchInterval: 15000,
  });
  const item =
    !result.isError && result.data?.id === id ? result.data : undefined;
  const retained = result.data?.id === id ? result.data : undefined;
  return (
    <div className={styles.page}>
      <Link to={{ pathname: queuePath, search }} className={styles.backLink}>
        <ArrowLeft size={17} aria-hidden="true" /> Danh sách khiếu nại
      </Link>
      <header className={styles.heading}>
        <div className="page-heading">
          <h1>
            {item
              ? disputeParty(item, "initiator").name +
                " ↔ " +
                disputeParty(item, "recipient").name
              : "Hồ sơ khiếu nại trao đổi"}
          </h1>
          {item && (
            <div className={styles.identity}>
              <strong>Hồ sơ {exchangeCode(item)}</strong>
              <span className={styles.stage}>{disputeStatus(item)}</span>
            </div>
          )}
        </div>
        <Button
          busy={result.isFetching}
          disabled={pending}
          onClick={() => void result.refetch()}
        >
          {!result.isFetching && <RefreshCw size={16} aria-hidden="true" />}
          Tải lại hồ sơ
        </Button>
      </header>
      {outcome && <Notice tone={outcome.tone}>{outcome.text}</Notice>}
      {result.isPending && <p role="status">Đang tải hồ sơ…</p>}
      {result.isError && (
        <ErrorNotice
          error={result.error}
          retry={() => void result.refetch()}
          busy={result.isFetching || pending}
        />
      )}
      <div className={styles.detailGrid}>
        {item && (
          <div className={styles.column}>
            <ShipmentOverview item={item} viewerId={user.id} />
            <section className={styles.card}>
              <h2>Nội dung báo sự cố</h2>
              {item.disputedAt && (
                <time className={styles.muted} dateTime={item.disputedAt}>
                  Mở lúc {dateText(item.disputedAt)}
                </time>
              )}
              <p className={styles.prose}>
                {item.disputeReason || "Chưa có nội dung báo sự cố."}
              </p>
            </section>
            {(item.returnResolution || item.status === "ResolutionPending") && (
              <section
                className={styles.card}
                aria-labelledby="dispute-materials-title"
              >
                <h2 id="dispute-materials-title">Giải trình và bằng chứng</h2>
                {item.returnResolution && (
                  <DisputeStatements item={item} viewerId={user.id} />
                )}
                {item.status === "ResolutionPending" && (
                  <ExchangeEvidenceReview
                    embedded
                    id={item.id}
                    userId={user.id}
                    onAssignment={() => result.refetch()}
                  />
                )}
              </section>
            )}
          </div>
        )}
        <div className={styles.column}>
          {item?.returnResolution && (
            <ReturnOverview resolution={item.returnResolution} />
          )}
          {item?.status === "ResolutionPending" &&
            !item.canStartReturnResolution && (
              <Notice tone="info">
                {item.canVerifyOutboundDelivery
                  ? "Tiền và sách đang được giữ. Admin phụ trách có thể xác minh giao sách từ bằng chứng bàn giao."
                  : "Hồ sơ tiếp tục giữ tiền và sách trong lúc đối chiếu. Chưa đủ điều kiện chạy quy trình trả sách một chiều."}
              </Notice>
            )}
          {retained &&
            (pending ||
              (item?.status === "ResolutionPending" &&
                (item.canStartReturnResolution ||
                  (item.canVerifyOutboundDelivery &&
                    user.roles.includes("ADMIN"))))) && (
              <OperationsReturnActions
                item={retained}
                user={user}
                reload={() => result.refetch()}
                onFinish={setOutcome}
                onPending={setPending}
              />
            )}
          {item && <PaymentOverview item={item} />}
        </div>
      </div>
    </div>
  );
}

function disputeParty(
  item: ExchangeDisputeItem,
  side: "initiator" | "recipient",
) {
  const initiating = side === "initiator";
  const profile = item.participants?.[side];
  const books = initiating
    ? item.agreement?.initiatorBooks
    : item.agreement && [item.agreement.recipientBook];
  const role = initiating ? "Bên khởi tạo" : "Bên nhận đề xuất";
  return {
    id: initiating ? item.initiatorId : item.recipientId,
    name:
      profile?.displayName.trim() ||
      books?.[0]?.ownerDisplayName.trim() ||
      role,
    avatarId: profile?.avatarId,
    role,
    side,
    books: books?.map(({ book }) => book.title) ?? [],
    snapshots: books ?? [],
  };
}

function QueueBooks({ books }: { books: string[] }) {
  if (!books.length) return null;
  return (
    <div className={styles.partyBook}>
      <BookOpen size={14} aria-hidden="true" />
      <span>{books[0]}</span>
      {books.length > 1 && (
        <strong className={styles.bookCount}>+{books.length - 1} cuốn</strong>
      )}
    </div>
  );
}

function ParticipantAvatar({
  person,
  viewerId,
}: {
  person: ReturnType<typeof disputeParty>;
  viewerId: string;
}) {
  const avatar = useQuery({
    queryKey: [
      "operations",
      "user-avatar",
      viewerId,
      person.id,
      person.avatarId,
    ],
    enabled: Boolean(person.avatarId),
    queryFn: () =>
      session.request(
        "/operations/users/" + person.id + "/avatar/read",
        profileAvatarReadSchema,
      ),
    retry: false,
    staleTime: 60_000,
  });
  const url = avatar.isSuccess ? avatar.data.url : undefined;
  const [failedUrl, setFailedUrl] = useState<string>();
  return (
    <span className={styles.avatar} data-side={person.side} aria-hidden="true">
      {person.name.slice(0, 1).toLocaleUpperCase("vi")}
      {url && url !== failedUrl && (
        <img
          src={url}
          alt=""
          loading="lazy"
          onError={() => setFailedUrl(url)}
        />
      )}
    </span>
  );
}

function DisputeStatements({
  item,
  viewerId,
}: {
  item: ExchangeDisputeItem;
  viewerId: string;
}) {
  const statements = item.statements;
  return (
    <section aria-labelledby="dispute-statements-title">
      <h3 className={styles.materialTitle} id="dispute-statements-title">
        <FileText size={20} aria-hidden="true" /> Giải trình của hai bên
      </h3>
      {statements === undefined ? (
        <p className={styles.muted}>
          Nhận phụ trách bằng chứng để xem nội dung giải trình.
        </p>
      ) : statements.length === 0 ? (
        <p className={styles.muted}>Hai bên chưa gửi giải trình.</p>
      ) : (
        <ol className={styles.statements}>
          {statements.map(({ id, senderId, note, sentAt }) => {
            const person = disputeParty(
              item,
              senderId === item.initiatorId ? "initiator" : "recipient",
            );
            return (
              <li key={id}>
                <div className={styles.statementAuthor}>
                  <ParticipantAvatar person={person} viewerId={viewerId} />
                  <div>
                    <strong>{person.name}</strong>
                    <small>{person.role}</small>
                  </div>
                  <time dateTime={sentAt}>{dateText(sentAt)}</time>
                </div>
                <p className={styles.prose}>{note}</p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function DisputeBookImage({
  listingId,
  mediaId,
  viewerId,
}: {
  listingId: string;
  mediaId: string;
  viewerId: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const photo = useQuery({
    queryKey: [
      "operations",
      "dispute-book-image",
      viewerId,
      listingId,
      mediaId,
    ],
    queryFn: () =>
      session.request(
        "/operations/listings/" + listingId + "/media/" + mediaId + "/read",
        mediaRead,
      ),
    retry: false,
    staleTime: (query) =>
      signedMediaStaleTime(
        query.state.data?.expiresAt,
        query.state.dataUpdatedAt,
      ),
    gcTime: PUBLIC_MEDIA_GC_MS,
  });
  const url = photo.data?.url;
  return (
    <span className={styles.bookImage} aria-hidden="true">
      {url && failedUrl !== url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <BookOpen size={18} />
      )}
    </span>
  );
}

function ShipmentOverview({
  item,
  viewerId,
}: {
  item: ExchangeDisputeItem;
  viewerId: string;
}) {
  const verified = item.outboundDeliveryVerification;
  const initiator = disputeParty(item, "initiator");
  const recipient = disputeParty(item, "recipient");
  const shipments = [
    {
      from: initiator,
      to: recipient,
      shipped: item.initiatorShippedAt,
      received: item.recipientReceivedAt,
      verified: verified && !item.recipientShippedAt,
    },
    {
      from: recipient,
      to: initiator,
      shipped: item.recipientShippedAt,
      received: item.initiatorReceivedAt,
      verified: verified && !item.initiatorShippedAt,
    },
  ];
  return (
    <section className={styles.card} aria-labelledby="shipment-overview-title">
      <h2 id="shipment-overview-title">
        <Truck size={20} aria-hidden="true" /> Hai chiều giao sách
      </h2>
      <ol className={styles.shipments}>
        {shipments.map(
          ({ from, to, shipped, received, verified: deliveryVerified }) => {
            const delivered = Boolean(received || deliveryVerified);
            const tone = delivered
              ? "delivered"
              : shipped
                ? "waiting"
                : "unsent";
            const StatusIcon = delivered ? Check : shipped ? Clock3 : Package;
            return (
              <li key={from.id} className={styles.lane}>
                <div
                  className={styles.route}
                  aria-label={from.name + " gửi cho " + to.name}
                >
                  <div className={styles.person}>
                    <ParticipantAvatar person={from} viewerId={viewerId} />
                    <div>
                      <small>Người gửi</small>
                      <strong>{from.name}</strong>
                    </div>
                  </div>
                  <span className={styles.routeArrow}>
                    <ArrowRight size={18} aria-hidden="true" />
                  </span>
                  <div className={styles.person}>
                    <ParticipantAvatar person={to} viewerId={viewerId} />
                    <div>
                      <small>Người nhận</small>
                      <strong>{to.name}</strong>
                    </div>
                  </div>
                </div>
                {from.books.length > 0 && (
                  <div className={styles.laneBooks}>
                    <p>
                      <BookOpen size={16} aria-hidden="true" />{" "}
                      {from.books.length} cuốn sách
                    </p>
                    <ul aria-label="Sách gửi">
                      {from.snapshots.map(({ listingId, mediaIds, book }) => (
                        <li key={listingId}>
                          <DisputeBookImage
                            listingId={listingId}
                            mediaId={mediaIds[0]}
                            viewerId={viewerId}
                          />
                          <strong>{book.title}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className={styles.delivery}>
                  <span className={styles.deliveryStatus} data-tone={tone}>
                    <StatusIcon size={15} aria-hidden="true" />
                    {!shipped
                      ? "Chưa ghi nhận gửi"
                      : deliveryVerified
                        ? "Admin đã xác minh giao đến"
                        : received
                          ? "Đối tác đã xác nhận nhận"
                          : "Chưa xác minh giao đến"}
                  </span>
                  {(shipped || received) && (
                    <div className={styles.deliveryTimes}>
                      {shipped && (
                        <time dateTime={shipped}>
                          Gửi lúc {dateText(shipped)}
                        </time>
                      )}
                      {received && (
                        <time dateTime={received}>
                          Nhận lúc {dateText(received)}
                        </time>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          },
        )}
      </ol>
      {verified && (
        <div className={styles.verified}>
          <div className={styles.verifiedHeader}>
            <CheckCircle2
              size={16}
              className={styles.verifiedIcon}
              aria-hidden="true"
            />
            <strong>Đã xác minh lúc {dateText(verified.verifiedAt)}</strong>
          </div>
          <p className={styles.prose}>{verified.note}</p>
        </div>
      )}
    </section>
  );
}

function PaymentOverview({ item }: { item: ExchangeDisputeItem }) {
  const funded = Boolean(item.initiatorFundedAt && item.recipientFundedAt);
  const diffPayer =
    item.diffPayerId === item.initiatorId
      ? "Bên khởi tạo"
      : item.diffPayerId === item.recipientId
        ? "Bên nhận đề xuất"
        : undefined;
  return (
    <section className={styles.card}>
      <h2>
        <Wallet size={20} aria-hidden="true" /> Đối chiếu khoản tiền
      </h2>
      <dl className={styles.facts}>
        <div>
          <dt>Cọc bên khởi tạo</dt>
          <dd>{money(item.initiatorDeposit)}</dd>
        </div>
        <div>
          <dt>Cọc bên nhận đề xuất</dt>
          <dd>{money(item.recipientDeposit)}</dd>
        </div>
        <div>
          <dt>
            Tiền bù
            {item.diffAmount > 0 && diffPayer && <small>{diffPayer}</small>}
          </dt>
          <dd>{money(item.diffAmount)}</dd>
        </div>
        {funded && item.status === "ResolutionPending" && (
          <div className={styles.total}>
            <dt>Đang giữ</dt>
            <dd>{money(totalDeposit(item))}</dd>
          </div>
        )}
      </dl>
      {!funded && item.status === "ResolutionPending" && (
        <p className={styles.muted}>Cần đối chiếu khoản giữ.</p>
      )}
    </section>
  );
}

function ReturnOverview({
  resolution: r,
}: {
  resolution: NonNullable<ExchangeDisputeItem["returnResolution"]>;
}) {
  return (
    <section className={styles.card} aria-label="Quyết định trả sách">
      <h2>{exchangeReturnPhase[r.phase]}</h2>
      {r.note && <p className={styles.prose}>{r.note}</p>}
      <dl className={styles.facts}>
        {r.evidenceDueAt && r.phase === "Evidence" && (
          <div>
            <dt>Hạn bổ sung bằng chứng</dt>
            <dd>{dateText(r.evidenceDueAt)}</dd>
          </div>
        )}
        {r.appealDueAt &&
          ["ReturnOrdered", "CompensationOrdered"].includes(r.phase) &&
          !r.effectiveAt && (
            <div>
              <dt>Hạn kháng nghị</dt>
              <dd>{dateText(r.appealDueAt)}</dd>
            </div>
          )}
        {r.returnDueAt && r.phase === "ReturnOrdered" && (
          <div>
            <dt>Hạn bàn giao sách hoàn</dt>
            <dd>{dateText(r.returnDueAt)}</dd>
          </div>
        )}
        {r.trackingCode && (
          <div>
            <dt>Mã vận đơn hoàn</dt>
            <dd>{r.trackingCode}</dd>
          </div>
        )}
        {r.checkDueAt && r.phase === "CheckingReturn" && (
          <div>
            <dt>Hạn kiểm tra sách hoàn</dt>
            <dd>{dateText(r.checkDueAt)}</dd>
          </div>
        )}
        {r.compensation > 0 && (
          <div>
            <dt>Bồi thường từ cọc bên giữ sách</dt>
            <dd>{money(r.compensation)}</dd>
          </div>
        )}
      </dl>
      {r.returnDueAt && r.phase === "ReturnOrdered" && (
        <p className={styles.muted}>
          Nếu có kháng nghị, hạn tính lại khi Admin giữ quyết định.
        </p>
      )}
      {r.compensation > 0 && (
        <p className={styles.muted}>Hoàn tiền bù cho người đã nộp.</p>
      )}
      {r.outcome && (
        <p>
          {r.outcome === "Returned"
            ? "Đã ghi nhận trả sách và hoàn tiền."
            : "Đã chi bồi thường và ghi nhận vi phạm không trả sách."}
        </p>
      )}
    </section>
  );
}
