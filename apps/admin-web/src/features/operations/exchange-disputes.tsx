import { useCallback, useEffect, useState } from "react";
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
import { Button, Notice } from "../../core/ui";
import { ActionPanel, type Outcome } from "./action-panel";
import {
  exchangeDisputeResolution,
  exchangeDisputeResolutionsList,
  type ExchangeDisputeItem,
} from "./contracts";
import { ExchangeEvidenceReview } from "./exchange-evidence-review";
import { Forbidden, OperationsQueue } from "./queue-frame";
import { refetchWhileClosed, useQueuePanel } from "./queue-panel";
import styles from "./exchange-disputes.module.css";

export function ExchangeDisputesPage() {
  const user = useOutletContext<CurrentUser>();
  return canReview(user) ? <ExchangeDisputesContent user={user} /> : <Forbidden />;
}

function ExchangeDisputesContent({ user }: { user: CurrentUser }) {
  const panel = useQueuePanel();
  const result = useQuery({
    queryKey: ["operations", "exchange-disputes", user.id],
    queryFn: () => session.request("/operations/exchanges/resolutions", exchangeDisputeResolutionsList),
    refetchInterval: refetchWhileClosed(panel),
  });

  return (
    <OperationsQueue
      number="08"
      title="Khiếu nại trao đổi sách."
      intro="Mở hồ sơ để đối chiếu hai chiều giao sách, bằng chứng và các khoản đang giữ."
      order="Khiếu nại mới nhất trước."
      unit="khiếu nại"
      result={result}
      panel={panel}
      rows={(result.data ?? []).map((item) => ({
        id: item.id,
        status: item.returnResolution ? exchangeReturnPhase[item.returnResolution.phase] : "Chờ xử lý · Giữ tiền và sách",
        meta: [
          item.disputedAt ? dateText(item.disputedAt) : "Mới mở",
          item.initiatorFundedAt && item.recipientFundedAt
            ? "Đang giữ " + money(item.initiatorDeposit + item.recipientDeposit + item.diffAmount)
            : "Cần đối chiếu khoản giữ",
        ],
        title: "Trao đổi #" + item.id.slice(0, 8),
        detail: <p>{item.disputeReason}</p>,
        action: { label: "Mở hồ sơ", to: "/operations/exchange-disputes/" + item.id },
      }))}
      empty={{
        title: "Chưa có khiếu nại nào.",
        body: "Chưa có giao dịch chờ xử lý trong danh sách bạn được xem.",
      }}
      extra={() => (
        <Notice tone="info">
          Giữ tiền và sách trong lúc đối chiếu. Ca một bên đã nhận nhưng quá hạn gửi có thể mở quy trình trả sách.
        </Notice>
      )}
    />
  );
}

const actionText: Partial<Record<ExchangeReturnAction, { label: string; effect: string }>> = {
  VerifyOutboundDelivery: { label: "Xác minh đã giao sách", effect: "Đối chiếu đúng kiện sách, người nhận và thời điểm bàn giao. Sau khi lưu, hồ sơ có thể chuyển sang bước yêu cầu bổ sung bằng chứng." },
  RequestEvidence: { label: "Yêu cầu bổ sung bằng chứng", effect: "Hai bên có 48 giờ để bổ sung thông tin. Tiền vẫn được giữ." },
  OrderReturn: { label: "Ra quyết định yêu cầu trả sách", effect: "Hai bên có 48 giờ để kháng nghị. Sau khi quyết định có hiệu lực, bên giữ sách có 72 giờ bàn giao sách hoàn." },
  Uphold: { label: "Giữ quyết định sau kháng nghị", effect: "Quyết định có hiệu lực sau khi Admin xác nhận." },
  SetAside: { label: "Hủy quyết định để xem xét lại", effect: "Hồ sơ quay về bước xem xét. Các khoản tiền vẫn được giữ." },
  RejectReturnDispatch: { label: "Xác minh chưa bàn giao sách hoàn", effect: "Dùng khi đã kiểm tra và xác minh mã vận đơn chưa có bàn giao. Hồ sơ quay về bước trả sách với hạn cũ." },
  VerifyReturnDelivery: { label: "Xác minh đã giao sách hoàn", effect: "Chỉ xác nhận khi chứng cứ cho thấy đúng cuốn đã giao về chủ. Chủ sách có 48 giờ kiểm tra." },
  OrderCompensation: { label: "Ra quyết định bồi thường", effect: "Chỉ dùng khi đã xác minh bên nhận giữ sách quá hạn và không thể thu hồi. Hai bên có 48 giờ kháng nghị." },
  Settle: { label: "Thực hiện quyết định", effect: "Hệ thống sẽ ghi từng khoản vào ví theo kết quả cuối và cập nhật trạng thái hai bài đăng." },
};

