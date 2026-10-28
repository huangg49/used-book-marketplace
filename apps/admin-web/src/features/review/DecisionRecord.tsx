import { useEffect, useRef } from "react";
import { dateText } from "../../core/format";
import { usePaperMotion } from "../../core/paper-motion";
import styles from "./DecisionRecord.module.css";

export function DecisionRecord({
  decision,
  decidedAt,
  reason,
  revisionId,
  animate = false,
}: {
  decision: "Approve" | "Confirm" | "Reject";
  decidedAt: string;
  reason: string | null;
  revisionId: string;
  animate?: boolean;
}) {
  const stamp = useRef<HTMLDivElement>(null);
  const record = useRef<HTMLElement>(null);
  const positive = decision !== "Reject";
  useEffect(() => {
    if (!animate || !positive) return;
    // The confirmation control was removed by reconciliation. Move to its
    // acknowledged result once, regardless of animation support or completion.
    record.current?.focus({ preventScroll: true });
    record.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [animate, positive]);
  usePaperMotion(stamp, animate && positive ? revisionId : null, "stamp");
  return (
    <section
      ref={record}
      tabIndex={-1}
      className={styles.record}
      aria-label="Kết quả kiểm duyệt đã ghi nhận"
      data-confirmed-motion={animate && positive ? "true" : "false"}
    >
      {positive && (
        <div ref={stamp} className={styles.stamp} aria-hidden="true">
          <span>LẬT LẠI · KIỂM DUYỆT</span>
          <strong>{decision === "Approve" ? "ĐÃ DUYỆT" : "ĐÃ XÁC NHẬN"}</strong>
          <span>
            {new Intl.DateTimeFormat("vi-VN").format(new Date(decidedAt))}
          </span>
        </div>
      )}
      <div className={styles.content}>
        <p className={styles.label}>KẾT QUẢ ĐÃ LƯU</p>
        <p className={styles.outcome} role={animate ? "status" : undefined}>
          {decision === "Approve"
            ? "Bài đăng đã được duyệt."
            : decision === "Confirm"
              ? "Đầu sách đã được xác nhận."
              : "Bản gửi đã bị từ chối."}
        </p>
        <time dateTime={decidedAt}>{dateText(decidedAt)}</time>
        {reason && <p className={styles.reason}>{reason}</p>}
        <p className={styles.reference}>Bản gửi · {revisionId.slice(0, 8)}</p>
      </div>
    </section>
  );
}
