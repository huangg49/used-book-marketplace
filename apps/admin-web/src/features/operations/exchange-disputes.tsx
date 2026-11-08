import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { dateText, money } from "../../core/format";
import { canReview, session } from "../../core/session";
import { Notice } from "../../core/ui";
import { ActionPanel } from "./action-panel";
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
        detail: <DisputeSummary item={item} />,
        action: {
          label: "Xem chi tiết",
          render: (context) => (
            <DisputeResolutionWorkspace item={item} userId={user.id} {...context} />
          ),
        },
      }))}
      empty={{
        title: "Chưa có khiếu nại nào.",
        body: "Chưa có giao dịch chờ xử lý trong danh sách bạn được xem. Điều này không xác nhận mọi giao dịch đều đã hoàn tất.",
      }}
      extra={() => (
        <Notice tone="info">
          Đối soát chứng cứ trực tiếp: Quản trị viên kiểm tra video mở kiện hàng và ảnh hiện trạng để ra phán quyết.
          Sổ cái Ledger sẽ tự động hoàn cọc hoặc tất toán nguyên tử ngay khi thực thi.
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

function DisputeSummary({ item }: { item: ExchangeDisputeItem }) {
  const parsed = parseDisputeReason(item.disputeReason || "");
  const hasMedia = Boolean(parsed.imageName || parsed.videoName);

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
          📎 {[parsed.imageName && "1 ảnh", parsed.videoName && "1 video"].filter(Boolean).join(" · ")}
        </span>
      )}
    </div>
  );
}

type DisputeDecision = "RefundBoth" | "CompleteExchange";

const decisionDetails: Record<
  DisputeDecision,
  { label: string; effect: string }
> = {
  RefundBoth: {
    label: "Hủy giao dịch & Hoàn tiền cọc cả 2 bên (Refund Both)",
    effect:
      "Hủy đơn do sách hư hỏng khi giao nhận. Sổ cái Ledger hoàn lại 100% cọc cho Bên A và Bên B cùng tiền bù; các cuốn sách được mở khóa trở lại kệ.",
  },
  CompleteExchange: {
    label: "Bác khiếu nại & Hoàn tất trao đổi (Complete Exchange)",
    effect:
      "Bằng chứng không đủ căn cứ chứng minh lỗi. Công nhận giao dịch hoàn tất hợp lệ, sổ cái Ledger tất toán cọc và chuyển tiền bù chênh lệch.",
  },
};

type WorkspaceProps = { item: ExchangeDisputeItem; userId: string } & ActionContext;

