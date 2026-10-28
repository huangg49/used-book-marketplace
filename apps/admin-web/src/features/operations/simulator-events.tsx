import { useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { z } from "zod";
import type { CurrentUser } from "@used-books/session-client";
import { canSimulate } from "../../core/session";
import { Button, Notice } from "../../core/ui";
import { ActionPanel } from "./action-panel";
import { Field } from "./field";
import { Forbidden } from "./queue-frame";
import { simulatorCommand, simulatorOutcome, simulatorReceipts, type SimulatorKind, type SimulatorReceipt, type SimulatorValues } from "./simulator-contracts";

const titles = { topups: "Nạp tiền mô phỏng.", pickups: "Lấy hàng trực tiếp.", deliveries: "Giao hàng trực tiếp." } as const;
const labels: Record<string, string> = { eventId: "Mã sự kiện", intentId: "Mã yêu cầu nạp", recipientId: "Mã người nhận tiền", amount: "Số tiền (VND)", currency: "Loại tiền", outcome: "Kết quả nạp", orderId: "Mã đơn hàng", shipmentId: "Mã lô giao hàng", trackingCode: "Mã vận đơn", occurredAt: "Thời điểm sự kiện (ISO 8601)" };
const hints: Record<string, string> = { eventId: "Mã được giữ nguyên khi thử lại cùng yêu cầu.", occurredAt: "Có múi giờ, ví dụ 2026-10-26T10:00:00.000Z. Nhập đúng thời điểm sự kiện.", trackingCode: "Bắt đầu LL-, tiếp theo là 8–32 chữ in hoa hoặc số.", amount: "Số nguyên từ 1 đến 10.000.000; phải khớp yêu cầu nạp.", recipientId: "UUID của người nhận tiền, khác tài khoản vận hành.", currency: "Ba chữ in hoa; nhập đúng loại tiền của yêu cầu nạp." };
const reconcileReceipt = async () => undefined;
const ignorePending = () => undefined;

export function SimulatorEventsPage() {
  const user = useOutletContext<CurrentUser>();
  const { kind } = useParams();
  if (!canSimulate(user)) return <Forbidden />;
  if (kind !== "topups" && kind !== "pickups" && kind !== "deliveries") return <p>Không tìm thấy công cụ mô phỏng.</p>;
  return <SimulatorForm key={kind} kind={kind} user={user} />;
}

function SimulatorForm({ kind, user }: { kind: SimulatorKind; user: CurrentUser }) {
  const [values, setValues] = useState<SimulatorValues>(() => ({ eventId: crypto.randomUUID(), occurredAt: new Date().toISOString(), currency: "VND", outcome: "" }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ tone: "success" | "info" | "warning"; text: string }>();
  const fields = kind === "topups" ? ["intentId", "recipientId", "amount", "currency", "outcome"] : ["orderId", "shipmentId", "trackingCode"];
  const validate = () => {
    try { simulatorCommand(kind, values, user.id); setErrors({}); return true; }
    catch (cause) {
      if (!(cause instanceof z.ZodError)) throw cause;
      const next = Object.fromEntries(cause.issues.map(issue => [String(issue.path[0]), issue.code === "custom" ? issue.message : `Kiểm tra lại ${labels[String(issue.path[0])]?.toLocaleLowerCase("vi-VN") || "thông tin"}.`]));
      setErrors(next);
      document.getElementById(`sim-${kind}-${String(cause.issues[0]?.path[0])}`)?.focus();
      return false;
    }
  };
  return <>
    <header className="page-heading"><h1>{titles[kind]}</h1><p className="intro">Nhập các mã từ kịch bản mô phỏng đã tạo. Chỉ dành cho tài khoản vận hành thử độc lập với các bên tham gia.</p></header>
    <Notice tone="info">{kind === "topups" ? "Chỉ áp dụng yêu cầu nạp mô phỏng đồ án. Sai số tiền, loại tiền hoặc người nhận có thể đưa yêu cầu vào trạng thái cần đối chiếu." : "Thông báo từ LatLaiSimulator. Máy chủ kiểm tra mã đơn, vận đơn, thời điểm và trạng thái hiện tại trước khi ghi nhận."}</Notice>
    {result ? <>
      <Notice tone={result.tone}>{result.text}</Notice>
      <Button onClick={() => { setResult(undefined); setValues(current => ({ ...current, eventId: crypto.randomUUID(), occurredAt: new Date().toISOString() })); }}>Nhập sự kiện tiếp theo</Button>
    </> : <ActionPanel<SimulatorReceipt>
      label={titles[kind]} title="Thông tin sự kiện"
      dirty={fields.some(name => name !== "currency" && !!values[name])}
      fields={locked => <fieldset disabled={locked}>
        {[...fields, "occurredAt", "eventId"].map(name => {
          const id = `sim-${kind}-${name}`;
          const change = (value: string) => { setValues(current => ({ ...current, [name]: value })); setErrors(current => ({ ...current, [name]: "" })); };
          return <Field key={name} id={id} label={labels[name]} hint={hints[name] || (name === "outcome" ? "Chọn đúng trạng thái do cổng mô phỏng báo." : "Nhập mã UUID từ kịch bản đã tạo.")} error={errors[name]}>
            {name === "outcome" ? <select id={id} required value={values[name] || ""} onChange={event => change(event.target.value)} aria-invalid={!!errors[name]} aria-describedby={`${id}-hint`}>
              <option value="">Chọn kết quả</option><option value="Processing">Đang xử lý</option><option value="Succeeded">Thành công</option><option value="Failed">Không thành công</option>
            </select> : <input id={id} value={values[name] || ""} type={name === "amount" ? "number" : "text"} inputMode={name === "amount" ? "numeric" : undefined}
              min={name === "amount" ? 1 : undefined} max={name === "amount" ? 10000000 : undefined} step={name === "amount" ? 1 : undefined}
              readOnly={name === "eventId"} required={name !== "eventId"} autoComplete="off" spellCheck={false} onChange={event => change(event.target.value)}
              aria-invalid={!!errors[name]} aria-describedby={`${id}-hint`} />}
          </Field>;
        })}
      </fieldset>}
      validate={validate} submitLabel="Kiểm tra và gửi sự kiện" confirmTitle="Gửi sự kiện mô phỏng?"
      confirmBody={<p>{titles[kind]} Đối tượng: {kind === "topups" ? values.intentId : values.orderId}. Thời điểm: {values.occurredAt}. Mã sự kiện: {values.eventId}.</p>}
      build={() => simulatorCommand(kind, values, user.id)} schema={simulatorReceipts[kind] as z.ZodType<SimulatorReceipt>}
      interpret={simulatorOutcome} reconcile={reconcileReceipt} onFinish={setResult} onPending={ignorePending}
      refusalText="Yêu cầu đã bị từ chối. Kiểm tra thông tin trước khi nhập sự kiện mới."
      refusalRecoveryText="Máy chủ đã từ chối yêu cầu. Kết thúc yêu cầu này để chỉnh thông tin."
      refusalRecoveryLabel="Kết thúc yêu cầu bị từ chối"
    />}
  </>;
}
