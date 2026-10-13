import { useCallback, useEffect, useRef, type ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { dateText } from "../../core/format";
import { Button, ErrorNotice, Notice } from "../../core/ui";
import type { Finish } from "./action-panel";
import type { QueuePanel, Row } from "./queue-panel";

export function OperationsQueue({
  number,
  title,
  intro,
  order,
  unit = "hồ sơ",
  result,
  serverTime,
  rows,
  empty,
  panel,
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
}) {
  const { open, setOpen, pending, setPending, notice, setNotice } = panel;
  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);
  const finish = useCallback<Finish>(
    (outcome) => {
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
        <p className="eyebrow">Điểm và đấu giá / {number}</p>
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
      <p className="muted">
        {order}{" "}
        {result.isSuccess &&
          `Đang hiển thị ${rows.length} ${unit}.${serverTime ? ` Cập nhật ${dateText(serverTime)}.` : ""}`}
      </p>
      {notice && (
        <div ref={noticeRef} tabIndex={-1}>
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      )}
      {result.isLoading && (
        <p className="empty" role="status">
          Đang tải hồ sơ…
        </p>
      )}
      {result.error && (
        <ErrorNotice
          error={result.error}
          retry={() => void result.refetch()}
          busy={result.isFetching}
        />
      )}
      {result.isSuccess && rows.length === 0 && (
        <div className="empty">
          <span className="folio">—</span>
          <h2>{empty.title}</h2>
          <p>{empty.body}</p>
        </div>
      )}
      <div className="queue-list">
        {rows.map((row, index) => {
          const expanded = open === row.id;
          const panelId = `action-${row.id}`;
          return (
            <article className="queue-row" key={row.id}>
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
              {expanded && row.action && (
                <div id={panelId} className="row-panel">
                  {row.action.render({
                    onFinish: finish,
                    onPending: setPending,
                    reconcile,
                  })}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}

export function Forbidden() {
  return <p>Không có quyền xem khu vực này.</p>;
}