function DisputeResolutionWorkspace({ item, userId, ...context }: WorkspaceProps) {
  const parsed = parseDisputeReason(item.disputeReason || "");
  const evidence = useEvidenceMedia(item.id);

  const [decision, setDecision] = useState<DisputeDecision | null>(null);
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<"decision" | "reason" | null>(null);

  const firstDecision = useRef<HTMLInputElement>(null);
  const reasonInput = useRef<HTMLTextAreaElement>(null);

  const trimmed = reason.trim();
  const hasEvidence = Boolean(parsed.imageName || parsed.videoName);

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

  const handleApplyPreset = (text: string, dec: DisputeDecision) => {
    setReason(text);
    setDecision(dec);
    setProblem(null);
  };

  return (
    <div className={styles.dossierContainer}>
      <div className={styles.dossierSection}>
        <div className={styles.sectionHeader}>
          <strong>Nội dung &amp; Lý do khiếu nại:</strong>
          <span className={styles.sectionHint}>
            Người khiếu nại: {item.disputedBy === "System" ? "Hệ thống" : "Thành viên đối tác"}
          </span>
        </div>
        <div className={styles.reasonBox}>
          {parsed.category && (
            <span className={styles.reasonBadge}>Sự cố: {parsed.category}</span>
          )}
          <p className={styles.reasonDetailText}>
            {item.disputeReason || "Không có lý do chi tiết"}
          </p>
        </div>
      </div>

      <div className={styles.dossierSection}>
        <div className={styles.sectionHeader}>
          <strong>Chứng cứ mở hộp &amp; Đối soát hiện trạng:</strong>
          <span className={styles.sectionHint}>Xem ảnh/video được tải lên hệ thống</span>
        </div>

        {/* Secure evidence review component */}
        <ExchangeEvidenceReview key={userId + ':' + item.id} id={item.id} userId={userId} />

        {/* Inline bridge fallback preview if available */}
        {hasEvidence && (imageSrc || videoSrc) && (
          <div className={styles.evidenceGrid} style={{ marginTop: "0.75rem" }}>
            {imageSrc && (
              <div className={styles.mediaBox}>
                <div className={styles.mediaBoxHeader}>
                  <span>Ảnh hiện trạng:</span>
                  <small title={parsed.imageName}>{parsed.imageName}</small>
                </div>
                <div className={styles.imageWrapper}>
                  <img
                    src={imageSrc}
                    alt={parsed.imageName || "Ảnh chứng cứ"}
                    className={styles.evidenceImg}
                    onClick={() => window.open(imageSrc, "_blank")}
                    title="Bấm để mở ảnh kích thước lớn"
                  />
                </div>
              </div>
            )}

            {videoSrc && (
              <div className={styles.mediaBox}>
                <div className={styles.mediaBoxHeader}>
                  <span>Video mở kiện hàng (Unboxing):</span>
                  <small title={parsed.videoName}>{parsed.videoName}</small>
                </div>
                <div className={styles.videoWrapper}>
                  <video
                    src={videoSrc}
                    controls
                    preload="metadata"
                    className={styles.evidenceVid}
                  >
                    Trình duyệt không hỗ trợ xem video.
                  </video>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={styles.dossierSection}>
        <div className={styles.sectionHeader}>
          <strong>Đối chiếu tình trạng giao nhận 2 chiều:</strong>
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
          </div>
        </div>
      </div>

      <ActionPanel<ExchangeDisputeItem>
        {...context}
        label="Phán quyết khiếu nại"
        title="Quyết định phân xử khiếu nại"
        intro="Phán quyết sẽ có hiệu lực tức thì. Sổ cái Ledger sẽ thực hiện hoàn cọc hoặc tất toán thanh toán theo đúng lựa chọn."
        dirty={Boolean(decision || reason)}
        fields={(locked: boolean) => (
          <>
            <fieldset
              className="fieldset"
              disabled={locked}
              aria-invalid={problem === "decision"}
            >
              <legend>Lựa chọn phán quyết</legend>
              {(["RefundBoth", "CompleteExchange"] as DisputeDecision[]).map((value, index) => (
                <label className="check" key={value}>
                  <input
                    ref={index === 0 ? firstDecision : undefined}
                    type="radio"
                    name={`decision-${item.id}`}
                    checked={decision === value}
                    onChange={() => {
                      setDecision(value);
                      setProblem(null);
                    }}
                  />
                  <span>
                    <strong>{decisionDetails[value].label}</strong>
                    <small className="muted"> — {decisionDetails[value].effect}</small>
                  </span>
                </label>
              ))}
            </fieldset>

            {problem === "decision" && (
              <p className="field-error">Vui lòng chọn một quyết định xử lý.</p>
            )}

            <div className="field">
              <label htmlFor={`reason-${item.id}`}>Lý do phán quyết & Căn cứ đối chiếu</label>
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
                    "Xác minh video mở hộp và ảnh chụp cho thấy bên gửi giao sách rách nát, hư hỏng nặng so với mô tả ban đầu. Phán quyết: Hủy giao dịch do sự cố giao nhận, hoàn trả 100% tiền cọc và tiền bù cho hai bên theo đúng quy trình.",
                    "RefundBoth",
                  )
                }
              >
                ⚡ Mẫu 1: Hủy đơn & Hoàn tiền cọc (Sự cố hư hỏng)
              </button>

              <button
                type="button"
                className={styles.presetBtn}
                disabled={locked}
                onClick={() =>
                  handleApplyPreset(
                    "Video unboxing không ghi nhận được hư hỏng từ bên gửi; tình trạng sách nhận được đúng với bài đăng ban đầu. Phán quyết: Bác bỏ khiếu nại, công nhận giao dịch hợp lệ, tất toán cọc và chuyển tiền bù cho bên gửi.",
                    "CompleteExchange",
                  )
                }
              >
                ⚡ Mẫu 2: Bác khiếu nại & Bảo vệ bên gửi (Tố cáo sai)
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
              : "Bác khiếu nại & Hoàn tất trao đổi, tất toán cọc thành công."
          }`,
          close: true,
        })}
      />
    </div>
  );
}
