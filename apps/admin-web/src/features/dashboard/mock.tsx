import { ArrowRight, BookOpenCheck, Clock3, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";

const summary = [
  {
    label: "Hồ sơ chờ duyệt",
    value: "12",
    note: "Bài đăng và đầu sách đang chờ đọc.",
    icon: Clock3,
  },
  {
    label: "Đã xử lý hôm nay",
    value: "08",
    note: "Quyết định đã được ghi vào hồ sơ.",
    icon: BookOpenCheck,
  },
  {
    label: "Tài khoản cần xem",
    value: "03",
    note: "Dành cho thao tác tra cứu của Admin.",
    icon: UsersRound,
  },
] as const;

const activity = [
  {
    time: "09:40",
    title: "Bài đăng chờ kiểm tra ảnh",
    detail: "Bản gửi #04 · Tình trạng: Khá",
  },
  {
    time: "09:15",
    title: "Yêu cầu đầu sách mới",
    detail: "Cần đối chiếu tên tác giả và nhà xuất bản.",
  },
  {
    time: "08:55",
    title: "Bài đăng được trả về để bổ sung",
    detail: "Người đăng đã nhận ghi chú kiểm duyệt.",
  },
] as const;

export function DashboardMock() {
  return (
    <>
      <section className="mock-banner" aria-label="Trạng thái bản xem trước">
        <span>Dữ liệu mẫu</span>
        <p>Dashboard này chưa truy vấn API và không hỗ trợ thao tác vận hành.</p>
      </section>

      <section className="dashboard-summary" aria-label="Tổng quan mẫu">
        {summary.map(({ label, value, note, icon: Icon }) => (
          <article className="dashboard-stat" key={label}>
            <Icon aria-hidden="true" />
            <p className="eyebrow">{label}</p>
            <strong>{value}</strong>
            <p>{note}</p>
          </article>
        ))}
      </section>

      <section className="dashboard-layout" aria-label="Nội dung dashboard mẫu">
        <article className="dashboard-panel dashboard-queue">
          <div className="dashboard-panel-heading">
            <div>
              <p className="eyebrow">Ưu tiên tiếp theo</p>
              <h2>Hàng đợi cần mở</h2>
            </div>
            <span className="mock-tag">Mẫu</span>
          </div>
          <p className="muted">
            Đi từ hồ sơ chờ lâu nhất để giữ việc kiểm duyệt rõ ràng và nhất quán.
          </p>
          <div className="dashboard-actions">
            <Link className="dashboard-action" to="/review/listings">
              <span>
                <small>Bước 01</small>
                <strong>Kiểm duyệt bài đăng sách</strong>
                <em>12 hồ sơ mẫu đang chờ</em>
              </span>
              <ArrowRight aria-hidden="true" />
            </Link>
            <Link className="dashboard-action" to="/review/catalog-requests">
              <span>
                <small>Bước 02</small>
                <strong>Kiểm tra đầu sách</strong>
                <em>04 yêu cầu mẫu cần đối chiếu</em>
              </span>
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </article>

        <article className="dashboard-panel dashboard-activity">
          <div className="dashboard-panel-heading">
            <div>
              <p className="eyebrow">Nhật ký gần đây</p>
              <h2>Những việc vừa đến</h2>
            </div>
            <span className="mock-tag">Mẫu</span>
          </div>
          <ol>
            {activity.map((item) => (
              <li key={item.time}>
                <time>{item.time}</time>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </article>
      </section>
    </>
  );
}
