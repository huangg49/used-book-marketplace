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
} from "react-router-dom";
import {
  BookCheck,
  BookPlus,
  ChartNoAxesCombined,
  ClipboardCheck,
  LayoutDashboard,
  UsersRound,
} from "lucide-react";
import { currentUserSchema } from "@used-books/session-client";
import logo from "../../../packages/brand/logos/lat-lai-horizontal-primary.svg";
import {
  canReview,
  canReviewCatalog,
  queryClient,
  session,
} from "./core/session";
import { Button, ErrorNotice, Notice } from "./core/ui";
import { Queue } from "./features/review/queue";
import { Detail } from "./features/review/detail";
import { LeaveGuard } from "./core/leave-guard";
import "./App.css";

function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(undefined);
    try {
      await session.login({
        email: String(data.get("email")).trim(),
        password: String(data.get("password")),
      });
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <section className="login-story">
        <img src={logo} alt="Lật lại" width="170" />
        <p className="eyebrow">Không gian vận hành · TP.HCM</p>
        <h1>
          Giữ sự rõ ràng
          <br />
          trên từng
          <br />
          <em>trang sách.</em>
        </h1>
        <p>
          Kiểm tra những gì người đăng gửi.
          <br />
          Để người đọc sau có thêm cơ sở lựa chọn.
        </p>
        <div className="spine-mark" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      </section>
      <section className="login-form">
        <p className="eyebrow">Bàn kiểm duyệt</p>
        <h2>Chào người giữ kệ.</h2>
        <p className="muted">
          Đăng nhập bằng tài khoản nhân viên hoặc quản trị viên được cấp.
        </p>
        <form onSubmit={(event) => void submit(event)}>
          <label className="field">
            Email
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              disabled={busy}
            />
          </label>
          <label className="field">
            Mật khẩu
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={busy}
            />
          </label>
          {error !== undefined && <ErrorNotice error={error} />}
          <Button className="primary" type="submit" busy={busy}>
            Đăng nhập
          </Button>
        </form>
        <p className="small muted">
          Phiên chỉ giữ trong tab này. Tải lại trình duyệt sẽ cần đăng nhập lại.
        </p>
      </section>
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
      <aside className="sidebar">
        <Link
          className="sidebar-brand"
          to="/review/listings"
          aria-label="Lật lại · Bàn kiểm duyệt"
        >
          <img src={logo} alt="Lật lại" width="142" height="46" />
          <span>Bàn quản trị</span>
        </Link>
        {user && canReview(user) && (
          <nav className="workspace-nav" aria-label="Khu vực quản trị">
            <p className="sidebar-section-label">Điều hướng</p>
            <span className="sidebar-item is-unavailable" aria-disabled="true">
              <span className="sidebar-item-content">
                <LayoutDashboard aria-hidden="true" />
                Dashboard
              </span>
              <small>Sắp triển khai</small>
            </span>
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
            <span className="sidebar-item is-unavailable" aria-disabled="true">
              <span className="sidebar-item-content">
                <UsersRound aria-hidden="true" />
                Quản lý người dùng
              </span>
              <small>Sắp triển khai</small>
            </span>
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
        <header className="mobile-topbar">
          <span>Bàn quản trị</span>
          <Button busy={logoutBusy} onClick={() => void logout()}>
            Đăng xuất
          </Button>
        </header>
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
          {user && !canReview(user) && (
            <Notice tone="warning">
              Tài khoản hiện không có quyền kiểm duyệt. Cần tài khoản đang hoạt
              động với quyền Staff hoặc Admin.
            </Notice>
          )}
          {user && canReview(user) && (
            <div inert={logoutBusy || profile.isError || undefined}>
              <LeaveGuard.Provider value={registerGuard}>
                <Outlet context={user} />
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
      { index: true, element: <Navigate to="/review/listings" replace /> },
      { path: "/review/:kind", element: <Queue /> },
      { path: "/review/:kind/:id", element: <Detail /> },
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
