import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@used-books/api-contract";
import { z } from "zod";
import { Link } from "react-router-dom";
import { session } from "../../core/session";
import { money } from "../../core/format";
import { Button, ErrorNotice, Notice } from "../../core/ui";
import { ActionPanel, type Outcome } from "./action-panel";
import { walletEventReceipt } from "./simulator-contracts";
import { Field } from "./field";
import styles from "./simulator-topup.module.css";

type Schema = components["schemas"];
const recipients = z.strictObject({
  items: z.array(z.strictObject({ id: z.uuid(), displayName: z.string() })).max(40),
  hasMore: z.boolean(),
}) satisfies z.ZodType<Schema["SimulatedTopupRecipientPage"]>;
const input = z.strictObject({ recipientId: z.uuid(), amount: z.number().int().min(1000).max(10000000) }) satisfies z.ZodType<Schema["CreateSimulatedTopup"]>;
const reconcile = async () => undefined;
const pending = () => undefined;
type Recipient = Schema["SimulatedTopupRecipientPage"]["items"][number];

export function SimulatorTopup({ userId }: { userId: string }) {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [recipient, setRecipient] = useState<Recipient>();
  const [amount, setAmount] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Omit<Outcome, "close">>();
  const [receipt, setReceipt] = useState<Schema["WalletCommandReceipt"]>();
  const list = useQuery({
    queryKey: ["operations", "simulator-topup-recipients", userId, q],
    queryFn: () => session.request(`/operations/simulator/topup-recipients?q=${encodeURIComponent(q)}`, recipients),
    retry: false,
  });
  const options = list.data?.items ?? [];
  const validate = () => {
    const parsed = input.safeParse({ recipientId: recipient?.id, amount: Number(amount) });
    if (parsed.success && recipient?.id !== userId) { setErrors({}); return true; }
    const next = { recipientId: !recipient || recipient.id === userId ? "Chọn một Member khác tài khoản vận hành." : "", amount: !Number.isInteger(Number(amount)) || Number(amount) < 1000 || Number(amount) > 10000000 ? "Nhập số nguyên từ 1.000 đến 10.000.000 đồng." : "" };
    setErrors(next);
    document.getElementById(next.recipientId ? "sim-recipient" : "sim-amount")?.focus();
    return false;
  };
  return <div className={styles.page}>
    <header className="page-heading"><h1>Nạp tiền mô phỏng</h1><p className="intro">Chọn người nhận, nhập số tiền và xác nhận. Member có thể dùng số dư để thử mua sách.</p></header>
    <Notice tone="info">Tiền mô phỏng đồ án, không phải tiền thật. Thao tác này tạo khoản nạp riêng và không xử lý giao dịch VNPay đang chờ.</Notice>
    {result ? <section className={styles.result} aria-label="Kết quả nạp mô phỏng" aria-live="polite">
      <Notice tone={result.tone}>{result.text}</Notice>
      {receipt?.credited && <><h2>{money(Number(amount))}</h2><p>Đã ghi có cho <strong>{recipient?.displayName}</strong>.</p><p>Member mở Ví của tôi và làm mới để xem số dư và lịch sử nạp tiền.</p><dl><dt>Mã yêu cầu nạp</dt><dd>{receipt.entityId}</dd><dt>Mã biên nhận</dt><dd>{receipt.id}</dd></dl></>}
      <Button onClick={() => { setResult(undefined); setReceipt(undefined); if (receipt?.credited) { setAmount(""); setRecipient(undefined); } }}> {receipt?.credited ? "Nạp cho lượt tiếp theo" : "Quay lại chỉnh thông tin"}</Button>
    </section> : <div className={styles.layout}>
      <ActionPanel<Schema["WalletCommandReceipt"]>
        label="Nạp tiền cho Member" title="Người nhận & số tiền"
        dirty={!!recipient || !!amount} submitLabel="Kiểm tra khoản nạp"
        validate={validate} confirmTitle="Xác nhận nạp tiền mô phỏng?"
        confirmBody={<div className={styles.confirm}><p>Người nhận: <strong>{recipient?.displayName}</strong></p><p className={styles.accountId}>{recipient?.id}</p><p className={styles.total}>{money(Number(amount))}</p><p>Khoản nạp mới sẽ vào ví Member ngay khi máy chủ xác nhận. Đây là tiền mô phỏng đồ án.</p></div>}
        build={() => ({ path: "/operations/simulator/topups", body: { recipientId: recipient!.id, amount: Number(amount) } })}
        schema={walletEventReceipt}
        interpret={value => { setReceipt(value); return { close: true, tone: value.credited && value.state === "Succeeded" ? "success" : "warning", text: value.credited && value.state === "Succeeded" ? "Nạp tiền mô phỏng thành công." : "Máy chủ chưa xác nhận ghi có. Giữ biên nhận để đối chiếu trước khi nạp thêm." }; }}
        reconcile={reconcile} onFinish={setResult} onPending={pending}
        refusalText="Máy chủ đã từ chối khoản nạp. Chưa ghi có; hãy kiểm tra người nhận và số tiền."
        refusalRecoveryText="Khoản nạp đã bị từ chối. Giữ thông tin đang nhập để kiểm tra lại."
        refusalRecoveryLabel="Quay lại kiểm tra thông tin"
        fields={locked => <fieldset disabled={locked} className={styles.fields}>
          <div className={styles.search}><Field id="sim-search" label="Tìm Member" hint="Tìm theo tên hiển thị hoặc mã tài khoản; không cần đăng nhập hộ Member.">
            <input id="sim-search" value={search} maxLength={80} placeholder="Nhập tên hoặc mã tài khoản" onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); setQ(search.trim()); } }} />
          </Field><Button onClick={() => setQ(search.trim())} busy={list.isFetching}>Tìm người nhận</Button></div>
          {list.isPending && <p role="status">Đang tải danh sách Member…</p>}
          {list.isError && <><ErrorNotice error={list.error} /><Button onClick={() => void list.refetch()}>Tải lại danh sách Member</Button></>}
          {list.data && <p role="status" className="muted">{options.length ? `${options.length} Member phù hợp${list.data.hasMore ? "; còn kết quả khác, nhập tên cụ thể hơn" : ""}.` : "Không tìm thấy Member đủ điều kiện. Thử tên khác hoặc mã tài khoản."}</p>}
          <Field id="sim-recipient" label="Member nhận tiền" hint="Chỉ hiện Member đang hoạt động, đã xác minh email. Mã tài khoản giúp phân biệt tên trùng." error={errors.recipientId}>
            <select id="sim-recipient" value={recipient?.id ?? ""} aria-invalid={!!errors.recipientId} aria-describedby="sim-recipient-hint" onChange={e => { setRecipient(options.find(row => row.id === e.target.value) ?? (recipient?.id === e.target.value ? recipient : undefined)); setErrors(current => ({ ...current, recipientId: "" })); }}>
              <option value="">Chọn Member nhận tiền</option>
              {recipient && !options.some(row => row.id === recipient.id) && <option value={recipient.id}>{recipient.displayName} · {recipient.id.slice(0, 8)}</option>}
              {options.map(row => <option key={row.id} value={row.id}>{row.displayName} · {row.id.slice(0, 8)}</option>)}
            </select>
          </Field>
          {recipient && <p className={styles.accountId}>Mã tài khoản: {recipient.id}</p>}
          <Field id="sim-amount" label="Số tiền nạp (đồng)" hint="Từ 1.000 đến 10.000.000 đồng mỗi lượt." error={errors.amount}>
            <input id="sim-amount" type="number" inputMode="numeric" min={1000} max={10000000} step={1} value={amount} aria-invalid={!!errors.amount} aria-describedby="sim-amount-hint" onChange={e => { setAmount(e.target.value); setErrors(current => ({ ...current, amount: "" })); }} />
          </Field>
          <div className={styles.presets} aria-label="Chọn nhanh số tiền">{[100000, 500000, 1000000].map(value => <Button key={value} aria-pressed={Number(amount) === value} onClick={() => { setAmount(String(value)); setErrors(current => ({ ...current, amount: "" })); }}>{money(value)}</Button>)}</div>
        </fieldset>}
      />
      <aside className={styles.guide} aria-label="Hướng dẫn nạp mô phỏng"><h2>Dùng khi demo</h2><ol><li>Chọn đúng Member cần có số dư.</li><li>Kiểm tra tên, mã tài khoản và số tiền trước khi xác nhận.</li><li>Sau thông báo thành công, Member làm mới Ví của tôi.</li></ol><p>Mất kết nối? Giữ trang này và bấm thử lại. Yêu cầu được giữ nguyên để tránh nạp hai lần.</p><p>Tài khoản vận hành phải khác người nhận. Admin/Staff không tự có quyền nạp mô phỏng.</p><Link to="/dashboard">Về tổng quan vận hành</Link></aside>
    </div>}
  </div>;
}
