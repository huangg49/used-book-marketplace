import type { CurrentUser } from "@used-books/session-client";
import { navigationGroups } from "./navigation";

export type WorkspaceCommand = {
  to: string;
  label: string;
  group: string;
  description: string;
  keywords: string;
};
const details: Record<string, [string, string]> = {
  '/transaction-reviews':['Kiểm duyệt đánh giá và phản hồi sau công bố','review danh gia uy tin phan hoi bang chung'],
  "/dashboard": [
    "Kệ sách chờ duyệt và các khu vực vận hành",
    "tong quan ban bien tap ke sach home",
  ],
  "/review/listings": [
    "Đọc hồ sơ, đối chiếu ảnh và kiểm duyệt bài đăng",
    "sach duyet bai ban doi phe duyet",
  ],
  "/review/catalog-requests": [
    "Kiểm tra và xác nhận thông tin đầu sách",
    "catalog tac gia isbn nha xuat ban",
  ],
  "/users": [
    "Tra cứu tài khoản và thông tin người dùng",
    "thanh vien tai khoan member user",
  ],
  "/operations/intakes": [
    "Tiếp nhận và kiểm tra sách đấu giá tại điểm",
    "tiep nhan kiem tra custody inspection intake",
  ],
  "/operations/collections": [
    "Theo dõi giao và nhận lại sách tại điểm",
    "nhan lai don collection",
  ],
  "/operations/incidents": [
    "Xem sự cố, quyết định và quỹ mô phỏng",
    "boi thuong quy incident",
  ],
  "/operations/resolutions": [
    "Đối chiếu và xử lý các đơn tại điểm",
    "quyet dinh resolution",
  ],
  "/operations/auctions": [
    "Theo dõi các phiên đấu giá được quản trị",
    "bid auction phien",
  ],
  "/operations/escalations": [
    "Xem các trường hợp đã quá hạn xử lý",
    "tre han overdue escalation",
  ],
  "/operations/points": [
    "Xem thông tin và sức chứa điểm giao nhận",
    "dia diem suc chua capacity point",
  ],
  "/simulator/deliveries": [
    "Kết quả giao sách từ điểm qua hãng mô phỏng",
    "carrier van don tracking",
  ],
  "/simulator/events/pickups": [
    "Mở công cụ ghi nhận kết quả lấy hàng mô phỏng",
    "pickup nhan hang",
  ],
  "/simulator/events/deliveries": [
    "Mở công cụ ghi nhận kết quả giao hàng mô phỏng",
    "delivery van chuyen",
  ],
  "/simulator/events/topups": [
    "Mở công cụ ghi nhận kết quả nạp tiền mô phỏng",
    "topup wallet vi",
  ],
};
export function workspaceCommands(
  user: CurrentUser | undefined,
): WorkspaceCommand[] {
  return navigationGroups(user).flatMap((group) =>
    group.items.map((item) => ({
      to: item.to,
      label: item.label,
      group: group.label,
      description: details[item.to]?.[0] ?? "Mở khu vực quản trị",
      keywords: details[item.to]?.[1] ?? "",
    })),
  );
}
export function foldCommandText(value: string) {
  return value
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d");
}
export function findCommands(commands: WorkspaceCommand[], query: string) {
  const tokens = foldCommandText(query.trim()).split(/\s+/).filter(Boolean);
  return commands
    .map((command, order) => {
      const label = foldCommandText(command.label);
      const rest = foldCommandText(
        `${command.description} ${command.keywords} ${command.group}`,
      );
      const scores = tokens.map((token) =>
        label.startsWith(token)
          ? 0
          : label.includes(token)
            ? 1
            : rest.includes(token)
              ? 3
              : Infinity,
      );
      return {
        command,
        order,
        score: scores.reduce((sum, score) => sum + score, 0),
      };
    })
    .filter((result) => Number.isFinite(result.score))
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .map((result) => result.command);
}
export function nextCommandIndex(
  current: number,
  direction: 1 | -1,
  length: number,
) {
  return length ? (current + direction + length) % length : -1;
}
export function isCommandShortcut(
  event: Pick<
    KeyboardEvent,
    | "key"
    | "ctrlKey"
    | "metaKey"
    | "altKey"
    | "shiftKey"
    | "repeat"
    | "isComposing"
  >,
) {
  return (
    !event.repeat &&
    !event.isComposing &&
    !event.altKey &&
    !event.shiftKey &&
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === "k"
  );
}
