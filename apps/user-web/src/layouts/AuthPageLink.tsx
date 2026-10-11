import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuthPaper } from "./auth-paper";

/** Preserve native modifier clicks; turn the sheet for ordinary navigation. */
export function AuthPageLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  const { turnTo } = useAuthPaper();
  return <Link to={to} className={className} onClick={(event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void turnTo(to);
  }}>{children}</Link>;
}
