import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { dateText, money } from "../../core/format";
import { canOperatePoint, canResolve, session } from "../../core/session";
import { Button, ErrorNotice } from "../../core/ui";
import { ActionPanel } from "./action-panel";
import { MotionPanel } from "../../core/MotionPanel";
import {
  incidentFund,
  incidentKindLabels,
  incidentStateLabels,
  intakeList,
  myPointAssignments,
  operationsPointList,
  pointIncidentList,
  pointReceipt,
  type PointIncident,
} from "./contracts";
import { Field } from "./field";
import { Forbidden, OperationsQueue } from "./queue-frame";
import {
  refetchWhileClosed,
  useQueuePanel,
  type ActionContext,
} from "./queue-panel";

// N4-13 (FR-T04, FR-H07, POL-42): Staff and Admins record incidents at a
// point, even before any Order. An independent Admin decides. Compensation
// is capped by the protected value and funded from the simulated fund while
// it lasts; nothing is paid into a member wallet from here.

const length = (value: string) => [...value.trim()].length;

export function IncidentsPage() {
  const user = useOutletContext<CurrentUser>();
  if (!canOperatePoint(user) && !canResolve(user)) return <Forbidden />;
  return <IncidentsContent user={user} />;
}

function IncidentsContent({ user }: { user: CurrentUser }) {
  const panel = useQueuePanel();
  const [opening, setOpening] = useState(false);
  const admin = canResolve(user);
  const result = useQuery({
    queryKey: ["operations", "incidents"],
    queryFn: () => session.request("/operations/incidents", pointIncidentList),
    refetchInterval: opening ? false : refetchWhileClosed(panel),
  });
  return (
    <>
      {admin && <FundSummary refreshKey={result.dataUpdatedAt} />}
      <OperationsQueue
        number="06"
        title="Sự cố tại điểm."
        intro="Ghi nhận mất, hư hỏng hoặc sách đến không khớp, kể cả khi chưa có đơn. Quản trị viên độc lập với điểm quyết định bồi thường trong giá trị bảo vệ."
        order="Sự cố chờ quyết định trước, cũ nhất trước; sau đó là các quyết định gần nhất."
        unit="sự cố"
        result={result}
        serverTime={result.data?.serverTime}
        panel={panel}
        extra={(context) => (
          <>
            <MotionPanel open={opening} className="row-panel">
              {opening && (
                <IncidentOpen
                  {...context}
                  admin={admin}
                  onFinish={(outcome) => {
                    setOpening(false);
                    context.onFinish(outcome);
                  }}
                  onClose={() => setOpening(false)}
                />
              )}
            </MotionPanel>
            {!opening && (
              <Button
                disabled={panel.pending}
                onClick={() => {
                  panel.setOpen(undefined);
                  panel.setNotice(undefined);
                  setOpening(true);
                }}
              >
                Báo sự cố
              </Button>
            )}
          </>
        )}
        rows={(result.data?.items ?? []).map((item) => ({
          id: item.id,
          status: incidentStateLabels[item.state],
          meta: [
            incidentKindLabels[item.kind],
            item.pointName,
            `Mở ${dateText(item.openedAt)}`,
            ...(item.protectedValue !== null
              ? [`Giá trị bảo vệ ${money(item.protectedValue)}`]
              : []),
          ],
          title: item.title ?? incidentKindLabels[item.kind],
          detail: <IncidentDetail item={item} />,
          action:
            admin && item.state === "Open" && item.openedBy !== user.id
              ? {
                  label: "Quyết định",
                  render: (context) => (
                    <IncidentDecide item={item} {...context} />
                  ),
                }
              : undefined,
        }))}
        empty={{
          title: "Chưa có sự cố.",
          body: admin
            ? "Sự cố do nhân viên điểm hoặc quản trị viên báo sẽ hiện ở đây."
            : "Chỉ hiện sự cố tại các điểm bạn đang được phân công.",
        }}
      />
    </>
  );
}

