import { type ReactNode } from "react";
import styles from "./BookCard.module.css";

/** A stable container providing hover elevation without 3D tilt. */
export function BookCardMotion({ children }: { children: ReactNode }) {
  return <div className={styles.motionFrame}>{children}</div>;
}

