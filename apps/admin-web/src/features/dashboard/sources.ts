import type { CurrentUser } from "@used-books/session-client";
import type { z } from "zod";
import type { Request } from "../../core/command";
import {
  canOperatePoint,
  canResolve,
  canReview,
  canReviewCatalog,
  canSimulate,
} from "../../core/session";
import {
  catalog,
  labels,
  listing,
  pageOf,
  type Listing,
} from "../review/contracts";
import {
  collectionLabels,
  collectionQueue,
  incidentFund,
  incidentKindLabels,
  incidentStateLabels,
  intakeLabels,
  intakeList,
  operationsAuctionList,
  operationsPointList,
  pointEscalationList,
  pointIncidentList,
  resolutionLabels,
  resolutionQueue,
  simulatedDeliveryQueue,
} from "../operations/contracts";
import { operationsUsersPage, userStatusLabel } from "../users/contracts";

export type DashboardRow = {
  id: string;
  title: string;
  detail: string;
  at?: string;
  to?: string;
};
export type DashboardSnapshot = {
  points?: { id: string; name: string; capacity: number; heldSlots: number; status: string }[];
  value: number;
  more?: boolean;
  money?: boolean;
  serverTime?: string;
  rows: DashboardRow[];
  reviewItems?: Listing[];
};
export type DashboardSource = {
  id: string;
  title: string;
  to: string;
  path: string;
  note: string;
  load: (request: Request) => Promise<DashboardSnapshot>;
};

function source<T>(
  meta: Omit<DashboardSource, "load">,
  schema: z.ZodType<T>,
  summarize: (data: T) => DashboardSnapshot,
): DashboardSource {
  return {
    ...meta,
    load: async (request) => summarize(await request(meta.path, schema)),
  };
}

