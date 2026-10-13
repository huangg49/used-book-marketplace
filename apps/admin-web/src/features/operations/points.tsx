import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { dateText } from "../../core/format";
import { canResolve, session } from "../../core/session";
import { Button, ErrorNotice } from "../../core/ui";
import { ActionPanel } from "./action-panel";
import { Field } from "./field";
import {
  operationsPointList,
  pointReceipt,
  pointStatusLabels,
  staffPage,
  type OperationsPoint,
} from "./contracts";
import { Forbidden, OperationsQueue } from "./queue-frame";
import {
  refetchWhileClosed,
  useQueuePanel,
  type ActionContext,
} from "./queue-panel";

// N4-10/N4-11 (FR-H04): Admin creates and edits the simulated points and
// assigns Staff. Opening hours stay the fixed 09:00–18:00 rule (ADR 0030).
// Every rule is enforced again by the API: capacity against held slots,
// Closed only without held slots, Active only with a current assignment.

const length = (value: string) => [...value.trim()].length;
const between = (value: string, min: number, max: number) =>
  length(value) >= min && length(value) <= max;
const CODE = /^HCM-[A-Z0-9-]{2,36}$/;

export function PointsPage() {
  const user = useOutletContext<CurrentUser>();
  if (!canResolve(user)) return <Forbidden />;
  return <PointsContent />;
}

function PointsContent() {
  const panel = useQueuePanel();
  const [creating, setCreating] = useState(false);
  const result = useQuery({
    queryKey: ["operations", "points"],
    queryFn: () => session.request("/operations/points", operationsPointList),
    refetchInterval: creating ? false : refetchWhileClosed(panel),
  });
  return (
    <OperationsQueue
      number="05"
      title="Điểm giao nhận."
      intro="Tạo và sửa điểm mô phỏng, đổi trạng thái và phân công nhân viên. Giờ mở cửa cố định 09:00–18:00 mỗi ngày."
      order="Xếp theo mã điểm."
      unit="điểm"
      result={result}
      serverTime={result.data?.serverTime}
      panel={panel}
      extra={(context) =>
        creating ? (
          <div className="row-panel">
            <PointCreate
              {...context}
              onFinish={(outcome) => {
                setCreating(false);
                context.onFinish(outcome);
              }}
              onClose={() => setCreating(false)}
            />
          </div>
        ) : (
          <Button
            disabled={panel.pending}
            onClick={() => {
              panel.setOpen(undefined);
              panel.setNotice(undefined);
              setCreating(true);
            }}
          >
            Thêm điểm
          </Button>
        )
      }
      rows={(result.data?.items ?? []).map((point) => ({
        id: point.id,
        status: pointStatusLabels[point.status],
        meta: [
          point.code,
          `Sức chứa ${point.capacity}`,
          `Đang giữ ${point.heldSlots}`,
        ],
        title: point.name,
        detail: (
          <>
            <p>{point.displayAddress}</p>
            <p>
              {point.assignments.length
                ? `Nhân viên: ${point.assignments.map((a) => a.displayName || a.userId.slice(0, 8)).join(", ")}`
                : "Chưa phân công nhân viên."}
            </p>
          </>
        ),
        action: {
          label: "Quản lý",
          render: (context) => <PointManage point={point} {...context} />,
        },
      }))}
      empty={{
        title: "Chưa có điểm giao nhận.",
        body: "Thêm điểm đầu tiên, phân công nhân viên rồi mở điểm.",
      }}
    />
  );
}

type Props = { point: OperationsPoint } & ActionContext;
type Tab = "edit" | "assign" | "end";