function IncidentDetail({ item }: { item: PointIncident }) {
  return (
    <>
      <p className="prose">{item.description}</p>
      {item.decision === "NoCompensation" && (
        <p>Không bồi thường. {item.decisionReason}</p>
      )}
      {item.decision === "Compensate" && (
        <p>
          Duyệt bồi thường {money(item.approvedAmount)}: quỹ mô phỏng đáp ứng{" "}
          {money(item.fundedAmount)}
          {item.unfundedAmount
            ? `, còn thiếu ${money(item.unfundedAmount)} (đã ghi nhận, điểm tạm dừng nhận booking mới)`
            : ""}
          . Chưa chi vào ví thành viên. {item.decisionReason}
        </p>
      )}
    </>
  );
}

function FundSummary({ refreshKey }: { refreshKey: number }) {
  const fund = useQuery({
    queryKey: ["operations", "incident-fund", refreshKey],
    queryFn: () => session.request("/operations/incident-fund", incidentFund),
  });
  if (fund.error)
    return (
      <ErrorNotice
        error={fund.error}
        retry={() => void fund.refetch()}
        busy={fund.isFetching}
      />
    );
  if (!fund.data) return null;
  return (
    <aside className="fund-summary" aria-label="Quỹ sự cố mô phỏng">
      <p className="eyebrow">Quỹ sự cố mô phỏng (POL-42)</p>
      <dl>
        <div>
          <dt>Số dư mở đầu</dt>
          <dd>{money(fund.data.opening)}</dd>
        </div>
        <div>
          <dt>Đã duyệt</dt>
          <dd>{money(fund.data.approved)}</dd>
        </div>
        <div>
          <dt>Còn lại</dt>
          <dd>{money(fund.data.balance)}</dd>
        </div>
      </dl>
      <p className="muted">
        Không tự nạp thêm. Khoản duyệt chưa được chi vào ví thành viên; chi trả
        cần cổng quyết toán riêng.
      </p>
    </aside>
  );
}

