import { useRef, useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Link,
  useLocation,
  useOutletContext,
  useParams,
} from "react-router-dom";
import { z } from "zod";
import type { components } from "@used-books/api-contract";
import {
  pendingAccountCommand,
  pendingAccountCommandPath,
  sendAccountCommand,
  type CurrentUser,
} from "@used-books/session-client";
import { session, canReviewCatalog } from "../../core/session";
import { Button, CursorPagination, Notice } from "../../core/ui";
import { operationErrorText } from "../../core/errors";
import { dateText } from "../../core/format";
import { operationsUser, userStatusLabel } from "./contracts";
import "./account-controls.css";
const date = z.iso.datetime({ offset: true }),
  status = z.enum(["ACTIVE", "RESTRICTED"]);
const account = z.object({
  user: operationsUser,
  version: z.number().int().positive(),
  lock: z
    .object({
      scope: z.literal("NewTransactions"),
      restoreStatus: status,
      reason: z.string(),
      unlockCondition: z.string(),
      relatedReference: z.string().nullable(),
      actorId: z.uuid(),
      createdAt: date,
    })
    .nullable(),
}) satisfies z.ZodType<components["schemas"]["OperationsAccount"]>;
const event = z.object({
  id: z.uuid(),
  actorId: z.uuid(),
  action: z.enum(["AccountLocked", "AccountUnlocked"]),
  fromStatus: operationsUser.shape.status,
  toStatus: operationsUser.shape.status,
  reason: z.string(),
  scope: z.literal("NewTransactions"),
  unlockCondition: z.string().nullable(),
  relatedReference: z.string().nullable(),
  createdAt: date,
});
const events = z.object({
  items: z.array(event),
  nextCursor: z.string().nullable(),
  serverTime: date,
});

