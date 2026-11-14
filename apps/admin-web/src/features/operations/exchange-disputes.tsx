import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, RefreshCw, Truck, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useOutletContext, useParams } from "react-router-dom";
import {
  exchangeEvidenceAccessSchema,
  demoExchangeDeadlineLabel,
  exchangeEvidenceListSchema,
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
  const list = useRef<HTMLOListElement>(null);
  useListMotion(
    list,
    rows?.map((item) => item.id + ":" + item.revision).join("|") ?? "",
  );

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
      <section className={styles.queue} aria-labelledby="exchange-queue-title">
        <header className={styles.queueHeader}>
          <div>
            <h2 id="exchange-queue-title">Hồ sơ chờ xử lý</h2>
            <p>Giữ tiền và sách trong lúc đối chiếu.</p>
          </div>
          {rows && (
            <p className={styles.queueCount}>
              {rows.length} hồ sơ · Mới nhất trước
            </p>
          )}
        </header>
        <ListFeedback result={result} loadingText="Đang tải hồ sơ…" />
        {result.isSuccess && !rows?.length && (
          <div className="empty">
            <EmptyArt variant="inbox" />
            <h3>Chưa có khiếu nại nào.</h3>
            <p>Chưa có giao dịch chờ xử lý trong danh sách bạn được xem.</p>
          </div>
        )}
        <ol className={styles.queueList} ref={list}>
          {rows?.map((item) => (
            <li
              className={styles.queueRow}
              key={item.id}
              data-motion-key={item.id}
              data-motion-revision={item.revision}
            >
              <div className={styles.queueCase}>
                <h3>Trao đổi {exchangeCode(item)}</h3>
                <p>{item.disputeReason || "Chưa có nội dung báo sự cố."}</p>
              </div>
              <div className={styles.queueFacts}>
                <span className={styles.stage}>{disputeStatus(item)}</span>
                {item.disputedAt && (
                  <time dateTime={item.disputedAt}>
                    Mở lúc {dateText(item.disputedAt)}
                  </time>
                )}
                <span>
                  {item.initiatorFundedAt && item.recipientFundedAt ? (
                    <>
                      Đang giữ <strong>{money(totalDeposit(item))}</strong>
                    </>
                  ) : (
                    "Cần đối chiếu khoản giữ"
                  )}
                </span>
              </div>
              <Link className={styles.caseLink} to={queuePath + "/" + item.id}>
                Mở hồ sơ <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ol>
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
      <Link to={queuePath} className={styles.backLink}>
        <ArrowLeft size={17} aria-hidden="true" /> Danh sách khiếu nại
      </Link>
      <header className={styles.heading}>
        <div className="page-heading">
          <h1>Hồ sơ khiếu nại trao đổi</h1>
          {item && (
            <div className={styles.identity}>
              <strong>Trao đổi {exchangeCode(item)}</strong>
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
            <ShipmentOverview item={item} />
            {item.status === "ResolutionPending" && (
              <ExchangeEvidenceReview
                id={item.id}
                userId={user.id}
                onAssignment={() => result.refetch()}
              />
            )}
          </div>
        )}
        <div className={styles.column}>
          {item && <PaymentOverview item={item} />}
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
        </div>
      </div>
    </div>
  );
}

function ShipmentOverview({ item }: { item: ExchangeDisputeItem }) {
  const verified = item.outboundDeliveryVerification;
  const shipments = [
    {
      from: "Bên khởi tạo",
      to: "Bên nhận đề xuất",
      shipped: item.initiatorShippedAt,
      received: item.recipientReceivedAt,
    },
    {
      from: "Bên nhận đề xuất",
      to: "Bên khởi tạo",
      shipped: item.recipientShippedAt,
      received: item.initiatorReceivedAt,
    },
  ];
  return (
    <section className={styles.card}>
      <h2>
        <Truck size={20} aria-hidden="true" /> Hai chiều giao sách
      </h2>
      <ul className={styles.shipments}>
        {shipments.map(({ from, to, shipped, received }) => (
          <li key={from}>
            <h3>
              {from} <ArrowRight size={15} aria-label="gửi cho" /> {to}
            </h3>
            <p>
              {!shipped
                ? "Chưa ghi nhận gửi"
                : verified
                  ? "Admin đã xác minh giao đến"
                  : received
                    ? "Đối tác đã xác nhận nhận"
                    : "Chưa xác minh giao đến"}
            </p>
            {shipped && (
              <time dateTime={shipped}>Gửi lúc {dateText(shipped)}</time>
            )}
            {received && (
              <time dateTime={received}>Nhận lúc {dateText(received)}</time>
            )}
          </li>
        ))}
      </ul>
      {verified && (
        <div className={styles.verified}>
          <strong>Đã xác minh lúc {dateText(verified.verifiedAt)}</strong>
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
