import { Link } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { navigationGroups } from "../navigation/navigation";
import styles from "./WorkspaceStart.module.css";
const hints: Record<string, string> = {
  "/review/listings":
    "Duyệt bài đăng của một bản sách; mở chi tiết để xem ảnh và phiên bản trước quyết định.",
  "/review/catalog-requests":
    "Duyệt thông tin đầu sách. Đầu sách khác với bài đăng một bản sách cụ thể.",
  "/transaction-reviews":
    "Xử lý đánh giá và phản hồi đã đủ điều kiện công bố. Điểm thấp tự nó không phải vi phạm.",
  "/operations/intakes":
    "Tiếp nhận và kiểm tra sách gửi đấu giá; làm theo bước được phép trong hồ sơ.",
  "/operations/collections":
    "Tra đơn thắng đấu giá, xác minh điều kiện và mã nhận trước khi bàn giao sách.",
  "/operations/incidents":
    "Ghi nhận hoặc theo dõi sự cố tại điểm, giữ đúng chứng cứ và hiện trạng.",
  "/operations/resolutions":
    "Xem hồ sơ đơn cần xử lý và căn cứ trước quyết định; quyết định ảnh hưởng tiền phải độc lập.",
  "/operations/auctions":
    "Theo dõi phiên và các tình huống cần can thiệp; không thay việc tiếp nhận sách.",
  "/operations/escalations":
    "Xem việc đã quá hạn; mở đúng hồ sơ để xử lý theo trạng thái.",
  "/operations/points":
    "Quản lý điểm và phân công nhân viên. Có vai trò Staff chưa đồng nghĩa có quyền tại mọi điểm.",
  "/users":
    "Tra cứu tài khoản và quyền hiện tại. Danh bạ không tự cấp quyền khóa hoặc mở tài khoản.",
};
export function WorkspaceStart({ user }: { user: CurrentUser }) {
  const groups = navigationGroups(user).filter((g) =>
    ["review", "operations", "management"].includes(g.id),
  );
  if (!groups.length) return null;
  return (
    <details className={styles.guide}>
      <summary>Chưa biết bắt đầu ở đâu?</summary>
      <p>
        Chọn mục theo việc cần làm. Hàng đợi cho biết hồ sơ hiện tại; mở chi
        tiết để xem điều kiện, thời hạn và thao tác được phép.
      </p>
      <div className={styles.groups}>
        {groups.map((group) => (
          <section key={group.id}>
            <h2>{group.label}</h2>
            <ul>
              {group.items.map((item) => (
                <li key={item.to}>
                  <Link to={item.to}>{item.label}</Link>
                  <p>{hints[item.to]}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p>
        Tiếp nhận, kiểm tra và bàn giao cần đúng phân công tại điểm và độc lập
        với giao dịch. Ảnh hoặc báo cáo không tự cho phép hoàn tiền, giải ngân
        hay đưa sách trở lại kệ.
      </p>
    </details>
  );
}
