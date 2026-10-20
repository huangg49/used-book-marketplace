import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { dateText, money } from "../../core/format";
import { canOperatePoint, canResolve, session } from "../../core/session";
import { AssignmentNote } from "./assignment-note";
import { AuctionCancel } from "./auction-actions";
import {
  collectionLabels,
  collectionQueue,
  intakeLabels,
  intakeList,
  operationsAuctionList,
  reclaimLabels,
  resolutionLabels,
  resolutionQueue,
  type CollectionItem,
  type Intake,
} from "./contracts";
import {
  CollectionDispatch,
  CollectionHandover,
  CollectionReturn,
} from "./collection-actions";
import {
  IntakeEvidenceDecision,
  IntakeInspect,
  InspectionReports,
} from "./inspection";
import { IntakeOpen, IntakeReceive, IntakeReclaim } from "./intake-actions";
import { Forbidden, OperationsQueue } from "./queue-frame";
import { ResolutionDecision } from "./resolution-actions";
import { refetchWhileClosed, useQueuePanel, type Row } from "./queue-panel";

// Queues for the point desks and Admin decisions. Each row's command opens
// under the row (N4-02 to N4-05).

export function IntakeQueue() {
  const user = useOutletContext<CurrentUser>();
  if (!canOperatePoint(user)) return <Forbidden />;
  return <IntakeQueueContent userId={user.id} />;
}
function intakeMeta(item: Intake) {
  if (item.state === "AwaitingDropoff")
    return [`Hạn mang tới: ${dateText(item.dropoffDeadline)}`];
  const meta = [`Nhận lúc ${dateText(item.receivedAt)}`];
  if (item.inspectionDueAt)
    meta.push(`Hạn kiểm tra: ${dateText(item.inspectionDueAt)}`);
  if (item.reclaimDueAt)
    meta.push(`Hạn người bán nhận lại: ${dateText(item.reclaimDueAt)}`);
  if (item.state === "NeedsEvidence")
    meta.push(
      item.evidenceSubmittedAt
        ? "Người bán đã bổ sung bằng chứng"
        : `Hạn bổ sung: ${dateText(item.evidenceDeadline)}`,
    );
  if (item.shelfCode) meta.push(`Kệ ${item.shelfCode}`);
  if (item.reclaimReason) meta.push(reclaimLabels[item.reclaimReason]);
  return meta;
}
// N4-02: the next step for the assigned Staff member, if any.
function intakeAction(item: Intake, userId: string): Row["action"] {
  switch (item.state) {
    // The Staff member who asked for evidence never decides on it.
    case "NeedsEvidence":
      return item.evidenceRequestedBy === userId
        ? undefined
        : {
            label: "Xem bằng chứng",
            render: (context) => (
              <IntakeEvidenceDecision item={item} {...context} />
            ),
          };
    case "AwaitingDropoff":
      return {
        label: "Nhận sách",
        render: (context) => <IntakeReceive item={item} {...context} />,
      };
    case "Received":
      return {
        label: "Kiểm tra",
        render: (context) => <IntakeInspect item={item} {...context} />,
      };
    case "Passed":
      return {
        label: "Mở phiên",
        render: (context) => <IntakeOpen item={item} {...context} />,
      };
    case "ReclaimRequired":
      return {
        label: "Trả sách",
        render: (context) => <IntakeReclaim item={item} {...context} />,
      };
    default:
      return undefined;
  }
}
function IntakeQueueContent({ userId }: { userId: string }) {
  const panel = useQueuePanel();
  const result = useQuery({
    queryKey: ["operations", "auction-intakes"],
    queryFn: () => session.request("/operations/auction-intakes", intakeList),
    refetchInterval: refetchWhileClosed(panel),
  });
  return (
    <OperationsQueue
      number="01"
      title="Sách gửi đấu giá."
      intro="Nhận sách người bán mang tới, kiểm tra tình trạng theo bài đã duyệt rồi mở phiên hoặc trả lại sách."
      order="Xếp theo lần gửi, cũ nhất trước."
      result={result}
      panel={panel}
      rows={(result.data?.items ?? []).map((item) => ({
        id: item.id,
        status: intakeLabels[item.state],
        meta: intakeMeta(item),
        title: item.title,
        detail: (
          <>
            <p>
              Giá khởi điểm {money(item.startPrice)} · bước {money(item.step)}
              {item.buyNowPrice !== null &&
                ` · mua ngay ${money(item.buyNowPrice)}`}
            </p>
            <InspectionReports item={item} />
            {item.state === "NeedsEvidence" &&
              item.evidenceRequestedBy === userId && (
                <p>
                  Bạn đã yêu cầu bằng chứng; một nhân viên khác tại điểm sẽ
                  quyết định.
                </p>
              )}
          </>
        ),
        action: intakeAction(item, userId),
      }))}
      empty={{ title: "Chưa có sách cần xử lý.", body: <AssignmentNote /> }}
    />
  );
}

