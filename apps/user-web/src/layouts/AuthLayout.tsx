import type { ReactNode } from "react";
import { Header } from "../components/Header";
import styles from "./AuthLayout.module.css";
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.root}>
      <Header />
      <main className={styles.main}>{children}</main>
      <p className={styles.note}>Lật lại · Sách cũ. Người đọc mới.</p>
    </div>
  );
}
