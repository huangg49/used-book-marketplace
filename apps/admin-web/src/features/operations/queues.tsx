import { useQuery } from "@tanstack/react-query";
import { ChevronDown, MapPin } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { dateText, money } from "../../core/format";
import { canOperateIntake, canOperatePoint, canResolve, session } from "../../core/session";
import { AssignmentNote } from "./assignment-note";
import { AuctionCancel, AuctionHoldDecision, AuctionScheduledDecision } from "./auction-actions";
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
  type OperationsAuction,
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
import { IntakeReceive, IntakeReclaim } from "./intake-actions";
import { Forbidden, OperationsQueue } from "./queue-frame";
import { ResolutionDecision } from "./resolution-actions";
import { refetchWhileClosed, useQueuePanel, type Row } from "./queue-panel";
import intakeStyles from "./IntakeQueue.module.css";

// Queues for the point desks and Admin decisions. Each row's command opens
// under the row (N4-02 to N4-05).

export function IntakeQueue() {
  const user = useOutletContext<CurrentUser>();
  if (!canOperateIntake(user)) return <Forbidden />;
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
  if (item.reclaimReason) meta.push(reclaimLabels[item.reclaimReason]);
  return meta;
}
const intakeTone = {
  AwaitingDropoff: "neutral",
  Received: "ready",
  Passed: "active",
  NeedsEvidence: "attention",
  Auctioning: "active",
  ReclaimRequired: "attention",
  Reclaimed: "neutral",
  Cancelled: "neutral",
  Sold: "completed",
} as const satisfies Record<Intake["state"], string>;

