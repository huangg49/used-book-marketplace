import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { dateText } from "../../core/format";
import { Button, Notice } from "../../core/ui";
import { ListFeedback } from "../../core/list-feedback";
import type { Finish } from "./action-panel";
import type { ActionContext, QueuePanel, Row } from "./queue-panel";
import { MotionPanel } from "../../core/MotionPanel";
import { useListMotion, useTaskArrival } from "../../core/task-motion";
import styles from "../../core/task-motion.module.css";

export function OperationsQueue({
  title,
  intro,
  order,
  unit = "hồ sơ",
  result,
  serverTime,
  rows,
  empty,
  panel,
  extra,
}: {
  number: string;
  title: string;
  intro: string;
  // The API's own sort order, stated like the review queue does.
  order: string;
  unit?: string;
  result: UseQueryResult<unknown>;
  serverTime?: string;
  rows: Row[];
  empty: { title: string; body: ReactNode };
  panel: QueuePanel;
  // A page-level command (e.g. adding a point) shares the notice and refresh.
  extra?: (context: ActionContext) => ReactNode;
}) {
  const { open, setOpen, pending, setPending, notice, setNotice } = panel;
  const [receiptIndex, setReceiptIndex] = useState<number>();
  const presented = useRef<unknown>(undefined);
  const presentNotice = useCallback((value: unknown, element: HTMLElement) => {
    // Polling can move the receipt to another surviving row without a new ACK.
    if (presented.current === value) return;
    presented.current = value;
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, []);
  const list = useRef<HTMLDivElement>(null);
  useListMotion(
    list,
    rows
      .map((row) => `${row.id}:${row.status}:${row.meta.join("/")}`)
      .join("|"),
  );
  const finish = useCallback<Finish>(
    (outcome) => {
      setReceiptIndex(undefined);
      setOpen(undefined);
      setNotice(outcome);
    },
    [setOpen, setNotice],
  );
  const reconcile = useCallback(
    () => result.refetch({ throwOnError: true }),
    [result],
  );
  return (
    <>
      <header className="page-heading">
        <h1>{title}</h1>
        <p className="intro">{intro}</p>
      </header>
      <div className="queue-toolbar">
        <Button
          busy={result.isFetching}
          disabled={pending}
          onClick={() => void result.refetch()}
        >
          Cập nhật danh sách
        </Button>
      </div>
      {extra?.({ onFinish: finish, onPending: setPending, reconcile })}
      <p className="muted">
        {order}{" "}
        {result.data !== undefined &&
          `Đang hiển thị ${rows.length} ${unit}.${serverTime ? ` Cập nhật ${dateText(serverTime)}.` : ""}`}
      </p>
      {notice && receiptIndex === undefined && (
        <OperationReceipt value={notice} present={presentNotice} />
      )}
      <ListFeedback
        result={result}
        loadingText="Đang tải hồ sơ…"
        retryDisabled={pending}
      />
      {result.isSuccess && rows.length === 0 && (
        <div className="empty">
          <span className="folio">—</span>
          <h2>{empty.title}</h2>
          <p>{empty.body}</p>
        </div>
      )}
      <div className="queue-list" ref={list}>
        {rows.map((row, index) => {
          const expanded = open === row.id;
          const panelId = `action-${row.id}`;
          return (
            <Fragment key={row.id}>
              {notice && receiptIndex === index && (
                <OperationReceipt value={notice} present={presentNotice} />
              )}
              <article
                className="queue-row"
                data-motion-key={row.id}
                data-motion-revision={`${row.status}/${row.meta.join("/")}`}
              >
                <span className="row-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <div className="row-meta">
                    <span>{row.status}</span>
                    {row.meta.map((value) => (
                      <span key={value}>{value}</span>
                    ))}
                  </div>
                  <h2>
                    {row.title || "Chưa có tên sách"}{" "}
                    <span className="short-id">/ {row.id.slice(0, 8)}</span>
                  </h2>
                  {row.detail && <div className="muted">{row.detail}</div>}
                </div>
                {row.action ? (
                  <Button
                    className="row-action"
                    aria-expanded={expanded}
                    aria-controls={expanded ? panelId : undefined}
                    disabled={pending}
                    onClick={() => {
                      setNotice(undefined);
                      setOpen(expanded ? undefined : row.id);
                    }}
                  >
                    {expanded ? "Đóng" : row.action.label}
                  </Button>
                ) : (
                  <span />
                )}
                {row.action && (
                  <MotionPanel
                    open={expanded}
                    id={panelId}
                    className="row-panel"
                  >
                    {expanded &&
                      row.action.render({
                        onFinish: (outcome) => {
                          setReceiptIndex(index);
                          setOpen(undefined);
                          setNotice(outcome);
                        },
                        onPending: setPending,
                        reconcile,
                      })}
                  </MotionPanel>
                )}
              </article>
            </Fragment>
          );
        })}
        {notice &&
          receiptIndex !== undefined &&
          receiptIndex >= rows.length && (
            <OperationReceipt value={notice} present={presentNotice} />
          )}
      </div>
    </>
  );
}

function OperationReceipt({
  value,
  present,
}: {
  value: { tone: "success" | "info" | "warning"; text: string };
  present: (value: unknown, element: HTMLElement) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useTaskArrival(ref, value.text);
  useEffect(() => {
    if (ref.current) present(value, ref.current);
  }, [value, present]);
  return (
    <div
      ref={ref}
      className={styles.receipt}
      tabIndex={-1}
      aria-label="Kết quả thao tác"
    >
      <span className={styles.receiptLabel}>
        {value.tone === "success" ? "Kết quả đã ghi nhận" : "Kết quả đối chiếu"}
      </span>
      <Notice tone={value.tone}>{value.text}</Notice>
    </div>
  );
}

export function Forbidden() {
  return <p>Không có quyền xem khu vực này.</p>;
}