type Kind = PointIncident["kind"];
function IncidentOpen({
  admin,
  onClose,
  ...context
}: ActionContext & { admin: boolean; onClose: () => void }) {
  const points = useQuery({
    queryKey: ["incident-points", admin],
    queryFn: async () =>
      admin
        ? (
            await session.request("/operations/points", operationsPointList)
          ).items.map((p) => ({ id: p.id, label: `${p.name} (${p.code})` }))
        : (
            await session.request("/me/point-assignments", myPointAssignments)
          ).items.map((p) => ({
            id: p.pointId,
            label: `${p.name} (${p.code})`,
          })),
  });
  // Staff pick the book from their intake desk; Admins report without one.
  const intakes = useQuery({
    queryKey: ["operations", "auction-intakes"],
    enabled: !admin,
    queryFn: () => session.request("/operations/auction-intakes", intakeList),
  });
  const [pointId, setPointId] = useState("");
  const [intakeId, setIntakeId] = useState("");
  const [kind, setKind] = useState<Kind>("Damaged");
  const [description, setDescription] = useState("");
  const [problem, setProblem] = useState<string>();
  const books = (intakes.data?.items ?? []).filter(
    (i) => i.pointId === pointId && i.state !== "AwaitingDropoff",
  );
  const kinds = (Object.keys(incidentKindLabels) as Kind[]).filter(
    (k) => admin || k !== "EmergencyClose",
  );
  return (
    <>
      {points.error && (
        <ErrorNotice
          error={points.error}
          retry={() => void points.refetch()}
          busy={points.isFetching}
        />
      )}
      <ActionPanel
        {...context}
        label="Báo sự cố"
        title="Báo sự cố tại điểm."
        intro={
          kind === "EmergencyClose"
            ? "Đóng khẩn cấp dừng nhận booking mới ngay. Sách và nghĩa vụ đang có vẫn ở điểm để trả lại hoặc điều tra."
            : "Mô tả điều đã thấy, thời điểm và vị trí. Không ghi mã nhận, địa chỉ hay thông tin cá nhân."
        }
        dirty={pointId !== "" || description !== ""}
        fields={(locked) => (
          <fieldset disabled={locked}>
            <Field
              id="incident-point"
              label="Điểm"
              hint={admin ? "Mọi điểm." : "Các điểm bạn đang được phân công."}
              error={problem === "point" ? "Chọn điểm." : undefined}
            >
              <select
                id="incident-point"
                value={pointId}
                aria-describedby="incident-point-hint"
                onChange={(e) => {
                  setPointId(e.target.value);
                  setIntakeId("");
                  setProblem(undefined);
                }}
              >
                <option value="">Chọn điểm</option>
                {(points.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            {!admin && (
              <Field
                id="incident-intake"
                label="Sách liên quan"
                hint="Để trống nếu sự cố không gắn với một cuốn sách. Giá trị bảo vệ lấy từ sách đã chọn."
              >
                <select
                  id="incident-intake"
                  value={intakeId}
                  aria-describedby="incident-intake-hint"
                  onChange={(e) => setIntakeId(e.target.value)}
                >
                  <option value="">Không gắn sách</option>
                  {books.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title}
                      {i.shelfCode ? ` · kệ ${i.shelfCode}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field
              id="incident-kind"
              label="Loại sự cố"
              hint="Chọn loại gần nhất."
            >
              <select
                id="incident-kind"
                value={kind}
                aria-describedby="incident-kind-hint"
                onChange={(e) => setKind(e.target.value as Kind)}
              >
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {incidentKindLabels[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              id="incident-description"
              label="Mô tả"
              hint="Bắt buộc, 20–2.000 ký tự."
              error={
                problem === "description"
                  ? "Mô tả từ 20 đến 2.000 ký tự."
                  : undefined
              }
            >
              <textarea
                id="incident-description"
                rows={4}
                maxLength={2000}
                value={description}
                aria-invalid={problem === "description"}
                aria-describedby="incident-description-hint"
                onChange={(e) => {
                  setDescription(e.target.value);
                  setProblem(undefined);
                }}
              />
            </Field>
          </fieldset>
        )}
        validate={() => {
          const issue = !pointId
            ? "point"
            : length(description) < 20 || length(description) > 2000
              ? "description"
              : undefined;
          setProblem(issue);
          if (issue) document.getElementById(`incident-${issue}`)?.focus();
          return !issue;
        }}
        submitLabel="Báo sự cố"
        confirmTitle={
          kind === "EmergencyClose" ? "Đóng khẩn cấp điểm?" : "Báo sự cố?"
        }
        confirmBody={
          <>
            <p>
              {incidentKindLabels[kind]} tại{" "}
              {points.data?.find((p) => p.id === pointId)?.label}.
              {kind === "EmergencyClose" &&
                " Điểm dừng nhận booking mới ngay khi lưu."}
            </p>
            <blockquote className="prose">{description.trim()}</blockquote>
          </>
        }
        build={() => ({
          path: "/operations/incidents",
          body: {
            pointId,
            intakeId: intakeId || null,
            kind,
            description: description.trim(),
          },
        })}
        schema={pointReceipt}
        interpret={() => ({
          tone: "success",
          text:
            kind === "EmergencyClose"
              ? "Đã đóng khẩn cấp: điểm dừng nhận booking mới. Một quản trị viên khác sẽ quyết định."
              : "Đã báo sự cố. Một quản trị viên độc lập sẽ quyết định.",
          close: true,
        })}
      />
      <div className="actions">
        <Button onClick={onClose}>Đóng</Button>
      </div>
    </>
  );
}

function IncidentDecide({
  item,
  ...context
}: { item: PointIncident } & ActionContext) {
  const [decision, setDecision] = useState<"Compensate" | "NoCompensation">();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string>();
  const value = decision === "Compensate" ? Number(amount) : 0;
  const cap = item.protectedValue;
  const id = `incident-${item.id}`;
  return (
    <ActionPanel
      {...context}
      label="Quyết định sự cố"
      title="Quyết định bồi thường."
      intro={
        cap === null
          ? "Sự cố không gắn sách nên không có giá trị bảo vệ; chỉ có thể không bồi thường."
          : `Bồi thường tối đa bằng giá trị bảo vệ ${money(cap)}; hư hỏng chỉ tính phần thiệt hại đã xác minh. Quỹ thiếu thì phần còn lại được ghi nhận và điểm tạm dừng nhận booking mới.`
      }
      dirty={!!decision || amount !== "" || reason !== ""}
      fields={(locked) => (
        <fieldset disabled={locked}>
          <fieldset>
            <legend>Quyết định</legend>
            <label className="check">
              <input
                type="radio"
                name={`${id}-decision`}
                checked={decision === "Compensate"}
                disabled={cap === null}
                onChange={() => {
                  setDecision("Compensate");
                  setProblem(undefined);
                }}
              />
              Bồi thường từ quỹ sự cố mô phỏng
            </label>
            <label className="check">
              <input
                type="radio"
                name={`${id}-decision`}
                checked={decision === "NoCompensation"}
                onChange={() => {
                  setDecision("NoCompensation");
                  setProblem(undefined);
                }}
              />
              Không bồi thường
            </label>
          </fieldset>
          {problem === "decision" && (
            <p className="field-error">Chọn một quyết định.</p>
          )}
          {decision === "Compensate" && (
            <Field
              id={`${id}-amount`}
              label="Số tiền bồi thường (đ)"
              hint={`Từ 1đ đến ${money(cap)}.`}
              error={
                problem === "amount"
                  ? `Nhập số tiền từ 1đ đến ${money(cap)}.`
                  : undefined
              }
            >
              <input
                id={`${id}-amount`}
                inputMode="numeric"
                value={amount}
                aria-invalid={problem === "amount"}
                aria-describedby={`${id}-amount-hint`}
                onChange={(e) => {
                  setAmount(e.target.value.replace(/\D/g, "").slice(0, 7));
                  setProblem(undefined);
                }}
              />
            </Field>
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
              rows={3}
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
        const issue = !decision
          ? "decision"
          : decision === "Compensate" &&
              (!Number.isInteger(value) || value < 1 || value > (cap ?? 0))
            ? "amount"
            : length(reason) < 10 || length(reason) > 1000
              ? "reason"
              : undefined;
        setProblem(issue);
        if (issue && issue !== "decision")
          document.getElementById(`${id}-${issue}`)?.focus();
        return !issue;
      }}
      submitLabel="Ghi quyết định"
      confirmTitle="Ghi quyết định sự cố?"
      confirmBody={
        <>
          <p>
            {decision === "Compensate"
              ? `Duyệt bồi thường ${money(value)} từ quỹ mô phỏng. Nếu quỹ không đủ, phần thiếu được ghi nhận và điểm tạm dừng nhận booking mới. Khoản này chưa được chi vào ví thành viên.`
              : "Không bồi thường cho sự cố này."}{" "}
            Không sửa được sau khi ghi.
          </p>
          <blockquote className="prose">{reason.trim()}</blockquote>
        </>
      }
      build={() => ({
        path: `/operations/incidents/${item.id}/decide`,
        body: {
          expectedVersion: item.version,
          decision,
          amount: value,
          reason: reason.trim(),
        },
      })}
      schema={pointReceipt}
      interpret={(receipt) => ({
        tone: receipt.state === "Underfunded" ? "warning" : "success",
        text:
          receipt.state === "Underfunded"
            ? "Đã ghi quyết định. Quỹ không đủ: phần thiếu được ghi nhận và điểm tạm dừng nhận booking mới."
            : "Đã ghi quyết định sự cố.",
        close: true,
      })}
    />
  );
}
