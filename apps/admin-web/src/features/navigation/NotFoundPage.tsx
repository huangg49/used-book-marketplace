import { useEffect, useRef } from "react";
import { ArrowRight, LayoutDashboard } from "lucide-react";
import { Link, useOutletContext } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { canReview } from "../../core/session";
import styles from "./NotFoundPage.module.css";

export default function NotFoundPage() {
  const user = useOutletContext<CurrentUser>();
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <section className={styles.page} aria-labelledby="not-found-heading">
      <div className={styles.ticket}>
        <div className={styles.code} aria-hidden="true">404</div>
        <div className={styles.content}>
          <h1 id="not-found-heading" ref={heading} tabIndex={-1}>
            Không tìm thấy trang
          </h1>
          <p>Có thể đường dẫn đã thay đổi hoặc địa chỉ được nhập sai.</p>
          <div className={styles.actions}>
            <Link to="/dashboard" className={styles.primary} data-focus-inverse>
              <LayoutDashboard size={18} aria-hidden="true" />
              Về tổng quan
            </Link>
            {canReview(user) && (
              <Link to="/review/listings" className={styles.secondary}>
                Về bàn kiểm duyệt
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
