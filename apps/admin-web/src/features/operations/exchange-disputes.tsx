import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { dateText, money } from "../../core/format";
import { canReview, session } from "../../core/session";
import { Notice } from "../../core/ui";
import {
  exchangeDisputeResolutionsList,
  type ExchangeDisputeItem,
} from "./contracts";
import { Forbidden, OperationsQueue } from "./queue-frame";
import { refetchWhileClosed, useQueuePanel } from "./queue-panel";
import styles from "./exchange-disputes.module.css";

export function ExchangeDisputesPage() {
  const user = useOutletContext<CurrentUser>();
  if (!canReview(user)) return <Forbidden />;
  return <ExchangeDisputesContent />;
}

function ExchangeDisputesContent() {
  const panel = useQueuePanel();
  const result = useQuery({
    queryKey: ["operations", "exchange-disputes"],
    queryFn: () =>
      session.request("/operations/exchanges/resolutions", exchangeDisputeResolutionsList),
    refetchInterval: refetchWhileClosed(panel),
  });

  return (
    <OperationsQueue
      number="08"
      title="Khiếu nại trao đổi sách."
      intro="Xem giao dịch đang cần xử lý và tình trạng gửi, nhận của hai bên. Danh sách không bao gồm giao dịch của chính bạn."
      order="Khiếu nại mới nhất trước."
      unit="khiếu nại"
      result={result}
      panel={panel}
      rows={(result.data ?? []).map((item) => ({
        id: item.id,
        status: "Chờ xử lý · Giữ tiền và sách",
        meta: [
          item.disputedBy === "System"
            ? "Hệ thống tự động (POL-07)"
            : "Thành viên khiếu nại",
          item.disputedAt ? `Mở ${dateText(item.disputedAt)}` : "Mới mở",
          `Cọc: ${money(item.initiatorDeposit)} / ${money(item.recipientDeposit)}`,
          item.diffAmount > 0
            ? `Bù chênh lệch: ${money(item.diffAmount)}`
            : "Không bù tiền",
        ],
        title: `Giao dịch trao đổi: #${item.id.slice(0, 8)}`,
        detail: <DisputeDetail item={item} />,
      }))}
      empty={{
        title: "Chưa có khiếu nại nào.",
        body: "Chưa có giao dịch chờ xử lý trong danh sách bạn được xem. Điều này không xác nhận mọi giao dịch đều đã hoàn tất.",
      }}
      extra={() => (
        <Notice tone="warning">
          Chưa thể thực thi phán quyết hoàn tiền hoặc hoàn tất trao đổi. Tiền và
          sách tiếp tục được giữ. Nhóm vận hành cần hoàn tất việc xác minh nơi giữ
          sách, phân bổ tiền và quy trình kháng nghị trước khi mở quyền phân xử.
        </Notice>
      )}
    />
  );
}

function parseDisputeReason(reason: string) {
  let category = "";
  let detail = "";
  let videoName = "";
  let imageName = "";

  const lines = reason.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[Sự cố]:")) {
      category = trimmed.replace("[Sự cố]:", "").trim();
    } else if (trimmed.startsWith("[Chi tiết]:")) {
      detail = trimmed.replace("[Chi tiết]:", "").trim();
    } else if (trimmed.startsWith("[Video unboxing]:")) {
      videoName = trimmed.replace("[Video unboxing]:", "").trim();
    } else if (trimmed.startsWith("[Ảnh bằng chứng]:")) {
      imageName = trimmed.replace("[Ảnh bằng chứng]:", "").trim();
    }
  }

  return {
    category,
    detail: detail || (!category && !videoName && !imageName ? reason : ""),
    videoName,
    imageName,
  };
}

function useEvidenceMedia(exchangeId: string) {
  const [media, setMedia] = useState<{ image?: string; video?: string }>({});

  useEffect(() => {
    // 1. Direct local storage (if same origin or cached)
    try {
      const localImg = localStorage.getItem(`evidence_img_${exchangeId}`);
      const localVid = localStorage.getItem(`evidence_video_${exchangeId}`);
      if (localImg || localVid) {
        setMedia((prev) => ({
          image: localImg || prev.image,
          video: localVid || prev.video,
        }));
      }
    } catch {}

    // 2. Set up iframe bridge to user-web if available
    let iframe = document.getElementById(
      "evidence-bridge-iframe",
    ) as HTMLIFrameElement | null;
    if (!iframe && typeof document !== "undefined") {
      iframe = document.createElement("iframe");
      iframe.id = "evidence-bridge-iframe";
      iframe.src = "http://localhost:5174/bridge.html";
      iframe.style.display = "none";
      document.body.appendChild(iframe);
    }

    const handleMessage = (e: MessageEvent) => {
      if (
        e.data &&
        e.data.type === "EVIDENCE_MEDIA_RES" &&
        e.data.id === exchangeId
      ) {
        setMedia((prev) => ({
          image: e.data.imageData || prev.image,
          video: e.data.videoData || prev.video,
        }));
      }
    };

    window.addEventListener("message", handleMessage);

    const postQuery = () => {
      try {
        iframe?.contentWindow?.postMessage(
          { type: "GET_EVIDENCE_MEDIA", id: exchangeId },
          "*",
        );
      } catch {}
    };

    if (iframe?.contentWindow) {
      postQuery();
    }
    iframe?.addEventListener("load", postQuery);

    return () => {
      window.removeEventListener("message", handleMessage);
      iframe?.removeEventListener("load", postQuery);
    };
  }, [exchangeId]);

  return media;
}