function PointManage(props: Props) {
  const [tab, setTab] = useState<Tab>("edit");
  const tabs: [Tab, string][] = [
    ["edit", "Sửa thông tin"],
    ["assign", "Phân công nhân viên"],
    ["end", "Kết thúc phân công"],
  ];
  return (
    <>
      <div className="segmented" role="group" aria-label="Chọn thao tác">
        {tabs.map(([key, label]) => (
          <Button
            key={key}
            aria-pressed={tab === key}
            className={tab === key ? "primary" : undefined}
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </div>
      {tab === "edit" && <PointEdit {...props} />}
      {tab === "assign" && <PointAssign {...props} />}
      {tab === "end" && <PointUnassign {...props} />}
    </>
  );
}

function PointCreate({
  onClose,
  ...context
}: ActionContext & { onClose: () => void }) {
  const [code, setCode] = useState("HCM-");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [capacity, setCapacity] = useState("20");
  const [problem, setProblem] = useState<string>();
  const first = useRef<HTMLInputElement>(null);
  const size = Number(capacity);
  return (
    <>
      <ActionPanel
        {...context}
        label="Thêm điểm giao nhận"
        title="Thêm điểm mô phỏng."
        intro="Điểm mới ở trạng thái tạm dừng. Phân công ít nhất một nhân viên rồi mở điểm để nhận booking."
        dirty={code !== "HCM-" || name !== "" || address !== ""}
        fields={(locked) => (
          <fieldset disabled={locked}>
            <Field
              id="point-code"
              label="Mã điểm"
              hint="Ví dụ HCM-DEMO-03. Chữ in hoa, số hoặc dấu gạch ngang; không đổi được sau khi tạo."
              error={
                problem === "code"
                  ? "Mã bắt đầu bằng HCM- và có 2–36 ký tự in hoa, số hoặc dấu gạch ngang."
                  : undefined
              }
            >
              <input
                id="point-code"
                ref={first}
                value={code}
                autoComplete="off"
                maxLength={40}
                aria-invalid={problem === "code"}
                aria-describedby="point-code-hint"
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setProblem(undefined);
                }}
              />
            </Field>
            <PointTextFields
              id="point-new"
              name={name}
              address={address}
              capacity={capacity}
              problem={problem}
              onName={setName}
              onAddress={setAddress}
              onCapacity={setCapacity}
              clear={() => setProblem(undefined)}
            />
          </fieldset>
        )}
        validate={() => {
          const issue = !CODE.test(code)
            ? "code"
            : !between(name, 3, 120)
              ? "name"
              : !between(address, 10, 300)
                ? "address"
                : !Number.isInteger(size) || size < 1 || size > 200
                  ? "capacity"
                  : undefined;
          setProblem(issue);
          if (issue)
            document
              .getElementById(
                `point-${issue === "code" ? "code" : `new-${issue}`}`,
              )
              ?.focus();
          return !issue;
        }}
        submitLabel="Thêm điểm"
        confirmTitle="Thêm điểm giao nhận?"
        confirmBody={
          <p>
            Điểm <strong>{code}</strong> “{name.trim()}”, sức chứa {size} cuốn,
            sẽ được tạo ở trạng thái tạm dừng.
          </p>
        }
        build={() => ({
          path: "/operations/points",
          body: {
            code,
            name: name.trim(),
            displayAddress: address.trim(),
            capacity: size,
          },
        })}
        schema={pointReceipt}
        interpret={() => ({
          tone: "success",
          text: `Đã thêm điểm ${code}. Hãy phân công nhân viên trước khi mở điểm.`,
          close: true,
        })}
      />
      <div className="actions">
        <Button onClick={onClose}>Đóng</Button>
      </div>
    </>
  );
}

function PointTextFields({
  id,
  name,
  address,
  capacity,
  problem,
  onName,
  onAddress,
  onCapacity,
  clear,
  held = 0,
}: {
  id: string;
  name: string;
  address: string;
  capacity: string;
  problem?: string;
  onName: (value: string) => void;
  onAddress: (value: string) => void;
  onCapacity: (value: string) => void;
  clear: () => void;
  held?: number;
}) {
  return (
    <>
      <Field
        id={`${id}-name`}
        label="Tên điểm"
        hint="3–120 ký tự. Không dùng tên nhà sách hoặc quán chưa hợp tác."
        error={
          problem === "name" ? "Nhập tên điểm từ 3 đến 120 ký tự." : undefined
        }
      >
        <input
          id={`${id}-name`}
          value={name}
          maxLength={120}
          aria-invalid={problem === "name"}
          aria-describedby={`${id}-name-hint`}
          onChange={(e) => {
            onName(e.target.value);
            clear();
          }}
        />
      </Field>
      <Field
        id={`${id}-address`}
        label="Địa chỉ hiển thị"
        hint="10–300 ký tự. Ghi rõ đây là điểm mô phỏng; không ghi địa chỉ cá nhân."
        error={
          problem === "address"
            ? "Nhập địa chỉ hiển thị từ 10 đến 300 ký tự."
            : undefined
        }
      >
        <textarea
          id={`${id}-address`}
          rows={2}
          maxLength={300}
          value={address}
          aria-invalid={problem === "address"}
          aria-describedby={`${id}-address-hint`}
          onChange={(e) => {
            onAddress(e.target.value);
            clear();
          }}
        />
      </Field>
      <Field
        id={`${id}-capacity`}
        label="Sức chứa (cuốn)"
        hint={`1–200 cuốn${held ? `, không thấp hơn ${held} chỗ đang giữ` : ""}.`}
        error={
          problem === "capacity"
            ? `Sức chứa là số nguyên từ ${Math.max(1, held)} đến 200.`
            : undefined
        }
      >
        <input
          id={`${id}-capacity`}
          inputMode="numeric"
          value={capacity}
          aria-invalid={problem === "capacity"}
          aria-describedby={`${id}-capacity-hint`}
          onChange={(e) => {
            onCapacity(e.target.value.replace(/\D/g, "").slice(0, 3));
            clear();
          }}
        />
      </Field>
    </>
  );
}

function PointEdit({ point, ...context }: Props) {
  const [name, setName] = useState(point.name);
  const [address, setAddress] = useState(point.displayAddress);
  const [capacity, setCapacity] = useState(String(point.capacity));
  const [status, setStatus] = useState(point.status);
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string>();
  const size = Number(capacity);
  const id = `point-${point.id}`;
  const statusHint =
    status === "Active" && !point.assignments.length
      ? "Cần phân công ít nhất một nhân viên trước khi mở điểm."
      : status === "Closed" && point.heldSlots > 0
        ? "Điểm còn sách hoặc chỗ đang giữ nên chưa đóng được."
        : status === "Paused"
          ? "Tạm dừng chặn booking mới; sách đã hẹn vẫn được nhận, kiểm tra và giao."
          : status === "Closed"
            ? "Chỉ đóng khi không còn sách, chỗ giữ hoặc nghĩa vụ tại điểm."
            : "Điểm nhận booking mới trong sức chứa còn lại.";
  return (
    <ActionPanel
      {...context}
      label="Sửa điểm giao nhận"
      title="Sửa thông tin và trạng thái."
      dirty={
        name !== point.name ||
        address !== point.displayAddress ||
        capacity !== String(point.capacity) ||
        status !== point.status ||
        reason !== ""
      }
      fields={(locked) => (
        <fieldset disabled={locked}>
          <PointTextFields
            id={id}
            name={name}
            address={address}
            capacity={capacity}
            problem={problem}
            held={point.heldSlots}
            onName={setName}
            onAddress={setAddress}
            onCapacity={setCapacity}
            clear={() => setProblem(undefined)}
          />
          <Field id={`${id}-status`} label="Trạng thái" hint={statusHint}>
            <select
              id={`${id}-status`}
              value={status}
              aria-describedby={`${id}-status-hint`}
              onChange={(e) =>
                setStatus(e.target.value as OperationsPoint["status"])
              }
            >
              {(["Active", "Paused", "Closed"] as const).map((value) => (
                <option key={value} value={value}>
                  {pointStatusLabels[value]}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id={`${id}-reason`}
            label="Lý do thay đổi"
            hint="Bắt buộc, 10–1.000 ký tự. Lưu vào nhật ký kiểm toán."
            error={
              problem === "reason"
                ? "Nhập lý do từ 10 đến 1.000 ký tự."
                : undefined
            }
          >
            <textarea
              id={`${id}-reason`}
              rows={2}
              maxLength={1000}
              value={reason}
              aria-invalid={problem === "reason"}
              aria-describedby={`${id}-reason-hint`}
              onChange={(e) => {
                setReason(e.target.value);
                setProblem(undefined);
              }}
            />
          </Field>
        </fieldset>
      )}
      validate={() => {
        const issue = !between(name, 3, 120)
          ? "name"
          : !between(address, 10, 300)
            ? "address"
            : !Number.isInteger(size) ||
                size < Math.max(1, point.heldSlots) ||
                size > 200
              ? "capacity"
              : !between(reason, 10, 1000)
                ? "reason"
                : undefined;
        setProblem(issue);
        if (issue) document.getElementById(`${id}-${issue}`)?.focus();
        return !issue;
      }}
      submitLabel="Lưu thay đổi"
      confirmTitle="Lưu thay đổi của điểm?"
      confirmBody={
        <>
          <p>
            {point.code}: {pointStatusLabels[status]}, sức chứa {size} cuốn
            (đang giữ {point.heldSlots}).
          </p>
          <blockquote className="prose">{reason.trim()}</blockquote>
        </>
      }
      build={() => ({
        path: `/operations/points/${point.id}`,
        body: {
          expectedVersion: point.version,
          name: name.trim(),
          displayAddress: address.trim(),
          capacity: size,
          status,
          reason: reason.trim(),
        },
      })}
      schema={pointReceipt}
      interpret={() => ({
        tone: "success",
        text: `Đã lưu điểm ${point.code}.`,
        close: true,
      })}
    />
  );
}

function PointAssign({ point, ...context }: Props) {
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState<string>();
  const [userId, setUserId] = useState<string>();
  const [problem, setProblem] = useState(false);
  const staff = useQuery({
    queryKey: ["operations", "staff", term],
    enabled: term !== undefined,
    queryFn: () => {
      const parameters = new URLSearchParams({
        limit: "20",
        role: "STAFF",
        status: "ACTIVE",
      });
      if (term) parameters.set("q", term);
      return session.request(`/operations/users?${parameters}`, staffPage);
    },
  });
  const assigned = new Set(point.assignments.map((a) => a.userId));
  const candidates = (staff.data?.items ?? []).filter(
    (u) => !assigned.has(u.id),
  );
  const chosen = candidates.find((u) => u.id === userId);
  const id = `assign-${point.id}`;
  return (
    <ActionPanel
      {...context}
      label="Phân công nhân viên"
      title="Phân công nhân viên tại điểm."
      intro="Chỉ tài khoản nhân viên đang hoạt động. Không tự phân công chính mình."
      dirty={!!userId}
      fields={(locked) => (
        <fieldset disabled={locked}>
          <form
            className="inline-search"
            onSubmit={(event) => {
              event.preventDefault();
              setUserId(undefined);
              setTerm(query.trim());
            }}
          >
            <div className="field">
              <label htmlFor={`${id}-q`}>Tìm nhân viên</label>
              <input
                id={`${id}-q`}
                type="search"
                value={query}
                placeholder="Tên hoặc email"
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Button type="submit" busy={staff.isFetching}>
              Tìm
            </Button>
          </form>
          {staff.error && (
            <ErrorNotice
              error={staff.error}
              retry={() => void staff.refetch()}
              busy={staff.isFetching}
            />
          )}
          {staff.isSuccess && !candidates.length && (
            <p className="muted">
              Không có nhân viên phù hợp chưa được phân công.
            </p>
          )}
          {candidates.length > 0 && (
            <div role="radiogroup" aria-label="Nhân viên">
              {candidates.map((u) => (
                <label className="check" key={u.id}>
                  <input
                    type="radio"
                    name={id}
                    checked={userId === u.id}
                    onChange={() => {
                      setUserId(u.id);
                      setProblem(false);
                    }}
                  />
                  {u.displayName} · {u.email}
                </label>
              ))}
            </div>
          )}
          {problem && <p className="field-error">Chọn một nhân viên.</p>}
        </fieldset>
      )}
      validate={() => {
        setProblem(!chosen);
        return !!chosen;
      }}
      submitLabel="Phân công"
      confirmTitle="Phân công nhân viên?"
      confirmBody={
        <p>
          {chosen?.displayName} sẽ nhận, kiểm tra và giao sách tại {point.name}{" "}
          ({point.code}) từ bây giờ.
        </p>
      }
      build={() => ({
        path: `/operations/points/${point.id}/assignments`,
        body: { expectedVersion: point.version, userId: chosen!.id },
      })}
      schema={pointReceipt}
      interpret={() => ({
        tone: "success",
        text: `Đã phân công ${chosen?.displayName ?? "nhân viên"} tại ${point.code}.`,
        close: true,
      })}
    />
  );
}

function PointUnassign({ point, ...context }: Props) {
  const [assignmentId, setAssignmentId] = useState<string>();
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<"who" | "reason">();
  const chosen = point.assignments.find((a) => a.id === assignmentId);
  const id = `end-${point.id}`;
  if (!point.assignments.length)
    return <p className="muted">Điểm chưa có nhân viên được phân công.</p>;
  const last = point.assignments.length === 1 && point.heldSlots > 0;
  return (
    <ActionPanel
      {...context}
      label="Kết thúc phân công"
      title="Kết thúc phân công."
      intro={
        last
          ? "Đây là nhân viên duy nhất và điểm còn sách đang giữ: hãy phân công người thay trước."
          : "Nhân viên mất quyền thao tác tại điểm ngay khi lưu."
      }
      dirty={!!assignmentId || reason !== ""}
      fields={(locked) => (
        <fieldset disabled={locked}>
          <div role="radiogroup" aria-label="Nhân viên">
            {point.assignments.map((a) => (
              <label className="check" key={a.id}>
                <input
                  type="radio"
                  name={id}
                  checked={assignmentId === a.id}
                  onChange={() => {
                    setAssignmentId(a.id);
                    setProblem(undefined);
                  }}
                />
                {a.displayName || a.userId.slice(0, 8)} · từ{" "}
                {dateText(a.validFrom)}
              </label>
            ))}
          </div>
          {problem === "who" && (
            <p className="field-error">Chọn một nhân viên.</p>
          )}
          <Field
            id={`${id}-reason`}
            label="Lý do"
            hint="Bắt buộc, 10–1.000 ký tự. Lưu vào nhật ký kiểm toán."
            error={
              problem === "reason"
                ? "Nhập lý do từ 10 đến 1.000 ký tự."
                : undefined
            }
          >
            <textarea
              id={`${id}-reason`}
              rows={2}
              maxLength={1000}
              value={reason}
              aria-invalid={problem === "reason"}
              aria-describedby={`${id}-reason-hint`}
              onChange={(e) => {
                setReason(e.target.value);
                setProblem(undefined);
              }}
            />
          </Field>
        </fieldset>
      )}
      validate={() => {
        const issue = !chosen
          ? "who"
          : !between(reason, 10, 1000)
            ? "reason"
            : undefined;
        setProblem(issue);
        if (issue === "reason")
          document.getElementById(`${id}-reason`)?.focus();
        return !issue;
      }}
      submitLabel="Kết thúc phân công"
      confirmTitle="Kết thúc phân công?"
      confirmBody={
        <>
          <p>
            {chosen?.displayName} sẽ không còn thao tác được tại {point.code}.
          </p>
          <blockquote className="prose">{reason.trim()}</blockquote>
        </>
      }
      build={() => ({
        path: `/operations/points/${point.id}/assignments/${chosen!.id}/end`,
        body: { expectedVersion: point.version, reason: reason.trim() },
      })}
      schema={pointReceipt}
      interpret={() => ({
        tone: "success",
        text: `Đã kết thúc phân công của ${chosen?.displayName ?? "nhân viên"} tại ${point.code}.`,
        close: true,
      })}
    />
  );
}
