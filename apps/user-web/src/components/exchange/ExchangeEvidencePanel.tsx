import { useEffect, useState, useMemo } from "react";
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
import ui from "./ExchangeEvidencePanel.module.css";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ExchangeEvidencePanel({
  id,
  revision,
  userId,
}: {
  id: string;
  revision: number;
  userId: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [resumeId, setResumeId] = useState<string>();
  const [download, setDownload] = useState<{ url: string; expiresAt: string }>();

  // Manage preview URL lifecycle
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

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

  const fileType = useMemo(() => {
    if (!file) return null;
    if (file.type.startsWith("image/")) return "image";
    if (file.type === "video/mp4") return "video";
    if (file.type === "application/pdf") return "pdf";
    return "other";
  }, [file]);

  async function upload() {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let input: EvidenceInput | null = null;
      if (!pending) {
        if (!file) throw Error("Chưa chọn tệp.");
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
          throw Error("Chỉ nhận ảnh JPG, PNG hoặc video MP4.");

        const max = mime.startsWith("image/")
          ? 10000000
          : mime === "application/pdf"
            ? 20000000
            : 100000000;
        if (file.size > max) throw Error(`Tệp vượt giới hạn ${formatBytes(max)}.`);

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

      if (resumeId && input) {
        await resumeEvidence(session, id, resumeId, input, () =>
          crypto.randomUUID(),
        );
      } else {
        await sendEvidence(session, id, input, () => crypto.randomUUID());
      }

      if (evidenceIdentity(session) !== userId) return;
      setFile(null);
      setResumeId(undefined);
      setMessage("Đã gửi thành công. Máy chủ đã ghi nhận tệp.");
      await list.refetch();
    } catch (e) {
      if (evidenceIdentity(session) === userId)
        setError(e instanceof Error ? e.message : "Chưa gửi được tệp.");
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
    <section aria-label="Bằng chứng sự cố" className={ui.panelCard}>
      {/* Header gọn gàng tối đa */}
      <div className={ui.panelHeader}>
        <h3 className={ui.title}>Bằng chứng sự cố</h3>
      </div>

      {/* Upload & Preview Area */}
      <div className={ui.uploadArea}>
        {!file && !pending ? (
          <label className={ui.dropzone}>
            <span className={ui.dropzoneTitle}>
              {resumeId ? "Chọn lại tệp để gửi tiếp" : "Chọn ảnh hoặc video"}
            </span>
            <span className={ui.dropzoneHint}>JPG, PNG, MP4</span>
            <input
              aria-label="Chọn bằng chứng"
              className={ui.hiddenFileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4"
              disabled={busy || !!pending}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setMessage("");
                setError("");
              }}
            />
          </label>
        ) : (
          <div className={ui.previewBox}>
            <div className={ui.previewTop}>
              <div className={ui.previewInfo}>
                <span className={ui.previewName}>{file?.name ?? pending?.fileName}</span>
                <span className={ui.previewMeta}>
                  {file ? formatBytes(file.size) : ""}
                </span>
              </div>
              {!busy && !pending && (
                <button
                  type="button"
                  className={ui.changeFileBtn}
                  onClick={() => {
                    setFile(null);
                    setResumeId(undefined);
                    setMessage("");
                    setError("");
                  }}
                >
                  Đổi tệp
                </button>
              )}
            </div>

            {/* Visual Media Preview */}
            {previewUrl && (
              <div className={ui.mediaPreviewWrap}>
                {fileType === "image" && (
                  <img src={previewUrl} alt="Xem trước" className={ui.imagePreview} />
                )}
                {fileType === "video" && (
                  <video src={previewUrl} controls className={ui.videoPreview} />
                )}
                {fileType === "pdf" && (
                  <div className={ui.pdfPreviewNote}>Tệp PDF đã sẵn sàng.</div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className={ui.submitActions}>
              <button
                type="button"
                className={ui.primaryBtn}
                disabled={busy || pending?.busy || (!file && !pending)}
                onClick={() => void upload()}
              >
                {busy
                  ? "Đang gửi..."
                  : pending
                    ? "Thử lại gửi bằng chứng"
                    : "Gửi bằng chứng"}
              </button>
            </div>
          </div>
        )}

        {/* Status Alerts */}
        {busy && <div className={ui.busyAlert}>Đang gửi tệp lên hệ thống...</div>}
        {message && <div role="status" className={ui.successAlert}>{message}</div>}
        {error && <div role="alert" className={ui.errorAlert}>{error}</div>}

        {!list.isError && download && (
          <div className={ui.successAlert}>
            <a href={download.url} target="_blank" rel="noopener noreferrer" style={{ color: "#166534", fontWeight: 700 }}>
              Tải tệp đã được cấp quyền
            </a>
          </div>
        )}
      </div>

      {/* Uploaded Evidence List */}
      <div className={ui.listSection}>
        <h4 className={ui.listTitle}>Bằng chứng đã gửi</h4>

        {list.isPending && <p className={ui.emptyText}>Đang tải...</p>}

        {list.isError ? (
          <p className={ui.errorAlert}>
            Lỗi tải danh sách.
            <button type="button" className={ui.retryBtn} onClick={() => void list.refetch()}>
              Thử lại
            </button>
          </p>
        ) : !list.data?.items.length ? (
          <p className={ui.emptyText}>Chưa có bằng chứng nào.</p>
        ) : (
          <ul className={ui.evidenceList}>
            {list.data.items.map((e) => (
              <li key={e.id} className={ui.evidenceItem}>
                <div className={ui.evidenceItemLeft}>
                  <span className={ui.evidenceFileName}>{e.fileName}</span>
                  <span className={ui.evidenceItemSub}>
                    {formatBytes(e.byteSize)} · {new Date(e.createdAt).toLocaleDateString("vi-VN")}
                  </span>
                </div>
                <div className={ui.evidenceItemRight}>
                  {e.status === "Ready" ? (
                    <>
                      <span className={ui.badgeReady}>Đã nhận</span>
                      <button
                        type="button"
                        aria-label={`Tải tệp ${e.fileName}`}
                        className={ui.viewFileBtn}
                        onClick={() => void read(e.id)}
                      >
                        Xem
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={ui.badgePending}>Chưa xong</span>
                      {e.uploaderId === userId && (
                        <button
                          disabled={!!pending || busy}
                          type="button"
                          aria-label={`Gửi tiếp ${e.fileName}`}
                          className={ui.viewFileBtn}
                          onClick={() => {
                            setResumeId(e.id);
                            setFile(null);
                          }}
                        >
                          Gửi tiếp
                        </button>
                      )}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
