import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  exchangeEvidenceListSchema,
  exchangeEvidenceReadSchema,
  pendingEvidence,
  sendEvidence,
  resumeEvidence,
  evidenceIdentity,
  type EvidenceInput,
} from "@used-books/session-client";
import { session } from "../../lib/session";
import styles from "../../pages/DirectOrders.module.css";
import ui from "./ExchangeEvidencePanel.module.css";
export function ExchangeEvidencePanel({
  id,
  revision,
  userId,
}: {
  id: string;
  revision: number;
  userId: string;
}) {
  const [file, setFile] = useState<File | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [resumeId, setResumeId] = useState<string>(),
    [download, setDownload] = useState<{ url: string; expiresAt: string }>();
  useEffect(() => {
    if (!download) return;
    const timer = setTimeout(
      () => setDownload(undefined),
      Math.max(0, Date.parse(download.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [download]);
  const list = useQuery({
    queryKey: ["exchange-evidence", userId, id],
    queryFn: () =>
      session.request(`/exchanges/${id}/evidence`, exchangeEvidenceListSchema),
    retry: false,
    refetchInterval: 5000,
  });
  const pending = pendingEvidence(session, id);
  async function upload() {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let input: EvidenceInput | null = null;
      if (!pending) {
        if (!file) throw Error("Chọn tệp cần gửi.");
        const mime = file.type as EvidenceInput["mimeType"];
        if (
          ![
            "image/jpeg",
            "image/png",
            "image/webp",
            "application/pdf",
            "video/mp4",
          ].includes(mime)
        )
          throw Error("Dùng JPEG, PNG, WebP, PDF hoặc MP4.");
        const max = mime.startsWith("image/")
          ? 10000000
          : mime === "application/pdf"
            ? 20000000
            : 100000000;
        if (file.size > max) throw Error("Tệp vượt giới hạn dung lượng.");
        const bytes = new Uint8Array(await file.arrayBuffer());
        input = {
          bytes,
          fileName: file.name,
          mimeType: mime,
          sha256: Array.from(
            new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
            (b) => b.toString(16).padStart(2, "0"),
          ).join(""),
          expectedVersion: revision,
        };
      }
      if (resumeId && input)
        await resumeEvidence(session, id, resumeId, input, () =>
          crypto.randomUUID(),
        );
      else await sendEvidence(session, id, input, () => crypto.randomUUID());
      if (evidenceIdentity(session) !== userId) return;
      setFile(null);
      setResumeId(undefined);
      setMessage(
        "Máy chủ đã ghi nhận tệp. Nhóm vận hành có thể xem sau khi nhận phụ trách.",
      );
      await list.refetch();
    } catch (e) {
      if (evidenceIdentity(session) === userId)
        setError(
          e instanceof Error
            ? e.message
            : "Chưa gửi được tệp. Thử lại cùng tệp.",
        );
    } finally {
      setBusy(false);
    }
  }
  async function read(eid: string) {
    setError("");
    try {
      const result = await session.request(
        `/exchanges/${id}/evidence/${eid}/read`,
        exchangeEvidenceReadSchema,
        { method: "POST" },
      );
      if (evidenceIdentity(session) === userId) setDownload(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chưa mở được tệp.");
    }
  }
  return (
    <section aria-label="Bằng chứng sự cố" className={ui.root}>
      <h3>Bằng chứng sự cố</h3>
      <p>
        Báo sự cố đã được tiếp nhận; tải tệp lỗi không làm mất báo cáo. Tiền
        tiếp tục được giữ. Video mở hộp không bắt buộc.
      </p>
      <p>
        Ảnh tối đa 10 MB, PDF tĩnh 20 MB, MP4 100 MB. Tối đa 10 tệp mỗi người,
        gồm tệp đang chờ. Không tải thông tin cá nhân không liên quan.
      </p>
      {list.isPending && <p role="status">Đang tải bằng chứng…</p>}
      {list.isError ? (
        <p role="alert">
          Chưa tải được danh sách.{" "}
          <button onClick={() => void list.refetch()}>
            Tải lại bằng chứng
          </button>
        </p>
      ) : (
        <ul>
          {list.data?.items.map((e) => (
            <li key={e.id}>
              <strong>{e.fileName}</strong> ·{" "}
              {e.status === "Ready" ? "Đã gửi" : "Chưa gửi xong"} ·{" "}
              {Math.ceil(e.byteSize / 1000)} KB{" "}
              {e.status === "Ready" ? (
                <button type="button" onClick={() => void read(e.id)}>
                  Tải tệp {e.fileName}
                </button>
              ) : (
                e.uploaderId === userId && (
                  <button
                    disabled={!!pending || busy}
                    type="button"
                    onClick={() => {
                      setResumeId(e.id);
                      setFile(null);
                    }}
                  >
                    Gửi tiếp {e.fileName}
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      )}
      {resumeId && (
        <p role="status">
          Chọn lại đúng tệp gốc để gửi tiếp. Máy chủ đối chiếu hash, không ghi
          đè nội dung.
        </p>
      )}
      <label data-focus-surface className={ui.picker}>
        Chọn tệp từ thiết bị
        <input
          aria-label="Chọn bằng chứng"
          className={ui.file}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4"
          disabled={busy || !!pending}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setMessage("");
          }}
        />
      </label>
      <p role="status">
        {busy
          ? "Đang gửi và kiểm tra tệp…"
          : pending
            ? `Chưa rõ kết quả: ${pending.fileName}. Thử lại gửi cùng yêu cầu.`
            : file
              ? `Đã chọn ${file.name}; chưa gửi lên máy chủ.`
              : "Chưa chọn tệp."}
      </p>
      {!list.isError && download && (
        <p>
          <a href={download.url} target="_blank" rel="noopener noreferrer">
            Tải tệp đã được cấp quyền
          </a>{" "}
          · Liên kết có hạn tối đa 2 phút.
        </p>
      )}
      <button
        type="button"
        className={styles.secondaryActionBtn}
        disabled={busy || pending?.busy || (!file && !pending)}
        onClick={() => void upload()}
      >
        {pending ? "Thử lại gửi bằng chứng" : "Gửi bằng chứng"}
      </button>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
