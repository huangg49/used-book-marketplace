import { useEffect, useRef } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../lib/routes';
import styles from './NotFoundPage.module.css';

export function NotFoundPage() {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className={styles.page} aria-labelledby="member-not-found">
      <div className={styles.panel}>
        <span className={styles.code} aria-hidden="true">404</span>
        <div className={styles.content}>
          <h1 id="member-not-found" ref={heading} tabIndex={-1}>
            Không tìm thấy trang
          </h1>
          <p>Có thể đường dẫn đã thay đổi hoặc địa chỉ được nhập sai.</p>
          <div className={styles.actions}>
            <Link to={ROUTES.search} className={styles.primary} data-focus-inverse>
              <Search size={18} aria-hidden="true" />
              Tìm sách
            </Link>
            <Link to={ROUTES.home} className={styles.secondary}>
              <ArrowLeft size={18} aria-hidden="true" />
              Về trang chủ
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
