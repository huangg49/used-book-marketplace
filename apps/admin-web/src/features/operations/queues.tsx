import type { ReactNode } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { dateText, money } from "../../core/format";
import { canOperatePoint, canResolve, session } from "../../core/session";
import { Button, ErrorNotice } from "../../core/ui";
import {
  auctionList,
  collectionLabels,
  collectionQueue,
  intakeLabels,
  intakeList,
  resolutionLabels,
  resolutionQueue,
  type Intake,
} from "./contracts";

// Read-only queues for the point desks and Admin decisions. Actions on each row
// come with their own packages (N4-02 to N4-05).

interface Row {
  id: string;
  status: string;
  meta: string[];
  title: string;
  detail?: string;
}
function OperationsQueue({
  number,
  title,
  intro,
  order,
  unit = "hồ sơ",
  result,
  serverTime,
  rows,
  empty,
}: {
  number: string;
  title: string;
  intro: string;
  // The API's own sort order, stated like the review queue does.
  order: string;
  unit?: string;
  result: UseQueryResult<unknown>;
  serverTime?: string;
  rows: Row[];
  empty: { title: string; body: ReactNode };
}) {
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">Điểm và đấu giá / {number}</p>
        <h1>{title}</h1>
        <p className="intro">{intro}</p>
      </header>
      <div className="queue-toolbar">
        <Button busy={result.isFetching} onClick={() => void result.refetch()}>
          Cập nhật danh sách
        </Button>
      </div>
      <p className="muted">
        {order}{" "}
        {result.isSuccess &&
          `Đang hiển thị ${rows.length} ${unit}.${serverTime ? ` Cập nhật ${dateText(serverTime)}.` : ""}`}
      </p>
      {result.isLoading && (
        <p className="empty" role="status">
          Đang tải hồ sơ…
        </p>
      )}
      {result.error && (
        <ErrorNotice
          error={result.error}
          retry={() => void result.refetch()}
          busy={result.isFetching}
        />
      )}
      {result.isSuccess && rows.length === 0 && (
        <div className="empty">
          <span className="folio">—</span>
          <h2>{empty.title}</h2>
          <p>{empty.body}</p>
        </div>
      )}
      <div className="queue-list">
        {rows.map((row, index) => (
          <article className="queue-row" key={row.id}>
            <span className="row-number">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <div className="row-meta">
                <span>{row.status}</span>
                {row.meta.map((value) => (
                  <span key={value}>{value}</span>
                ))}
              </div>
              <h2>
                {row.title || "Chưa có tên sách"}{" "}
                <span className="short-id">/ {row.id.slice(0, 8)}</span>
              </h2>
              {row.detail && <p className="muted">{row.detail}</p>}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function Forbidden() {
  return <p>Không có quyền xem khu vực này.</p>;
}
const assignmentNote =
  "Danh sách chỉ gồm sách tại các điểm bạn đang được phân công, trừ sách của chính bạn. Nếu bạn chưa được phân công điểm nào, danh sách sẽ luôn trống; hãy liên hệ quản trị viên.";
const queueOptions = { refetchInterval: 30_000 } as const;

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
  return meta;
}
function IntakeQueueContent() {
  const result = useQuery({
    queryKey: ["operations", "auction-intakes"],
    queryFn: () => session.request("/operations/auction-intakes", intakeList),
    ...queueOptions,
  });
  return (
    <OperationsQueue
      number="01"
      title="Sách gửi đấu giá."
      intro="Nhận sách người bán mang tới, kiểm tra tình trạng theo bài đã duyệt rồi mở phiên hoặc trả lại sách."
      order="Xếp theo lần gửi, cũ nhất trước."
      result={result}
      rows={(result.data?.items ?? []).map((item) => ({
        id: item.id,
        status: intakeLabels[item.state],
        meta: intakeMeta(item),
        title: item.title,
        detail: `Giá khởi điểm ${money(item.startPrice)} · bước ${money(item.step)}${item.buyNowPrice !== null ? ` · mua ngay ${money(item.buyNowPrice)}` : ""}`,
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
  const result = useQuery({
    queryKey: ["operations", "point-orders"],
    queryFn: () => session.request("/operations/point-orders", collectionQueue),
    ...queueOptions,
  });
  return (
    <OperationsQueue
      number="02"
      title="Giao sách tại điểm."
      intro="Giao sách cho người nhận bằng mã họ tự yêu cầu trên ứng dụng, và nhận lại sách khi đơn cần trả."
      order="Xếp theo hạn đến lấy, gần nhất trước."
      result={result}
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
  const result = useQuery({
    queryKey: ["operations", "point-order-resolutions"],
    queryFn: () =>
      session.request("/operations/point-order-resolutions", resolutionQueue),
    ...queueOptions,
  });
  return (
    <OperationsQueue
      number="03"
      title="Đơn chờ quyết định."
      intro="Quyết định độc lập cho đơn tại điểm khi người nhận từ chối biên bản, quá hạn hoặc khiếu nại sau khi nhận."
      order="Xếp theo lúc mở hồ sơ, cũ nhất trước."
      result={result}
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
  const result = useQuery({
    queryKey: ["operations", "auctions"],
    queryFn: () => session.publicRequest("/auctions", auctionList),
    ...queueOptions,
  });
  return (
    <OperationsQueue
      number="04"
      title="Phiên đang diễn ra."
      intro="Theo dõi các phiên đấu giá đang mở. Chỉ hủy phiên khi có sự cố hoặc gian lận, kèm lý do; hệ thống không tự chọn người thắng."
      order="Xếp theo giờ kết thúc, gần nhất trước."
      unit="phiên"
      result={result}
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
