import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  createBrowserRouter,
  Link,
  Navigate,
  NavLink,
  Outlet,
  RouterProvider,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  BookCheck,
  BookPlus,
  ChartNoAxesCombined,
  ClipboardCheck,
  Gavel,
  Handshake,
  LayoutDashboard,
  PackageCheck,
  Scale,
  UsersRound,
  Warehouse,
  MapPin,
  TriangleAlert,
  Clock,
  Truck,
  Eye,
  EyeOff,
  Lock,
} from "lucide-react";
import { currentUserSchema } from "@used-books/session-client";
import logo from "../../../packages/brand/logos/lat-lai-horizontal-primary.svg";
import logoWhite from "../../../packages/brand/logos/lat-lai-horizontal-white.svg";
import {
  canEnterWorkspace,
  canOperatePoint,
  canResolve,
  canSimulate,
  canReview,
  canReviewCatalog,
  queryClient,
  session,
} from "./core/session";
import { Button, ErrorNotice, Notice } from "./core/ui";
import { Queue } from "./features/review/queue";
import { Detail } from "./features/review/detail";
import { LeaveGuard } from "./core/leave-guard";
import { UserDirectory } from "./features/users/directory";
import { DashboardMock } from "./features/dashboard/mock";
import { DeliverySimulator } from "./features/operations/simulator";
import {
  AuctionQueue,
  CollectionQueue,
  IntakeQueue,
  ResolutionQueue,
} from "./features/operations/queues";
import { PointsPage } from "./features/operations/points";
import { IncidentsPage } from "./features/operations/incidents";
import { EscalationsPage } from "./features/operations/escalations";
import "./App.css";

