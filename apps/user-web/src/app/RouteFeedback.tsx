import { useEffect, useState } from 'react';
import { useNavigation } from 'react-router-dom';
import styles from './RouteFeedback.module.css';

/** Only used while a direct link's route module is being loaded. */
export function RoutePending() {
  return (
    <main className={styles.state} aria-busy="true">
      <div>
        <h1>Đang mở trang…</h1>
        <p role="status">Vui lòng chờ trong giây lát.</p>
      </div>
    </main>
  );
}

/** Reload the document so a failed or outdated chunk can be requested again. */
export function RouteError() {
  return (
    <main className={styles.state}>
      <div>
        <h1>Chưa mở được trang</h1>
        <p role="alert">Kiểm tra kết nối rồi tải lại trang này nhé.</p>
        <div className={styles.actions}>
          <button className={styles.reload} type="button" onClick={() => window.location.reload()}>
            Tải lại trang
          </button>
          <a className={styles.home} href="/">Về trang chủ</a>
        </div>
      </div>
    </main>
  );
}

/** Keep the current page mounted during navigation, with feedback on slower loads. */
export function RouteNavigationStatus() {
  const navigation = useNavigation();
  const destination = navigation.state === 'idle' ? null : navigation.location?.key;
  const [visibleFor, setVisibleFor] = useState<string | null>(null);
  useEffect(() => {
    if (!destination) return;
    const timer = window.setTimeout(() => setVisibleFor(destination), 200);
    return () => window.clearTimeout(timer);
  }, [destination]);
  return (
    <p
      className={styles.navigation}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      hidden={!destination || destination !== visibleFor}
    >
      Đang mở trang…
    </p>
  );
}
