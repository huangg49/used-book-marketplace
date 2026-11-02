import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  exchangeEvidenceAccessSchema,
  exchangeEvidenceListSchema,
  exchangeEvidenceReadSchema,
} from "@used-books/session-client";
import { z } from "zod";
import { ApiError } from "@used-books/session-client";
import { session } from "../../core/session";
import { Notice } from "../../core/ui";
import styles from "./exchange-evidence-review.module.css";
const receipt = z.object({ entityId: z.string(), state: z.string() });
export function ExchangeEvidenceReview({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  const [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [download, setDownload] = useState<{
      url: string;
      expiresAt: string;
      name: string;
      evidenceId: string;
      mimeType: string;
    }>();
  const [intent, setIntent] = useState<
    | { key: string; body: { expectedVersion: number; reason: string } }
    | undefined
  >(undefined);
  useEffect(() => {
    if (!download) return;
    const timer = setTimeout(
      () => setDownload(undefined),
      Math.max(0, Date.parse(download.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [download]);
  const access = useQuery({
    queryKey: ["operations", "exchange-evidence-access", userId, id],
    queryFn: () =>
      session.request(
        `/operations/exchanges/${id}/evidence-access`,
        exchangeEvidenceAccessSchema,
      ),
    retry: false,
  });
  const assigned = !access.isError && access.data?.assigneeId === userId;
  const list = useQuery({
    queryKey: ["operations", "exchange-evidence", userId, id],
    queryFn: () =>
      session.request(
        `/operations/exchanges/${id}/evidence`,
        exchangeEvidenceListSchema,
      ),
    enabled: assigned,
    retry: false,
  });
  async function assign() {
    if (busy || !access.data) return;
    setBusy(true);
    setError("");
    const command = intent ?? {
      key: crypto.randomUUID(),
      body: { expectedVersion: access.data.version, reason: reason.trim() },
    };
    setIntent(command);
    try {
      await session.request(
        `/operations/exchanges/${id}/evidence-access`,
        receipt,
        {
          method: "POST",
          headers: { "Idempotency-Key": command.key },
          body: JSON.stringify(command.body),
        },
      );
      setIntent(undefined);
      await access.refetch();
    } catch (e) {
      if (e instanceof ApiError && [400, 409, 422].includes(e.status)) {
        setIntent(undefined);
        await access.refetch();
      }
      setError(
        e instanceof Error
          ? e.message
          : "Chưa xác nhận tiếp nhận. Thử lại cùng yêu cầu.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function read(eid: string, name: string, mimeType: string) {
    setError("");
    setDownload(undefined);
    try {
      const r = await session.request(
        `/operations/exchanges/${id}/evidence/${eid}/read`,
        exchangeEvidenceReadSchema,
        { method: "POST", body: JSON.stringify({ reason: reason.trim() }) },
      );
      setDownload({ ...r, name, evidenceId: eid, mimeType });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chưa mở được bằng chứng.");
      await list.refetch();
    }
  }
  return (
    <section aria-label="Bằng chứng riêng của hồ sơ" className={styles.root}>
      <h3>Bằng chứng riêng của hồ sơ</h3>
      <p>
        Nhận phụ trách để xem tệp. Mỗi lượt cấp quyền tải được ghi audit; không
        dùng bằng chứng để tự động hoàn tiền hoặc xác nhận nơi giữ sách.
      </p>
      <label>
        Lý do tiếp nhận / xem tệp
        <textarea
          value={reason}
          disabled={busy || !!intent}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {access.isPending && <p role="status">Đang kiểm tra phân công…</p>}
      {access.isError ? (
        <Notice tone="error">
          Chưa tải được quyền phụ trách.{" "}
          <button onClick={() => void access.refetch()}>
            Thử lại quyền phụ trách
          </button>
        </Notice>
      ) : !assigned ? (
        <>
          <p>
            {access.data?.assigneeId
              ? "Hồ sơ đã có người phụ trách. Chỉ Admin có thể nhận lại với lý do."
              : "Chưa có người phụ trách bằng chứng."}
          </p>
          <button
            disabled={busy || (!intent && reason.trim().length < 5)}
            onClick={() => void assign()}
          >
            {intent ? "Thử lại tiếp nhận" : "Nhận phụ trách bằng chứng"}
          </button>
        </>
      ) : (
        <>
          <p>Bạn đang phụ trách bằng chứng.</p>
          {list.isPending && <p role="status">Đang tải tệp…</p>}
          {list.isError ? (
            <Notice tone="error">
              Chưa tải được tệp hoặc phân công đã đổi.{" "}
              <button
                onClick={() => {
                  void access.refetch();
                  void list.refetch();
                }}
              >
                Kiểm tra lại phân công
              </button>
            </Notice>
          ) : (
            <>
              {list.data?.items.length === 0 && (
                <p>
                  Chưa có tệp gửi thành công. Mô tả báo sự cố vẫn được tiếp
                  nhận; không xem đây là bằng chứng không có thiệt hại.
                </p>
              )}
              <ul>
                {list.data?.items.map((e) => (
                  <li key={e.id}>
                    {e.fileName} · {e.mimeType} · {Math.ceil(e.byteSize / 1000)}{" "}
                    KB{" "}
                    <button
                      disabled={e.status !== "Ready" || reason.trim().length < 5}
                      onClick={() => void read(e.id, e.fileName, e.mimeType)}
                    >
                      Cấp quyền tải {e.fileName}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {assigned && !list.isError && download &&
        list.data?.items.some(e => e.id === download.evidenceId && e.status === "Ready") && (
        <div className={styles.preview}>
          {download.mimeType.startsWith("image/") && <img src={download.url} alt={`Bằng chứng: ${download.name}`} />}
          {download.mimeType === "video/mp4" && <video aria-label={`Video bằng chứng: ${download.name}`} src={download.url} controls playsInline preload="metadata">Trình duyệt chưa phát được video. Dùng liên kết tải bên dưới.</video>}
        <p>
          <a href={download.url} target="_blank" rel="noopener noreferrer">
            Tải tệp đã được cấp quyền: {download.name}
          </a>{" "}
          · Liên kết hết hạn sau tối đa 2 phút.
        </p>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </section>
  );
}
