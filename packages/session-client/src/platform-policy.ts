import { DEFAULT_SALE_COMMISSION_BPS, formatSaleFeeRate } from "./sale-fees";

// Public Policy and Contact copy shared by user-web and React Native, so the
// two clients never drift. Numbers are the project's demo baseline (SRS 1.1
// §3.2) and only those enforced in code/contract are quoted here; the server's
// snapshot on each transaction is always the binding value.
export const PLATFORM_CONTACT_EMAIL = "latlai@example.com";
export const PLATFORM_POLICY_UPDATED = "2026-11-26";

export const LISTING_PRICE_MIN_VND = 10_000;
export const LISTING_PRICE_MAX_VND = 1_000_000;
export const INSPECTION_HOURS = 72;

const vnd = (value: number) => `${value.toLocaleString("vi-VN")}đ`;

export interface PolicySection {
  id: string;
  title: string;
  summary: string;
  points: string[];
}

export const PLATFORM_POLICY_NOTICE =
  "Lật lại là sản phẩm đồ án. Ví, thanh toán, vận chuyển và hai điểm giao nhận đều là mô phỏng; không có giao dịch tiền thật.";

export const PLATFORM_POLICY_SECTIONS: readonly PolicySection[] = [
  {
    id: "account",
    title: "Tài khoản và quy chế chung",
    summary: "Mỗi người dùng một tài khoản đã xác minh email, chịu trách nhiệm về thông tin mình đăng.",
    points: [
      "Chỉ tài khoản đã xác minh email mới đăng sách, chat và giao dịch.",
      "Không mạo danh, không đăng nội dung vi phạm pháp luật hoặc bản quyền.",
      "Quản trị viên có thể khóa tài khoản kèm lý do; nghĩa vụ giao dịch cũ vẫn phải hoàn tất.",
    ],
  },
  {
    id: "listing",
    title: "Đăng sách và kiểm duyệt",
    summary: "Sách chỉ lên kệ sau khi được duyệt và còn sẵn sàng giao dịch.",
    points: [
      `Giá bán và giá trị đổi trong khoảng ${vnd(LISTING_PRICE_MIN_VND)} – ${vnd(LISTING_PRICE_MAX_VND)}.`,
      "Ảnh và mô tả phải đúng tình trạng thực tế của cuốn sách.",
      "Bài đăng có thể bị gỡ nếu sai thông tin, trùng lặp hoặc vi phạm quy chế.",
    ],
  },
  {
    id: "fees",
    title: "Phí dịch vụ",
    summary: "Phí được tính và lưu lại tại thời điểm giao kết, không đổi theo chính sách mới.",
    points: [
      `Bán sách và đấu giá: phí dịch vụ ${formatSaleFeeRate(DEFAULT_SALE_COMMISSION_BPS)} trên tiền sách, trừ vào tiền người bán nhận khi quyết toán.`,
      "Đổi sách: phí dịch vụ 0đ. Tiền cọc và tiền bù được giữ riêng trong Ví.",
      "Cước vận chuyển hiển thị trước khi xác nhận và tính riêng với tiền sách.",
    ],
  },
  {
    id: "wallet",
    title: "Ví và thanh toán",
    summary: "Tiền giao dịch được giữ an toàn đến khi đủ điều kiện hoàn tất.",
    points: [
      "Mọi biến động số dư đều có bút toán trong sổ cái; không ai sửa số dư trực tiếp.",
      "Tiền của giao dịch đang khiếu nại được giữ đến khi có quyết định.",
      "Nạp và rút tiền là mô phỏng; yêu cầu rút được quản trị viên duyệt.",
    ],
  },
  {
    id: "inspection",
    title: "Nhận sách, kiểm tra và khiếu nại",
    summary: `Người nhận có ${INSPECTION_HOURS} giờ kiểm tra sách sau khi giao hợp lệ.`,
    points: [
      "Bấm “Đã nhận” không làm mất phần thời gian kiểm tra còn lại.",
      "Sách khác mô tả: báo vấn đề kèm ảnh/video trong thời gian kiểm tra để được xem xét.",
      "Hết thời gian kiểm tra mà không có khiếu nại, giao dịch tự hoàn tất.",
      "Quyết định có thể kháng nghị; người xét kháng nghị không phải người ra quyết định ban đầu.",
    ],
  },
  {
    id: "auction",
    title: "Đấu giá",
    summary: "Sách đấu giá phải được điểm giao nhận tiếp nhận và kiểm tra trước khi mở phiên.",
    points: [
      "Giá trả đã đặt là cam kết; người thắng thanh toán theo hạn của đơn đấu giá.",
      "Mức trả giá tự động của bạn luôn được giữ kín.",
      "Hai điểm giao nhận tại TP.HCM là điểm demo mô phỏng.",
    ],
  },
  {
    id: "privacy",
    title: "Quyền riêng tư",
    summary: "Địa chỉ và số điện thoại chỉ hiện cho các bên cần giao nhận.",
    points: [
      "Mật khẩu và mã xác thực không bao giờ được ghi vào nhật ký.",
      "Nhân viên chỉ xem hồ sơ được phân công; mọi thao tác quản trị đều có nhật ký.",
      "Bằng chứng khiếu nại được lưu trong thời hạn hồ sơ rồi xử lý theo chính sách lưu trữ.",
    ],
  },
];

export interface ContactChannel {
  id: string;
  title: string;
  detail: string;
}

export const PLATFORM_CONTACT_CHANNELS: readonly ContactChannel[] = [
  {
    id: "email",
    title: "Email",
    detail: PLATFORM_CONTACT_EMAIL,
  },
  {
    id: "support",
    title: "Yêu cầu hỗ trợ",
    detail: "Với vấn đề của một đơn, trao đổi hoặc phiên đấu giá, tạo yêu cầu hỗ trợ để nhân viên xem đúng hồ sơ.",
  },
];

export const PLATFORM_CONTACT_FAQ: readonly { q: string; a: string }[] = [
  {
    q: "Sách nhận được khác mô tả?",
    a: `Mở giao dịch và báo vấn đề trong ${INSPECTION_HOURS} giờ kiểm tra, kèm ảnh hoặc video.`,
  },
  {
    q: "Tiền của tôi đang ở đâu?",
    a: "Ví hiển thị số dư khả dụng, số dư đang giữ và lịch sử bút toán của từng giao dịch.",
  },
  {
    q: "Không đăng nhập được?",
    a: "Dùng “Quên mật khẩu” để đặt lại. Nếu tài khoản bị khóa, gửi email kèm địa chỉ đăng ký.",
  },
];