function OperationsReturnActions({ item, user, reload, onFinish, onPending }: {
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
  const [demo, setDemo] = useState<{ deadline: DemoExchangeDeadline; revision: number }>();
  const reportPending = useCallback((value: boolean) => {
    setPending(value);
    onPending(value);
  }, [onPending]);
  const key = ["operations", "exchange-evidence-access", user.id, item.id];
  const access = useQuery({
    queryKey: key,
    queryFn: () => session.request("/operations/exchanges/" + item.id + "/evidence-access", exchangeEvidenceAccessSchema),
  });
  const assigned = access.isSuccess && access.data.assigneeId === user.id && item.status === "ResolutionPending";
  const r = item.returnResolution;
  const admin = user.roles.includes("ADMIN");
  const verifying = item.canVerifyOutboundDelivery && admin;
  const privileged = admin || item.initiatorDeposit + item.recipientDeposit + item.diffAmount <= 300000;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const due = (deadline?: string | null) => !!deadline && Date.parse(deadline) <= now;
  const ready = r && due(r.appealDueAt) && !r.appeals.length;
  const actions: ExchangeReturnAction[] = [];
  if (verifying) actions.push("VerifyOutboundDelivery");
  if (item.canStartReturnResolution && (!r || r.phase === "NeedsReview")) actions.push("RequestEvidence");
  if (r?.phase === "Evidence" && due(r.evidenceDueAt) && privileged) actions.push("OrderReturn");
  if (r && (r.phase === "ReturnOrdered" || r.phase === "CompensationOrdered") && due(r.appealDueAt) && r.appeals.length && !r.effectiveAt && admin) {
    actions.push("Uphold", "SetAside");
  }
  if (r?.phase === "ReturnOrdered" && due(r.returnDueAt) && (ready || r.effectiveAt) && admin) actions.push("OrderCompensation");
  if (r && ["ReturnInProgress", "ReturnIssue"].includes(r.phase) && admin) {
    actions.push("VerifyReturnDelivery");
    if (!r.returnedAt) actions.push("RejectReturnDispatch");
  }
  if (privileged && r && ((r.phase === "CheckingReturn" && due(r.checkDueAt)) ||
    (r.phase === "CompensationOrdered" && (ready || r.effectiveAt)))) actions.push("Settle");
  const useEvidence = selected === "VerifyOutboundDelivery" || selected === "OrderCompensation" || selected === "VerifyReturnDelivery" || selected === "RejectReturnDispatch";
  const evidence = useQuery({
    queryKey: ["operations", "exchange-evidence", user.id, item.id],
    queryFn: () => session.request("/operations/exchanges/" + item.id + "/evidence", exchangeEvidenceListSchema),
    enabled: assigned && useEvidence,
  });
  const active = selected && actionText[selected];
  if (!assigned && !pending) return <p>Nhận phụ trách hồ sơ để thực hiện bước tiếp theo.</p>;
  return (
    <section aria-label="Bước tiếp theo của hồ sơ" className={styles.nextStep}>
      <h2>Bước tiếp theo</h2>
      {!privileged && <Notice tone="info">Tổng khoản giữ vượt 300.000đ. Admin cần nhận phụ trách để ra quyết định.</Notice>}
      {r?.appeals.map((appeal) => (
        <p key={appeal.by}><strong>{appeal.by === r.ownerId ? "Chủ sách kháng nghị" : "Bên đang giữ sách kháng nghị"}</strong><br />{appeal.note}</p>
      ))}
      {!actions.length && !pending && (
        <p>{r?.phase === "Evidence" ? "Đang chờ hết hạn bổ sung bằng chứng."
          : r?.phase === "CheckingReturn" ? "Đang chờ chủ sách kiểm tra sách đã trả."
          : r?.appeals.length && !r.effectiveAt ? "Đang chờ Admin khác xem xét kháng nghị."
          : "Theo dõi hạn và các cập nhật của hai bên trong hồ sơ."}</p>
      )}
      {item.demoDeadline && !selected && !demo && !pending && (
        <Button onClick={() => setDemo({ deadline: item.demoDeadline!, revision: item.revision })}>
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
          confirmBody={<p>Đóng thời hạn này để thử thao tác tiếp theo trên hồ sơ.</p>}
          build={() => ({
            path: "/operations/exchanges/" + item.id + "/demo-advance",
            body: { expectedVersion: demo.revision, deadline: demo.deadline },
          })}
          schema={exchangeDisputeResolution}
          interpret={(updated) => {
            if (updated.id !== item.id || updated.revision <= demo.revision)
              throw new Error("Chưa xác minh được kết quả của đúng hồ sơ.");
            return { tone: "success", text: "Đã tua hạn demo. Xem thao tác tiếp theo trên hồ sơ.", close: true };
          }}
          reconcile={reload}
          onPending={reportPending}
          onFinish={(outcome) => { setDemo(undefined); onFinish(outcome); }}
        />
        {!pending && <Button onClick={() => setDemo(undefined)}>Đóng thao tác demo</Button>}
        </div>
      )}
      {verifying && !selected && !demo && (
        <div className={styles.verifyCallout}>
          <p>Chiều gửi ban đầu đang chờ đối chiếu. Mở tệp bàn giao trong mục bằng chứng trước khi xác minh.</p>
          <Button onClick={() => setSelected("VerifyOutboundDelivery")}>Xác minh đã giao sách</Button>
        </div>
      )}
      {!demo && (!verifying && actions.length > 0 || pending && selected !== "VerifyOutboundDelivery") && (
        <label>
          Thao tác với hồ sơ
          <select value={selected ?? ""} disabled={pending} onChange={(e) => {
            const value = actions.find((action) => action === e.target.value);
            setSelected(value);
            setNote("");
            setEvidenceId("");
          }}>
            <option value="">Chọn thao tác</option>
            {(pending && selected ? [selected] : actions).map((action) => (
              <option key={action} value={action}>{actionText[action]?.label}</option>
            ))}
          </select>
        </label>
      )}
      {active && (pending || actions.includes(selected!)) && (
        <ActionPanel
          key={selected}
          label={active.label}
          title={active.label}
          intro={active.effect}
          fields={(locked) => assigned && selected !== "Settle" && (
            <>
              <label>
                {selected === "VerifyOutboundDelivery" ? "Căn cứ xác minh bàn giao" : "Căn cứ hoặc yêu cầu gửi hai bên"}
                <textarea value={note} disabled={locked} minLength={5} maxLength={500} onChange={(e) => setNote(e.target.value)} />
              </label>
              {useEvidence && (
                <label>
                  Tệp bằng chứng đã đối chiếu
                  <select value={evidenceId} disabled={locked || evidence.isError} onChange={(e) => setEvidenceId(e.target.value)}>
                    <option value="">Chọn tệp trong hồ sơ</option>
                    {evidence.data?.items.filter((item) => item.status === "Ready").map((item) => (
                      <option key={item.id} value={item.id}>{item.fileName}</option>
                    ))}
                  </select>
                  {evidence.isError && <span role="alert">Chưa tải được tệp. Hãy tải lại hồ sơ.</span>}
                  {evidence.isSuccess && !evidence.data.items.some((entry) => entry.status === "Ready") &&
                    <span>Chưa có tệp tải xong trong hồ sơ.</span>}
                </label>
              )}
            </>
          )}
          dirty={note.length > 0 || evidenceId !== ""}
          validate={() => (selected === "Settle" || note.trim().length >= 5) && (!useEvidence || Boolean(evidenceId))}
          submitLabel={active.label}
          confirmTitle={active.label + "?"}
          confirmBody={<p>{active.effect} {note}</p>}
          build={() => ({
            path: "/operations/exchanges/" + item.id + "/return-resolution",
            body: { expectedVersion: item.revision, action: selected, ...(note ? { note: note.trim() } : {}), ...(evidenceId ? { evidenceId } : {}) },
          })}
          schema={exchangeDisputeResolution}
          interpret={(updated) => {
            if (updated.id !== item.id || (selected === "VerifyOutboundDelivery"
              ? !updated.outboundDeliveryVerification || !updated.canStartReturnResolution
              : !updated.returnResolution)) {
              throw new Error("Chưa xác minh được kết quả của đúng hồ sơ.");
            }
            return { tone: "success", text: selected === "VerifyOutboundDelivery"
              ? "Đã xác minh giao sách. Có thể yêu cầu hai bên bổ sung bằng chứng."
              : "Đã ghi nhận thao tác. Hồ sơ đã được cập nhật.", close: true };
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
    </section>
  );
}

export function ExchangeDisputeDetailPage() {
  const user = useOutletContext<CurrentUser>();
  return canReview(user) ? <ExchangeDisputeDetailContent user={user} /> : <Forbidden />;
}

function ExchangeDisputeDetailContent({ user }: { user: CurrentUser }) {
  const { id } = useParams<{ id: string }>();
  const [outcome, setOutcome] = useState<Omit<Outcome, "close">>();
  const [pending, setPending] = useState(false);
  const result = useQuery({
    queryKey: ["operations", "exchange-dispute", user.id, id],
    queryFn: () => session.request("/operations/exchanges/" + id + "/dispute", exchangeDisputeResolution),
    refetchInterval: 15000,
  });
  const item = !result.isError && result.data?.id === id ? result.data : undefined;
  const retained = result.data?.id === id ? result.data : undefined;
  const r = item?.returnResolution;
  const verified = item?.outboundDeliveryVerification;
  return (
    <main className={styles.detailPageContainer}>
      <header className={styles.detailHeader}>
        <Link to="/operations/exchange-disputes">← Danh sách khiếu nại</Link>
        <h1>Hồ sơ khiếu nại trao đổi</h1>
        {item && <p>Trao đổi #{item.id.slice(0, 8)}</p>}
        <Button onClick={() => void result.refetch()}>Tải lại hồ sơ</Button>
      </header>
      {outcome && <Notice tone={outcome.tone}>{outcome.text}</Notice>}
      {result.isPending && <p role="status">Đang tải hồ sơ…</p>}
      {result.isError && <Notice tone="error">Chưa tải được hồ sơ hoặc quyền xem đã thay đổi.</Notice>}
      {item && (
        <>
          <section className={styles.reasonBox} aria-label="Thông tin giao nhận">
            <h2>Hai chiều giao sách</h2>
            <dl className={styles.returnFacts}>
              <div><dt>Sách bên khởi tạo gửi</dt><dd>{!item.initiatorShippedAt ? "Chưa ghi nhận gửi" : verified ? "Admin đã xác minh giao đến" : item.recipientReceivedAt ? "Đối tác đã xác nhận nhận" : "Chưa xác minh giao đến"}</dd></div>
              <div><dt>Sách bên nhận đề xuất gửi</dt><dd>{!item.recipientShippedAt ? "Chưa ghi nhận gửi" : verified ? "Admin đã xác minh giao đến" : item.initiatorReceivedAt ? "Đối tác đã xác nhận nhận" : "Chưa xác minh giao đến"}</dd></div>
              <div><dt>Cọc bên khởi tạo</dt><dd>{money(item.initiatorDeposit)}</dd></div>
              <div><dt>Cọc bên nhận đề xuất</dt><dd>{money(item.recipientDeposit)}</dd></div>
              <div><dt>Tiền bù đã nộp</dt><dd>{money(item.diffAmount)}{item.diffAmount > 0 && (item.diffPayerId === item.initiatorId ? " từ bên khởi tạo" : item.diffPayerId === item.recipientId ? " từ bên nhận đề xuất" : "")}</dd></div>
            </dl>
            {item.disputeReason && <details><summary>Nội dung báo sự cố</summary><p>{item.disputeReason}</p></details>}
            {verified && <p><strong>Đã xác minh lúc {dateText(verified.verifiedAt)}</strong><br />{verified.note}</p>}
          </section>
          {r && (
            <section className={styles.reasonBox} aria-label="Quyết định trả sách">
              <h2>{exchangeReturnPhase[r.phase]}</h2>
              <p>{r.note}</p>
              {r.evidenceDueAt && r.phase === "Evidence" && <p>Hạn bổ sung bằng chứng {dateText(r.evidenceDueAt)}</p>}
              {r.appealDueAt && ["ReturnOrdered", "CompensationOrdered"].includes(r.phase) && !r.effectiveAt && <p>Hạn kháng nghị {dateText(r.appealDueAt)}</p>}
              {r.returnDueAt && r.phase === "ReturnOrdered" && <p>Hạn bàn giao sách hoàn {dateText(r.returnDueAt)}. Nếu có kháng nghị, hạn tính lại khi Admin giữ quyết định.</p>}
              {r.trackingCode && <p>Mã vận đơn hoàn {r.trackingCode}</p>}
              {r.checkDueAt && r.phase === "CheckingReturn" && <p>Hết hạn kiểm tra sách hoàn {dateText(r.checkDueAt)}</p>}
              {r.compensation > 0 && <p>Bồi thường {money(r.compensation)} từ tiền cọc của bên giữ sách. Hoàn tiền bù cho người đã nộp.</p>}
              {r.outcome && <p>{r.outcome === "Returned" ? "Đã ghi nhận trả sách và hoàn tiền." : "Đã chi bồi thường và ghi nhận vi phạm không trả sách."}</p>}
            </section>
          )}
          {item.status === "ResolutionPending" && <ExchangeEvidenceReview id={item.id} userId={user.id} onAssignment={() => result.refetch()} />}
          {item.status === "ResolutionPending" && !item.canStartReturnResolution && (
            <Notice tone="info">{item.canVerifyOutboundDelivery
              ? "Tiền và sách đang được giữ. Admin phụ trách có thể xác minh giao sách từ bằng chứng bàn giao."
              : "Hồ sơ tiếp tục giữ tiền và sách trong lúc đối chiếu. Chưa đủ điều kiện chạy quy trình trả sách một chiều."}</Notice>
          )}
        </>
      )}
      {retained && (pending || (item?.status === "ResolutionPending" &&
        (item.canStartReturnResolution || item.canVerifyOutboundDelivery && user.roles.includes("ADMIN")))) && (
        <OperationsReturnActions
          item={retained}
          user={user}
          reload={() => result.refetch()}
          onFinish={setOutcome}
          onPending={setPending}
        />
      )}
    </main>
  );
}
