import { useLayoutEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, ChevronDown, History } from "lucide-react";
import { useLocation } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import {
  categoryPath,
  facetDefinitions,
  languageLabel,
} from "@used-books/api-contract/catalog-taxonomy";
import { dateText } from "../../core/format";
import { invalidateDashboard } from "../../core/dashboard-cache";
import { session } from "../../core/session";
import { Button, ErrorNotice, Notice } from "../../core/ui";
import { catalog, labels } from "./contracts";
import { DecisionForm } from "./decision-form";
import { DecisionRecord } from "./DecisionRecord";
import { NextReview } from "./NextReview";
import {
  matchesRecordedDecision,
  recordedDecision,
  type RecordedDecision,
} from "./decision-feedback";
import styles from "./CatalogReview.module.css";

export function CatalogDrawerDetail({
  id,
  user,
}: {
  id: string;
  user: CurrentUser;
}) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [reset, setReset] = useState(0);
  const [pendingCommand, setPendingCommand] = useState(false);
  const [recorded, setRecorded] = useState<RecordedDecision | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const result = useQuery({
    queryKey: ["review", "catalog-requests", id],
    queryFn: () =>
      session.request(`/operations/catalog-requests/${id}`, catalog),
    // Never refetch under an open review (ADR 0010), but drop the copy on leave so
    // reopening shows the latest revision, not the one decided earlier this session.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
    gcTime: 0,
  });

  const value = result.data;
  const loadedId = value?.id;

  useLayoutEffect(() => {
    if (!loadedId) return;
    rootRef.current?.parentElement?.scrollTo({ top: 0, behavior: "instant" });
    const active = document.activeElement;
    const linkPath =
      active instanceof HTMLAnchorElement && !active.matches(".skip-link")
        ? new URL(active.href).pathname
        : undefined;
    if (
      active === document.body ||
      linkPath === location.pathname ||
      linkPath === "/review/catalog-requests"
    ) {
      heading.current?.focus({ preventScroll: true });
    }
  }, [loadedId, location.pathname]);

  async function reconcile() {
    await invalidateDashboard(queryClient);
    const fresh = await result.refetch();
    if (fresh.error) throw fresh.error;
    await queryClient.invalidateQueries({ queryKey: ["queue"] });
    await queryClient.invalidateQueries({ queryKey: ["revisions", id] });
  }

  if (result.isLoading) {
    return <p role="status">Đang mở hồ sơ…</p>;
  }

  if (result.error && !value) {
    return (
      <ErrorNotice
        error={result.error}
        retry={() => void result.refetch()}
        busy={result.isFetching}
      />
    );
  }

  if (!value) return null;

  const m = value.currentRevision.metadata;
  const status = value.status;
  const self = value.requesterId === user.id;
  const pending = status === "Pending";
  const decisionAllowed = pending && !self;
  const decisionRecord = value.decisions.find(
    (decision) => decision.revisionId === value.currentRevision.id,
  );
  const canonicalCategory = m.categoryId
    ? categoryPath(m.categoryId)
        .map((c) => c.label)
        .join(" / ") || m.categoryId
    : null;
  const attributeEntries = Object.entries(m.attributes ?? {}).filter(
    ([, values]) => values && values.length > 0,
  );

  return (
    <div className={styles.detailStack} ref={rootRef}>
      {result.error && (
        <ErrorNotice
          error={result.error}
          retry={() => void result.refetch()}
          busy={result.isFetching}
        />
      )}

      <header className={styles.heroCard}>
        <div className={styles.heroTopRow}>
          <span className={styles.heroMeta}>
            #{id.slice(0, 8).toUpperCase()} · Bản gửi{" "}
            {value.currentRevision.number} ·{" "}
            {dateText(value.currentRevision.submittedAt)}
          </span>
          <span
            className={`status-label ${styles.statusBadge}`}
            data-state={status}
          >
            {labels[status] || status}
          </span>
        </div>
        <h2 className={styles.heroTitle} ref={heading} tabIndex={-1}>
          {m.title}
        </h2>
        <p className={styles.heroAuthors}>
          Tác giả:{" "}
          <strong>{m.authors.join(" · ") || "Chưa cung cấp"}</strong>
        </p>
      </header>

      <div className={styles.sheetCard}>
        <section className={styles.sheetSection}>
          <h3>
            <BookOpen size={17} aria-hidden="true" />
            Thông tin xuất bản
          </h3>
          <dl className={styles.metaGrid}>
            <div>
              <dt>Nhà xuất bản</dt>
              <dd className={!m.publisher ? styles.metaMissing : undefined}>
                {m.publisher || "Chưa cung cấp"}
              </dd>
            </div>
            <div>
              <dt>Năm xuất bản</dt>
              <dd
                className={!m.publicationYear ? styles.metaMissing : undefined}
              >
                {m.publicationYear || "Chưa cung cấp"}
              </dd>
            </div>
            <div>
              <dt>Danh mục</dt>
              <dd>{m.category}</dd>
            </div>
            <div>
              <dt>Ngôn ngữ</dt>
              <dd>{languageLabel(m.language)}</dd>
            </div>
            <div>
              <dt>Ấn bản</dt>
              <dd className={!m.edition ? styles.metaMissing : undefined}>
                {m.edition || "Chưa cung cấp"}
              </dd>
            </div>
            <div>
              <dt>ISBN</dt>
              <dd className={!m.isbn ? styles.metaMissing : undefined}>
                {m.isbn || "Không có ISBN"}
              </dd>
            </div>
            {canonicalCategory && (
              <div>
                <dt>Danh mục chuẩn</dt>
                <dd>{canonicalCategory}</dd>
              </div>
            )}
            {m.series && (
              <div>
                <dt>Bộ truyện</dt>
                <dd>{m.series}</dd>
              </div>
            )}
            {attributeEntries.map(([key, values]) => {
              const facet = facetDefinitions.find((f) => f.id === key);
              return (
                <div key={key}>
                  <dt>{facet?.label || key}</dt>
                  <dd>
                    {values
                      .map(
                        (v) =>
                          facet?.options.find((o) => o.id === v)?.label || v,
                      )
                      .join(" · ")}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>

        <section className={styles.sheetSection}>
          <h3>
            <History size={17} aria-hidden="true" />
            Lịch sử quyết định
          </h3>
          {value.decisions.length === 0 ? (
            <p className={styles.emptyNote}>Chưa có quyết định nào.</p>
          ) : (
            <div className={styles.historyList}>
              {value.decisions.map((decision) => (
                <article className={styles.historyEntry} key={decision.id}>
                  <div className={styles.historyEntryTop}>
                    <strong>{labels[decision.decision]}</strong>
                    <span>
                      {dateText(decision.decidedAt)} · Bản{" "}
                      {decision.revisionId.slice(0, 8)}
                    </span>
                  </div>
                  {decision.reason && (
                    <p className="prose">{decision.reason}</p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <div
        className={styles.decisionWrap}
        role="region"
        aria-label="Phiếu quyết định"
      >
        {decisionRecord && (
          <DecisionRecord
            {...decisionRecord}
            animate={matchesRecordedDecision(value, recorded)}
          />
        )}

        {self && (
          <Notice tone="warning">
            Bạn là người gửi hồ sơ này. Cần một người kiểm duyệt khác quyết
            định.
          </Notice>
        )}

        {!pending && !decisionRecord && <Notice>Hồ sơ đã có kết quả.</Notice>}

        {!pending && !self && (
          <NextReview
            kind="catalog-requests"
            currentId={id}
            reviewerId={user.id}
            canReadPendingCatalog
          />
        )}

        {decisionAllowed && (
          <DecisionForm
            key={`${value.version}/${value.currentRevision.id}/${reset}`}
            kind="catalog-requests"
            id={id}
            version={value.version}
            revisionId={value.currentRevision.id}
            canApprove
            photosReady
            disabled={result.isError || result.isFetching}
            reconcile={reconcile}
            onPending={setPendingCommand}
            subject={m.title}
            revisionNumber={value.currentRevision.number}
            onRecorded={(intent) =>
              setRecorded(recordedDecision(intent, "catalog-requests", id))
            }
          />
        )}

        <details className={styles.reloadBox}>
          <summary>
            <span>Có thông tin vừa thay đổi?</span>
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <div>
            <p>
              Tải lại để bắt đầu lượt kiểm tra mới. Lý do chưa gửi sẽ bị xóa.
              Nếu vừa gửi quyết định, hãy dùng nút tải kết quả trong khung quyết
              định.
            </p>
            <Button
              disabled={pendingCommand}
              busy={result.isFetching}
              onClick={async () => {
                if (
                  !window.confirm(
                    "Tải lại hồ sơ và bỏ lý do chưa gửi? Nếu vừa gửi quyết định, hãy thử lại yêu cầu đó trước.",
                  )
                )
                  return;
                const fresh = await result.refetch();
                if (!fresh.error) setReset((previous) => previous + 1);
              }}
            >
              Tải lại hồ sơ
            </Button>
          </div>
        </details>
      </div>

      <p className={styles.recordFoot}>Mã hồ sơ: {id}</p>
    </div>
  );
}
