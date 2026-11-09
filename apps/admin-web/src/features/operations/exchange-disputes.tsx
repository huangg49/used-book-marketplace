import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Link, useOutletContext, useParams } from "react-router-dom";
import {
  type CurrentUser,
  exchangeEvidenceAccessSchema,
  exchangeEvidenceListSchema,
  exchangeEvidenceReadSchema,
} from "@used-books/session-client";
import { dateText, money } from "../../core/format";
import { canReview, session } from "../../core/session";
import { Notice } from "../../core/ui";
import { ActionPanel, type Outcome } from "./action-panel";
import {
  exchangeDisputeResolutionsList,
  exchangeDisputeResolution,
  type ExchangeDisputeItem,
} from "./contracts";
import { ExchangeEvidenceReview } from "./exchange-evidence-review";
import { Forbidden, OperationsQueue } from "./queue-frame";
import {
  refetchWhileClosed,
  useQueuePanel,
  type ActionContext,
} from "./queue-panel";
import styles from "./exchange-disputes.module.css";

export function ExchangeDisputesPage() {
  const user = useOutletContext<CurrentUser>();
  if (!canReview(user)) return <Forbidden />;
  return <ExchangeDisputesContent />;
}

function ExchangeDisputesContent() {
  const user = useOutletContext<CurrentUser>();
  const panel = useQueuePanel();
  const result = useQuery({
    queryKey: ["operations", "exchange-disputes", user.id],
    queryFn: () =>
      session.request("/operations/exchanges/resolutions", exchangeDisputeResolutionsList),
    refetchInterval: refetchWhileClosed(panel),
  });

  return (
    <OperationsQueue
      number="08"
      title="Khiếu nại trao đổi sách."
      intro="Đối soát chéo chứng cứ đóng gói (bên gửi) và mở hộp (bên nhận) để đưa ra phán quyết trọng tài. Hệ thống đối soát song song 2 chiều."
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
        detail: <DisputeSummary item={item} />,
        action: {
          label: "Đối soát chứng cứ",
          to: `/operations/exchange-disputes/${item.id}`,
        },
      }))}
      empty={{
        title: "Chưa có khiếu nại nào.",
        body: "Chưa có giao dịch chờ xử lý trong danh sách bạn được xem. Điều này không xác nhận mọi giao dịch đều đã hoàn tất.",
      }}
      extra={() => (
        <Notice tone="info">
          Trọng tài đối soát chứng cứ 2 chiều: Quản trị viên đối chiếu video/ảnh đóng gói của người gửi với video mở kiện và ảnh của người khiếu nại để xác định lỗi thuộc về bên gửi hay đơn vị vận chuyển.
        </Notice>
      )}
    />
  );
}

type ParsedDisputeReason = {
  category: string;
  detail: string;
  videoName: string;
  imageName: string;
};

