import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { dateText } from "../../core/format";
import { canSimulate, session } from "../../core/session";
import { ActionPanel } from "./action-panel";
import {
  simulatedDeliveryQueue,
  type SimulatedDelivery,
} from "./contracts";
import { Forbidden, OperationsQueue } from "./queue-frame";
import {
  refetchWhileClosed,
  useQueuePanel,
  type ActionContext,
} from "./queue-panel";

// ADR 0044: an independent TEST_OPERATOR reports what the simulated carrier
// did with an auction book the point handed over. Each confirmation is one
// event: its id is the Idempotency-Key, frozen for retries after an unknown
// outcome. Delivered starts the buyer's inspection window; Failed goes to an
// independent Admin, who can only require the book back.

export function DeliverySimulator() {
  const user = useOutletContext<CurrentUser>();
  if (!canSimulate(user)) return <Forbidden />;
  return <DeliverySimulatorContent />;
}

function DeliverySimulatorContent() {
  const panel = useQueuePanel();
  const result = useQuery({
    queryKey: ["operations", "simulator", "point-deliveries"],
    queryFn: async () => {
      const sent = Date.now();
      const data = await session.request(
        "/operations/simulator/point-deliveries",
        simulatedDeliveryQueue,
      );
      // Server clock minus local clock, so an event time is never in the
      // server's future.
      const offset = Date.parse(data.serverTime) - (sent + Date.now()) / 2;
      return { ...data, offset };
    },
    refetchInterval: refetchWhileClosed(panel),
  });
  const offset = result.data?.offset ?? 0;
  return (
    <OperationsQueue
      number="06"
      title="Mô phỏng hãng vận chuyển."
      intro="Báo kết quả giao các sách đấu giá điểm đã giao cho hãng vận chuyển mô phỏng. Chỉ dùng tài khoản vận hành thử, không phải người mua hoặc người bán của đơn."
      order="Xếp theo hạn giao, gần nhất trước."
      unit="đơn"
      result={result}
      panel={panel}
      serverTime={result.data?.serverTime}
      rows={(result.data?.items ?? []).map((item) => ({
        id: item.orderId,
        status: "Đang giao",
        meta: [
          `Mã vận đơn ${item.trackingCode}`,
          `Hạn giao: ${dateText(item.deliveryDeadline)}`,
        ],
        title: item.title,
        detail: `Giao từ ${item.pointName} lúc ${dateText(item.dispatchedAt)}`,
        action: {
          label: "Báo kết quả",
          render: (context) => (
            <DeliveryOutcome item={item} offset={offset} {...context} />
          ),
        },
      }))}
      empty={{
        title: "Không có đơn đang giao.",
        body: "Đơn xuất hiện ở đây sau khi nhân viên điểm giao sách cho hãng vận chuyển.",
      }}
    />
  );
}

type Outcome = "Delivered" | "Failed";
function DeliveryOutcome({
  item,
  offset,
  ...context
}: { item: SimulatedDelivery; offset: number } & ActionContext) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [missing, setMissing] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const choice = (value: Outcome, text: string, ref?: typeof first) => (
    <label className="check">
      <input
        ref={ref}
        type="radio"
        name={`outcome-${item.orderId}`}
        checked={outcome === value}
        onChange={() => {
          setOutcome(value);
          setMissing(false);
        }}
      />
      {text}
    </label>
  );
  return (
    <ActionPanel
      {...context}
      label="Báo kết quả giao hàng"
      title="Báo kết quả của hãng vận chuyển."
      intro={`Vận đơn ${item.trackingCode}. Kết quả ghi theo giờ máy chủ lúc xác nhận và chỉ báo được một lần cho mỗi đơn.`}
      dirty={outcome !== null}
      fields={(locked) => (
        <>
          <fieldset disabled={locked}>
            <legend>Kết quả</legend>
            {choice(
              "Delivered",
              "Đã giao tới người nhận: bắt đầu 72 giờ kiểm tra sách",
              first,
            )}
            {choice(
              "Failed",
              "Giao không thành công: chuyển quản trị viên yêu cầu trả sách về điểm",
            )}
          </fieldset>
          {missing && <p className="field-error">Chọn kết quả giao hàng.</p>}
        </>
      )}
      validate={() => {
        if (outcome) return true;
        setMissing(true);
        first.current?.focus();
        return false;
      }}
      submitLabel="Báo kết quả"
      confirmTitle={
        outcome === "Failed"
          ? "Báo giao không thành công?"
          : "Báo đã giao tới người nhận?"
      }
      confirmBody={
        <p>
          “{item.title}” · vận đơn {item.trackingCode}.{" "}
          {outcome === "Failed"
            ? "Đơn chuyển quản trị viên xử lý; tiền vẫn được giữ."
            : "Người nhận có 72 giờ để báo nếu sách khác biên bản."}
        </p>
      }
      build={() => {
        const eventId = crypto.randomUUID();
        return {
          path: "/operations/simulator/point-delivery-events",
          key: eventId,
          body: {
            eventId,
            orderId: item.orderId,
            carrier: "LatLaiSimulator",
            trackingCode: item.trackingCode,
            outcome,
            occurredAt: new Date(Date.now() + offset - 1000).toISOString(),
          },
        };
      }}
      interpret={(receipt) =>
        receipt.state === "Inspection"
          ? {
              tone: "success",
              text: `Đã ghi nhận giao thành công “${item.title}”. Thời hạn kiểm tra của người nhận bắt đầu.`,
              close: true,
            }
          : receipt.state === "ResolutionPending"
            ? {
                tone: "warning",
                text: `Đã ghi nhận giao không thành công “${item.title}”. Đơn chờ quản trị viên xử lý.`,
                close: true,
              }
            : {
                tone: "info",
                text: "Máy chủ chưa báo trạng thái mới. Danh sách đã tải lại.",
                close: true,
              }
      }
    />
  );
}
