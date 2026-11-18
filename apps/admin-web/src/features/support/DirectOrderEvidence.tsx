import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, getDirectOrderEvidence, readDirectOrderEvidence } from "@used-books/session-client";
import { session } from "../../core/session";
import { Button, Notice } from "../../core/ui";
import styles from "./support.module.css";

export function DirectOrderEvidence({ owner, caseId }: { owner: string; caseId: string }) {
  const evidence = useQuery({
    queryKey: ["operations-direct-order-evidence", owner, caseId],
    queryFn: () => getDirectOrderEvidence(session, caseId),
    retry: false,
  });
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [download, setDownload] = useState<{ id: string; url: string }>();
  if (evidence.error instanceof ApiError && evidence.error.status === 404) return null;
  if (!evidence.data) return evidence.isError
    ? <Notice tone="error">Chưa tải được bằng chứng. <Button onClick={() => void evidence.refetch()}>Thử lại</Button></Notice>
    : <p role="status">Đang tải bằng chứng đơn mua…</p>;

  async function read(id: string) {
    if (busy || reason.trim().length < 5) return;
    setBusy(true);
    setError("");
    setDownload(undefined);
    try {
      setDownload(await readDirectOrderEvidence(session, caseId, id, reason.trim()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chưa mở được tệp.");
    } finally {
      setBusy(false);
    }
  }
  const files = [
    ...evidence.data.packagingEvidenceIds.map((id, index) => ({ id, label: `Ảnh đóng gói ${index + 1}`, ready: true })),
    ...evidence.data.items.map((item, index) => ({
      id: item.id, label: `${item.mimeType === "video/mp4" ? "Video" : "Ảnh"} người mua gửi ${index + 1}`, ready: item.status === "Ready",
    })),
  ];

  return (
    <section className={styles.actions} aria-label="Đối chiếu bằng chứng đơn mua">
      <h2>Đối chiếu bằng chứng</h2>
      <Button onClick={() => void evidence.refetch()} busy={evidence.isFetching}>Cập nhật tệp</Button>
      {files.length === 0 ? <p>Chưa nhận được tệp bằng chứng.</p> : (
        <>
          <label className={styles.form}>Lý do xem tệp
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={250} />
          </label>
          <ul>
            {files.map((file) => <li key={file.id}>
              {file.label}{" · "}
              {file.ready ? <Button disabled={reason.trim().length < 5 || busy} onClick={() => void read(file.id)}>Lấy liên kết</Button> : "Chờ tải lên"}
              {download?.id === file.id && <> · <a href={download.url} target="_blank" rel="noreferrer">Mở tệp</a></>}
            </li>)}
          </ul>
        </>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </section>
  );
}