export function dashboardSources(user: CurrentUser): DashboardSource[] {
  const sources: DashboardSource[] = [];
  if (canReview(user))
    sources.push(
      source(
        {
          id: "listings",
          title: "Bài đăng chờ duyệt",
          to: "/review/listings?status=PendingReview",
          path: "/operations/listings?moderation=PendingReview&limit=20",
          note: "Hồ sơ theo lần gửi, cũ nhất trước.",
        },
        pageOf(listing),
        (data) => ({
          value: data.items.length,
          more: data.nextCursor !== null,
          serverTime: data.serverTime,
          reviewItems: data.items.slice(0, 6),
          rows: data.items
            .slice(0, 3)
            .map((item) => ({
              id: item.id,
              title:
                item.currentRevision.content.bundle?.title ||
                item.currentRevision.content.description.trim().slice(0, 80) ||
                `Bài đăng ${item.id.slice(0, 8)}`,
              detail:
                item.channel === "Auction"
                  ? "Sách đấu giá"
                  : labels[item.currentRevision.content.mode || ""] ||
                    "Bài đăng sách",
              at: item.currentRevision.submittedAt || item.createdAt,
              to: `/review/listings/${item.id}`,
            })),
        }),
      ),
    );
  if (canReviewCatalog(user))
    sources.push(
      source(
        {
          id: "catalog",
          title: "Đầu sách chờ xác nhận",
          to: "/review/catalog-requests?status=Pending",
          path: "/operations/catalog-requests?status=Pending&limit=20",
          note: "Yêu cầu xác nhận thông tin đầu sách.",
        },
        pageOf(catalog),
        (data) => ({
          value: data.items.length,
          more: data.nextCursor !== null,
          serverTime: data.serverTime,
          rows: data.items
            .slice(0, 3)
            .map((item) => ({
              id: item.id,
              title: item.currentRevision.metadata.title,
              detail: item.currentRevision.metadata.authors.join(" · "),
              at: item.currentRevision.submittedAt,
              to: `/review/catalog-requests/${item.id}`,
            })),
        }),
      ),
      source(
        {
          id: "users",
          title: "Tra cứu người dùng",
          to: "/users",
          path: "/operations/users?limit=20",
          note: "Tài khoản trong kết quả tra cứu; không phải tổng số toàn hệ thống.",
        },
        operationsUsersPage,
        (data) => ({
          value: data.items.length,
          more: data.nextCursor !== null,
          serverTime: data.serverTime,
          rows: data.items
            .slice(0, 3)
            .map((item) => ({
              id: item.id,
              title: item.displayName,
              detail: userStatusLabel[item.status],
              at: item.createdAt,
            })),
        }),
      ),
    );
  if (canOperatePoint(user))
    sources.push(
      source(
        {
          id: "intakes",
          title: "Sách tại điểm được phân công",
          to: "/operations/intakes",
          path: "/operations/auction-intakes",
          note: "Theo danh sách tiếp nhận được cấp quyền.",
        },
        intakeList,
        (data) => ({
          value: data.items.length,
          rows: data.items
            .slice(0, 3)
            .map((item) => ({
              id: item.id,
              title: item.title,
              detail: intakeLabels[item.state],
              at: item.createdAt,
            })),
        }),
      ),
      source(
        {
          id: "collections",
          title: "Đơn tại điểm được phân công",
          to: "/operations/collections",
          path: "/operations/point-orders",
          note: "Theo danh sách giao và nhận lại sách tại điểm.",
        },
        collectionQueue,
        (data) => ({
          value: data.items.length,
          serverTime: data.serverTime,
          rows: data.items
            .slice(0, 3)
            .map((item) => ({
              id: item.id,
              title: item.title,
              detail: collectionLabels[item.state],
            })),
        }),
      ),
    );
  if (canOperatePoint(user) || canResolve(user))
    sources.push(
      source(
        {
          id: "incidents",
          title: "Sự cố tại điểm",
          to: "/operations/incidents",
          path: "/operations/incidents",
          note: "Bao gồm sự cố và quyết định trong danh sách được phép xem.",
        },
        pointIncidentList,
        (data) => ({
          value: data.items.length,
          serverTime: data.serverTime,
          rows: data.items
            .slice(0, 3)
            .map((item) => ({
              id: item.id,
              title: item.title || incidentKindLabels[item.kind],
              detail: `${item.pointName} · ${incidentStateLabels[item.state]}`,
              at: item.openedAt,
            })),
        }),
      ),
    );
  if (canResolve(user))
    sources.push(
      source(
        {
          id: "resolutions",
          title: "Đơn chờ xử lý tại điểm",
          to: "/operations/resolutions",
          path: "/operations/point-order-resolutions",
          note: "Chỉ hiển thị các trường hợp quản trị viên được xử lý.",
        },
        resolutionQueue,
        (data) => ({
          value: data.items.length,
          serverTime: data.serverTime,
          rows: data.items
            .slice(0, 3)
            .map((item) => ({
              id: item.id,
              title: item.title,
              detail: resolutionLabels[item.openReason],
              at: item.openedAt,
            })),
        }),
      ),
      source(
        {
          id: "auctions",
          title: "Phiên đấu giá đang vận hành",
          to: "/operations/auctions",
          path: "/operations/auctions",
          note: "Theo danh sách đủ điều kiện quản trị; tối đa 50 phiên.",
        },
        operationsAuctionList,
        (data) => ({
          value: data.items.length,
          serverTime: data.serverTime,
          rows: data.items
            .slice(0, 3)
            .map((item) => ({
              id: item.id,
              title: item.title,
              detail: `${item.pointName} · ${item.state === "OnHold" ? "Tạm giữ" : "Đang diễn ra"}`,
              at: item.endAt,
            })),
        }),
      ),
      source(
        {
          id: "points",
          title: "Điểm giao nhận",
          to: "/operations/points",
          path: "/operations/points",
          note: "Thông tin điểm và sức chứa hiện tại.",
        },
        operationsPointList,
        (data) => ({
          value: data.items.length,
          serverTime: data.serverTime,
          points: data.items.map(({ id, name, capacity, heldSlots, status }) => ({ id, name, capacity, heldSlots, status })),
          rows: data.items
            .slice(0, 3)
            .map((item) => ({
              id: item.id,
              title: item.name,
              detail: `${item.code} · Đang giữ ${item.heldSlots}/${item.capacity} chỗ`,
            })),
        }),
      ),
      source(
        {
          id: "escalations",
          title: "Việc tại điểm đã quá hạn",
          to: "/operations/escalations",
          path: "/operations/escalations",
          note: "Theo hạn trên máy chủ; không tự đưa ra quyết định xử lý.",
        },
        pointEscalationList,
        (data) => ({
          value: data.items.length,
          serverTime: data.serverTime,
          rows: data.items
            .slice(0, 3)
            .map((item) => ({
              id: `${item.intakeId}/${item.kind}`,
              title: item.title,
              detail: item.pointName,
              at: item.dueAt,
            })),
        }),
      ),
      source(
        {
          id: "fund",
          title: "Quỹ sự cố mô phỏng",
          to: "/operations/incidents",
          path: "/operations/incident-fund",
          note: "Số dư quỹ sự cố, không phải doanh thu hoặc ví thành viên.",
        },
        incidentFund,
        (data) => ({
          value: data.balance,
          money: true,
          serverTime: data.serverTime,
          rows: data.entries
            .slice(-3)
            .reverse()
            .map((item) => ({
              id: String(item.sequence),
              title:
                item.type === "Opening"
                  ? "Khởi tạo quỹ mô phỏng"
                  : "Phê duyệt bồi thường",
              detail: `Bút toán số ${item.sequence}`,
              at: item.createdAt,
            })),
        }),
      ),
    );
  if (canSimulate(user))
    sources.push(
      source(
        {
          id: "deliveries",
          title: "Giao từ điểm đang chờ kết quả",
          to: "/simulator/deliveries",
          path: "/operations/simulator/point-deliveries",
          note: "Chỉ các vận đơn thuộc hãng vận chuyển mô phỏng.",
        },
        simulatedDeliveryQueue,
        (data) => ({
          value: data.items.length,
          serverTime: data.serverTime,
          rows: data.items
            .slice(0, 3)
            .map((item) => ({
              id: item.orderId,
              title: item.title,
              detail: `${item.pointName} · ${item.trackingCode}`,
              at: item.deliveryDeadline,
            })),
        }),
      ),
    );
  return sources;
}
