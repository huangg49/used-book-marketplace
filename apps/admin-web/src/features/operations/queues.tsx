import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { dateText, money } from "../../core/format";
import { canOperatePoint, canResolve, session } from "../../core/session";
import {
  auctionList,
  collectionLabels,
  collectionQueue,
  intakeLabels,
  intakeList,
  reclaimLabels,
  resolutionLabels,
  resolutionQueue,
  type Intake,
} from "./contracts";
import {
  IntakeInspect,
  IntakeOpen,
  IntakeReceive,
  IntakeReclaim,
} from "./intake-actions";
import { Forbidden, OperationsQueue } from "./queue-frame";
import {
  refetchWhileClosed,
  useQueuePanel,
  type Row,
} from "./queue-panel";

// Queues for the point desks and Admin decisions. Each row's command opens
// under the row (N4-02 to N4-05).

const assignmentNote =
  "Danh sách chỉ gồm sách tại các điểm bạn đang được phân công, trừ sách của chính bạn. Nếu bạn chưa được phân công điểm nào, danh sách sẽ luôn trống; hãy liên hệ quản trị viên.";

export function IntakeQueue() {
  const user = useOutletContext<CurrentUser>();
  if (!canOperatePoint(user)) return <Forbidden />;
  return <IntakeQueueContent />;
}
function intakeMeta(item: Intake) {
  if (item.state === "AwaitingDropoff")
    return [`Hạn mang tới: ${dateText(item.dropoffDeadline)}`];
  const meta = [`Nhận lúc ${dateText(item.receivedAt)}`];
  if (item.shelfCode) meta.push(`Kệ ${item.shelfCode}`);
  if (item.reclaimReason) meta.push(reclaimLabels[item.reclaimReason]);
  return meta;
}
// N4-02: the next step for the assigned Staff member, if any.
function intakeAction(item: Intake): Row["action"] {
  switch (item.state) {
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
function IntakeQueueContent() {
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
            {item.inspectionNote && (
              <p className="prose">Ghi chú kiểm tra: {item.inspectionNote}</p>
            )}
          </>
        ),
        action: intakeAction(item),
      }))}
      empty={{ title: "Chưa có sách cần xử lý.", body: assignmentNote }}
    />
  );
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
            : `Hạn đến lấy: ${dateText(item.collectionDeadline)}`,
          ...(item.shelfCode ? [`Kệ ${item.shelfCode}`] : []),
        ],
        title: item.title,
        detail: `Người nhận: ${item.recipientName}`,
      }))}
      empty={{ title: "Chưa có đơn cần giao hoặc nhận lại.", body: assignmentNote }}
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
    queryFn: () => session.publicRequest("/auctions", auctionList),
    refetchInterval: refetchWhileClosed(panel),
  });
  return (
    <OperationsQueue
      number="04"
      title="Phiên đang diễn ra."
      intro="Theo dõi các phiên đấu giá đang mở. Chỉ hủy phiên khi có sự cố hoặc gian lận, kèm lý do; hệ thống không tự chọn người thắng."
      order="Xếp theo giờ kết thúc, gần nhất trước."
      unit="phiên"
      result={result}
      panel={panel}
      serverTime={result.data?.serverTime}
      rows={(result.data?.items ?? []).map((item) => ({
        id: item.id,
        status: `Kết thúc ${dateText(item.endAt)}`,
        meta: [item.pointName, `${item.bidderCount} người trả giá`],
        title: item.title,
        detail: `Giá hiện tại ${money(item.currentPrice ?? item.startPrice)} · bước ${money(item.step)}`,
      }))}
      empty={{
        title: "Không có phiên nào đang diễn ra.",
        body: "Phiên mới xuất hiện sau khi nhân viên điểm mở phiên cho sách đạt kiểm tra.",
      }}
    />
  );
}