export function AccountControls() {
  const user = useOutletContext<CurrentUser>(),
    { id } = useParams();
  if (!canReviewCatalog(user))
    return (
      <Notice tone="warning">
        Chỉ quản trị viên đang hoạt động được quản lý tài khoản.
      </Notice>
    );
  if (!id || !z.uuid().safeParse(id).success)
    return <Notice tone="error">Mã tài khoản không hợp lệ.</Notice>;
  return <AccountContent key={`${user.id}/${id}`} id={id} owner={user.id} />;
}
function AccountContent({ id, owner }: { id: string; owner: string }) {
  const [confirmation, setConfirmation] = useState<{
    path: string;
    body:
      | components["schemas"]["LockUserAccount"]
      | components["schemas"]["UnlockUserAccount"];
    locking: boolean;
  } | null>(null);
  const cache = useQueryClient(),
    location = useLocation(),
    dialog = useRef<HTMLDialogElement>(null);
  const back =
    typeof location.state?.returnTo === "string" &&
    location.state.returnTo.startsWith("/users?")
      ? location.state.returnTo
      : "/users";
  const result = useQuery({
    queryKey: ["operations-account", owner, id],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: () => session.request(`/operations/users/${id}`, account),
    retry: false,
  });
  const history = useInfiniteQuery({
    queryKey: ["account-control-history", owner, id],
    staleTime: 0,
    refetchOnMount: "always",
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      session.request(
        `/operations/users/${id}/history?limit=10${pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""}`,
        events,
      ),
    getNextPageParam: (last) => last.nextCursor,
    retry: false,
  });
  const [reason, setReason] = useState(""),
    [condition, setCondition] = useState(""),
    [reference, setReference] = useState(""),
    [legacyStatus, setLegacyStatus] = useState<"ACTIVE" | "RESTRICTED">(
      "RESTRICTED",
    ),
    [busy, setBusy] = useState(false),
    [needsRead, setNeedsRead] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const slot = `account-control:${id}`,
    pending = pendingAccountCommand(session, slot),
    current = result.data,
    locked = current?.user.status === "LOCKED";
  const eligible =
    current &&
    id !== owner &&
    ["ACTIVE", "RESTRICTED", "LOCKED"].includes(current.user.status);
  async function refresh() {
    void history.refetch();
    const read = await result.refetch();
    if (read.error) throw read.error;
    setNeedsRead(false);
  }
  async function send() {
    if (busy || (!confirmation && !pending)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const receipt = await sendAccountCommand(
        session,
        slot,
        pendingAccountCommandPath(session, slot) ?? confirmation!.path,
        pending ? null : confirmation!.body,
        () => crypto.randomUUID(),
        { entityType: "UserAccount", entityId: id },
      );
      setNeedsRead(true);
      setConfirmation(null);
      dialog.current?.close();
      setMessage(
        `Đã ghi nhận: ${userStatusLabel[receipt.state as keyof typeof userStatusLabel] ?? receipt.state}.`,
      );
      setReason("");
      setCondition("");
      setReference("");
      await refresh();
      void cache.invalidateQueries({ queryKey: ["operations-users"] });
    } catch (e) {
      setError(operationErrorText(e));
      dialog.current?.close();
    } finally {
      setBusy(false);
    }
  }
  const entries = history.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="account-controls">
      <Link to={back}>← Về danh sách người dùng</Link>
      <header className="page-heading">
        <h1>Quản lý tài khoản</h1>
        <p className="intro">
          Giới hạn giao dịch mới, giữ kênh xử lý nghĩa vụ đang có.
        </p>
      </header>
      {result.isPending && <p role="status">Đang tải tài khoản…</p>}
      {result.error && (
        <Notice tone="error">{operationErrorText(result.error)}</Notice>
      )}
      <Button
        busy={result.isFetching}
        disabled={busy}
        onClick={() =>
          void refresh().catch((e) => setError(operationErrorText(e)))
        }
      >
        Tải trạng thái mới
      </Button>
      {message && <Notice tone="success">{message}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {pending && (
        <section>
          <Notice tone="warning">
            Chưa xác nhận được kết quả thao tác trước. Thử lại cùng yêu cầu;
            chưa đổi quyết định.
          </Notice>
          <Button busy={busy} onClick={() => void send()}>
            Xác minh thao tác trước
          </Button>
        </section>
      )}
      {current && (
        <>
          <section
            className="account-control-summary"
            aria-labelledby="account-name"
          >
            <h2 id="account-name">{current.user.displayName}</h2>
            <p>{current.user.email}</p>
            <p>
              <strong>{userStatusLabel[current.user.status]}</strong> · Phiên
              bản {current.version}
            </p>
            <p className="muted">Mã tài khoản: {id}</p>
            {current.lock && (
              <dl>
                <dt>Lý do khóa</dt>
                <dd>{current.lock.reason}</dd>
                <dt>Điều kiện mở</dt>
                <dd>{current.lock.unlockCondition}</dd>
                <dt>Hồ sơ liên quan</dt>
                <dd>{current.lock.relatedReference ?? "Không có"}</dd>
                <dt>Người khóa · thời điểm</dt>
                <dd>
                  {current.lock.actorId} · {dateText(current.lock.createdAt)}
                </dd>
                <dt>Khi mở khóa</dt>
                <dd>
                  Khôi phục{" "}
                  {userStatusLabel[current.lock.restoreStatus].toLowerCase()};
                  các vi phạm và hạn chế riêng vẫn giữ.
                </dd>
              </dl>
            )}
          </section>
          {needsRead && (
            <Notice tone="warning">
              Lệnh đã được ghi nhận. Cần tải trạng thái mới trước khi quyết định
              tiếp.
            </Notice>
          )}
          {!pending &&
            (eligible ? (
              <form
                className="account-control-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!reason.trim() || (!locked && !condition.trim())) {
                    setError("Nhập lý do và điều kiện mở khóa.");
                    return;
                  }
                  setConfirmation({
                    path: `/operations/users/${id}/${locked ? "unlock" : "lock"}`,
                    locking: !locked,
                    body: locked
                      ? {
                          expectedVersion: current.version,
                          reason: reason.trim(),
                          restoreStatus:
                            current.lock?.restoreStatus ?? legacyStatus,
                        }
                      : {
                          expectedVersion: current.version,
                          reason: reason.trim(),
                          unlockCondition: condition.trim(),
                          relatedReference: reference.trim() || null,
                        },
                  });
                  dialog.current?.showModal();
                }}
              >
                <h2>{locked ? "Mở khóa tài khoản" : "Khóa giao dịch mới"}</h2>
                <p>
                  Không xóa ví, thay đổi số dư, snapshot hoặc hủy giao dịch.
                  Người dùng vẫn xử lý các nghĩa vụ cũ được hệ thống hỗ trợ.
                </p>
                {locked && !current.lock && (
                  <>
                    <Notice tone="warning">
                      Khóa lịch sử chưa có trạng thái gốc. Chọn rõ trạng thái
                      khôi phục; quyết định sẽ được ghi vào lịch sử.
                    </Notice>
                    <label className="field">
                      Trạng thái khôi phục
                      <select
                        value={legacyStatus}
                        disabled={busy || needsRead}
                        onChange={(e) =>
                          setLegacyStatus(
                            e.target.value as "ACTIVE" | "RESTRICTED",
                          )
                        }
                      >
                        <option value="RESTRICTED">Hạn chế</option>
                        <option value="ACTIVE">Đang hoạt động</option>
                      </select>
                    </label>
                  </>
                )}
                <label htmlFor="account-reason" className="field">
                  Lý do {locked ? "mở khóa" : "khóa"}
                </label>
                <textarea
                  id="account-reason"
                  required
                  maxLength={1000}
                  rows={3}
                  value={reason}
                  disabled={busy || needsRead}
                  onChange={(e) => setReason(e.target.value)}
                />
                {!locked && (
                  <>
                    <label htmlFor="account-condition" className="field">
                      Điều kiện mở khóa
                    </label>
                    <textarea
                      id="account-condition"
                      required
                      maxLength={1000}
                      rows={3}
                      value={condition}
                      disabled={busy || needsRead}
                      onChange={(e) => setCondition(e.target.value)}
                    />
                    <label className="field">
                      Mã hồ sơ liên quan (không bắt buộc)
                      <input
                        maxLength={100}
                        value={reference}
                        disabled={busy || needsRead}
                        onChange={(e) => setReference(e.target.value)}
                      />
                    </label>
                  </>
                )}
                <Button
                  type="submit"
                  variant={locked ? "primary" : "danger"}
                  disabled={busy || needsRead}
                >
                  {locked ? "Kiểm tra mở khóa" : "Kiểm tra khóa tài khoản"}
                </Button>
              </form>
            ) : (
              <Notice tone="info">
                {id === owner
                  ? "Không thể tự khóa hoặc mở tài khoản của chính mình."
                  : "Trạng thái hiện tại không hỗ trợ khóa/mở."}
              </Notice>
            ))}
        </>
      )}
      <section aria-labelledby="account-history">
        <h2 id="account-history">Lịch sử khóa và mở</h2>
        {history.isPending && <p role="status">Đang tải lịch sử…</p>}
        {history.error && !history.isFetchNextPageError && (
          <>
            <Notice tone="error">
              Chưa tải được lịch sử. {operationErrorText(history.error)}
            </Notice>
            <Button onClick={() => void history.refetch()}>
              Thử lại lịch sử
            </Button>
          </>
        )}
        {history.isSuccess && !entries.length && (
          <p>Chưa có quyết định khóa/mở được ghi trong phạm vi đã tải.</p>
        )}
        <ol className="account-control-history">
          {entries.map((e) => (
            <li key={e.id}>
              <h3>
                {e.action === "AccountLocked"
                  ? "Khóa tài khoản"
                  : "Mở khóa tài khoản"}
              </h3>
              <p>
                {userStatusLabel[e.fromStatus]} → {userStatusLabel[e.toStatus]}
              </p>
              <p>{e.reason}</p>
              {e.unlockCondition && <p>Điều kiện mở: {e.unlockCondition}</p>}
              {e.relatedReference && <p>Hồ sơ: {e.relatedReference}</p>}
              <p className="muted">
                {dateText(e.createdAt)} · Người thực hiện: {e.actorId}
              </p>
            </li>
          ))}
        </ol>
        <CursorPagination
          pageCount={history.data?.pages.length ?? 0}
          hasNextPage={history.hasNextPage}
          isFetchingNextPage={history.isFetchingNextPage}
          isFetching={history.isFetching}
          error={history.isFetchNextPageError ? history.error : undefined}
          onNextPage={() =>
            void history.fetchNextPage({ cancelRefetch: false })
          }
          nextLabel="Xem thêm lịch sử"
        />
      </section>
      <dialog
        ref={dialog}
        aria-labelledby="account-confirm"
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <h2 id="account-confirm">
          {confirmation?.locking
            ? "Xác nhận khóa tài khoản"
            : "Xác nhận mở khóa"}
        </h2>
        <p>
          {current?.user.displayName} · {current?.user.email}
        </p>
        <blockquote>{confirmation?.body.reason}</blockquote>
        <p>
          {confirmation?.locking
            ? "Chặn giao dịch mới; giữ nghĩa vụ, tiền và lịch sử hiện có."
            : `Khôi phục ${userStatusLabel[confirmation?.body && "restoreStatus" in confirmation.body ? confirmation.body.restoreStatus : legacyStatus].toLowerCase()}.`}
        </p>
        <div className="actions">
          <Button
            autoFocus
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            Quay lại kiểm tra
          </Button>
          <Button
            busy={busy}
            variant={confirmation?.locking ? "danger" : "primary"}
            onClick={() => void send()}
          >
            Xác nhận quyết định
          </Button>
        </div>
      </dialog>
    </div>
  );
}