// N4-03: handover with the recipient's code, or a return check.
function collectionAction(item: CollectionItem): Row["action"] {
  if (
    item.state === "ReadyForCollection" &&
    item.fulfillmentMethod === "CarrierOutbound"
  )
    return {
      label: "Giao cho hãng",
      render: (context) => <CollectionDispatch item={item} {...context} />,
    };
  if (item.state === "ReadyForCollection")
    return {
      label: "Giao sách",
      render: (context) => <CollectionHandover item={item} {...context} />,
    };
  if (item.state === "ReturnPending")
    return {
      label: "Nhận lại sách",
      render: (context) => <CollectionReturn item={item} {...context} />,
    };
  return undefined;
}
export function CollectionQueue() {
  const user = useOutletContext<CurrentUser>();
  if (!canOperatePoint(user)) return <Forbidden />;
  return <CollectionQueueContent />;
}
function CollectionQueueContent() {
  const panel = useQueuePanel();
  const result = useQuery({
    queryKey: ["operations", "point-orders"],
    queryFn: () => session.request("/operations/point-orders", collectionQueue),
    refetchInterval: refetchWhileClosed(panel),
  });
  return (
    <OperationsQueue
      number="02"
      title="Giao sách tại điểm."
      intro="Giao sách cho người nhận bằng mã họ tự yêu cầu trên ứng dụng, và nhận lại sách khi đơn cần trả."
      order="Xếp theo hạn đến lấy, gần nhất trước."
      result={result}
      panel={panel}
      serverTime={result.data?.serverTime}
      rows={(result.data?.items ?? []).map((item) => ({
        id: item.id,
        status: collectionLabels[item.state],
        meta: [
          item.state === "ReturnPending"
            ? `Hạn trả: ${dateText(item.returnDeadline)}`
            : item.fulfillmentMethod === "CarrierOutbound"
              ? `Hạn giao cho hãng: ${dateText(item.collectionDeadline)}`
              : `Hạn đến lấy: ${dateText(item.collectionDeadline)}`,
          ...(item.shelfCode ? [`Kệ ${item.shelfCode}`] : []),
        ],
        title: item.title,
        detail: item.delivery
          ? `Giao tận nơi: ${item.delivery.recipientName} · ${item.delivery.phone} · ${item.delivery.detail}`
          : `Người nhận: ${item.recipientName}`,
        action: collectionAction(item),
      }))}
      empty={{
        title: "Chưa có đơn cần giao hoặc nhận lại.",
        body: <AssignmentNote />,
      }}
    />
  );
}

export function ResolutionQueue() {
  const user = useOutletContext<CurrentUser>();
  if (!canResolve(user)) return <Forbidden />;
  return <ResolutionQueueContent />;
}
function ResolutionQueueContent() {
  const panel = useQueuePanel();
  const result = useQuery({
    queryKey: ["operations", "point-order-resolutions"],
    queryFn: () =>
      session.request("/operations/point-order-resolutions", resolutionQueue),
    refetchInterval: refetchWhileClosed(panel),
  });
  return (
    <OperationsQueue
      number="03"
      title="Đơn chờ quyết định."
      intro="Quyết định độc lập cho đơn tại điểm khi người nhận từ chối biên bản, quá hạn hoặc khiếu nại sau khi nhận."
      order="Xếp theo lúc mở hồ sơ, cũ nhất trước."
      result={result}
      panel={panel}
      serverTime={result.data?.serverTime}
      rows={(result.data?.items ?? []).map((item) => ({
        id: item.id,
        status: resolutionLabels[item.openReason],
        meta: [`Mở lúc ${dateText(item.openedAt)}`, item.pointName],
        title: item.title,
        detail: [`Người mua đã trả ${money(item.buyerTotal)}`, item.note]
          .filter(Boolean)
          .join(" · "),
        action: {
          label: "Quyết định",
          render: (context) => <ResolutionDecision item={item} {...context} />,
        },
      }))}
      empty={{
        title: "Chưa có đơn cần quyết định.",
        body: "Đơn tại điểm bạn được phân công hoặc đơn bạn có liên quan không hiện ở đây, để quyết định luôn độc lập.",
      }}
    />
  );
}

export function AuctionQueue() {
  const user = useOutletContext<CurrentUser>();
  if (!canResolve(user)) return <Forbidden />;
  return <AuctionQueueContent />;
}
function AuctionQueueContent() {
  const panel = useQueuePanel();
  const result = useQuery({
    queryKey: ["operations", "auctions"],
    queryFn: () =>
      session.request("/operations/auctions", operationsAuctionList),
    refetchInterval: refetchWhileClosed(panel),
  });
  return (
    <OperationsQueue
      number="04"
      title="Phiên đang mở hoặc tạm giữ."
      intro="Theo dõi các phiên còn có thể hủy. Chỉ hủy khi có sự cố hoặc gian lận, kèm lý do; hệ thống không tự chọn người thắng."
      order="Xếp theo giờ kết thúc, gần nhất trước."
      unit="phiên"
      result={result}
      panel={panel}
      serverTime={result.data?.serverTime}
      rows={(result.data?.items ?? []).map((item) => ({
        id: item.id,
        status:
          item.state === "OnHold"
            ? "Tạm giữ, chờ quyết định"
            : `Kết thúc ${dateText(item.endAt)}`,
        meta: [item.pointName, `${item.bidderCount} người trả giá`],
        title: item.title,
        detail: `Giá hiện tại ${money(item.currentPrice ?? item.startPrice)} · bước ${money(item.step)}`,
        action: {
          label: "Hủy phiên",
          render: (context) => <AuctionCancel item={item} {...context} />,
        },
      }))}
      empty={{
        title: "Không có phiên nào cần theo dõi.",
        body: "Phiên bạn bán hoặc đã trả giá không hiện ở đây, để việc hủy luôn độc lập.",
      }}
    />
  );
}
