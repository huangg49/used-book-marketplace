import { ROUTES, searchUrl } from "./routes";
export const memberJourneys = [
  {
    id: "buy",
    title: "Tôi muốn mua sách",
    action: "Tìm sách để mua",
    to: searchUrl({ mode: "Sale" }),
    manage: "/orders",
    manageLabel: "Xem đơn trực tiếp",
    steps: [
      "Tìm bản sách, xem ảnh, tình trạng và giá.",
      "Dùng Mua ngay nếu có, hoặc trò chuyện để người bán chốt đơn. Mở chat chưa giữ sách.",
      "Kiểm tra địa chỉ và tổng tiền, rồi thanh toán đơn bằng ví. Theo dõi bước tiếp theo trong đơn.",
    ],
    note: "Sách thắng đấu giá được theo dõi ở Đấu giá của tôi, không nằm trong danh sách đơn trực tiếp.",
  },
  {
    id: "sell",
    title: "Tôi muốn bán sách",
    action: "Đăng sách để bán",
    to: ROUTES.sell,
    manage: ROUTES.myBooks,
    manageLabel: "Mở kệ sách của tôi",
    steps: [
      "Đăng bản sách với ảnh thật, tình trạng và giá; gửi duyệt.",
      "Theo dõi kết quả tại Kệ sách của tôi. Bản nháp hoặc bài chưa duyệt chưa xuất hiện trên kệ công khai.",
      "Khi có đơn hoặc trao đổi với người mua, theo dõi trong Đơn trực tiếp và Trò chuyện.",
    ],
    note: "Muốn đưa sách lên đấu giá, dùng luồng gửi sách tới điểm để tiếp nhận và kiểm tra; đăng bán không tự tạo phiên đấu giá.",
  },
  {
    id: "exchange",
    title: "Tôi muốn đổi sách",
    action: "Tìm sách để đổi",
    to: searchUrl({ mode: "Exchange" }),
    manage: ROUTES.exchangeMine,
    manageLabel: "Xem trao đổi của tôi",
    steps: [
      "Có bản sách lẻ phù hợp để đổi trên kệ của mình.",
      "Mở bản sách muốn nhận và gửi đề nghị đổi, chọn sách của mình và khoản bù nếu có.",
      "Theo dõi đề nghị gửi/nhận tại Trao đổi của tôi; sau khi chấp nhận, làm bước đặt cọc và giao nhận theo trạng thái.",
    ],
    note: "Gửi đề nghị chưa hoàn tất trao đổi. Chưa đủ điều kiện thì màn chi tiết sẽ cho biết lý do; không cần tạo đề nghị mới để thử ép thành công.",
  },
  {
    id: "auction",
    title: "Tôi muốn tham gia đấu giá",
    action: "Xem phiên đấu giá",
    to: ROUTES.auctions,
    manage: ROUTES.myAuctions,
    manageLabel: "Mở đấu giá của tôi",
    steps: [
      "Mở phiên để xem sách, điểm giữ sách, giá và thời gian.",
      "Đặt giá hoặc mua ngay khi phiên cho phép. Theo dõi kết quả tại Đấu giá của tôi.",
      "Nếu thắng, thanh toán đúng hạn và mở đơn thắng để theo dõi nhận sách.",
    ],
    note: "Muốn bán đấu giá, bắt đầu từ sách đủ điều kiện trên kệ hoặc gửi sách tới điểm; cần tiếp nhận và kiểm tra trước khi có phiên.",
  },
] as const;
export const memberWork = [
  {
    to: "/orders",
    label: "Đơn mua/bán trực tiếp",
    hint: "Thanh toán, xác nhận và theo dõi đơn mua hoặc đơn bán.",
  },
  {
    to: ROUTES.exchangeMine,
    label: "Trao đổi của tôi",
    hint: "Đề nghị đã gửi, đề nghị nhận được và giao dịch đang đổi.",
  },
  {
    to: ROUTES.myAuctions,
    label: "Đấu giá của tôi",
    hint: "Phiên đã tham gia, sách gửi đấu giá và đơn thắng đấu giá.",
  },
  {
    to: ROUTES.chat(),
    label: "Trò chuyện",
    hint: "Thương lượng và trao đổi trong đúng hội thoại giao dịch.",
  },
] as const;
