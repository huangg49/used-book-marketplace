import { useEffect, useId, useRef, type ReactNode } from "react";
import { LayoutDashboard } from "lucide-react";
import { Link } from "react-router-dom";
import { PageTitle } from "../../core/PageHeading";
import styles from "./WorkspaceRecovery.module.css";

export function WorkspaceRecovery({
  code,
  title,
  description,
  children,
}: {
  code: "403" | "404";
  title: string;
  description: string;
  children?: ReactNode;
}) {
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <section className={styles.page} aria-labelledby={headingId}>
      <div className={styles.ticket}>
        <div className={styles.code} aria-hidden="true">{code}</div>
        <div className={styles.content}>
          <PageTitle id={headingId} ref={heading} tabIndex={-1}>{title}</PageTitle>
          <p>{description}</p>
          <div className={styles.actions}>
            <Link to="/dashboard" className={styles.primary} data-focus-inverse>
              <LayoutDashboard size={18} aria-hidden="true" />
              Về tổng quan
            </Link>
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
