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
        if (!file) throw Error("Vui lòng chọn tệp bằng chứng cần gửi.");
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
          throw Error("Định dạng tệp không hỗ trợ. Vui lòng chọn ảnh JPG/PNG/WebP, PDF hoặc video MP4.");

        const max = mime.startsWith("image/")
          ? 10000000
          : mime === "application/pdf"
            ? 20000000
            : 100000000;
        if (file.size > max) throw Error(`Tệp vượt quá giới hạn dung lượng cho phép (${formatBytes(max)}).`);

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
      setMessage("Đã tải tệp lên thành công! Tệp đã được lưu an toàn vào hồ sơ đối soát khiếu nại.");
      await list.refetch();
    } catch (e) {
      if (evidenceIdentity(session) === userId)
        setError(
          e instanceof Error
            ? e.message
            : "Chưa gửi được tệp. Vui lòng thử lại với cùng tệp.",
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
    <section aria-label="Bằng chứng sự cố" className={ui.panelCard}>
      {/* Header */}
      <div className={ui.panelHeader}>
        <h3 className={ui.title}>Bằng chứng sự cố &amp; Mở hộp</h3>
        <p className={ui.subtitle}>
          Bằng chứng bạn cung cấp sẽ được gửi tới Ban Quản trị Lật Lại để đối chiếu với bằng chứng đóng gói của đối tác, phục vụ việc phân xử và hoàn cọc an toàn.
        </p>
      </div>

      {/* Guidelines Box */}
      <div className={ui.guidelinesBox}>
        <p>
          Hỗ trợ: Ảnh chụp chi tiết hư hỏng (JPG, PNG, WebP tối đa 10 MB) hoặc Video quay mở hộp (MP4 tối đa 100 MB). Bạn có thể tải lên nhiều tệp (tối đa 10 tệp).
        </p>
      </div>

      {/* Upload & Preview Area */}
      <div className={ui.uploadArea}>
        {!file && !resumeId ? (
          <label className={ui.dropzone}>
            <span className={ui.dropzoneTitle}>Bấm vào đây để chọn ảnh hoặc video từ thiết bị</span>
            <span className={ui.dropzoneHint}>Chấp nhận: Ảnh JPG, PNG, WebP hoặc Video MP4</span>
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
                  {file ? `Dung lượng: ${formatBytes(file.size)} · Định dạng: ${file.type || 'Không xác định'}` : 'Đang xử lý tệp chưa hoàn tất'}
                </span>
              </div>
              {!busy && (
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
                  Đổi tệp khác
                </button>
              )}
            </div>

            {/* Visual Media Preview */}
            {previewUrl && (
              <div className={ui.mediaPreviewWrap}>
                {fileType === "image" && (
                  <img src={previewUrl} alt="Xem trước bằng chứng" className={ui.imagePreview} />
                )}
                {fileType === "video" && (
                  <video src={previewUrl} controls className={ui.videoPreview}>
                    Trình duyệt của bạn không hỗ trợ phát video xem trước.
                  </video>
                )}
                {fileType === "pdf" && (
                  <div className={ui.pdfPreviewNote}>
                    Tệp tài liệu PDF đã được chọn sẵn sàng tải lên.
                  </div>
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
                {busy ? "Đang gửi lên máy chủ..." : pending ? "Thử lại gửi bằng chứng" : "Gửi bằng chứng này"}
              </button>
            </div>
          </div>
        )}

        {/* Status Alerts */}
        {busy && <div className={ui.busyAlert}>Đang tải tệp lên máy chủ và xác thực, vui lòng chờ trong giây lát...</div>}
        {message && <div className={ui.successAlert}>{message}</div>}
        {error && <div className={ui.errorAlert}>{error}</div>}

        {resumeId && (
          <p className={ui.guidelinesBox}>
            Chọn lại đúng tệp gốc để tiếp tục gửi. Máy chủ sẽ đối chiếu mã băm sha256 tự động.
          </p>
        )}

        {!list.isError && download && (
          <div className={ui.successAlert}>
            <a href={download.url} target="_blank" rel="noopener noreferrer" style={{ color: '#166534', fontWeight: 700 }}>
              Bấm vào đây để tải / xem tệp đã được cấp quyền
            </a>
            {" "}· Liên kết bảo mật có hạn trong 2 phút.
          </div>
        )}
      </div>

      {/* Uploaded Evidence List */}
      <div className={ui.listSection}>
        <h4 className={ui.listTitle}>Danh sách bằng chứng đã gửi lên</h4>

        {list.isPending && <p className={ui.emptyText}>Đang kiểm tra danh sách bằng chứng...</p>}

        {list.isError ? (
          <p className={ui.errorAlert}>
            Chưa tải được danh sách bằng chứng.
            <button type="button" className={ui.retryBtn} onClick={() => void list.refetch()}>
              Thử tải lại
            </button>
          </p>
        ) : !list.data?.items.length ? (
          <p className={ui.emptyText}>Chưa có bằng chứng nào được tải lên cho giao dịch này.</p>
        ) : (
          <ul className={ui.evidenceList}>
            {list.data.items.map((e) => (
              <li key={e.id} className={ui.evidenceItem}>
                <div className={ui.evidenceItemLeft}>
                  <span className={ui.evidenceFileName}>{e.fileName}</span>
                  <span className={ui.evidenceItemSub}>
                    {formatBytes(e.byteSize)} · {new Date(e.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} · {new Date(e.createdAt).toLocaleDateString('vi-VN')}
                  </span>
                </div>
                <div className={ui.evidenceItemRight}>
                  {e.status === "Ready" ? (
                    <>
                      <span className={ui.badgeReady}>Đã ghi nhận</span>
                      <button type="button" className={ui.viewFileBtn} onClick={() => void read(e.id)}>
                        Xem tệp
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={ui.badgePending}>Chưa xong</span>
                      {e.uploaderId === userId && (
                        <button
                          disabled={!!pending || busy}
                          type="button"
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
