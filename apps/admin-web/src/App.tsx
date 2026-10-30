import { lazy, Suspense, useSyncExternalStore } from "react";
import {
  createBrowserRouter,
  Link,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import { session } from "./core/session";
import { LoginPage } from "./features/auth/LoginPage";
import "./App.css";
import "./task-surfaces.css";

const AuthenticatedWorkspace = lazy(
  () => import("./features/navigation/AuthenticatedWorkspace"),
);

// Stable lazy components: profile refreshes and URL filter changes must not
// recreate page types or remount unsent forms. These imports run only when the
// authenticated/profile-checked Outlet renders the corresponding page.
const DashboardPage = lazy(() =>
  import("./features/dashboard/DashboardPage").then((m) => ({
    default: m.DashboardPage,
  })),
);
const Queue = lazy(() =>
  import("./features/review/queue").then((m) => ({ default: m.Queue })),
);
const Detail = lazy(() =>
  import("./features/review/detail").then((m) => ({ default: m.Detail })),
);
const UserDirectory = lazy(() =>
  import("./features/users/directory").then((m) => ({
    default: m.UserDirectory,
  })),
);
const IntakeQueue = lazy(() =>
  import("./features/operations/queues").then((m) => ({
    default: m.IntakeQueue,
  })),
);
const CollectionQueue = lazy(() =>
  import("./features/operations/queues").then((m) => ({
    default: m.CollectionQueue,
  })),
);
const ResolutionQueue = lazy(() =>
  import("./features/operations/queues").then((m) => ({
    default: m.ResolutionQueue,
  })),
);
const AuctionQueue = lazy(() =>
  import("./features/operations/queues").then((m) => ({
    default: m.AuctionQueue,
  })),
);
const PointsPage = lazy(() =>
  import("./features/operations/points").then((m) => ({
    default: m.PointsPage,
  })),
);
const IncidentsPage = lazy(() =>
  import("./features/operations/incidents").then((m) => ({
    default: m.IncidentsPage,
  })),
);
const EscalationsPage = lazy(() =>
  import("./features/operations/escalations").then((m) => ({
    default: m.EscalationsPage,
  })),
);
const DeliverySimulator = lazy(() =>
  import("./features/operations/simulator").then((m) => ({
    default: m.DeliverySimulator,
  })),
);
const SimulatorEventsPage = lazy(() =>
  import("./features/operations/simulator-events").then((m) => ({
    default: m.SimulatorEventsPage,
  })),
);
const ExchangeDisputesPage = lazy(() =>
  import("./features/operations/exchange-disputes").then((m) => ({
    default: m.ExchangeDisputesPage,
  })),
);

function Workspace() {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  if (state.status !== "authenticated") return <LoginPage />;
  return (
    <Suspense
      fallback={
        <main className="workspace" role="status">
          Đang mở bàn vận hành…
        </main>
      }
    >
      <AuthenticatedWorkspace />
    </Suspense>
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
      { path: "/operations/exchange-disputes", element: <ExchangeDisputesPage /> },
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
  return <RouterProvider router={router} />;
}