function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(undefined);
    try {
      await session.login({
        email: String(data.get("email") || email).trim(),
        password: String(data.get("password") || password),
      });
      // A protected deep link stays in place when the authenticated workspace opens.
      if (location.pathname === "/") navigate("/dashboard", { replace: true });
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-scene-root">
      {/* Full-bleed Barcelona bookstore photograph with dark wine overlay */}
      <div className="login-backdrop" aria-hidden="true">
        <img
          src="/photography/bookshop-barcelona.jpg"
          alt=""
          className="login-backdrop-img"
        />
        <div className="login-backdrop-overlay" />
      </div>

      {/* Decorative vector line flourishes matching user-web */}
      <img
        src="/illustrations/hero-paper-left.svg"
        alt=""
        aria-hidden="true"
        className="login-curl-left"
      />
      <img
        src="/illustrations/hero-paper-right.svg"
        alt=""
        aria-hidden="true"
        className="login-curl-right"
      />
      <img
        src="/illustrations/hero-open-book.svg"
        alt=""
        aria-hidden="true"
        className="login-open-book"
      />

      <div className="login-stage">
        {/* Left Column: Brand Story & 3D Floating Book Fan */}
        <section className="login-editorial">
          <div className="login-brand-header">
            <img src={logoWhite} alt="Lật lại" width="168" className="login-logo-white" />
            <span className="login-portal-tag">Bàn kiểm duyệt & Vận hành</span>
          </div>

          <p className="login-eyebrow">Hồ sơ minh bạch · Sách tiếp tục hành trình</p>

          <h1 className="login-hero-title">
            Giữ sự rõ ràng<br />
            trên từng<br />
            <em>trang sách.</em>
          </h1>

          <p className="login-hero-desc">
            Kiểm tra những gì người đăng gửi. Để người đọc sau có trọn vẹn niềm tin và câu chuyện tiếp nối.
          </p>

          {/* Floating 3D Book Fan matching user-web hero */}
          <div className="login-book-fan" aria-hidden="true">
            <div className="login-fan-book book-left">
              <img src="/illustrations/alice-moi.webp" alt="" />
            </div>
            <div className="login-fan-book book-center">
              <img src="/illustrations/duoc-su.webp" alt="" />
            </div>
            <div className="login-fan-book book-right">
              <img src="/illustrations/tuoi-tho.webp" alt="" />
            </div>
          </div>

          {/* Quick helper credentials */}
          <div className="login-quick-creds">
            <span className="creds-label">Thử nghiệm nhanh:</span>
            <button
              type="button"
              className="cred-chip"
              onClick={() => {
                setEmail("admin@latlai.local");
                setPassword("LatLai-Local-2026!");
              }}
            >
              👤 Quản trị viên
            </button>
            <button
              type="button"
              className="cred-chip"
              onClick={() => {
                setEmail("staff@latlai.local");
                setPassword("LatLai-Local-2026!");
              }}
            >
              📋 Nhân viên
            </button>
          </div>

          {/* Poetic handwritten annotation with Auth Melody cursive font */}
          <div className="login-hand-annotation" aria-hidden="true">
            <p>“Đoạn này đọc lúc 2 giờ sáng.”</p>
            <small>trang 87, bút chì</small>
            <span className="pencil-line" />
          </div>
        </section>

        {/* Right Column: Tactile Librarian Dossier Stack */}
        <section className="login-dossier-wrap">
          <div className="login-stack-container">
            <div className="login-sheet-back" aria-hidden="true" />
            <div className="login-sheet-middle" aria-hidden="true" />
            <div className="login-form-card">
              <div className="card-top-binding" aria-hidden="true" />
              <div className="card-inner-content">
                <div className="card-header-row">
                  <span className="card-stamp-badge">BÀN KIỂM DUYỆT · TP.HCM</span>
                  <span className="card-serial-no">SỐ THẺ #OPS-2026</span>
                </div>

                <h2>Chào người giữ kệ.</h2>
                <p className="card-desc">
                  Đăng nhập bằng tài khoản nhân viên hoặc quản trị viên được cấp.
                </p>

                <form onSubmit={(event) => void submit(event)}>
                  <div className="form-field-group">
                    <label className="field" htmlFor="admin-email">
                      Email
                    </label>
                    <input
                      id="admin-email"
                      name="email"
                      type="email"
                      autoComplete="username"
                      required
                      disabled={busy}
                      placeholder="admin@latlai.local hoặc staff@latlai.local"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  <div className="form-field-group">
                    <div className="field-label-split">
                      <label className="field" htmlFor="admin-password">
                        Mật khẩu
                      </label>
                    </div>
                    <div className="password-input-wrapper">
                      <input
                        id="admin-password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        required
                        disabled={busy}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  {error !== undefined && <ErrorNotice error={error} />}

                  <Button className="primary login-submit-btn" type="submit" busy={busy}>
                    Đăng nhập
                  </Button>
                </form>

                <div className="card-security-note">
                  <Lock size={14} aria-hidden="true" />
                  <span>Phiên chỉ giữ trong tab này. Tải lại trình duyệt sẽ cần đăng nhập lại.</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
function Workspace() {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState<unknown>();
  const guard = useRef<(() => boolean) | undefined>(undefined);
  const registerGuard = useCallback((next: (() => boolean) | undefined) => {
    guard.current = next;
  }, []);
  const authenticated = state.status === "authenticated";
  const profile = useQuery({
    queryKey: ["profile"],
    enabled: authenticated,
    queryFn: () => session.request("/auth/me", currentUserSchema),
    refetchInterval: 30_000,
  });
  async function logout() {
    if (guard.current && !guard.current()) return;
    setLogoutBusy(true);
    setLogoutError(undefined);
    try {
      await session.logout();
    } catch (cause) {
      setLogoutError(cause);
    } finally {
      setLogoutBusy(false);
    }
  }
  if (!authenticated) return <Login />;
  const user = profile.data;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Đến nội dung chính
      </a>
      <header className="mobile-topbar">
        <span>Bàn quản trị</span>
        <Button busy={logoutBusy} onClick={() => void logout()}>
          Đăng xuất
        </Button>
      </header>
      <aside className="sidebar">
        <Link
          className="sidebar-brand"
          to="/dashboard"
          aria-label="Lật lại · Bàn kiểm duyệt"
        >
          <img src={logo} alt="Lật lại" width="142" height="46" />
          <span>Bàn quản trị</span>
        </Link>
        {user && canEnterWorkspace(user) && (
          <nav className="workspace-nav" aria-label="Khu vực quản trị">
            <p className="sidebar-section-label">Điều hướng</p>
            <NavLink to="/dashboard">
              <LayoutDashboard aria-hidden="true" />
              Dashboard
              <small className="mock-nav-label">Mock</small>
            </NavLink>
            {canReview(user) && (
              <div className="sidebar-group">
                <p className="sidebar-group-title">
                  <ClipboardCheck aria-hidden="true" />
                  Duyệt bài đăng
                </p>
                <NavLink to="/review/listings">
                  <BookCheck aria-hidden="true" />
                  Bài đăng sách
                </NavLink>
                {canReviewCatalog(user) && (
                  <NavLink to="/review/catalog-requests">
                    <BookPlus aria-hidden="true" />
                    Đầu sách
                  </NavLink>
                )}
              </div>
            )}
            {canSimulate(user) && (
              <div className="sidebar-group">
                <p className="sidebar-group-title">
                  <Truck aria-hidden="true" />
                  Mô phỏng
                </p>
                <NavLink to="/simulator/deliveries">
                  <Truck aria-hidden="true" />
                  Hãng vận chuyển
                </NavLink>
              </div>
            )}
            {(canOperatePoint(user) || canResolve(user)) && (
              <div className="sidebar-group">
                <p className="sidebar-group-title">
                  <Warehouse aria-hidden="true" />
                  Điểm và đấu giá
                </p>
                {canOperatePoint(user) && (
                  <>
                    <NavLink to="/operations/intakes">
                      <PackageCheck aria-hidden="true" />
                      Nhận sách đấu giá
                    </NavLink>
                    <NavLink to="/operations/collections">
                      <Handshake aria-hidden="true" />
                      Giao sách
                    </NavLink>
                  </>
                )}
                <NavLink to="/operations/incidents">
                  <TriangleAlert aria-hidden="true" />
                  Sự cố tại điểm
                </NavLink>
                {canResolve(user) && (
                  <>
                    <NavLink to="/operations/resolutions">
                      <Scale aria-hidden="true" />
                      Xử lý đơn tại điểm
                    </NavLink>
                    <NavLink to="/operations/auctions">
                      <Gavel aria-hidden="true" />
                      Phiên đấu giá
                    </NavLink>
                    <NavLink to="/operations/escalations">
                      <Clock aria-hidden="true" />
                      Việc quá hạn
                    </NavLink>
                    <NavLink to="/operations/points">
                      <MapPin aria-hidden="true" />
                      Điểm giao nhận
                    </NavLink>
                  </>
                )}
              </div>
            )}
            {canReviewCatalog(user) && (
              <NavLink to="/users">
                <UsersRound aria-hidden="true" />
                Quản lý người dùng
              </NavLink>
            )}
            <span className="sidebar-item is-unavailable" aria-disabled="true">
              <span className="sidebar-item-content">
                <ChartNoAxesCombined aria-hidden="true" />
                Report
              </span>
              <small>Sắp triển khai</small>
            </span>
          </nav>
        )}
        <div className="sidebar-account">
          <span>{user?.displayName || state.user.displayName}</span>
          <Button busy={logoutBusy} onClick={() => void logout()}>
            Đăng xuất
          </Button>
        </div>
      </aside>
      <div className="workspace-frame">
        <main id="main" className="workspace" tabIndex={-1}>
          {logoutError !== undefined && <ErrorNotice error={logoutError} />}
          {profile.isLoading && (
            <p role="status">Đang kiểm tra quyền truy cập…</p>
          )}
          {profile.error && (
            <ErrorNotice
              error={profile.error}
              retry={() => void profile.refetch()}
              busy={profile.isFetching}
            />
          )}
          {user && !canEnterWorkspace(user) && (
            <Notice tone="warning">
              Tài khoản hiện không có quyền kiểm duyệt. Cần tài khoản đang hoạt
              động với quyền Staff, Admin hoặc vận hành thử.
            </Notice>
          )}
          {user && canEnterWorkspace(user) && (
            <div inert={logoutBusy || profile.isError || undefined}>
              <LeaveGuard.Provider value={registerGuard}>
                <div className="page-enter">
                  <Outlet context={user} />
                </div>
              </LeaveGuard.Provider>
            </div>
          )}
        </main>
        <footer className="workspace-footer">
          Lật lại · Hồ sơ rõ ràng, sách tiếp tục hành trình.
          <span>Thời gian hiển thị theo TP.HCM</span>
        </footer>
      </div>
    </div>
  );
}
const router = createBrowserRouter([
  {
    element: <Workspace />,
    errorElement: (
      <main className="workspace">
        <h1>Chưa mở được trang.</h1>
        <p>Thử tải lại trình duyệt để đăng nhập và kiểm tra hồ sơ.</p>
        <a href="/review/listings">Về bàn kiểm duyệt</a>
      </main>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "/dashboard", element: <DashboardMock /> },
      { path: "/review/:kind", element: <Queue /> },
      { path: "/review/:kind/:id", element: <Detail /> },
      { path: "/users", element: <UserDirectory /> },
      { path: "/operations/intakes", element: <IntakeQueue /> },
      { path: "/operations/collections", element: <CollectionQueue /> },
      { path: "/operations/resolutions", element: <ResolutionQueue /> },
      { path: "/operations/auctions", element: <AuctionQueue /> },
      { path: "/operations/points", element: <PointsPage /> },
      { path: "/operations/incidents", element: <IncidentsPage /> },
      { path: "/operations/escalations", element: <EscalationsPage /> },
      { path: "/simulator/deliveries", element: <DeliverySimulator /> },
      {
        path: "*",
        element: (
          <p>
            Không tìm thấy trang.{" "}
            <Link to="/review/listings">Về bàn kiểm duyệt</Link>
          </p>
        ),
      },
    ],
  },
]);
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
