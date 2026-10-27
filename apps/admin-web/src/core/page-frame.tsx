import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigationType } from "react-router-dom";
import { Button } from "./ui";
import { playWorkspaceEdge, shouldTurnWorkspace } from "./workspace-motion";
import styles from "./page-frame.module.css";

export function PageLoading() {
  return <p className="empty" role="status">Đang mở trang…</p>;
}

export function PageLoadError({ dashboard }: { dashboard: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return (
    <section aria-label="Không mở được nội dung trang">
      <h1 ref={heading} tabIndex={-1}>Chưa mở được trang này.</h1>
      <p>Thử tải lại trang để mở nội dung. Bạn sẽ cần đăng nhập lại.</p>
      <div className="actions">
        <Button onClick={() => window.location.reload()}>Tải lại trang</Button>
        {!dashboard && <Link to="/dashboard">Về tổng quan</Link>}
      </div>
    </section>
  );
}

class PageErrorBoundary extends Component<
  { children: ReactNode; dashboard: boolean },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed
      ? <PageLoadError dashboard={this.props.dashboard} />
      : this.props.children;
  }
}

// A failed page stays inside the workspace. Navigating to another pathname
// resets its boundary; changing filters does not remount an active form.
export function PageFrame({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const action = useNavigationType();
  const [navigation, setNavigation] = useState({ pathname, turn: false });
  // Keep the decision for this pathname through profile/query re-renders and
  // deferred imports. Only a committed new pathname earns another edge.
  if (navigation.pathname !== pathname) setNavigation({
    pathname, turn: shouldTurnWorkspace(navigation.pathname, pathname, action),
  });
  return (
    <PageErrorBoundary key={pathname} dashboard={pathname === "/dashboard"}>
      <Suspense fallback={<PageLoading />}>
        <PageSurface key={pathname} turn={navigation.turn}>{children}</PageSurface>
      </Suspense>
    </PageErrorBoundary>
  );
}

// This effect only mounts after Suspense resolves. The edge is decorative:
// it cannot defer navigation, move focus or change the controls' geometry.
function PageSurface({ children, turn }: { children: ReactNode; turn: boolean }) {
  const edge = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (turn && edge.current) return playWorkspaceEdge(edge.current);
  }, [turn]);
  return <div className={styles.surface}>
    <span ref={edge} className={styles.edge} aria-hidden="true" />
    {children}
  </div>;
}