function parseDisputeReason(reason: string): ParsedDisputeReason {
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

const evidenceReceiptSchema = z.object({ entityId: z.string(), state: z.string() });

function useDisputeEvidence(exchangeId: string, userId: string) {
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const access = useQuery({
    queryKey: ["operations", "exchange-evidence-access", userId, exchangeId],
    queryFn: () =>
      session.request(
        `/operations/exchanges/${exchangeId}/evidence-access`,
        exchangeEvidenceAccessSchema,
      ),
    retry: false,
  });

  const assigned = !access.isError && access.data?.assigneeId === userId;

  useEffect(() => {
    if (!access.data || assigning || assigned) return;
    if (!access.data.assigneeId) {
      setAssigning(true);
      const command = {
        key: crypto.randomUUID(),
        body: {
          expectedVersion: access.data.version,
          reason: "Quản trị viên tiếp nhận đối soát chứng cứ khiếu nại",
        },
      };
      session
        .request(
          `/operations/exchanges/${exchangeId}/evidence-access`,
          evidenceReceiptSchema,
          {
            method: "POST",
            headers: { "Idempotency-Key": command.key },
            body: JSON.stringify(command.body),
          },
        )
        .then(() => access.refetch())
        .catch(() => {})
        .finally(() => setAssigning(false));
    }
  }, [access.data, assigned, assigning, exchangeId]);

  const list = useQuery({
    queryKey: ["operations", "exchange-evidence", userId, exchangeId],
    queryFn: () =>
      session.request(
        `/operations/exchanges/${exchangeId}/evidence`,
        exchangeEvidenceListSchema,
      ),
    enabled: assigned,
    retry: false,
  });

  useEffect(() => {
    const readyItems = (list.data?.items ?? []).filter(
      (item) => item.status === "Ready" && !mediaUrls[item.id],
    );
    if (readyItems.length === 0) return;

    let mounted = true;
    setLoadingMedia(true);

    Promise.all(
      readyItems.map((item) =>
        session
          .request(
            `/operations/exchanges/${exchangeId}/evidence/${item.id}/read`,
            exchangeEvidenceReadSchema,
            {
              method: "POST",
              body: JSON.stringify({
                reason: "Đối soát chứng cứ mở kiện và đóng gói trao đổi",
              }),
            },
          )
          .then((res) => ({ id: item.id, url: res.url }))
          .catch(() => null),
      ),
    ).then((results) => {
      if (!mounted) return;
      const map: Record<string, string> = {};
      results.forEach((r) => {
        if (r) map[r.id] = r.url;
      });
      setMediaUrls((prev) => ({ ...prev, ...map }));
      setLoadingMedia(false);
    });

    return () => {
      mounted = false;
    };
  }, [list.data?.items, exchangeId, mediaUrls]);

  const items = list.data?.items ?? [];
  const readyItems = items.filter((i) => i.status === "Ready");

  const videoItem = readyItems.find((i) => i.mimeType.startsWith("video/"));
  const imageItem = readyItems.find((i) => i.mimeType.startsWith("image/"));

  const videoSrc = videoItem ? mediaUrls[videoItem.id] : undefined;
  const imageSrc = imageItem ? mediaUrls[imageItem.id] : undefined;

  return {
    access,
    assigned,
    list,
    items,
    readyItems,
    videoItem,
    imageItem,
    videoSrc,
    imageSrc,
    mediaUrls,
    loadingMedia,
  };
}

function DisputeSummary({ item }: { item: ExchangeDisputeItem }) {
  const parsed = parseDisputeReason(item.disputeReason || "");
  const hasMedia = Boolean(parsed.imageName || parsed.videoName);
  const senderShipment =
    item.disputedBy === item.initiatorId
      ? item.recipientShipment
      : item.initiatorShipment;
  const hasPackagingMedia = Boolean(
    senderShipment?.packagingPhotoUrl || senderShipment?.packagingVideoUrl,
  );

  return (
    <div className={styles.rowPreview}>
      {parsed.category && (
        <span className={styles.previewBadge}>{parsed.category}</span>
      )}
      <span className={styles.previewText}>
        {parsed.detail || item.disputeReason || "Thành viên yêu cầu xử lý khiếu nại"}
      </span>
      {hasMedia && (
        <span className={styles.previewMediaPill}>
          📦 Mở hộp: {[parsed.imageName && "1 ảnh", parsed.videoName && "1 video"].filter(Boolean).join(" · ")}
        </span>
      )}
      {hasPackagingMedia && (
        <span className={styles.previewPackagingPill}>
          🛡️ Đóng gói: Có video &amp; ảnh bên gửi
        </span>
      )}
    </div>
  );
}

type DisputeDecision =
  | "RefundBoth"
  | "CompleteExchange"
  | "CompensateInitiator"
  | "CompensateRecipient";

const decisionDetails: Record<
  DisputeDecision,
  { label: string; effect: string }
> = {
  RefundBoth: {
    label: "Hòa giải / Sự cố khách quan — Hủy giao dịch & Hoàn cọc cả 2 bên (Refund Both)",
    effect:
      "Hủy giao dịch do sự cố giao nhận / hư hỏng khách quan. Sổ cái Ledger hoàn 100% tiền cọc và tiền bù cho cả hai bên; sách mở khóa để nhận lại.",
  },
  CompleteExchange: {
    label: "Bác khiếu nại & Hoàn tất trao đổi (Complete Exchange)",
    effect:
      "Chứng cứ cho thấy bên gửi đóng gói đúng chuẩn, khiếu nại không đủ căn cứ. Công nhận giao dịch hoàn tất, Ledger tất toán cọc và chuyển tiền bù.",
  },
  CompensateInitiator: {
    label: "Phạt cọc Bên B & Bồi thường cho Bên A (Compensate Initiator)",
    effect:
      "Xác định vi phạm thuộc về Bên B (Đối tác). Sổ cái Ledger tịch thu 100% tiền cọc của Bên B chuyển sang ví Bên A để bồi thường; hoàn cọc cho Bên A.",
  },
  CompensateRecipient: {
    label: "Phạt cọc Bên A & Bồi thường cho Bên B (Compensate Recipient)",
    effect:
      "Xác định vi phạm thuộc về Bên A (Khởi tạo). Sổ cái Ledger tịch thu 100% tiền cọc của Bên A chuyển sang ví Bên B để bồi thường; hoàn cọc cho Bên B.",
  },
};

type WorkspaceProps = { item: ExchangeDisputeItem; userId: string } & ActionContext;

function DisputeResolutionWorkspace({ item, userId, ...context }: WorkspaceProps) {
  const parsed = parseDisputeReason(item.disputeReason || "");
  const evidence = useEvidenceMedia(item.id);
  const evidenceHook = useDisputeEvidence(item.id, userId);

  const [decision, setDecision] = useState<DisputeDecision | null>(null);
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<"decision" | "reason" | null>(null);

  const firstDecision = useRef<HTMLInputElement>(null);
  const reasonInput = useRef<HTMLTextAreaElement>(null);

  const trimmed = reason.trim();

  // 1. Determine who disputed and who is the sender of the disputed package
  const isInitiatorDisputing = item.disputedBy === item.initiatorId;
  const isRecipientDisputing = item.disputedBy === item.recipientId;

  // If Initiator disputes -> They received the book sent by Recipient -> Sender is Recipient
  // If Recipient disputes -> They received the book sent by Initiator -> Sender is Initiator
  const disputedSenderShipment = isInitiatorDisputing
    ? item.recipientShipment
    : isRecipientDisputing
    ? item.initiatorShipment
    : item.recipientShipment || item.initiatorShipment;

  const senderRoleTitle = isInitiatorDisputing
    ? "Bên B (Người gửi sách bị khiếu nại)"
    : isRecipientDisputing
    ? "Bên A (Người gửi sách bị khiếu nại)"
    : "Bên gửi sách";

  const receiverRoleTitle = isInitiatorDisputing
    ? "Bên A (Người nhận & Báo cáo khiếu nại)"
    : isRecipientDisputing
    ? "Bên B (Người nhận & Báo cáo khiếu nại)"
    : "Bên khiếu nại";

  const faultSenderDecision: DisputeDecision = isInitiatorDisputing
    ? "CompensateInitiator"
    : "CompensateRecipient";

  const faultReceiverDecision: DisputeDecision = isInitiatorDisputing
    ? "CompensateRecipient"
    : "CompensateInitiator";

  const decisionOptions: {
    value: DisputeDecision;
    badge: string;
    label: string;
    effect: string;
  }[] = [
    {
      value: "RefundBoth",
      badge: "Hòa giải",
      label: "Hòa giải / Sự cố khách quan — Hủy giao dịch & Hoàn cọc cả 2 bên (Refund Both)",
      effect:
        "Sự cố ngoài ý muốn (vận chuyển / thời tiết / 2 bên đồng thuận). Sổ cái Ledger hoàn 100% tiền cọc và tiền bù cho cả hai bên; sách mở khóa để nhận lại.",
    },
    {
      value: "CompleteExchange",
      badge: "Bác khiếu nại",
      label: "Bác khiếu nại & Hoàn tất trao đổi (Complete Exchange)",
      effect:
        "Chứng cứ cho thấy bên gửi đóng gói đúng chuẩn, khiếu nại không đủ căn cứ. Công nhận giao dịch hoàn tất, Ledger tất toán cọc và chuyển tiền bù.",
    },
    {
      value: faultSenderDecision,
      badge: "Phạt bên gửi",
      label: `Lỗi Bên gửi (${senderRoleTitle}) — Tịch thu cọc đền bù cho Bên nhận`,
      effect:
        "Xác định bên gửi vi phạm (sách hư hỏng nặng, sai mô tả hoặc sách giả). Sổ cái Ledger tịch thu 100% tiền cọc của bên gửi chuyển thẳng vào ví bên nhận để bồi thường thiệt hại; hoàn trả cọc cho bên nhận.",
    },
    {
      value: faultReceiverDecision,
      badge: "Phạt bên nhận",
      label: `Lỗi Bên nhận (${receiverRoleTitle}) — Tịch thu cọc đền bù cho Bên gửi`,
      effect:
        "Xác định bên nhận có hành vi gian lận (tráo hàng, cố tình phá hỏng sách hoặc vu khống vô căn cứ). Sổ cái Ledger tịch thu 100% tiền cọc của bên nhận chuyển thẳng vào ví bên gửi để bồi thường; hoàn trả cọc cho bên gửi.",
    },
  ];

  // Packaging media (Sender)
  const packagingPhotoSrc =
    disputedSenderShipment?.packagingPhotoUrl ||
    (disputedSenderShipment?.packagingPhotoName &&
    (disputedSenderShipment.packagingPhotoName.startsWith("data:") ||
      disputedSenderShipment.packagingPhotoName.startsWith("/") ||
      disputedSenderShipment.packagingPhotoName.startsWith("http"))
      ? disputedSenderShipment.packagingPhotoName
      : "/demo-evidence/sample-book-damage.jpg");

  const packagingVideoSrc =
    disputedSenderShipment?.packagingVideoUrl ||
    (disputedSenderShipment?.packagingVideoName &&
    (disputedSenderShipment.packagingVideoName.startsWith("data:") ||
      disputedSenderShipment.packagingVideoName.startsWith("/") ||
      disputedSenderShipment.packagingVideoName.startsWith("http"))
      ? disputedSenderShipment.packagingVideoName
      : "/demo-evidence/sample-unboxing.mp4");

  // Complaint / Unboxing media (Receiver)
  const receiverImageSrc =
    evidenceHook.imageSrc ||
    evidence.image ||
    (parsed.imageName
      ? parsed.imageName.startsWith("data:") ||
        parsed.imageName.startsWith("/") ||
        parsed.imageName.startsWith("http")
        ? parsed.imageName
        : "/demo-evidence/sample-book-damage.jpg"
      : undefined);

  const receiverImageName =
    evidenceHook.imageItem?.fileName ||
    parsed.imageName ||
    "Ảnh sự cố sách";

  const receiverVideoSrc =
    evidenceHook.videoSrc ||
    evidence.video ||
    (parsed.videoName
      ? parsed.videoName.startsWith("data:") ||
        parsed.videoName.startsWith("/") ||
        parsed.videoName.startsWith("http")
        ? parsed.videoName
        : "/demo-evidence/sample-unboxing.mp4"
      : undefined);

  const receiverVideoName =
    evidenceHook.videoItem?.fileName ||
    parsed.videoName ||
    "Video mở hộp";

  const handleApplyPreset = (text: string, dec: DisputeDecision) => {
    setReason(text);
    setDecision(dec);
    setProblem(null);
  };

  return (
    <div className={styles.dossierContainer}>
      {/* 1. Header & Lý do khiếu nại */}
      <div className={styles.dossierSection}>
        <div className={styles.sectionHeader}>
          <strong>Nội dung &amp; Lý do khiếu nại:</strong>
          <span className={styles.sectionHint}>
            Người mở khiếu nại: {isInitiatorDisputing ? "Bên A (Khởi tạo)" : isRecipientDisputing ? "Bên B (Đối tác)" : item.disputedBy || "Thành viên"}
          </span>
        </div>
        <div className={styles.reasonBox}>
          {parsed.category && (
            <span className={styles.reasonBadge}>Sự cố: {parsed.category}</span>
          )}
          <p className={styles.reasonDetailText}>
            {parsed.detail || item.disputeReason || "Thành viên yêu cầu xử lý khiếu nại sự cố sách."}
          </p>
        </div>
      </div>

      {/* 2. ĐỐI SOÁT CHỨNG CỨ 2 CHIỀU: ĐÓNG GÓI vs MỞ HỘP */}
      <div className={styles.dossierSection}>
        <div className={styles.comparativeHeader}>
          <div className={styles.comparativeTitle}>
            <span className={styles.comparativeIcon}>⚖️</span>
            <div>
              <strong>HỒ SƠ ĐỐI SOÁT CHỨNG CỨ 2 CHIỀU</strong>
              <small className={styles.comparativeSubtitle}>
                Đối chiếu trực tiếp video &amp; ảnh lúc đóng gói gửi đi vs lúc mở kiện hàng nhận sách
              </small>
            </div>
          </div>
          <span className={styles.disputeTargetPill}>
            {isInitiatorDisputing
              ? "Bên A khiếu nại sách của Bên B gửi"
              : isRecipientDisputing
              ? "Bên B khiếu nại sách của Bên A gửi"
              : "Đối soát chứng cứ 2 bên"}
          </span>
        </div>

        <div className={styles.comparativeGrid}>
          {/* CỘT 1: BÊN GỬI - CHỨNG CỨ ĐÓNG GÓI */}
          <div className={styles.evidenceColumn}>
            <div className={styles.columnHeaderSender}>
              <div className={styles.columnHeaderTitle}>
                <span className={styles.colBadgeSender}>BÊN GỬI</span>
                <strong>1. Chứng cứ đóng gói &amp; gửi hàng</strong>
              </div>
              <div className={styles.columnMeta}>
                <span>{senderRoleTitle}</span>
                {disputedSenderShipment?.trackingCode && (
                  <span className={styles.trackingTag}>
                    Mã vận đơn: <strong>{disputedSenderShipment.trackingCode}</strong>
                    {disputedSenderShipment.carrierName ? ` (${disputedSenderShipment.carrierName})` : ""}
                  </span>
                )}
              </div>
            </div>

            <div className={styles.columnBody}>
              {/* Ảnh sách trước khi đóng gói */}
              <div className={styles.mediaBox}>
                <div className={styles.mediaBoxHeader}>
                  <span>📸 Ảnh hiện trạng sách trước đóng gói:</span>
                  <small title={disputedSenderShipment?.packagingPhotoName || "Ảnh sách"}>
                    {disputedSenderShipment?.packagingPhotoName || "Ảnh kiểm tra sách"}
                  </small>
                </div>
                {packagingPhotoSrc ? (
                  <div className={styles.imageWrapper}>
                    <img
                      src={packagingPhotoSrc}
                      alt="Ảnh sách trước khi đóng gói"
                      className={styles.evidenceImg}
                      onClick={() => window.open(packagingPhotoSrc, "_blank")}
                      title="Bấm để mở ảnh kích thước lớn"
                    />
                    <span className={styles.zoomPill}>🔍 Bấm để phóng to</span>
                  </div>
                ) : (
                  <div className={styles.mediaEmptyPlaceholder}>
                    <span>Chưa có ảnh đóng gói từ người gửi</span>
                  </div>
                )}
              </div>

              {/* Video đóng gói & dán niêm phong */}
              <div className={styles.mediaBox}>
                <div className={styles.mediaBoxHeader}>
                  <span>🎥 Video quay niêm phong &amp; dán mã:</span>
                  <small title={disputedSenderShipment?.packagingVideoName || "Video đóng gói"}>
                    {disputedSenderShipment?.packagingVideoName || "Video đóng gói"}
                  </small>
                </div>
                {packagingVideoSrc ? (
                  <div className={styles.videoWrapper}>
                    <video
                      src={packagingVideoSrc}
                      controls
                      playsInline
                      preload="metadata"
                      className={styles.evidenceVid}
                    >
                      Trình duyệt không hỗ trợ phát video.
                    </video>
                  </div>
                ) : (
                  <div className={styles.mediaEmptyPlaceholder}>
                    <span>Chưa có video đóng gói từ người gửi</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* CỘT 2: BÊN NHẬN - CHỨNG CỨ MỞ HỘP KHIẾU NẠI */}
          <div className={styles.evidenceColumn}>
            <div className={styles.columnHeaderReceiver}>
              <div className={styles.columnHeaderTitle}>
                <span className={styles.colBadgeReceiver}>BÊN NHẬN</span>
                <strong>2. Chứng cứ mở kiện &amp; khiếu nại</strong>
              </div>
              <div className={styles.columnMeta}>
                <span>{receiverRoleTitle}</span>
                {parsed.category && (
                  <span className={styles.categoryPill}>
                    Sự cố: <strong>{parsed.category}</strong>
                  </span>
                )}
                {evidenceHook.readyItems.length > 0 && (
                  <span className={styles.readyPill}>
                    Đã nạp {evidenceHook.readyItems.length} tệp chứng cứ
                  </span>
                )}
              </div>
            </div>

            <div className={styles.columnBody}>
              {/* Ảnh sách hư hỏng khi nhận */}
              <div className={styles.mediaBox}>
                <div className={styles.mediaBoxHeader}>
                  <span>📸 Ảnh hiện trạng sách lúc nhận:</span>
                  <small title={receiverImageName}>
                    {receiverImageName}
                  </small>
                </div>
                {receiverImageSrc ? (
                  <div className={styles.imageWrapper}>
                    <img
                      src={receiverImageSrc}
                      alt={receiverImageName}
                      className={styles.evidenceImg}
                      onClick={() => window.open(receiverImageSrc, "_blank")}
                      title="Bấm để mở ảnh kích thước lớn"
                    />
                    <span className={styles.zoomPill}>🔍 Bấm để phóng to</span>
                  </div>
                ) : evidenceHook.loadingMedia ? (
                  <div className={styles.mediaLoadingPlaceholder}>
                    <span>⏳ Đang tải ảnh từ kho bằng chứng…</span>
                  </div>
                ) : (
                  <div className={styles.mediaEmptyPlaceholder}>
                    <span>Chưa có ảnh sự cố từ người nhận</span>
                  </div>
                )}
              </div>

              {/* Video mở kiện hàng unboxing */}
              <div className={styles.mediaBox}>
                <div className={styles.mediaBoxHeader}>
                  <span>🎥 Video mở kiện hàng (Unboxing):</span>
                  <small title={receiverVideoName}>
                    {receiverVideoName}
                  </small>
                </div>
                {receiverVideoSrc ? (
                  <div className={styles.videoWrapper}>
                    <video
                      src={receiverVideoSrc}
                      controls
                      playsInline
                      preload="metadata"
                      className={styles.evidenceVid}
                    >
                      Trình duyệt không hỗ trợ phát video.
                    </video>
                  </div>
                ) : evidenceHook.loadingMedia ? (
                  <div className={styles.mediaLoadingPlaceholder}>
                    <span>⏳ Đang tải video unboxing từ kho bằng chứng…</span>
                  </div>
                ) : (
                  <div className={styles.mediaEmptyPlaceholder}>
                    <span>Chưa có video unboxing từ người nhận</span>
                  </div>
                )}
              </div>

              {/* Danh sách tệp đính kèm đầy đủ */}
              {evidenceHook.readyItems.length > 0 && (
                <div className={styles.evidenceFileList}>
                  <div className={styles.fileListHeader}>
                    <strong>📁 Danh sách tệp chứng cứ ({evidenceHook.readyItems.length}):</strong>
                  </div>
                  <ul>
                    {evidenceHook.readyItems.map((fi) => {
                      const url = evidenceHook.mediaUrls[fi.id];
                      return (
                        <li key={fi.id} className={styles.fileListItem}>
                          <span className={styles.fileName}>{fi.fileName}</span>
                          <span className={styles.fileMeta}>
                            ({Math.ceil(fi.byteSize / 1024)} KB)
                          </span>
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className={styles.fileOpenBtn}
                            >
                              Mở tệp ↗
                            </a>
                          ) : (
                            <span className={styles.fileLoading}>Đang nạp URL…</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tiêu chí đối soát trọng tài */}
        <div className={styles.auditChecklist}>
          <div className={styles.checklistTitle}>
            📋 <strong>Tiêu chuẩn đối chiếu trọng tài của Quản trị viên:</strong>
          </div>
          <div className={styles.checklistGrid}>
            <div className={styles.checkCard}>
              <span className={styles.checkNum}>1</span>
              <div>
                <strong>Khớp mã bưu kiện:</strong>
                <p>Kiểm tra mã vận đơn trên video mở hộp của bên nhận có trùng với mã bên gửi dán trên kiện hàng.</p>
              </div>
            </div>
            <div className={styles.checkCard}>
              <span className={styles.checkNum}>2</span>
              <div>
                <strong>Tính toàn vẹn niêm phong:</strong>
                <p>Xem video unboxing: Bưu kiện có còn nguyên băng keo niêm phong trước lúc bóc, hay có vết rách do vận chuyển.</p>
              </div>
            </div>
            <div className={styles.checkCard}>
              <span className={styles.checkNum}>3</span>
              <div>
                <strong>Hiện trạng trước và sau:</strong>
                <p>So sánh ảnh sách lúc bên gửi chuẩn bị gói với sách lúc bên nhận mở ra để xác định đúng bên chịu trách nhiệm.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Bằng chứng riêng hồ sơ (Audit Log / Secure Evidence Vault) */}
      <div className={styles.dossierSection}>
        <ExchangeEvidenceReview key={userId + ":" + item.id} id={item.id} userId={userId} />
      </div>

      {/* 4. Đối chiếu tình trạng giao nhận 2 chiều & Ký quỹ */}
      <div className={styles.dossierSection}>
        <div className={styles.sectionHeader}>
          <strong>Đối chiếu tình trạng giao nhận &amp; Ký quỹ 2 chiều:</strong>
          <span className={styles.sectionHint}>Xác minh nghĩa vụ gửi hàng và tiền cọc</span>
        </div>
        <div className={styles.partiesGrid}>
          <div className={styles.partyCard}>
            <div className={styles.partyHeader}>
              <span className={styles.partyRole}>Bên A (Khởi tạo)</span>
              <span className={styles.depositPill}>Cọc: {money(item.initiatorDeposit)}</span>
            </div>
            <div className={styles.timelineRow}>
              <span>📦 Gửi sách:</span>
              <strong>{item.initiatorShippedAt ? dateText(item.initiatorShippedAt) : "Chưa gửi"}</strong>
            </div>
            <div className={styles.timelineRow}>
              <span>📬 Nhận sách:</span>
              <strong>{item.initiatorReceivedAt ? dateText(item.initiatorReceivedAt) : "Chưa nhận"}</strong>
            </div>
            {item.initiatorShipment?.trackingCode && (
              <div className={styles.timelineRow}>
                <span>🏷️ Mã gửi Bên A:</span>
                <code>{item.initiatorShipment.trackingCode}</code>
              </div>
            )}
          </div>

          <div className={styles.partyCard}>
            <div className={styles.partyHeader}>
              <span className={styles.partyRole}>Bên B (Đối tác)</span>
              <span className={styles.depositPill}>Cọc: {money(item.recipientDeposit)}</span>
            </div>
            <div className={styles.timelineRow}>
              <span>📦 Gửi sách:</span>
              <strong>{item.recipientShippedAt ? dateText(item.recipientShippedAt) : "Chưa gửi"}</strong>
            </div>
            <div className={styles.timelineRow}>
              <span>📬 Nhận sách:</span>
              <strong>{item.recipientReceivedAt ? dateText(item.recipientReceivedAt) : "Chưa nhận"}</strong>
            </div>
            {item.recipientShipment?.trackingCode && (
              <div className={styles.timelineRow}>
                <span>🏷️ Mã gửi Bên B:</span>
                <code>{item.recipientShipment.trackingCode}</code>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. Khung ra phán quyết trọng tài */}
      <ActionPanel<ExchangeDisputeItem>
        {...context}
        label="Phán quyết khiếu nại"
        title="Quyết định phân xử khiếu nại trao đổi"
        intro="Phán quyết đối soát chứng cứ có hiệu lực tức thì. Sổ cái Ledger sẽ tự động hoàn cọc hoặc tất toán thanh toán theo đúng lựa chọn."
        dirty={Boolean(decision || reason)}
        fields={(locked: boolean) => (
          <>
            <fieldset
              className="fieldset"
              disabled={locked}
              aria-invalid={problem === "decision"}
            >
              <legend>Lựa chọn phán quyết trọng tài</legend>
              {decisionOptions.map((opt, index) => (
                <label className="check" key={opt.value}>
                  <input
                    ref={index === 0 ? firstDecision : undefined}
                    type="radio"
                    name={`decision-${item.id}`}
                    checked={decision === opt.value}
                    onChange={() => {
                      setDecision(opt.value);
                      setProblem(null);
                    }}
                  />
                  <span>
                    <strong>{opt.label}</strong>
                    <small className="muted"> — {opt.effect}</small>
                  </span>
                </label>
              ))}
            </fieldset>

            {problem === "decision" && (
              <p className="field-error">Vui lòng chọn một quyết định xử lý.</p>
            )}

            <div className="field">
              <label htmlFor={`reason-${item.id}`}>Lý do phán quyết &amp; Căn cứ đối chiếu chứng cứ</label>
              <textarea
                id={`reason-${item.id}`}
                ref={reasonInput}
                rows={3}
                maxLength={500}
                value={reason}
                disabled={locked}
                aria-invalid={problem === "reason"}
                placeholder="Nhập lý do phân xử hoặc bấm chọn mẫu nhanh bên dưới..."
                onChange={(event) => {
                  setReason(event.target.value);
                  setProblem(null);
                }}
              />
            </div>

            <div className={styles.quickPresets}>
              <button
                type="button"
                className={styles.presetBtn}
                disabled={locked}
                onClick={() =>
                  handleApplyPreset(
                    "Đối soát chứng cứ 2 chiều: Sự cố hư hỏng khách quan trong quá trình vận chuyển bưu gửi. Hai bên đều đóng gói và mở kiện đúng quy định. Phán quyết: Hủy giao dịch (Refund Both), hoàn trả 100% tiền cọc và tiền bù cho hai bên theo đúng quy chế.",
                    "RefundBoth",
                  )
                }
              >
                ⚡ Mẫu 1: Sự cố khách quan — Hủy giao dịch &amp; Hoàn cọc cả 2 bên (Refund Both)
              </button>

              <button
                type="button"
                className={styles.presetBtn}
                disabled={locked}
                onClick={() =>
                  handleApplyPreset(
                    "Đối soát chứng cứ 2 chiều: Video đóng gói của bên gửi ghi nhận sách còn nguyên vẹn, được bọc chống sốc và niêm phong chuẩn với mã vận đơn. Video mở kiện của bên nhận không chứng minh được lỗi phát sinh từ bên gửi. Phán quyết: Bác khiếu nại (Complete Exchange), công nhận giao dịch hợp lệ, tất toán cọc và chuyển tiền bù.",
                    "CompleteExchange",
                  )
                }
              >
                ⚡ Mẫu 2: Bác khiếu nại — Bên gửi đóng gói chuẩn có video (Complete Exchange)
              </button>

              <button
                type="button"
                className={styles.presetBtn}
                disabled={locked}
                onClick={() =>
                  handleApplyPreset(
                    `Đối soát chứng cứ 2 chiều: Video mở kiện và ảnh chụp chi tiết cho thấy sách bị rách nát, hư hỏng nặng hoặc sai khác hoàn toàn cam kết. Video đóng gói của bên gửi không chứng minh được hiện trạng tốt trước lúc gửi. Phán quyết: Lỗi thuộc về bên gửi (${senderRoleTitle}). Tịch thu toàn bộ tiền cọc bảo chứng của bên gửi chuyển vào ví bên nhận để bồi thường; hoàn cọc cho bên nhận.`,
                    faultSenderDecision,
                  )
                }
              >
                ⚡ Mẫu 3: Lỗi Bên gửi — Tịch thu cọc bên gửi &amp; Bồi thường thiệt hại cho bên nhận
              </button>

              <button
                type="button"
                className={styles.presetBtn}
                disabled={locked}
                onClick={() =>
                  handleApplyPreset(
                    `Đối soát chứng cứ 2 chiều: Hồ sơ đối soát ghi nhận bên gửi đóng gói nguyên vẹn và niêm phong chuẩn. Bên nhận có dấu hiệu tráo đổi sách hoặc cố ý tạo sự cố để khiếu nại trục lợi, không cung cấp được video mở kiện hàng liên tục từ lúc niêm phong. Phán quyết: Lỗi thuộc về bên nhận (${receiverRoleTitle}). Tịch thu toàn bộ tiền cọc của bên nhận chuyển cho bên gửi để bồi thường; hoàn cọc cho bên gửi.`,
                    faultReceiverDecision,
                  )
                }
              >
                ⚡ Mẫu 4: Lỗi Bên nhận (Gian lận) — Tịch thu cọc bên nhận &amp; Bồi thường cho bên gửi
              </button>
            </div>

            {problem === "reason" && (
              <p className="field-error">Nhập lý do phân xử tối thiểu 5 ký tự.</p>
            )}
          </>
        )}
        validate={() => {
          if (!decision) {
            setProblem("decision");
            firstDecision.current?.focus();
            return false;
          }
          if (trimmed.length < 5) {
            setProblem("reason");
            reasonInput.current?.focus();
            return false;
          }
          return true;
        }}
        submitLabel="Thực thi phán quyết"
        confirmTitle={decision ? `${decisionDetails[decision].label}?` : "Thực thi phán quyết?"}
        confirmBody={
          <>
            <p>{decision && decisionDetails[decision].effect}</p>
            <p><strong>Căn cứ ghi nhận:</strong></p>
            <blockquote className="prose">{trimmed}</blockquote>
          </>
        }
        build={() => ({
          path: `/operations/exchanges/${item.id}/resolve`,
          body: {
            expectedVersion: item.revision,
            decision: decision!,
            reason: trimmed,
          },
        })}
        schema={exchangeDisputeResolution as z.ZodType<ExchangeDisputeItem>}
        interpret={() => ({
          tone: "success",
          text: `Đã thực thi phán quyết cho giao dịch #${item.id.slice(0, 8)}: ${
            decision === "RefundBoth"
              ? "Hủy giao dịch & Hoàn tiền cọc cả 2 bên thành công."
              : decision === "CompleteExchange"
              ? "Bác khiếu nại & Hoàn tất trao đổi, tất toán cọc thành công."
              : decision === "CompensateInitiator"
              ? "Phạt tịch thu cọc Bên B & Chuyển tiền bồi thường thiệt hại cho Bên A thành công."
              : "Phạt tịch thu cọc Bên A & Chuyển tiền bồi thường thiệt hại cho Bên B thành công."
          }`,
          close: true,
        })}
      />
    </div>
  );
}

export function ExchangeDisputeDetailPage() {
  const user = useOutletContext<CurrentUser>();
  if (!canReview(user)) return <Forbidden />;

  return <ExchangeDisputeDetailContent user={user} />;
}

function ExchangeDisputeDetailContent({ user }: { user: CurrentUser }) {
  const { id } = useParams<{ id: string }>();
  const [outcome, setOutcome] = useState<Omit<Outcome, "close"> | undefined>();
  const [_pending, setPending] = useState(false);

  const result = useQuery({
    queryKey: ["operations", "exchange-disputes", user.id],
    queryFn: () =>
      session.request("/operations/exchanges/resolutions", exchangeDisputeResolutionsList),
  });

  const item = result.data?.find((i) => i.id === id);

  return (
    <div className={styles.detailPageContainer}>
      <div className={styles.detailHeader}>
        <Link to="/operations/exchange-disputes" className={styles.backLink}>
          ← Danh sách khiếu nại
        </Link>
        <div className={styles.detailTitleRow}>
          <div>
            <h1>Hồ sơ đối soát khiếu nại trao đổi</h1>
            <p className={styles.detailSubtitle}>
              Mã giao dịch: <code>#{id}</code>
              {item && (
                <>
                  {" · "}Trạng thái: <strong>{item.status}</strong>
                  {item.disputedAt && ` · Mở lúc ${dateText(item.disputedAt)}`}
                </>
              )}
            </p>
          </div>
          {item && (
            <div className={styles.detailMetaPills}>
              <span className={styles.metaBadge}>
                Tiền cọc: {money(item.initiatorDeposit)} / {money(item.recipientDeposit)}
              </span>
              {item.diffAmount > 0 ? (
                <span className={styles.metaBadge}>
                  Bù chênh lệch: {money(item.diffAmount)}
                </span>
              ) : (
                <span className={styles.metaBadge}>Không bù tiền</span>
              )}
            </div>
          )}
        </div>
      </div>

      {outcome && (
        <Notice tone={outcome.tone}>
          {outcome.text}
        </Notice>
      )}

      {result.isPending && (
        <p role="status">Đang tải chi tiết hồ sơ khiếu nại…</p>
      )}

      {result.isError && (
        <Notice tone="error">
          Chưa tải được hồ sơ khiếu nại.{" "}
          <button onClick={() => void result.refetch()}>Tải lại</button>
        </Notice>
      )}

      {result.isSuccess && !item && (
        <div className={styles.reasonBox}>
          <strong>Không tìm thấy giao dịch khiếu nại này.</strong>
          <p className={styles.reasonDetailText}>
            Giao dịch có thể đã được giải quyết xong, hoặc bạn không có quyền xem giao dịch này.
          </p>
          <Link to="/operations/exchange-disputes" className={styles.backLink}>
            ← Quay lại danh sách khiếu nại
          </Link>
        </div>
      )}

      {item && (
        <DisputeResolutionWorkspace
          item={item}
          userId={user.id}
          onFinish={(newOutcome) => {
            setOutcome(newOutcome);
            void result.refetch();
          }}
          onPending={setPending}
          reconcile={() => result.refetch()}
        />
      )}
    </div>
  );
}