function IntakeRowSummary({
  item,
  meta,
  userId,
}: {
  item: Intake;
  meta: string[];
  userId: string;
}) {
  const title = item.title || "Chưa có tên sách";
  const disclosureLabel = item.reports.length ? "Giá và biên bản" : "Thông tin giá";
  const waitingForOtherReviewer =
    item.state === "NeedsEvidence" && item.evidenceRequestedBy === userId;
  return (
    <div className={intakeStyles.rowSummary}>
      <div className={intakeStyles.summaryGrid}>
        <div className={intakeStyles.book}>
          <h2>{title}</h2>
          <span className={intakeStyles.reference}>#{item.id.slice(0, 8)}</span>
        </div>
        <div className={intakeStyles.status}>
          <span className={intakeStyles.badge} data-tone={intakeTone[item.state]}>
            {intakeLabels[item.state]}
          </span>
          {waitingForOtherReviewer && (
            <p>Nhân viên hoặc quản trị viên khác sẽ xem bằng chứng bạn đã yêu cầu.</p>
          )}
        </div>
        <div className={intakeStyles.placement}>
          {item.shelfCode && (
            <span className={intakeStyles.shelf}>
              <MapPin size={15} aria-hidden="true" />
              Kệ {item.shelfCode}
            </span>
          )}
          <ul className={intakeStyles.meta}>
            {meta.map((value) => <li key={value}>{value}</li>)}
          </ul>
        </div>
      </div>
      <details className={intakeStyles.disclosure}>
        <summary aria-label={`${disclosureLabel} của ${title}`}>
          <ChevronDown size={15} aria-hidden="true" />
          {disclosureLabel}
        </summary>
        <div className={intakeStyles.disclosureBody}>
          <dl>
            <div><dt>Giá khởi điểm</dt><dd>{money(item.startPrice)}</dd></div>
            <div><dt>Bước giá</dt><dd>{money(item.step)}</dd></div>
            {item.buyNowPrice !== null && (
              <div><dt>Giá mua ngay</dt><dd>{money(item.buyNowPrice)}</dd></div>
            )}
          </dl>
          <InspectionReports item={item} />
        </div>
      </details>
    </div>
  );
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
    // ADR 0047: the seller publishes a Passed book; Staff no longer open it.
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
      title="Sách gửi đấu giá"
      intro="Nhận và kiểm tra sách theo bài đã duyệt. Sách đạt do người bán đăng hoặc hẹn phiên. Sách không đạt thì trả tại điểm."
      order="Xếp theo lần gửi, cũ nhất trước."
      result={result}
      panel={panel}
      presentation={{
        className: intakeStyles.queue,
        listHeader: (
          <div className={intakeStyles.listHeader} aria-hidden="true">
            <div className={intakeStyles.summaryGrid}>
              <span>Hồ sơ sách</span>
              <span>Trạng thái</span>
              <span>Tiếp nhận tại điểm</span>
            </div>
            <span>Thao tác</span>
          </div>
        ),
      }}
      rows={(result.data?.items ?? []).map((item) => {
        const meta = intakeMeta(item);
        return {
          id: item.id,
          status: intakeLabels[item.state],
          meta: [...meta, item.shelfCode ?? ""],
          title: item.title,
          summary: <IntakeRowSummary item={item} meta={meta} userId={userId} />,
          action: intakeAction(item, userId),
        };
      })}
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

const AUCTION_TYPE_LABEL: Record<NonNullable<OperationsAuction["auctionType"]>, string> = {
  English: "Trả giá lên",
  Dutch: "Giá giảm dần",
  SealedFirst: "Giá kín",
  SealedSecond: "Giá kín · giá thứ hai",
};

// ADR 0081: before a registration auction is full, startAt is the 24 h
// registration deadline, not the open time; show the seller's time instead.
function scheduledStatus(item: OperationsAuction, serverTime?: string) {
  const need = item.minBidders;
  if (need == null || !item.opensAt)
    return `Hẹn mở ${dateText(item.startAt)} · kết thúc ${dateText(item.endAt)}`;
  if ((item.registeredCount ?? 0) >= need)
    return `Đủ người, mở ${dateText(item.startAt)} · kết thúc ${dateText(item.endAt)}`;
  const now = serverTime ? Date.parse(serverTime) : Date.now();
  return Date.parse(item.opensAt) > now
    ? `Chờ đủ người, mở ${dateText(item.opensAt)} · chưa đủ thì hủy ${dateText(item.startAt)}`
    : `Đã qua giờ mở, chờ đủ người tới ${dateText(item.startAt)}`;
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
      intro="Theo dõi các phiên còn có thể hủy. Phiên chờ mở đã đủ người đăng ký có thể mở ngay, kèm lý do. Chỉ hủy khi có sự cố hoặc gian lận, kèm lý do; hệ thống không tự chọn người thắng. Phiên tạm giữ được tiếp tục (cộng lại thời gian tạm dừng) hoặc hủy; mỗi phiên tạm dừng tối đa 72 giờ."
      order="Xếp theo giờ kết thúc, gần nhất trước."
      unit="phiên"
      result={result}
      panel={panel}
      serverTime={result.data?.serverTime}
      rows={(result.data?.items ?? []).map((item) => ({
        id: item.id,
        status:
          item.state === "OnHold"
            ? `${item.holdReason === "Review" ? "Tạm dừng vì báo cáo" : "Tạm giữ"}, chờ quyết định${item.holdExpiresAt ? ` · tự hủy ${dateText(item.holdExpiresAt)}` : ""}`
            : item.phase === "Scheduled"
              ? scheduledStatus(item, result.data?.serverTime)
              : `Kết thúc ${dateText(item.endAt)}`,
        meta: [
          item.pointName,
          ...(item.auctionType && item.auctionType !== "English"
            ? [AUCTION_TYPE_LABEL[item.auctionType]]
            : []),
          ...(item.minBidders != null
            ? [`${item.registeredCount ?? 0}/${item.minBidders} người đăng ký`]
            : []),
          `${item.bidderCount} người trả giá`,
        ],
        title: item.title,
        detail: `Giá hiện tại ${money(item.currentPrice ?? item.startPrice)} · bước ${money(item.step)}`,
        action:
          item.state === "OnHold"
            ? {
                label: "Xử lý phiên",
                render: (context) => <AuctionHoldDecision item={item} {...context} />,
              }
            : item.phase === "Scheduled"
              ? {
                  label: "Mở hoặc hủy phiên",
                  render: (context) => <AuctionScheduledDecision item={item} {...context} />,
                }
              : {
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
