import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Outlet } from "react-router-dom";
import { currentUserSchema } from "@used-books/session-client";
import { canEnterWorkspace, session } from "../../core/session";
import { queryClient } from "../../core/query-client";
import { ErrorNotice, Notice } from "../../core/ui";
import { PageFrame } from "../../core/page-frame";
import { LeaveGuard } from "../../core/leave-guard";
import { WorkspaceShell } from "./WorkspaceShell";

export default function AuthenticatedWorkspace() {
  return (
    <QueryClientProvider client={queryClient}>
      <Workspace />
    </QueryClientProvider>
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
  // The root gate handles login. This also covers a session expiring while the
  // deferred module or profile request was in flight.
  if (!authenticated) return null;
  const user = profile.data;
  return (
    <WorkspaceShell
      user={user}
      displayName={user?.displayName || state.user.displayName}
      profileFailed={profile.isError}
      logoutBusy={logoutBusy}
      logoutError={logoutError}
      onLogout={() => void logout()}
    >
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
                <PageFrame>
                  <Outlet context={user} />
                </PageFrame>
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
