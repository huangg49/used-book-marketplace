import { PageHeading } from "../../core/PageHeading";
import { useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { RotateCw, X } from "lucide-react";
import { canReviewCatalog, session } from "../../core/session";
import { Button, CursorPagination, Notice } from "../../core/ui";
import { ListFeedback } from "../../core/list-feedback";
import { PaperSelect } from "../../core/PaperSelect";
import { EmptyArt } from "../../core/EmptyArt";
import { dateText } from "../../core/format";
import { useListMotion } from "../../core/task-motion";
import {
  actionText,
  auditActorRoles,
  auditEntityTypes,
  auditEventPage,
  auditRequest,
  auditSearchParams,
  entityHref,
  entityLabel,
  readAuditFilters,
  type AuditEvent,
  type AuditFilters,
} from "./audit-filters";
import "../users/directory.css";
import "./activity-log.css";

const roleLabel = {
  MEMBER: "Thành viên",
  STAFF: "Nhân viên",
  ADMIN: "Quản trị viên",
  TEST_OPERATOR: "Vận hành thử",
} as const;

// FR-G05: Admin-only, read-only. The API enforces ADMIN; this guard only
// avoids showing a page the server would refuse.
export function ActivityLogPage() {
  const user = useOutletContext<CurrentUser>();
  if (!canReviewCatalog(user))
    return (
      <Notice tone="warning">
        Chỉ quản trị viên đang hoạt động được xem nhật ký hoạt động.
      </Notice>
    );
  return <ActivityLogContent owner={user.id} />;
}

function ActivityLogContent({ owner }: { owner: string }) {
  const [params, setParams] = useSearchParams();
  const filters = readAuditFilters(params);
  const [open, setOpen] = useState<AuditEvent | null>(null);
  const rows = useRef<HTMLTableSectionElement>(null);

  function apply(next: AuditFilters) {
    const value = auditSearchParams(next);
    if (value.toString() !== params.toString()) setParams(value);
    setOpen(null);
  }

  const result = useInfiniteQuery({
    queryKey: ["audit-events", owner, auditSearchParams(filters).toString()],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => session.request(auditRequest(filters, pageParam), auditEventPage),
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 0,
    retry: false,
  });
  const items = result.data?.pages.flatMap((p) => p.items) ?? [];
  useListMotion(rows, items.map((i) => i.id).join("|"));

  return (
    <>
      <PageHeading
        title="Nhật ký hoạt động"
        description="Tra cứu thao tác của nhân viên và quản trị viên theo người thực hiện, đối tượng, mã yêu cầu và thời gian. Nhật ký chỉ đọc; dữ liệu liên hệ và bí mật đã được ẩn."
      >
        <Button
          busy={result.isFetching}
          onClick={() => void result.refetch()}
          className={`btn-subtle-refresh ${result.isFetching ? "spinning" : ""}`}
        >
          <RotateCw size={14} aria-hidden="true" />
          Cập nhật nhật ký
        </Button>
      </PageHeading>

      <AuditFilterForm filters={filters} apply={apply} />

      {result.data && (
        <p className="directory-results-meta muted" role="status">
          Đang hiển thị {items.length} sự kiện. Cập nhật {dateText(result.data.pages[0].serverTime)}.
        </p>
      )}

      <ListFeedback result={result} loadingText="Đang tải nhật ký hoạt động…" />

      {result.isSuccess && !items.length && (
        <div className="empty">
          <EmptyArt variant="people" />
          <h2>Không có sự kiện phù hợp</h2>
          <p>Thử mở rộng khoảng thời gian, đổi nhóm tác nhân hoặc bỏ bớt bộ lọc.</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="directory-table-wrap">
          <table className="directory-table audit-table">
            <caption>Sự kiện nhật ký phù hợp với bộ lọc, mới nhất trước.</caption>
            <thead>
              <tr>
                <th scope="col">Thời điểm</th>
                <th scope="col">Người thực hiện</th>
                <th scope="col">Thao tác</th>
                <th scope="col">Đối tượng</th>
                <th scope="col">Lý do</th>
              </tr>
            </thead>
            <tbody ref={rows}>
              {items.map((item) => (
                <tr key={item.id} data-motion-key={item.id} aria-selected={open?.id === item.id}>
                  <td className="audit-time">
                    <time dateTime={item.createdAt}>{dateText(item.createdAt)}</time>
                  </td>
                  <th scope="row">
                    <ActorCell event={item} />
                  </th>
                  <td>
                    <button
                      type="button"
                      className="audit-action-link"
                      onClick={() => setOpen(item)}
                      aria-haspopup="dialog"
                    >
                      {actionText(item.action)}
                    </button>
                  </td>
                  <td>
                    <EntityCell event={item} />
                  </td>
                  <td className="audit-reason">{item.reason ?? <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CursorPagination
        pageCount={result.data?.pages.length ?? 0}
        hasNextPage={result.hasNextPage}
        isFetchingNextPage={result.isFetchingNextPage}
        isFetching={result.isFetching}
        error={result.isFetchNextPageError ? result.error : undefined}
        onNextPage={() => void result.fetchNextPage()}
        nextLabel="Tải thêm sự kiện"
      />

      {open && (
        <AuditDetail
          event={open}
          onClose={() => setOpen(null)}
          onFilter={(next) => apply({ ...filters, ...next })}
        />
      )}
    </>
  );
}

function ActorCell({ event }: { event: AuditEvent }) {
  if (event.actor.kind === "System")
    return (
      <div className="audit-actor">
        <strong>Hệ thống</strong>
        <small className="muted">{event.actor.systemActor ?? "Tự động"}</small>
      </div>
    );
  return (
    <div className="audit-actor">
      {event.actor.id ? (
        <Link to={`/users/${event.actor.id}`} className="user-name-link">
          {event.actor.displayName ?? "Tài khoản đã xóa"}
        </Link>
      ) : (
        <strong>Không rõ</strong>
      )}
      <small className="muted">
        {event.actor.roles.filter((r) => r !== "MEMBER").map((r) => roleLabel[r]).join(", ") || "Thành viên"}
      </small>
    </div>
  );
}

function EntityCell({ event }: { event: AuditEvent }) {
  if (!event.entity) return <span className="muted">—</span>;
  const href = entityHref(event.entity);
  const label = entityLabel[event.entity.type] ?? event.entity.type;
  const short = event.entity.id.slice(0, 8);
  return (
    <div className="audit-entity">
      <span>{label}</span>
      {href ? (
        <Link to={href} className="audit-code" aria-label={`Mở ${label} ${short}`}>
          {short}
        </Link>
      ) : (
        <code className="audit-code" title={event.entity.id}>{short}</code>
      )}
    </div>
  );
}

function Snapshot({ title, value }: { title: string; value: AuditEvent["before"] }) {
  return (
    <section className="audit-snapshot">
      <h3>{title}</h3>
      {value && Object.keys(value).length ? (
        <dl>
          {Object.entries(value).map(([key, v]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{Array.isArray(v) ? v.map(String).join(", ") : v === null ? "—" : String(v)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="muted">Không có dữ liệu hiển thị.</p>
      )}
    </section>
  );
}

function AuditDetail({
  event,
  onClose,
  onFilter,
}: {
  event: AuditEvent;
  onClose: () => void;
  onFilter: (next: Partial<AuditFilters>) => void;
}) {
  return (
    <aside
      className="audit-drawer"
      role="dialog"
      aria-modal="false"
      aria-labelledby="audit-drawer-title"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <header>
        <div>
          <p className="muted">{dateText(event.createdAt)}</p>
          <h2 id="audit-drawer-title">{actionText(event.action)}</h2>
        </div>
        <button type="button" className="audit-close" onClick={onClose} aria-label="Đóng chi tiết" autoFocus>
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <dl className="audit-meta">
        <div><dt>Mã sự kiện</dt><dd><code>{event.id}</code></dd></div>
        <div><dt>Mã yêu cầu</dt><dd><code>{event.requestId}</code></dd></div>
        {event.receiptId && <div><dt>Biên nhận</dt><dd><code>{event.receiptId}</code></dd></div>}
        {event.entity && (
          <div>
            <dt>{entityLabel[event.entity.type] ?? event.entity.type}</dt>
            <dd><code>{event.entity.id}</code></dd>
          </div>
        )}
        {event.reason && <div><dt>Lý do</dt><dd>{event.reason}</dd></div>}
      </dl>
      <div className="audit-drawer-actions">
        {event.actor.id && (
          <Button onClick={() => onFilter({ actorId: event.actor.id!, actorRole: "All" })}>
            Cùng người thực hiện
          </Button>
        )}
        {event.entity && (
          <Button onClick={() => onFilter({ entityType: event.entity!.type, entityId: event.entity!.id })}>
            Cùng đối tượng
          </Button>
        )}
        <Button onClick={() => onFilter({ requestId: event.requestId, actorRole: "All" })}>Cùng yêu cầu</Button>
      </div>
      <Snapshot title="Trước thay đổi" value={event.before} />
      <Snapshot title="Sau thay đổi" value={event.after} />
      {event.redactedFields > 0 && (
        <p className="muted audit-redacted">
          Đã ẩn {event.redactedFields} trường chứa dữ liệu nhạy cảm hoặc lồng nhau.
        </p>
      )}
    </aside>
  );
}

function AuditFilterForm({ filters, apply }: { filters: AuditFilters; apply: (f: AuditFilters) => void }) {
  const [draft, setDraft] = useState(filters);
  const [applied, setApplied] = useState(filters);
  if (auditSearchParams(applied).toString() !== auditSearchParams(filters).toString()) {
    setApplied(filters);
    setDraft(filters);
  }
  const set = (key: keyof AuditFilters) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft({ ...draft, [key]: e.target.value });
  const active = auditSearchParams(filters).toString() !== "";
  const advancedActive = Boolean(
    filters.entityId || filters.actorId || filters.action || filters.requestId || filters.eventId || filters.reason,
  );
  return (
    <form
      className="directory-filters audit-filters"
      onSubmit={(e) => {
        e.preventDefault();
        apply(draft);
      }}
    >
      <div className="filter-select-col">
        <PaperSelect
          label="Tác nhân"
          value={filters.actorRole}
          choices={auditActorRoles}
          onChange={(actorRole) => apply({ ...draft, actorRole })}
        />
      </div>
      <div className="filter-select-col">
        <PaperSelect
          label="Đối tượng"
          value={filters.entityType}
          choices={auditEntityTypes}
          onChange={(entityType) => apply({ ...draft, entityType })}
        />
      </div>
      <label className="field audit-field">
        <span>Từ</span>
        <input type="datetime-local" value={draft.from} onChange={set("from")} />
      </label>
      <label className="field audit-field">
        <span>Đến</span>
        <input type="datetime-local" value={draft.to} onChange={set("to")} />
      </label>
      <details className="audit-advanced" open={advancedActive || undefined}>
        <summary>Bộ lọc nâng cao{advancedActive ? " · đang áp dụng" : ""}</summary>
        <div className="audit-advanced-grid">
          <label className="field audit-field">
            <span>Mã đối tượng / giao dịch</span>
            <input value={draft.entityId} onChange={set("entityId")} maxLength={36} placeholder="UUID" spellCheck={false} />
          </label>
          <label className="field audit-field">
            <span>Mã người thực hiện</span>
            <input value={draft.actorId} onChange={set("actorId")} maxLength={36} placeholder="UUID" spellCheck={false} />
          </label>
          <label className="field audit-field">
            <span>Thao tác</span>
            <input value={draft.action} onChange={set("action")} maxLength={80} placeholder="Ví dụ: lockUserAccount" spellCheck={false} />
          </label>
          <label className="field audit-field">
            <span>Mã yêu cầu / sự kiện</span>
            <input
              value={draft.requestId || draft.eventId}
              onChange={(e) => setDraft({ ...draft, requestId: e.target.value, eventId: "" })}
              maxLength={36}
              placeholder="UUID"
              spellCheck={false}
            />
          </label>
          <label className="field audit-field">
            <span>Lý do chứa</span>
            <input value={draft.reason} onChange={set("reason")} maxLength={100} />
          </label>
        </div>
      </details>
      <div className="filter-actions-col audit-filter-actions">
        <Button type="submit" variant="primary">Lọc</Button>
        {active && (
          <Button type="button" onClick={() => apply(readAuditFilters(new URLSearchParams()))}>
            Xóa bộ lọc
          </Button>
        )}
      </div>
    </form>
  );
}
