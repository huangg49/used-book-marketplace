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
  UserCheck,
  Wallet,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  useLocation,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { z } from "zod";
import {
  ApiError,
  exchangeEvidenceAccessSchema,
  demoExchangeDeadlineLabel,
  exchangeEvidenceListSchema,
  profileAvatarReadSchema,
  PUBLIC_MEDIA_GC_MS,
  signedMediaStaleTime,
  exchangeReturnPhase,
  isExchangeReturnOverdue,
  type CurrentUser,
  type DemoExchangeDeadline,
  type ExchangeReturnAction,
} from "@used-books/session-client";
import { dateText, money } from "../../core/format";
import { errorText } from "../../core/errors";
import { canReview, session } from "../../core/session";
import { Button, ErrorNotice, Notice } from "../../core/ui";
import { PaperSelect } from "../../core/PaperSelect";
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
const STAFF_LIMIT = 300_000;
const assignReceiptSchema = z.object({ entityId: z.string(), state: z.string() });
const pageSize = 10;
const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("vi")
    .replaceAll("đ", "d")
    .trim();

function disputeStatus(item: ExchangeDisputeItem) {
  if (isExchangeReturnOverdue(item.returnResolution)) return "Quá hạn trả sách";
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
const needsAdminLimit = (item: ExchangeDisputeItem) =>
  totalDeposit(item) > STAFF_LIMIT &&
  Boolean(
    item.canStartReturnResolution ||
      item.returnResolution ||
      item.canVerifyOutboundDelivery,
  );

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
    refetchInterval: 6_000,
    refetchIntervalInBackground: false,
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
              // Publish the applied filter before pagination can read it.
              setParams(value ? { q: value } : {}, { flushSync: true });
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
            const isHighValue = needsAdminLimit(item);
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

function QuickAssignBox({
  id,
  userId,
  isAdmin,
  assigneeId,
  version,
  onAssigned,
}: {
  id: string;
  userId: string;
  isAdmin: boolean;
  assigneeId: string | null | undefined;
  version: number | undefined;
  onAssigned: () => Promise<unknown>;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState(
    "Tiếp nhận đối chiếu bằng chứng và xử lý hồ sơ khiếu nại.",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [intent, setIntent] = useState<
    | { key: string; body: { expectedVersion: number; reason: string } }
    | undefined
  >(undefined);

  const takenByOther = Boolean(assigneeId && assigneeId !== userId);
  const blockedForStaff = takenByOther && !isAdmin;

  async function handleAssign() {
    if (busy || version === undefined || blockedForStaff) return;
    setBusy(true);
    setError("");
    const command = intent ?? {
      key: crypto.randomUUID(),
      body: { expectedVersion: version, reason: reason.trim() },
    };
    setIntent(command);
    try {
      await session.request(
        `/operations/exchanges/${id}/evidence-access`,
        assignReceiptSchema,
        {
          method: "POST",
          headers: { "Idempotency-Key": command.key },
          body: JSON.stringify(command.body),
        },
      );
      setIntent(undefined);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["operations", "exchange-evidence-access", userId, id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["operations", "exchange-evidence", userId, id],
        }),
      ]);
      await onAssigned();
    } catch (e) {
      if (e instanceof ApiError && [400, 409, 422].includes(e.status)) {
        setIntent(undefined);
        await queryClient.invalidateQueries({
          queryKey: ["operations", "exchange-evidence-access", userId, id],
        });
      }
      setError(
        e instanceof Error
          ? e.message
          : "Chưa xác nhận tiếp nhận. Thử lại cùng yêu cầu.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.quickAssign}>
      <p>
        {takenByOther
          ? isAdmin
            ? "Hồ sơ đang được nhân sự khác phụ trách. Admin có thể nhận lại với lý do bên dưới."
            : "Hồ sơ đã có người phụ trách. Chỉ Admin có thể tiếp nhận lại."
          : "Nhận phụ trách ngay tại đây để mở khóa bằng chứng và ra phán quyết."}
      </p>
      {!blockedForStaff && (
        <>
          <label>
            Lý do tiếp nhận hồ sơ
            <input
              type="text"
              value={reason}
              disabled={busy || Boolean(intent)}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {error && <Notice tone="error">{error}</Notice>}
          <Button
            variant="primary"
            busy={busy}
            disabled={
              version === undefined || (!intent && reason.trim().length < 5)
            }
            onClick={() => void handleAssign()}
          >
            {!busy && <UserCheck size={16} aria-hidden="true" />}
            {intent ? "Thử lại tiếp nhận" : "Nhận phụ trách hồ sơ"}
          </Button>
        </>
      )}
    </div>
  );
}

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
  const returnOverdue = isExchangeReturnOverdue(r, now);
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
  if (admin && (returnOverdue || r?.phase === "ReturnIssue"))
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
        <QuickAssignBox
          id={item.id}
          userId={user.id}
          isAdmin={admin}
          assigneeId={access.data?.assigneeId}
          version={access.data?.version}
          onAssigned={async () => {
            await access.refetch();
            await reload();
          }}
        />
      )}
      {(assigned || pending) && (
        <>
          {returnOverdue && (
            <Notice tone="info">
              <strong>Quá hạn trả sách.</strong> Tiền vẫn được giữ. Admin phụ trách
              đối chiếu bằng chứng để quyết định bồi thường.
            </Notice>
          )}
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
                  <p>{demo.deadline === "Return"
                    ? "Chuyển hồ sơ sang Quá hạn trả sách. Sách và tiền vẫn được giữ để Admin xử lý tiếp."
                    : "Đóng thời hạn này để thử thao tác tiếp theo trên hồ sơ."}</p>
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
                    text: demo.deadline === "Return"
                      ? "Đã tua sang Quá hạn trả sách. Hồ sơ vẫn đang giữ tiền."
                      : "Đã tua hạn demo. Xem thao tác tiếp theo trên hồ sơ.",
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
              <PaperSelect
                label="Thao tác với hồ sơ"
                placeholder="Chọn thao tác"
                value={selected ?? ""}
                disabled={pending}
                options={(pending && selected ? [selected] : actions).map(
                  (action) => ({
                    value: action,
                    label: actionText[action]?.label ?? action,
                    hint: actionText[action]?.effect,
                  }),
                )}
                onChange={(nextValue) => {
                  const value = actions.find((action) => action === nextValue);
                  setSelected(value);
                  setNote("");
                  setEvidenceId("");
                }}
              />
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
                  <div className={styles.decisionFields}>
                    <label className={styles.fieldGroup}>
                      <span className={styles.fieldLabelRow}>
                        <span>
                          {selected === "VerifyOutboundDelivery"
                            ? "Căn cứ xác minh bàn giao"
                            : "Căn cứ hoặc yêu cầu gửi hai bên"}
                        </span>
                        <span
                          className={
                            note.trim().length >= 5
                              ? styles.charCountOk
                              : styles.charCount
                          }
                        >
                          {note.trim().length}/5+ ký tự
                        </span>
                      </span>
                      <textarea
                        value={note}
                        disabled={locked}
                        minLength={5}
                        maxLength={500}
                        rows={3}
                        placeholder="Nhập căn cứ đối chiếu hoặc yêu cầu cụ thể gửi tới hai bên..."
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </label>
                    {useEvidence && (
                      <div className={styles.fieldGroup}>
                        <PaperSelect
                          label="Tệp bằng chứng đã đối chiếu"
                          placeholder="Chọn tệp trong hồ sơ"
                          value={evidenceId}
                          disabled={locked || evidence.isError}
                          emptyText="Chưa có tệp tải xong trong hồ sơ."
                          options={(evidence.data?.items ?? [])
                            .filter((entry) => entry.status === "Ready")
                            .map((entry) => ({
                              value: entry.id,
                              label: entry.fileName,
                            }))}
                          onChange={(nextId) => setEvidenceId(nextId)}
                        />
                        {evidence.isError && (
                          <span className={styles.fieldAlert} role="alert">
                            Chưa tải được tệp. Hãy tải lại hồ sơ.
                          </span>
                        )}
                      </div>
                    )}
                  </div>
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

type ResolutionDecision =
  | "CompleteExchange"
  | "CompensateInitiator"
  | "CompensateRecipient";

function computeDamageSettlement(
  item: ExchangeDisputeItem,
  victimSide: "initiator" | "recipient",
  requestedDamage: number | undefined,
  bothReceived: boolean,
) {
  const victimIsInitiator = victimSide === "initiator";
  const ownerId = victimIsInitiator ? item.initiatorId : item.recipientId;
  const holderId = victimIsInitiator ? item.recipientId : item.initiatorId;
  const ownerDeposit = victimIsInitiator
    ? item.initiatorDeposit
    : item.recipientDeposit;
  const holderDeposit = victimIsInitiator
    ? item.recipientDeposit
    : item.initiatorDeposit;
  const initiatorBookValue = item.agreement
    ? item.agreement.initiatorBooks.reduce((sum, b) => sum + b.exchangeValue, 0)
    : item.recipientDeposit;
  const recipientBookValue = item.agreement
    ? item.agreement.recipientBook.exchangeValue
    : item.initiatorDeposit;
  const ownerBookValue = victimIsInitiator
    ? initiatorBookValue
    : recipientBookValue;
  const holderBookValue = victimIsInitiator
    ? recipientBookValue
    : initiatorBookValue;
  const diff = item.diffAmount;
  const diffPayerId = item.diffPayerId;
  const ownerLocked =
    ownerDeposit + (diffPayerId === ownerId && diff > 0 ? diff : 0);
  const holderLocked =
    holderDeposit + (diffPayerId === holderId && diff > 0 ? diff : 0);
  const maxDamage = Math.max(
    0,
    diffPayerId === ownerId && diff > 0
      ? Math.min(holderBookValue, diff + Math.min(ownerBookValue, holderLocked))
      : Math.min(holderBookValue, holderDeposit),
  );
  const fullComp = Math.min(ownerBookValue, holderLocked);
  const validPartial =
    bothReceived &&
    requestedDamage !== undefined &&
    Number.isInteger(requestedDamage) &&
    requestedDamage >= 1 &&
    requestedDamage < maxDamage;

  if (validPartial) {
    const d = requestedDamage!;
    if (diffPayerId === ownerId && diff > 0) {
      const diffToHolder = Math.max(0, diff - d);
      const compFromHolder = Math.max(0, d - diff);
      const ownerReceives = ownerLocked - diffToHolder + compFromHolder;
      const holderReceives = holderLocked - compFromHolder + diffToHolder;
      const diffRefundedToOwner = diff - diffToHolder;
      return {
        isPartial: true,
        maxDamage,
        applied: d,
        ownerReceives,
        holderReceives,
        ownerDetail:
          `Hoàn ${money(ownerDeposit)} cọc` +
          (diffRefundedToOwner > 0
            ? ` + hoàn ${money(diffRefundedToOwner)} tiền bù`
            : "") +
          (compFromHolder > 0
            ? ` + nhận ${money(compFromHolder)} từ cọc đối tác`
            : ""),
        holderDetail:
          `Hoàn ${money(holderDeposit - compFromHolder)} cọc` +
          (diffToHolder > 0
            ? ` + nhận ${money(diffToHolder)} tiền bù còn lại`
            : "") +
          ` · Đã khấu trừ ${money(d)} thiệt hại`,
      };
    }
    const holderToOwner = Math.min(
      holderLocked,
      (diffPayerId === holderId && diff > 0 ? diff : 0) + d,
    );
    const ownerReceives = ownerLocked + holderToOwner;
    const holderReceives = holderLocked - holderToOwner;
    return {
      isPartial: true,
      maxDamage,
      applied: d,
      ownerReceives,
      holderReceives,
      ownerDetail:
        `Hoàn ${money(ownerDeposit)} cọc` +
        (diffPayerId === holderId && diff > 0
          ? ` + nhận ${money(diff)} tiền bù`
          : "") +
        ` + nhận ${money(d)} khấu trừ thiệt hại`,
      holderDetail:
        `Khấu trừ ${money(d)} thiệt hại` +
        (diffPayerId === holderId && diff > 0
          ? ` + chuyển ${money(diff)} tiền bù`
          : "") +
        (holderReceives > 0 ? ` · Hoàn ${money(holderReceives)} phần dư` : ""),
    };
  }

  const ownerReceives = ownerLocked + fullComp;
  const holderReceives = holderLocked - fullComp;
  return {
    isPartial: false,
    maxDamage,
    applied: fullComp,
    ownerReceives,
    holderReceives,
    ownerDetail:
      `Hoàn ${money(ownerDeposit)} cọc + nhận ${money(fullComp)} bồi thường` +
      (diffPayerId === ownerId && diff > 0
        ? ` + hoàn ${money(diff)} tiền bù`
        : ""),
    holderDetail:
      `Trừ ${money(fullComp)} từ khoản ký quỹ để bồi thường` +
      (holderReceives > 0 ? ` · Hoàn ${money(holderReceives)} phần dư` : "") +
      " · Ghi nhận vi phạm · Đóng bài đăng",
  };
}

function InspectionDisputeActions({
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
  const key = ["operations", "exchange-evidence-access", user.id, item.id];
  const access = useQuery({
    queryKey: key,
    queryFn: () =>
      session.request(
        "/operations/exchanges/" + item.id + "/evidence-access",
        exchangeEvidenceAccessSchema,
      ),
  });
  const assigned = access.isSuccess && access.data.assigneeId === user.id;
  const isAdmin = user.roles.includes("ADMIN");

  const bothReceived = Boolean(
    item.initiatorShippedAt &&
      item.recipientShippedAt &&
      item.initiatorReceivedAt &&
      item.recipientReceivedAt,
  );

  const initiatorName =
    item.participants?.initiator?.displayName?.trim() || "Bên khởi tạo";
  const recipientName =
    item.participants?.recipient?.displayName?.trim() || "Bên nhận đề xuất";

  const isComplainantRecipient =
    item.disputedBy === item.recipientId || item.disputedBy === "Recipient";
  const isComplainantInitiator =
    item.disputedBy === item.initiatorId || item.disputedBy === "Initiator";

  const defaultDecision: ResolutionDecision = isComplainantRecipient
    ? "CompensateRecipient"
    : isComplainantInitiator
      ? "CompensateInitiator"
      : "CompleteExchange";

  const [decision, setDecision] = useState<ResolutionDecision>(defaultDecision);
  const [note, setNote] = useState("");

  const victimSide: "initiator" | "recipient" =
    decision === "CompensateInitiator" ? "initiator" : "recipient";
  const isCompensate =
    decision === "CompensateInitiator" || decision === "CompensateRecipient";

  const baseComp = computeDamageSettlement(
    item,
    victimSide,
    undefined,
    bothReceived,
  );
  const [damageInput, setDamageInput] = useState<string>(
    String(baseComp.maxDamage),
  );

  useEffect(() => {
    setDecision(defaultDecision);
  }, [item.id, defaultDecision]);

  useEffect(() => {
    setDamageInput(String(baseComp.maxDamage));
  }, [item.id, decision, baseComp.maxDamage]);

  const digits = damageInput.replace(/[^\d]/g, "");
  const parsedDamage = digits ? Number.parseInt(digits, 10) : NaN;
  const damageValid =
    !bothReceived ||
    !isCompensate ||
    baseComp.maxDamage <= 0 ||
    (Number.isInteger(parsedDamage) &&
      parsedDamage >= 1 &&
      parsedDamage <= baseComp.maxDamage);

  const compForRecipient = computeDamageSettlement(
    item,
    "recipient",
    decision === "CompensateRecipient" && damageValid
      ? parsedDamage
      : undefined,
    bothReceived,
  );
  const compForInitiator = computeDamageSettlement(
    item,
    "initiator",
    decision === "CompensateInitiator" && damageValid
      ? parsedDamage
      : undefined,
    bothReceived,
  );

  const initiatorDeposit = item.initiatorDeposit;
  const recipientDeposit = item.recipientDeposit;
  const diffAmount = item.diffAmount;
  const diffPayerIsInitiator = item.diffPayerId === item.initiatorId;
  const diffPayerIsRecipient = item.diffPayerId === item.recipientId;

  const faultySnapshots =
    victimSide === "recipient"
      ? (item.agreement?.initiatorBooks ?? [])
      : item.agreement
        ? [item.agreement.recipientBook]
        : [];

  const presets: { label: string; amount: number }[] = [];
  if (bothReceived && isCompensate && baseComp.maxDamage > 0) {
    const seen = new Set<number>();
    if (faultySnapshots.length > 1) {
      faultySnapshots.forEach((snap, idx) => {
        if (snap.exchangeValue >= 1 && snap.exchangeValue < baseComp.maxDamage && !seen.has(snap.exchangeValue)) {
          seen.add(snap.exchangeValue);
          const shortTitle =
            snap.book.title.length > 22
              ? snap.book.title.slice(0, 22) + "…"
              : snap.book.title;
          presets.push({
            label: `Cuốn ${idx + 1}: ${shortTitle} (${money(snap.exchangeValue)}) · Giữ sách`,
            amount: snap.exchangeValue,
          });
        }
      });
    } else {
      const quarter = Math.round(baseComp.maxDamage * 0.25);
      if (quarter >= 1 && quarter < baseComp.maxDamage && !seen.has(quarter)) {
        seen.add(quarter);
        presets.push({ label: `25% (${money(quarter)}) · Giữ sách`, amount: quarter });
      }
    }
    const half = Math.round(baseComp.maxDamage * 0.5);
    if (half >= 1 && half < baseComp.maxDamage && !seen.has(half)) {
      seen.add(half);
      presets.push({ label: `50% (${money(half)}) · Giữ sách`, amount: half });
    }
    presets.push({
      label: "Toàn phần · Yêu cầu trả sách",
      amount: baseComp.maxDamage,
    });
  }

  const decisionMeta: Record<
    ResolutionDecision,
    {
      label: string;
      ruling: string;
      confirmTitle: string;
      bookDisposition: string;
      party1: {
        name: string;
        role: string;
        amount: string;
        isPositive: boolean;
        detail: string;
      };
      party2: {
        name: string;
        role: string;
        amount: string;
        isPositive: boolean;
        detail: string;
      };
      footerText: string;
    }
  > = {
    CompensateRecipient: {
      label: compForRecipient.isPartial
        ? `1. Khấu trừ ${money(compForRecipient.applied)} cho ${recipientName} (Hai bên giữ sách)`
        : `1. Yêu cầu trả sách cho ${recipientName}`,
      ruling: compForRecipient.isPartial
        ? `Xác định thiệt hại một phần trên sách do ${initiatorName} gửi (${money(compForRecipient.applied)}). Hai bên giữ sách đã nhận và hoàn tất trao đổi.`
        : `Xác định sách do ${initiatorName} gửi không đạt thỏa thuận. Người giữ phải trả sách cho ${recipientName}.`,
      confirmTitle: compForRecipient.isPartial
        ? `Xác nhận khấu trừ ${money(compForRecipient.applied)} cho ${recipientName}?`
        : `Xác nhận yêu cầu trả sách cho ${recipientName}?`,
      bookDisposition: compForRecipient.isPartial
        ? `Hai bên giữ sách đã nhận. Bên vi phạm (${initiatorName}) bồi thường thiệt hại ${money(compForRecipient.applied)} cho bên bị hại (${recipientName}) để bù đắp chênh lệch. Giao dịch đóng ở trạng thái Hoàn tất.`
        : `${initiatorName} phải gửi trả sách của ${recipientName} (luồng trả sách 1 chiều về bên bị hại). Khi trả sách nguyên vẹn, ${initiatorName} vẫn được hoàn đủ 100% tiền đã khóa; chỉ khấu trừ bồi thường nếu không trả hoặc sách hư hại.`,
      party1: {
        name: recipientName,
        role: compForRecipient.isPartial
          ? "Bên bị hại · Nhận khấu trừ thiệt hại"
          : "Bên bị hại · Nhận bồi thường",
        amount: `+${money(compForRecipient.ownerReceives)}`,
        isPositive: true,
        detail: compForRecipient.ownerDetail,
      },
      party2: {
        name: initiatorName,
        role: compForRecipient.isPartial
          ? "Bên chịu khấu trừ · Hoàn tất"
          : "Bên chịu bồi thường",
        amount:
          compForRecipient.holderReceives > 0
            ? `+${money(compForRecipient.holderReceives)}`
            : money(0),
        isPositive: compForRecipient.holderReceives > 0,
        detail: compForRecipient.holderDetail,
      },
      footerText: compForRecipient.isPartial
        ? `Két ký quỹ giải ngân ${money(totalDeposit(item))} · Phiếu chuyển sang Hoàn tất`
        : `Két ký quỹ giải ngân ${money(totalDeposit(item))} · Phiếu hủy & đóng bài đăng`,
    },
    CompleteExchange: {
      label: "2. Bác khiếu nại (Hoàn tất trao đổi, hoàn 100% cọc) (Hai bên giữ sách)",
      ruling:
        "Sách đúng mô tả ban đầu, khiếu nại không đủ cơ sở. Hoàn tất trao đổi bình thường.",
      confirmTitle: "Xác nhận bác khiếu nại & hoàn tất trao đổi?",
      bookDisposition:
        "Hai bên giữ sách đã nhận. Đơn khiếu nại bị bác do sách đúng cam kết ban đầu. Cả hai bên nhận lại 100% tiền cọc về ví và giao dịch hoàn tất thành công.",
      party1: {
        name: initiatorName,
        role: "Bên khởi tạo · Hoàn tất",
        amount: `+${money(initiatorDeposit + (diffPayerIsRecipient && diffAmount > 0 ? diffAmount : 0))}`,
        isPositive: true,
        detail: `Hoàn 100% cọc (${money(initiatorDeposit)})${diffPayerIsRecipient && diffAmount > 0 ? ` + nhận ${money(diffAmount)} tiền bù` : ""}`,
      },
      party2: {
        name: recipientName,
        role: "Bên nhận đề xuất · Hoàn tất",
        amount: `+${money(recipientDeposit + (diffPayerIsInitiator && diffAmount > 0 ? diffAmount : 0))}`,
        isPositive: true,
        detail: `Hoàn 100% cọc (${money(recipientDeposit)})${diffPayerIsInitiator && diffAmount > 0 ? ` + nhận ${money(diffAmount)} tiền bù` : ""}`,
      },
      footerText: "Cả hai bên đều nhận lại 100% tiền cọc về ví",
    },
    CompensateInitiator: {
      label: compForInitiator.isPartial
        ? `3. Khấu trừ ${money(compForInitiator.applied)} cho ${initiatorName} (Hai bên giữ sách)`
        : `3. Yêu cầu trả sách cho ${initiatorName}`,
      ruling: compForInitiator.isPartial
        ? `Xác định thiệt hại một phần trên sách do ${recipientName} gửi (${money(compForInitiator.applied)}). Hai bên giữ sách đã nhận và hoàn tất trao đổi.`
        : `Xác định sách do ${recipientName} gửi không đạt thỏa thuận. Người giữ phải trả sách cho ${initiatorName}.`,
      confirmTitle: compForInitiator.isPartial
        ? `Xác nhận khấu trừ ${money(compForInitiator.applied)} cho ${initiatorName}?`
        : `Xác nhận yêu cầu trả sách cho ${initiatorName}?`,
      bookDisposition: compForInitiator.isPartial
        ? `Hai bên giữ sách đã nhận. Bên vi phạm (${recipientName}) bồi thường thiệt hại ${money(compForInitiator.applied)} cho bên bị hại (${initiatorName}) để bù đắp chênh lệch. Giao dịch đóng ở trạng thái Hoàn tất.`
        : `${recipientName} phải gửi trả sách của ${initiatorName} (luồng trả sách 1 chiều về bên bị hại). Khi trả sách nguyên vẹn, ${recipientName} vẫn được hoàn đủ 100% tiền đã khóa; chỉ khấu trừ bồi thường nếu không trả hoặc sách hư hại.`,
      party1: {
        name: initiatorName,
        role: compForInitiator.isPartial
          ? "Bên bị hại · Nhận khấu trừ thiệt hại"
          : "Bên bị hại · Nhận bồi thường",
        amount: `+${money(compForInitiator.ownerReceives)}`,
        isPositive: true,
        detail: compForInitiator.ownerDetail,
      },
      party2: {
        name: recipientName,
        role: compForInitiator.isPartial
          ? "Bên chịu khấu trừ · Hoàn tất"
          : "Bên chịu bồi thường",
        amount:
          compForInitiator.holderReceives > 0
            ? `+${money(compForInitiator.holderReceives)}`
            : money(0),
        isPositive: compForInitiator.holderReceives > 0,
        detail: compForInitiator.holderDetail,
      },
      footerText: compForInitiator.isPartial
        ? `Két ký quỹ giải ngân ${money(totalDeposit(item))} · Phiếu chuyển sang Hoàn tất`
        : `Két ký quỹ giải ngân ${money(totalDeposit(item))} · Phiếu hủy & đóng bài đăng`,
    },
  };

  const active = decisionMeta[decision];
  const currentComp =
    decision === "CompensateRecipient" ? compForRecipient : compForInitiator;
  const startsReturn = isCompensate && !currentComp.isPartial;

  if (!bothReceived) {
    return (
      <section
        aria-label="Phán quyết sự cố vận chuyển / giao nhận"
        className={styles.nextStep}
      >
        <h2>Phán quyết sự cố vận chuyển / giao nhận</h2>
        <Notice tone="info">
          {item.canVerifyOutboundDelivery
            ? "Tiền và sách đang được giữ. Admin phụ trách có thể xác minh giao sách từ bằng chứng bàn giao để mở quy trình trả sách một chiều."
            : "Phán quyết trực tiếp chỉ khả dụng sau khi cả hai bên đã xác nhận nhận sách (kiểm tra sách hai chiều). Hồ sơ hiện tiếp tục giữ tiền và sách trong lúc đối chiếu hoặc chờ quy trình trả sách một chiều."}
        </Notice>
      </section>
    );
  }

  return (
    <section
      aria-label="Phán quyết khiếu nại kiểm tra sách"
      className={styles.nextStep}
    >
      <h2>Phán quyết khiếu nại kiểm tra sách</h2>
      {!assigned ? (
        <QuickAssignBox
          id={item.id}
          userId={user.id}
          isAdmin={isAdmin}
          assigneeId={access.data?.assigneeId}
          version={access.data?.version}
          onAssigned={async () => {
            await access.refetch();
            await reload();
          }}
        />
      ) : (
        <ActionPanel
          label="Phán quyết"
          title={active.label}
          intro={active.ruling}
          fields={(locked) => (
            <div className={styles.decisionFields}>
              <PaperSelect
                label="Phương án phán quyết"
                value={decision}
                disabled={locked}
                options={[
                  {
                    value: "CompensateRecipient",
                    label: decisionMeta.CompensateRecipient.label,
                    hint: decisionMeta.CompensateRecipient.ruling,
                  },
                  {
                    value: "CompleteExchange",
                    label: decisionMeta.CompleteExchange.label,
                    hint: decisionMeta.CompleteExchange.ruling,
                  },
                  {
                    value: "CompensateInitiator",
                    label: decisionMeta.CompensateInitiator.label,
                    hint: decisionMeta.CompensateInitiator.ruling,
                  },
                ]}
                onChange={(nextValue) =>
                  setDecision(nextValue as ResolutionDecision)
                }
              />

              {bothReceived && isCompensate && baseComp.maxDamage > 0 && (
                <div className={styles.damageBox}>
                  <div className={styles.damageBoxHead}>
                    <strong>Mức khấu trừ thiệt hại</strong>
                    <span
                      className={styles.damageModeBadge}
                      data-mode={currentComp.isPartial ? "partial" : "full"}
                    >
                      {currentComp.isPartial
                        ? "Khấu trừ từng phần · Hoàn tất trao đổi"
                        : "Toàn phần · Yêu cầu trả sách"}
                    </span>
                  </div>

                  {presets.length > 0 && (
                    <div
                      className={styles.damagePresets}
                      role="group"
                      aria-label="Chọn nhanh mức khấu trừ"
                    >
                      {presets.map((preset) => {
                        const isActive = parsedDamage === preset.amount;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            disabled={locked}
                            className={
                              isActive
                                ? `${styles.damagePresetBtn} ${styles.damagePresetActive}`
                                : styles.damagePresetBtn
                            }
                            onClick={() =>
                              setDamageInput(String(preset.amount))
                            }
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className={styles.damageInputRow}>
                    <label>
                      Số tiền khấu trừ (tối đa {money(baseComp.maxDamage)})
                      <div className={styles.currencyInputWrap}>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={baseComp.maxDamage}
                          step={1000}
                          disabled={locked}
                          value={damageInput}
                          onChange={(e) => setDamageInput(e.target.value)}
                        />
                        <span className={styles.currencySuffix} aria-hidden="true">
                          đ
                        </span>
                      </div>
                    </label>
                  </div>

                  {!damageValid ? (
                    <p className={styles.damageHintAlert} role="alert">
                      Nhập số tiền nguyên từ 1đ đến {money(baseComp.maxDamage)}.
                    </p>
                  ) : (
                    <p className={styles.damageHint}>
                      {currentComp.isPartial
                        ? `Khấu trừ ${money(parsedDamage)} dưới mức tối đa (${money(baseComp.maxDamage)}): hai bên giữ sách đã nhận, giao dịch đóng ở trạng thái Hoàn tất.`
                        : "Mức tối đa mở quy trình trả sách 1 chiều về cho bên bị hại (chỉ nên dùng khi sách lỗi nặng / không thể đọc; bên trả lại sách nguyên vẹn vẫn được hoàn đủ 100% tiền đã khóa). Nếu sách chỉ lỗi nhẹ và vẫn đọc tốt, hãy chọn mức khấu trừ nhỏ hơn để hai bên giữ sách."}
                    </p>
                  )}
                </div>
              )}

              <div className={styles.bookDispositionBox}>
                <div className={styles.bookDispositionHead}>
                  <BookOpen size={15} aria-hidden="true" />
                  <span>Xử lý sách vật lý</span>
                </div>
                <p className={styles.bookDispositionText}>
                  {active.bookDisposition}
                </p>
              </div>

              {startsReturn ? (
                <div className={styles.escrowHoldBanner}>
                  <Wallet size={15} aria-hidden="true" />
                  <span>
                    Đang giữ <strong>{money(totalDeposit(item))}</strong> trong ký quỹ đến khi xử lý xong.
                  </span>
                </div>
              ) : (
                <div className={styles.settlementCard}>
                  <div className={styles.settlementHeader}>
                    <span>Dòng tiền sau phán quyết</span>
                    <span>Sổ cái</span>
                  </div>
                  <div className={styles.settlementPartyBlock}>
                    <div className={styles.settlementPartyRow}>
                      <div className={styles.settlementPartyName}>
                        <span>{active.party1.name}</span>
                        <span className={styles.settlementPartyRole}>
                          ({active.party1.role})
                        </span>
                      </div>
                      <div
                        className={
                          active.party1.isPositive
                            ? styles.settlementAmountPositive
                            : styles.settlementAmountNegative
                        }
                      >
                        {active.party1.amount}
                      </div>
                    </div>
                    <div className={styles.settlementPartyDetail}>
                      {active.party1.detail}
                    </div>
                  </div>

                  <hr className={styles.settlementDivider} />

                  <div className={styles.settlementPartyBlock}>
                    <div className={styles.settlementPartyRow}>
                      <div className={styles.settlementPartyName}>
                        <span>{active.party2.name}</span>
                        <span className={styles.settlementPartyRole}>
                          ({active.party2.role})
                        </span>
                      </div>
                      <div
                        className={
                          active.party2.isPositive
                            ? styles.settlementAmountPositive
                            : styles.settlementAmountNeutral
                        }
                      >
                        {active.party2.amount}
                      </div>
                    </div>
                    <div className={styles.settlementPartyDetail}>
                      {active.party2.detail}
                    </div>
                  </div>

                  <div className={styles.settlementFooter}>
                    <span>{active.footerText}</span>
                  </div>
                </div>
              )}

              <label className={styles.fieldGroup}>
                <span className={styles.fieldLabelRow}>
                  <span>Lý do phán quyết</span>
                  <span
                    className={
                      note.trim().length >= 10
                        ? styles.charCountOk
                        : styles.charCount
                    }
                  >
                    {note.trim().length}/10+ ký tự
                  </span>
                </span>
                <textarea
                  value={note}
                  disabled={locked}
                  minLength={10}
                  maxLength={500}
                  rows={3}
                  placeholder="Ví dụ: Đối chiếu video đóng gói của bên gửi và ảnh nhận hàng, xác nhận 1 cuốn bị rách gáy trước khi giao..."
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
            </div>
          )}
          dirty={note.trim().length > 0}
          validate={() => note.trim().length >= 10 && damageValid}
          submitLabel="Xác nhận phán quyết"
          confirmTitle={active.confirmTitle}
          confirmBody={
            <div>
              <p>
                <strong>Phán quyết:</strong> {active.ruling}
              </p>
              {startsReturn ? (
                <p>Hai bên có 48 giờ để kháng nghị. Tiền vẫn nằm trong ký quỹ trong thời gian trả sách.</p>
              ) : <div className={styles.settlementCard}>
                <div className={styles.settlementPartyBlock}>
                  <div className={styles.settlementPartyRow}>
                    <strong>{active.party1.name}</strong>
                    <span
                      className={
                        active.party1.isPositive
                          ? styles.settlementAmountPositive
                          : styles.settlementAmountNegative
                      }
                    >
                      {active.party1.amount}
                    </span>
                  </div>
                  <small className={styles.settlementPartyDetail}>
                    {active.party1.detail}
                  </small>
                </div>
                <hr className={styles.settlementDivider} />
                <div className={styles.settlementPartyBlock}>
                  <div className={styles.settlementPartyRow}>
                    <strong>{active.party2.name}</strong>
                    <span
                      className={
                        active.party2.isPositive
                          ? styles.settlementAmountPositive
                          : styles.settlementAmountNeutral
                      }
                    >
                      {active.party2.amount}
                    </span>
                  </div>
                  <small className={styles.settlementPartyDetail}>
                    {active.party2.detail}
                  </small>
                </div>
              </div>}
              <p>
                <strong>Lý do ghi nhận:</strong> {note}
              </p>
            </div>
          }
          build={() => ({
            path: `/operations/exchanges/${item.id}/resolve`,
            body: {
              expectedVersion: item.revision,
              decision,
              reason: note.trim(),
              ...(bothReceived &&
              isCompensate &&
              baseComp.maxDamage > 0 &&
              damageValid
                ? { compensationAmount: parsedDamage }
                : {}),
            },
          })}
          schema={exchangeDisputeResolution}
          interpret={(updated) => {
            if (updated.id !== item.id) {
              throw new Error("Chưa xác minh được kết quả của đúng hồ sơ.");
            }
            return {
              tone: "success",
              text:
                decision === "CompleteExchange"
                  ? "Đã bác khiếu nại và hoàn tất trao đổi thành công. Tiền cọc đã được tất toán về ví."
                  : currentComp.isPartial
                    ? `Đã khấu trừ thiệt hại ${money(currentComp.applied)} và hoàn tất trao đổi thành công.`
                    : "Đã mở quy trình trả sách. Hai bên có thể xem thời hạn trong phiếu; tiền vẫn được giữ.",
              close: true,
            };
          }}
          reconcile={reload}
          onPending={onPending}
          onFinish={(outcome) => {
            setNote("");
            onFinish(outcome);
          }}
        />
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
    refetchInterval: 6_000,
    refetchIntervalInBackground: false,
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
      {outcome && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
          <Notice tone={outcome.tone}>{outcome.text}</Notice>
          {item?.status !== "ResolutionPending" && <div>
            <Link
              to={{ pathname: queuePath, search }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.6rem 1.25rem",
                borderRadius: "8px",
                background: "var(--shop-wine, #5c1d24)",
                color: "#fff",
                textDecoration: "none",
                fontWeight: 600,
                fontSize: "0.925rem",
              }}
            >
              <ArrowLeft size={16} aria-hidden="true" /> Quay lại danh sách khiếu nại
            </Link>
          </div>}
        </div>
      )}
      {result.isPending && <p role="status">Đang tải hồ sơ…</p>}
      {result.isError && !outcome && (
        <ErrorNotice
          error={result.error}
          describe={(err) =>
            err instanceof ApiError && err.status === 404
              ? "Hồ sơ khiếu nại này đã được xử lý hoàn tất và đóng, hoặc không còn trong hàng đợi."
              : errorText(err)
          }
          retry={() => void result.refetch()}
          busy={result.isFetching || pending}
        />
      )}
      <div className={styles.detailGrid}>
        {item && (
          <div className={styles.column}>
            {(() => {
              const isRecipientComplainant =
                item.disputedBy === item.recipientId ||
                item.disputedBy === "Recipient";
              const isInitiatorComplainant =
                item.disputedBy === item.initiatorId ||
                item.disputedBy === "Initiator";
              const complainantParty = isRecipientComplainant
                ? disputeParty(item, "recipient")
                : isInitiatorComplainant
                  ? disputeParty(item, "initiator")
                  : null;
              const respondentParty = isRecipientComplainant
                ? disputeParty(item, "initiator")
                : isInitiatorComplainant
                  ? disputeParty(item, "recipient")
                  : null;
              const disputedSnapshots = respondentParty?.snapshots ?? [];

              const rawReason = item.disputeReason || "";
              const catMatch = rawReason.match(/\[Sự cố\]:\s*([^\n]+)/);
              const detailMatch = rawReason.match(/\[Chi tiết\]:\s*([\s\S]+)/);
              const category = catMatch?.[1]?.trim() || "Sách không đúng mô tả";
              const userNote =
                detailMatch?.[1]?.trim() || (!catMatch ? rawReason : "");

              return (
                <section
                  className={styles.card}
                  aria-label="Nội dung khiếu nại kiểm tra sách"
                >
                  <div className={styles.incidentHeader}>
                    <div className={styles.incidentTitleWrap}>
                      <ShieldAlert size={18} aria-hidden="true" />
                      <h2>Nội dung báo sự cố</h2>
                    </div>
                    <span className={styles.incidentTag}>{category}</span>
                  </div>

                  <div className={styles.incidentRelationship}>
                    <div className={styles.relationshipRow}>
                      <span className={styles.complainantDot} />
                      <strong>
                        {complainantParty ? complainantParty.name : "Người nhận"}
                      </strong>
                      <span className={styles.muted}>
                        khiếu nại về sách nhận từ
                      </span>
                      <strong>
                        {respondentParty ? respondentParty.name : "Người gửi"}
                      </strong>
                    </div>
                    {disputedSnapshots.length > 0 && (
                      <ul
                        className={styles.disputedBooksList}
                        aria-label="Sách thuộc chiều bị khiếu nại"
                      >
                        {disputedSnapshots.map((snap) => (
                          <li key={snap.listingId}>
                            <span className={styles.disputedBookName}>
                              <BookOpen size={14} aria-hidden="true" />
                              <strong>{snap.book.title}</strong>
                            </span>
                            <span className={styles.disputedBookValue}>
                              {money(snap.exchangeValue)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {item.disputedAt && (
                      <time className={styles.muted} dateTime={item.disputedAt}>
                        Mở khiếu nại lúc {dateText(item.disputedAt)}
                      </time>
                    )}
                  </div>

                  {userNote && (
                    <div className={styles.incidentQuoteBox}>
                      <div className={styles.incidentQuoteLabel}>
                        Nội dung phản ánh từ người gửi khiếu nại
                      </div>
                      <p className={styles.incidentQuoteText}>"{userNote}"</p>
                    </div>
                  )}
                </section>
              );
            })()}
            <ShipmentOverview item={item} viewerId={user.id} />
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
                    parties={{
                      initiatorId: item.initiatorId,
                      initiatorName: item.participants?.initiator?.displayName?.trim(),
                      recipientId: item.recipientId,
                      recipientName: item.participants?.recipient?.displayName?.trim(),
                    }}
                    onAssignment={() => result.refetch()}
                  />
                )}
              </section>
            )}
          </div>
        )}
        <div className={`${styles.column} ${styles.stickyColumn}`}>
          {item && <PaymentOverview item={item} />}
          {item?.returnResolution && (
            <ReturnOverview
              resolution={item.returnResolution}
              compensationAmount={item.resolutionCompensationAmount}
            />
          )}
          {retained &&
            (retained.returnResolution || retained.canStartReturnResolution ||
              (retained.canVerifyOutboundDelivery && user.roles.includes("ADMIN"))) &&
            (pending || item?.status === "ResolutionPending") && (
              <OperationsReturnActions
                item={retained}
                user={user}
                reload={() => result.refetch()}
                onFinish={setOutcome}
                onPending={setPending}
              />
            )}
          {item?.status === "ResolutionPending" &&
            !item.canStartReturnResolution &&
            !item.returnResolution &&
            !(item.canVerifyOutboundDelivery && user.roles.includes("ADMIN")) && (
              <InspectionDisputeActions
                item={item}
                user={user}
                reload={() => result.refetch()}
                onFinish={setOutcome}
                onPending={setPending}
              />
            )}
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
      shipment: item.initiatorShipment,
    },
    {
      from: recipient,
      to: initiator,
      shipped: item.recipientShippedAt,
      received: item.initiatorReceivedAt,
      verified: verified && !item.initiatorShippedAt,
      shipment: item.recipientShipment,
    },
  ];
  return (
    <section className={styles.card} aria-labelledby="shipment-overview-title">
      <h2 id="shipment-overview-title">
        <Truck size={20} aria-hidden="true" /> Hai chiều giao sách
      </h2>
      <ol className={styles.shipments}>
        {shipments.map(
          ({ from, to, shipped, received, verified: deliveryVerified, shipment }) => {
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
                {shipment && (shipment.packagingPhotoUrl || shipment.packagingVideoUrl || shipment.notes) && (
                  <div className={styles.packagingSection}>
                    <div className={styles.packagingHeader}>
                      <span>
                        <Package size={14} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />
                        Đóng gói lúc gửi
                      </span>
                      <small className={styles.muted}>{from.name}</small>
                    </div>
                    {shipment.notes && (
                      <p className={styles.packagingNote}>
                        💬 {shipment.notes}
                      </p>
                    )}
                    <div className={styles.packagingMediaRow}>
                      {shipment.packagingPhotoUrl && (
                        <a
                          href={shipment.packagingPhotoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.packagingMediaCard}
                          title={shipment.packagingPhotoName || "Xem ảnh đóng gói"}
                        >
                          <img
                            src={shipment.packagingPhotoUrl}
                            alt="Ảnh đóng gói"
                            className={styles.packagingMediaThumb}
                          />
                          <span className={styles.packagingBadge}>📷 Ảnh đóng gói</span>
                        </a>
                      )}
                      {shipment.packagingVideoUrl && (
                        <div className={styles.packagingMediaCard}>
                          <video
                            src={shipment.packagingVideoUrl}
                            controls
                            preload="metadata"
                            className={styles.packagingMediaVideo}
                          />
                          <span className={styles.packagingBadge}>🎥 Video</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
  const isHighValue = needsAdminLimit(item);
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
      {isHighValue && (
        <span className={styles.adminRequiredBadge}>
          <ShieldAlert size={13} aria-hidden="true" /> Vượt 300.000đ · Thẩm
          quyền Admin
        </span>
      )}
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
  compensationAmount,
}: {
  resolution: NonNullable<ExchangeDisputeItem["returnResolution"]>;
  compensationAmount?: number | null;
}) {
  const displayedComp = compensationAmount ?? r.compensation;
  const returnOverdue = isExchangeReturnOverdue(r);
  return (
    <section className={styles.card} aria-label="Quyết định trả sách">
      <h2>{returnOverdue ? "Quá hạn trả sách" : exchangeReturnPhase[r.phase]}</h2>
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
        {displayedComp > 0 && (
          <div>
            <dt>Khấu trừ / bồi thường</dt>
            <dd>{money(displayedComp)}</dd>
          </div>
        )}
      </dl>
      {r.returnDueAt && r.phase === "ReturnOrdered" && !returnOverdue && (
        <p className={styles.muted}>
          Nếu có kháng nghị, hạn tính lại khi Admin giữ quyết định.
        </p>
      )}
      {displayedComp > 0 && (
        <p className={styles.muted}>
          Phần tiền ký quỹ còn dư (nếu có) sau khi trừ bồi thường sẽ được hoàn lại ví bên giữ sách.
        </p>
      )}
      {r.outcome && (
        <p>
          {r.outcome === "Returned"
            ? "Đã ghi nhận trả sách và hoàn tiền."
            : "Đã tất toán khấu trừ/bồi thường theo phán quyết."}
        </p>
      )}
    </section>
  );
}
