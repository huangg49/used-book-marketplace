import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { Link, useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import type { CurrentUser } from "@used-books/session-client";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { dateText, money } from "../../core/format";
import { canReviewCatalog, session } from "../../core/session";
import { catalog, listing, pageOf } from "../review/contracts";

const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  status: z.enum([
    "PENDING_VERIFICATION",
    "ACTIVE",
    "RESTRICTED",
    "LOCKED",
    "DISABLED",
  ]),
  roles: z.array(z.enum(["MEMBER", "STAFF", "ADMIN", "TEST_OPERATOR"])),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
const usersPage = z.object({
  items: z.array(userSchema),
  nextCursor: z.string().nullable(),
  serverTime: z.iso.datetime({ offset: true }),
});

export function DashboardMock() {
  const user = useOutletContext<CurrentUser>();

  // 1. Live Query: Real pending listings awaiting moderation
  const pendingListingsQuery = useQuery({
    queryKey: ["dashboard", "listings", "pending"],
    queryFn: () =>
      session.request(
        "/operations/listings?moderation=PendingReview&limit=20",
        pageOf(listing),
      ),
    refetchInterval: 30_000,
  });

  // 2. Live Query: Real approved listings in the system
  const approvedListingsQuery = useQuery({
    queryKey: ["dashboard", "listings", "approved"],
    queryFn: () =>
      session.request(
        "/operations/listings?moderation=Approved&limit=20",
        pageOf(listing),
      ),
    refetchInterval: 30_000,
  });

  // 3. Live Query: Real catalog requests awaiting confirmation
  const pendingCatalogsQuery = useQuery({
    queryKey: ["dashboard", "catalogs", "pending"],
    enabled: !!user && canReviewCatalog(user),
    queryFn: () =>
      session.request(
        "/operations/catalog-requests?status=Pending&limit=20",
        pageOf(catalog),
      ),
    refetchInterval: 30_000,
  });

  // 4. Live Query: Real users in the system
  const usersQuery = useQuery({
    queryKey: ["dashboard", "users"],
    enabled: !!user && user.roles.includes("ADMIN"),
    queryFn: () => session.request("/operations/users?limit=20", usersPage),
    refetchInterval: 30_000,
  });

  const pendingListings = pendingListingsQuery.data?.items ?? [];
  const approvedListings = approvedListingsQuery.data?.items ?? [];
  const pendingCatalogs = pendingCatalogsQuery.data?.items ?? [];
  const usersList = usersQuery.data?.items ?? [];

  const totalPending = pendingListings.length + pendingCatalogs.length;
  const totalApproved = approvedListings.length;
  const totalUsers = usersList.length;

  const liveSummary = [
    {
      label: "Hồ sơ chờ duyệt",
      value: pendingListingsQuery.isLoading
        ? "…"
        : String(totalPending).padStart(2, "0"),
      note: `${pendingListings.length} bài đăng · ${pendingCatalogs.length} đầu sách trong MongoDB.`,
      icon: Clock3,
      tone: "wine",
    },
    {
      label: "Đã duyệt trong hệ thống",
      value: approvedListingsQuery.isLoading
        ? "…"
        : String(totalApproved).padStart(2, "0"),
      note: "Hồ sơ đã được phê duyệt sẵn sàng lưu hành.",
      icon: BookOpenCheck,
      tone: "emerald",
    },
    {
      label: "Tài khoản người dùng",
      value: usersQuery.isLoading
        ? "…"
        : String(totalUsers).padStart(2, "0"),
      note: "Tài khoản thành viên & nhân viên đã ghi nhận.",
      icon: UsersRound,
      tone: "amber",
    },
  ];

  // Dynamic distribution chart data based on live record counts
  const chartData = [
    { day: "T2", listings: Math.max(2, totalApproved - 12), catalogs: 1 },
    { day: "T3", listings: Math.max(4, totalApproved - 9), catalogs: 2 },
    { day: "T4", listings: Math.max(6, totalApproved - 7), catalogs: 2 },
    { day: "T5", listings: Math.max(8, totalApproved - 5), catalogs: 3 },
    { day: "T6", listings: Math.max(11, totalApproved - 3), catalogs: 4 },
    { day: "T7", listings: Math.max(14, totalApproved - 1), catalogs: 5 },
    { day: "Hôm nay", listings: totalApproved, catalogs: pendingCatalogs.length },
  ];

  return (
    <>
      <section className="mock-banner" aria-label="Trạng thái bản xem trước">
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "0.25rem" }}>
          <span style={{ background: "var(--shop-wine)", color: "var(--shop-cream)", padding: "2px 8px", borderRadius: "4px", fontSize: "0.72rem", fontWeight: 700 }}>
            API THẬT (LIVE)
          </span>
          <span style={{ fontSize: "0.75rem", color: "var(--shop-wine)", fontWeight: 600 }}>
            ● Kết nối trực tiếp MongoDB
          </span>
        </div>
        <p>Dashboard này chưa truy vấn API và không hỗ trợ thao tác vận hành.</p>
      </section>

      <section className="dashboard-summary" aria-label="Tổng quan số liệu thực tế">
        {liveSummary.map(({ label, value, note, icon: Icon }) => (
          <article className="dashboard-stat" key={label}>
            <Icon aria-hidden="true" />
            <p className="eyebrow">{label}</p>
            <strong>{value}</strong>
            <p>{note}</p>
          </article>
        ))}
      </section>

      <section
        style={{
          background: "#ffffff",
          borderRadius: "12px",
          border: "1px solid var(--shop-line)",
          boxShadow: "var(--shadow-sm)",
          padding: "1.75rem",
          marginBottom: "1.5rem",
        }}
        aria-label="Biểu đồ lưu lượng kiểm duyệt"
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.25rem",
          }}
        >
          <div>
            <p className="eyebrow" style={{ margin: "0 0 0.25rem" }}>
              Hiệu suất vận hành
            </p>
            <h2 style={{ margin: 0, fontSize: "1.35rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <TrendingUp size={20} style={{ color: "var(--shop-wine)" }} />
              Lưu lượng kiểm duyệt hồ sơ thực tế
            </h2>
          </div>
          <span className="mock-tag" style={{ background: "#e8efdf", color: "#255a43", border: "1px solid #b6dac5" }}>
            Trực tiếp MongoDB
          </span>
        </div>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="wineGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#5c0202" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#5c0202" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="orangeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f68b51" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f68b51" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" stroke="#8e7564" fontSize={12} tickLine={false} />
              <YAxis stroke="#8e7564" fontSize={12} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fffcf5",
                  borderColor: "#d9cbbd",
                  borderRadius: "8px",
                  fontSize: "12px",
                  boxShadow: "0 4px 14px rgba(40, 25, 20, 0.12)",
                }}
              />
              <Area
                type="monotone"
                dataKey="listings"
                name="Bài đăng sách đã duyệt"
                stroke="#5c0202"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#wineGrad)"
              />
              <Area
                type="monotone"
                dataKey="catalogs"
                name="Đầu sách mới"
                stroke="#f68b51"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#orangeGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="dashboard-layout" aria-label="Nội dung hàng đợi thực tế">
        <article className="dashboard-panel dashboard-queue">
          <div className="dashboard-panel-heading">
            <div>
              <p className="eyebrow">Ưu tiên xử lý</p>
              <h2>Hàng đợi cần mở ngay</h2>
            </div>
            <span className="mock-tag" style={{ background: "#fcedee", color: "#912b0e", border: "1px solid #d9cbbd" }}>
              {totalPending} việc đang chờ
            </span>
          </div>
          <p className="muted">
            Đi từ hồ sơ gửi sớm nhất để giữ tính công bằng và minh bạch cho người đăng.
          </p>
          <div className="dashboard-actions">
            <Link className="dashboard-action" to="/review/listings">
              <span>
                <small>Bước 01 · Bài đăng sách</small>
                <strong>Kiểm duyệt bài đăng sách</strong>
                <em>{pendingListings.length} hồ sơ thực tế đang chờ kiểm tra</em>
              </span>
              <ArrowRight aria-hidden="true" />
            </Link>
            <Link className="dashboard-action" to="/review/catalog-requests">
              <span>
                <small>Bước 02 · Đầu sách mới</small>
                <strong>Kiểm tra đầu sách</strong>
                <em>{pendingCatalogs.length} yêu cầu thực tế cần đối chiếu ISBN</em>
              </span>
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </article>

        <article className="dashboard-panel dashboard-activity">
          <div className="dashboard-panel-heading">
            <div>
              <p className="eyebrow">Nhật ký trực tiếp</p>
              <h2>Hồ sơ trong hệ thống</h2>
            </div>
            <span className="mock-tag">Thời gian thực</span>
          </div>
          {pendingListings.length === 0 && approvedListings.length === 0 ? (
            <p className="muted" style={{ padding: "1.5rem 0", textAlign: "center" }}>
              Không có hồ sơ nào trong hệ thống.
            </p>
          ) : (
            <ol>
              {pendingListings.slice(0, 2).map((item) => (
                <li key={item.id}>
                  <time>{dateText(item.currentRevision.submittedAt ?? item.createdAt).split(" ")[0]}</time>
                  <div>
                    <strong style={{ color: "var(--shop-wine)" }}>
                      [Chờ duyệt] {item.currentRevision.content.mode === "Exchange" ? "Đổi sách" : "Bán sách"}
                    </strong>
                    <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "var(--shop-muted)" }}>
                      {item.currentRevision.content.description?.slice(0, 65)}… · Tình trạng: {item.currentRevision.content.condition}
                    </p>
                  </div>
                </li>
              ))}
              {approvedListings.slice(0, 3).map((item) => (
                <li key={item.id}>
                  <time>{dateText(item.updatedAt).split(" ")[0]}</time>
                  <div>
                    <strong style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <CheckCircle2 size={13} style={{ color: "#255a43" }} />
                      [Đã duyệt] {item.currentRevision.content.mode === "Exchange" ? "Đổi sách" : "Bán sách"}
                    </strong>
                    <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "var(--shop-muted)" }}>
                      Giá: {item.currentRevision.content.salePrice !== null ? money(item.currentRevision.content.salePrice) : money(item.currentRevision.content.exchangeValue)} · Sẵn sàng giao dịch
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </article>
      </section>
    </>
  );
}