function DisputeDetail({ item }: { item: ExchangeDisputeItem }) {
  const parsed = parseDisputeReason(item.disputeReason || "");
  const evidence = useEvidenceMedia(item.id);

  const imageSrc =
    evidence.image ||
    (parsed.imageName
      ? parsed.imageName.startsWith("data:") ||
        parsed.imageName.startsWith("/") ||
        parsed.imageName.startsWith("http")
        ? parsed.imageName
        : "/demo-evidence/sample-book-damage.jpg"
      : undefined);

  const videoSrc =
    evidence.video ||
    (parsed.videoName
      ? parsed.videoName.startsWith("data:") ||
        parsed.videoName.startsWith("/") ||
        parsed.videoName.startsWith("http")
        ? parsed.videoName
        : "/demo-evidence/sample-unboxing.mp4"
      : undefined);

  return (
    <div className={styles.details}>
      <div className={styles.reasonBox}>
        {parsed.category && (
          <div className={styles.categoryBadge}>
            <span className={styles.categoryIcon}>⚠️</span>
            <span>{parsed.category}</span>
          </div>
        )}
        {parsed.detail && (
          <p className={styles.reasonText}>
            {parsed.detail}
          </p>
        )}
      </div>

      {(imageSrc || videoSrc || parsed.imageName || parsed.videoName) && (
        <div className={styles.evidenceSection}>
          <div className={styles.evidenceHeader}>
            <strong>Bằng chứng kiểm định từ thành viên:</strong>
          </div>
          <div className={styles.evidenceGrid}>
            {imageSrc && (
              <div className={styles.evidenceCard}>
                <div className={styles.evidenceMeta}>
                  <span className={styles.evidenceType}>📸 Ảnh chụp bằng chứng</span>
                  {parsed.imageName && (
                    <span className={styles.evidenceFileName} title={parsed.imageName}>
                      {parsed.imageName}
                    </span>
                  )}
                </div>
                <div className={styles.imageWrapper}>
                  <img
                    src={imageSrc}
                    alt={parsed.imageName || "Bằng chứng hư hại sách"}
                    className={styles.evidenceImage}
                  />
                </div>
              </div>
            )}
            {videoSrc && (
              <div className={styles.evidenceCard}>
                <div className={styles.evidenceMeta}>
                  <span className={styles.evidenceType}>🎥 Video mở hộp (Unboxing)</span>
                  {parsed.videoName && (
                    <span className={styles.evidenceFileName} title={parsed.videoName}>
                      {parsed.videoName}
                    </span>
                  )}
                </div>
                <div className={styles.videoWrapper}>
                  <video
                    src={videoSrc}
                    controls
                    preload="metadata"
                    className={styles.evidenceVideo}
                  >
                    Trình duyệt không hỗ trợ phát video.
                  </video>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={styles.parties}>
        <div className={styles.party}>
          <strong>Người khởi tạo (Bên A)</strong>
          <div>Gửi hàng: {item.initiatorShippedAt ? dateText(item.initiatorShippedAt) : "Chưa gửi"}</div>
          <div>Xác nhận đã nhận: {item.initiatorReceivedAt ? dateText(item.initiatorReceivedAt) : "Chưa nhận"}</div>
          <div>Cọc bảo chứng: {money(item.initiatorDeposit)}</div>
        </div>

        <div className={styles.party}>
          <strong>Đối tác (Bên B)</strong>
          <div>Gửi hàng: {item.recipientShippedAt ? dateText(item.recipientShippedAt) : "Chưa gửi"}</div>
          <div>Xác nhận đã nhận: {item.recipientReceivedAt ? dateText(item.recipientReceivedAt) : "Chưa nhận"}</div>
          <div>Cọc bảo chứng: {money(item.recipientDeposit)}</div>
        </div>
      </div>
    </div>
  );
}
