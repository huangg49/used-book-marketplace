import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  ApiError, directOrderEvidenceMime, getDirectOrderEvidence, readDirectOrderEvidence,
  reserveDirectOrderEvidence, uploadDirectOrderEvidence,
} from "@used-books/session-client";
import { session } from "../../lib/session";
import styles from "./support.module.css";

export function DirectOrderEvidence({ owner, caseId }: { owner?: string; caseId: string }) {
  const evidence = useQuery({
    queryKey: ["direct-order-issue-evidence", owner, caseId],
    queryFn: () => getDirectOrderEvidence(session, caseId),
    enabled: !!owner,
    retry: false,
  });
  const [file, setFile] = useState<File>();
  const [notice, setNotice] = useState("");
  const [link, setLink] = useState<{ url: string; evidenceId: string }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const intent = useRef<{ sha256: string; id: string; reserveKey: string; uploadKey: string } | undefined>(undefined);
  if (evidence.error instanceof ApiError && evidence.error.status === 404) return null;

  async function send() {
    if (!file || busy) return;
    setError("");
    setNotice("");
    const mime = directOrderEvidenceMime.safeParse(file.type);
    if (!mime.success || !file.size || file.size > 8_000_000) {
      setError("Chọn ảnh JPG, PNG, WebP hoặc video MP4 dung lượng tối đa 8 MB.");
      return;
    }
    setBusy(true);
    try {
      const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const saved = evidence.data?.items.find((item) => item.sha256 === sha256);
      if (saved?.status !== "Ready") {
        if (intent.current?.sha256 !== sha256) {
          intent.current = { sha256, id: saved?.id ?? crypto.randomUUID(), reserveKey: crypto.randomUUID(), uploadKey: crypto.randomUUID() };
        }
        const request = intent.current;
        if (!saved) await reserveDirectOrderEvidence(session, caseId, {
          evidenceId: request.id, mimeType: mime.data, byteSize: file.size, sha256,
        }, request.reserveKey);
        await uploadDirectOrderEvidence(session, caseId, saved?.id ?? request.id, file, request.uploadKey);
      }
      intent.current = undefined;
      setFile(undefined);
      setNotice("Đã lưu bằng chứng vào hồ sơ.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chưa lưu được tệp. Chọn lại đúng tệp để tiếp tục.");
    } finally {
      await evidence.refetch();
      setBusy(false);
    }
  }

  async function read(evidenceId: string) {
    setError("");
    setLink(undefined);
    try {
      const signed = await readDirectOrderEvidence(session, caseId, evidenceId);
      setLink({ evidenceId, url: signed.url });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chưa mở được bằng chứng.");
    }
  }
  if (!evidence.data) return evidence.isError
    ? <p role="alert">Chưa tải được phần bằng chứng. <button type="button" onClick={() => void evidence.refetch()}>Thử lại</button></p>
    : <p role="status">Đang tải bằng chứng…</p>;

  return (
    <section className={styles.detailHeaderCard} aria-label="Bằng chứng đơn mua">
      <h2>Bằng chứng đơn mua</h2>
      <p className={styles.detailStatusExplanation}>Bạn có thể gửi ảnh mở kiện, ảnh tình trạng sách hoặc video MP4 tối đa 8 MB mỗi tệp.</p>
      <label>
        Chọn ảnh hoặc video
        <input key={notice} type="file" accept="image/jpeg,image/png,image/webp,video/mp4" disabled={busy}
          onChange={(event) => setFile(event.target.files?.[0])} />
      </label>
      <button type="button" className={styles.refreshButton} disabled={!file || busy} onClick={() => void send()}>
        {busy ? "Đang gửi bằng chứng…" : "Gửi bằng chứng"}
      </button>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {evidence.data.items.length > 0 && <ul>
        {evidence.data.items.map((item, index) => <li key={item.id}>
          {item.mimeType === "video/mp4" ? "Video" : "Ảnh"} {index + 1}
          {" · "}{item.status === "Ready" ? <button type="button" onClick={() => void read(item.id)}>Lấy liên kết tệp</button>
            : "Chờ gửi · Chọn lại đúng tệp để tiếp tục"}
          {link?.evidenceId === item.id && <> · <a href={link.url} target="_blank" rel="noreferrer">Mở tệp đã gửi</a></>}
        </li>)}
      </ul>}
    </section>
  );
}
