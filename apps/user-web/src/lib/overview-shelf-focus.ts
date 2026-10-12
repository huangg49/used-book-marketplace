import { ROUTES } from "./routes";

export const shelfFocusFilters = [
  { moderation: "Rejected", label: "Bị từ chối" },
  { moderation: "Draft", label: "Bản nháp" },
  { moderation: "PendingReview", label: "Chờ duyệt" },
] as const;

export type ShelfSignal =
  "present" | "empty" | "loading" | "error" | "forbidden";

// Signals come from separate limit1 filtered reads, never the recent four books.
export function overviewShelfFocus(signals: readonly ShelfSignal[]) {
  if (signals.includes("forbidden"))
    return {
      title: "Xem lại trạng thái tài khoản",
      description:
        "Hiện chưa thể kiểm tra các mục trên kệ. Thông tin giới hạn nằm trong hồ sơ của bạn.",
      to: ROUTES.profile,
      action: "Xem hồ sơ",
      kind: "forbidden",
    };
  if (signals.length !== 3 || signals.includes("loading"))
    return {
      title: "Đang xem kệ của bạn…",
      description: "Kiểm tra bản nháp, bài chờ duyệt và bài bị từ chối.",
      to: null,
      action: "",
      kind: "loading",
    };
  if (signals.includes("error"))
    return {
      title: "Chưa kiểm tra được việc trên kệ",
      description:
        "Một mục chưa tải được. Bạn vẫn có thể mở kệ hoặc thử lại bên dưới.",
      to: ROUTES.myBooks,
      action: "Mở kệ sách",
      kind: "error",
    };
  const priority = signals.findIndex((signal) => signal === "present");
  const suggestions = [
    {
      title: "Có bài cần xem lại",
      description: "Đọc lý do từ chối để biết thông tin nào cần điều chỉnh.",
      action: "Xem bài bị từ chối",
    },
    {
      title: "Bạn còn bản nháp trên kệ",
      description: "Xem lại những cuốn sách chưa gửi duyệt của bạn.",
      action: "Xem bản nháp",
    },
    {
      title: "Sách của bạn đang chờ duyệt",
      description: "Bạn có thể xem trạng thái bài đăng trong mục Chờ duyệt.",
      action: "Xem bài chờ duyệt",
    },
  ];
  if (priority >= 0 && suggestions[priority])
    return {
      ...suggestions[priority],
      to: `${ROUTES.myBooks}?moderation=${shelfFocusFilters[priority]!.moderation}`,
      kind: shelfFocusFilters[priority]!.moderation,
    };
  return {
    title: "Dành chỗ cho cuốn sách tiếp theo",
    description:
      "Chọn một cuốn đã đọc xong, chụp tình trạng thật và tìm người đọc tiếp theo.",
    to: ROUTES.sell,
    action: "Đăng một cuốn sách",
    kind: "ready",
  };
}
