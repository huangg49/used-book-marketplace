import { useEffect, useState, type FormEvent } from "react";
import {
  exchangeReturnPhase,
  type ExchangeReturnAction,
  type ExchangeReturnResolution,
} from "@used-books/session-client";
import { formatVnd } from "../../lib/routes";
import { exchangeCommand } from "../../services/exchange";
import styles from "./ExchangeEvidencePanel.module.css";

const actions: Partial<Record<ExchangeReturnAction, { label: string; field?: "note" | "trackingCode" }>> = {
  SubmitStatement: { label: "Gửi giải trình", field: "note" },
  Appeal: { label: "Gửi kháng nghị", field: "note" },
  ReportDispatch: { label: "Ghi mã vận đơn hoàn", field: "trackingCode" },
  AcknowledgeReturn: { label: "Xác nhận đã nhận sách hoàn" },
  ReportReturnProblem: { label: "Báo vấn đề khi trả sách", field: "note" },
};

const dateText = (date: string) => new Date(date).toLocaleString("vi-VN");

export function ExchangeReturnPanel({ id, revision, userId, resolution: r, blocked, returnAddress, onRead }: {
  id: string;
  revision: number;
  userId: string;
  resolution: ExchangeReturnResolution;
  blocked: boolean;
  returnAddress?: { recipientName: string; phone: string; detail: string };
  onRead: () => void;
}) {
  const [selected, setSelected] = useState<ExchangeReturnAction>();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const owner = r.ownerId === userId;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const open = (date: string | null) => Boolean(date && Date.parse(date) > now);
  const expired = (date: string | null) => Boolean(date && Date.parse(date) <= now);
  const offerAppeal = (r.phase === "ReturnOrdered" || r.phase === "CompensationOrdered") &&
    !r.effectiveAt && open(r.appealDueAt);
  const available: ExchangeReturnAction[] = [];
  if (r.phase === "Evidence" && (!r.evidenceDueAt || open(r.evidenceDueAt))) available.push("SubmitStatement");
  if (offerAppeal && !r.appeals.some((appeal) => appeal.by === userId)) available.push("Appeal");
  if (!owner && r.phase === "ReturnOrdered" && open(r.returnDueAt) &&
    (r.effectiveAt || (expired(r.appealDueAt) && !r.appeals.length))) available.push("ReportDispatch");
  if (owner && r.phase === "ReturnInProgress") available.push("AcknowledgeReturn", "ReportReturnProblem");
  if (owner && r.phase === "CheckingReturn" && open(r.checkDueAt)) available.push("ReportReturnProblem");
  const current = selected && available.includes(selected) ? actions[selected] : undefined;
  const deposit = owner ? r.ownerDeposit : r.holderDeposit;
  const difference = r.differencePayerId === userId ? r.differenceAmount : 0;
  const ownRefund = r.outcome === "Compensated" && !owner ? 0 : deposit;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || busy || !current || !selected) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await exchangeCommand("/exchanges/" + id + "/return-resolution", {
        expectedVersion: revision, action: selected,
        ...(current.field ? { [current.field]: value.trim() } : {}),
      });
      setSelected(undefined);
      setValue("");
      setNotice("Đã ghi nhận yêu cầu.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chưa xác nhận được yêu cầu.");
    } finally {
      setBusy(false);
      onRead();
    }
  }

  return (
    <section className={styles.panelCard} aria-labelledby="exchange-return-title">
      <h3 className={styles.title} id="exchange-return-title">{exchangeReturnPhase[r.phase]}</h3>
      <p>{owner ? "Bạn là chủ cuốn sách cần thu hồi." : "Hồ sơ ghi nhận bạn đã nhận cuốn sách cần trả."}</p>
      {r.note && <p>{r.note}</p>}
      {r.phase === "Evidence" && r.evidenceDueAt && <p>Hạn bổ sung bằng chứng {dateText(r.evidenceDueAt)}</p>}
      {offerAppeal && r.appealDueAt && <p>Hạn kháng nghị {dateText(r.appealDueAt)}</p>}
      {r.appeals.length > 0 && !r.effectiveAt && r.phase !== "NeedsReview" && <p>Đã có kháng nghị. Đang chờ Admin xem xét.</p>}
      {r.phase === "ReturnOrdered" && r.returnDueAt && (!r.appeals.length || r.effectiveAt) && (
        <p>Hạn bàn giao sách hoàn {dateText(r.returnDueAt)}. {offerAppeal && "Hạn này được tính lại nếu có kháng nghị."}</p>
      )}
      {!owner && available.includes("ReportDispatch") && (
        returnAddress
          ? <p>Gửi về {returnAddress.recipientName} · {returnAddress.phone} · {returnAddress.detail}</p>
          : <p>Hồ sơ chưa có địa chỉ hoàn. Liên hệ hỗ trợ để xác nhận địa chỉ trước khi gửi.</p>
      )}
      {r.phase === "ReturnInProgress" && <p>Mã vận đơn hoàn {r.trackingCode}</p>}
      {r.phase === "CheckingReturn" && r.checkDueAt && <p>Hạn báo vấn đề về sách đã trả {dateText(r.checkDueAt)}</p>}
      {r.outcome ? (
        <dl>
          <div><dt>Cọc của bạn được hoàn</dt><dd>{formatVnd(ownRefund)}</dd></div>
          {difference > 0 && <div><dt>Tiền bù bạn đã nộp được hoàn</dt><dd>{formatVnd(difference)}</dd></div>}
          {r.compensation > 0 && <div><dt>{owner ? "Bồi thường nhận từ cọc của đối tác" : "Tiền cọc đã dùng để bồi thường"}</dt><dd>{formatVnd(r.compensation)}</dd></div>}
        </dl>
      ) : (
        <p>Đang giữ {formatVnd(deposit)} cọc của bạn{difference > 0 ? " và " + formatVnd(difference) + " tiền bù bạn đã nộp" : ""}.</p>
      )}
      {r.phase === "CompensationOrdered" && <p>Quyết định dự kiến chi {formatVnd(r.compensation)} từ tiền cọc của bên giữ sách.</p>}
      {error && !blocked && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <div className={styles.returnActions}>
        {available.map((action) => (
          <button type="button" key={action} disabled={blocked || busy} onClick={() => {
            setSelected(action);
            setValue("");
            setError("");
            setNotice("");
          }}>{actions[action]?.label}</button>
        ))}
        <button type="button" onClick={onRead}>Cập nhật hồ sơ</button>
      </div>
      {current && (
        <form className={styles.returnForm} onSubmit={(event) => void submit(event)}>
          {current.field ? (
            <label>
              {current.field === "trackingCode" ? "Mã vận đơn của chặng hoàn" : "Nội dung gửi"}
              <textarea value={value} disabled={blocked || busy} minLength={5} required
                maxLength={current.field === "trackingCode" ? 80 : 500} onChange={(event) => setValue(event.target.value)} />
            </label>
          ) : <p>Chỉ xác nhận sau khi cuốn sách đã về tay bạn. Bạn vẫn có 48 giờ để kiểm tra.</p>}
          <button disabled={blocked || busy || (!!current.field && value.trim().length < 5)}>{current.label}</button>
          <button type="button" disabled={blocked || busy} onClick={() => setSelected(undefined)}>Quay lại</button>
        </form>
      )}
    </section>
  );
}
