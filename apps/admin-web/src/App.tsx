import {
  lazy,
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  createBrowserRouter,
  Link,
  Navigate,
  Outlet,
  RouterProvider,
} from "react-router-dom";
import { currentUserSchema } from "@used-books/session-client";
import {
  canEnterWorkspace,
  queryClient,
  session,
} from "./core/session";
import { ErrorNotice, Notice } from "./core/ui";
import { PageFrame } from "./core/page-frame";
import { LeaveGuard } from "./core/leave-guard";
import { LoginPage } from "./features/auth/LoginPage";
import { WorkspaceShell } from "./features/navigation/WorkspaceShell";
import "./App.css";

// Stable lazy components: profile refreshes and URL filter changes must not
// recreate page types or remount unsent forms. These imports run only when the
// authenticated/profile-checked Outlet renders the corresponding page.
const DashboardPage = lazy(() => import("./features/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const Queue = lazy(() => import("./features/review/queue").then((m) => ({ default: m.Queue })));
const Detail = lazy(() => import("./features/review/detail").then((m) => ({ default: m.Detail })));
const UserDirectory = lazy(() => import("./features/users/directory").then((m) => ({ default: m.UserDirectory })));
const IntakeQueue = lazy(() => import("./features/operations/queues").then((m) => ({ default: m.IntakeQueue })));
const CollectionQueue = lazy(() => import("./features/operations/queues").then((m) => ({ default: m.CollectionQueue })));
const ResolutionQueue = lazy(() => import("./features/operations/queues").then((m) => ({ default: m.ResolutionQueue })));
const AuctionQueue = lazy(() => import("./features/operations/queues").then((m) => ({ default: m.AuctionQueue })));
const PointsPage = lazy(() => import("./features/operations/points").then((m) => ({ default: m.PointsPage })));
const IncidentsPage = lazy(() => import("./features/operations/incidents").then((m) => ({ default: m.IncidentsPage })));
const EscalationsPage = lazy(() => import("./features/operations/escalations").then((m) => ({ default: m.EscalationsPage })));
const DeliverySimulator = lazy(() => import("./features/operations/simulator").then((m) => ({ default: m.DeliverySimulator })));
const SimulatorEventsPage = lazy(() => import("./features/operations/simulator-events").then((m) => ({ default: m.SimulatorEventsPage })));

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
  if (!authenticated) return <LoginPage />;
  const user = profile.data;
  return (
    <WorkspaceShell user={user} displayName={user?.displayName || state.user.displayName}
      profileFailed={profile.isError} logoutBusy={logoutBusy} logoutError={logoutError} onLogout={() => void logout()}>

        <main id="main" className="workspace" tabIndex={-1}>
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
                  <PageFrame><Outlet context={user} /></PageFrame>
                </div>
              </LeaveGuard.Provider>
            </div>
          )}
        </main>
        <footer className="workspace-footer">
          Lật lại · Hồ sơ rõ ràng, sách tiếp tục hành trình.
          <span>Thời gian hiển thị theo TP.HCM</span>
        </footer>
    </WorkspaceShell>
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
      { path: "/dashboard", element: <DashboardPage /> },
      {
        path: "/review/:kind",
        element: <Queue />,
        children: [{ path: ":id", element: <Detail /> }],
      },
      { path: "/users", element: <UserDirectory /> },
      { path: "/operations/intakes", element: <IntakeQueue /> },
      { path: "/operations/collections", element: <CollectionQueue /> },
      { path: "/operations/resolutions", element: <ResolutionQueue /> },
      { path: "/operations/auctions", element: <AuctionQueue /> },
      { path: "/operations/points", element: <PointsPage /> },
      { path: "/operations/incidents", element: <IncidentsPage /> },
      { path: "/operations/escalations", element: <EscalationsPage /> },
      { path: "/simulator/deliveries", element: <DeliverySimulator /> },
      { path: "/simulator/events/:kind", element: <SimulatorEventsPage /> },
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
