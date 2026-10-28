import { useId } from "react";
import type { DashboardSnapshot } from "./sources";
import styles from "./DashboardPage.module.css";

type Point = NonNullable<DashboardSnapshot["points"]>[number];

export function PointCapacity({ point }: { point: Point }) {
  const clip = useId();
  const ratio = point.capacity > 0 ? Math.min(1, Math.max(0, point.heldSlots / point.capacity)) : 0;
  // Small capacities use one division per place. Large capacities are grouped
  // into at most 40 divisions; the clip preserves the exact occupied ratio.
  const divisions = Math.max(1, Math.min(40, point.capacity));
  const gap = 4;
  const segmentWidth = (320 - (divisions - 1) * gap) / divisions;
  return (
    <div className={styles.capacityRow}>
      <div className={styles.pointHeading}>
        <div className={styles.pointIdentity}>
          <h3>{point.name}</h3>
          <p className={styles.pointStatus} data-status={point.status}>
            {point.status === "Active" ? "Đang hoạt động" : point.status === "Paused" ? "Tạm dừng" : "Đã đóng"}
            {point.heldSlots > point.capacity ? " · Vượt sức chứa" : ""}
          </p>
        </div>
        <p className={styles.pointCount}>
          <strong>{point.heldSlots}</strong><span> / {point.capacity}</span>
          <small>chỗ đang giữ</small>
        </p>
      </div>
      <svg
        className={styles.capacityMeter}
        viewBox="0 0 320 16"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${point.name}: ${point.heldSlots} trên ${point.capacity} chỗ đang giữ`}
      >
        <defs><clipPath id={clip}><rect width={320 * ratio} height="16" /></clipPath></defs>
        <g className={styles.availableSlots}>
          {Array.from({ length: divisions }, (_, i) => <rect key={i} x={i * (segmentWidth + gap)} width={segmentWidth} height="16" rx="1" />)}
        </g>
        <g className={styles.heldSlots} clipPath={`url(#${clip})`}>
          {Array.from({ length: divisions }, (_, i) => <rect key={i} x={i * (segmentWidth + gap)} width={segmentWidth} height="16" rx="1" />)}
        </g>
      </svg>
    </div>
  );
}
